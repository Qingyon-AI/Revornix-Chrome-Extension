import { appendTranslationLog } from '@/lib/logging';
import type {
	TranslationItem,
	TranslationProvider,
	TranslationSettings,
} from '@/lib/translation';

export async function dispatchTranslationBatch(
	items: TranslationItem[],
	targetLanguage: string,
	model: string,
	provider: TranslationProvider,
	settings: TranslationSettings
) {
	switch (provider) {
		case 'google-translate-free':
			return translateWithGoogleFree(items, targetLanguage);
		case 'openai-compatible':
		default:
			return translateWithOpenAICompatible(items, targetLanguage, model, settings);
	}
}

export function buildTranslationErrorMessage(
	status: number,
	errorText: string,
	model: string
) {
	const lower = errorText.toLowerCase();
	if (
		status === 404 ||
		lower.includes('resource_not_found') ||
		lower.includes('not found the model') ||
		lower.includes('permission denied')
	) {
		return `Translation model "${model}" is unavailable. Check the model name or API permissions in translation settings.`;
	}

	return `Translation request failed: ${status} ${errorText}`;
}

function parseTranslationResponse(content: string) {
	const directJson = tryParseTranslationJson(content);
	if (directJson) {
		return directJson;
	}

	const jsonMatch = content.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error('Could not parse translation response.');
	}

	const fallbackJson = tryParseTranslationJson(jsonMatch[0]);
	if (!fallbackJson) {
		throw new Error('Could not parse translation response.');
	}

	return fallbackJson;
}

function tryParseTranslationJson(raw: string) {
	try {
		const parsed = JSON.parse(raw) as { translations?: TranslationItem[] };
		if (!Array.isArray(parsed.translations)) {
			return null;
		}
		return parsed.translations;
	} catch {
		return null;
	}
}

function getTemperatureForModel(model: string) {
	const normalized = model.toLowerCase();
	if (
		normalized.includes('kimi') &&
		(normalized.includes('k2.5') || normalized.includes('2.5'))
	) {
		return 1;
	}

	return 0.2;
}

async function translateWithOpenAICompatible(
	items: TranslationItem[],
	targetLanguage: string,
	model: string,
	settings: TranslationSettings
) {
	if (!settings.translationBaseUrl || !model) {
		throw new Error(
			'Translation settings are incomplete. Please configure the translation service in options.'
		);
	}

	const endpoint = `${settings.translationBaseUrl.replace(/\/$/, '')}/chat/completions`;
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(settings.translationApiKey
				? { Authorization: `Bearer ${settings.translationApiKey}` }
				: {}),
		},
		body: JSON.stringify({
			model,
			temperature: getTemperatureForModel(model),
			messages: [
				{
					role: 'system',
					content: `You are a webpage translator. Translate each text into ${targetLanguage} while preserving meaning, tone, markdown-like symbols, and surrounding whitespace. If an item includes "context", use it to disambiguate the selected text semantically, but translate only the item's "text" field. Return JSON only in the form {"translations":[{"id":"...","text":"..."}]}. Do not omit any item and do not add explanations.`,
				},
				{
					role: 'user',
					content: JSON.stringify({
						translations: items,
					}),
				},
			],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		void appendTranslationLog({
			level: 'error',
			scope: 'background',
			message: `Translation batch failed with ${response.status}`,
			details: `provider=openai-compatible; model=${model}; body=${errorText}`,
		});
		throw new Error(buildTranslationErrorMessage(response.status, errorText, model));
	}

	const data = (await response.json()) as {
		choices?: Array<{
			message?: {
				content?: string;
			};
		}>;
	};
	const content = data.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error('Translation service returned an empty response.');
	}

	return parseTranslationResponse(content);
}

async function translateWithGoogleFree(
	items: TranslationItem[],
	targetLanguage: string
) {
	const target = mapLanguageToGoogleCode(targetLanguage);
	return Promise.all(
		items.map(async (item) => {
			const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
			endpoint.searchParams.set('client', 'gtx');
			endpoint.searchParams.set('sl', 'auto');
			endpoint.searchParams.set('tl', target);
			endpoint.searchParams.set('dt', 't');
			endpoint.searchParams.set('q', item.text);

			const response = await fetch(endpoint.toString());
			if (!response.ok) {
				throw new Error(`Google Translate free request failed: ${response.status}`);
			}

			const data = (await response.json()) as unknown[];
			const translatedText = Array.isArray(data[0])
				? (data[0] as Array<[string]>).map((part) => part[0] || '').join('')
				: '';
			return {
				id: item.id,
				text: translatedText || item.text,
			};
		})
	);
}

function mapLanguageToGoogleCode(language: string) {
	const normalized = language.trim().toLowerCase();
	if (normalized.includes('繁') || normalized.includes('traditional')) return 'zh-TW';
	if (normalized.includes('简') || normalized.includes('simplified')) return 'zh-CN';
	if (normalized.includes('english')) return 'en';
	if (normalized.includes('日本')) return 'ja';
	if (normalized.includes('한국')) return 'ko';
	if (normalized.includes('fran')) return 'fr';
	if (normalized.includes('deutsch') || normalized.includes('german')) return 'de';
	return 'auto';
}
