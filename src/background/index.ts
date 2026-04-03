/// <reference types="chrome" />

import {
	DEFAULT_FLOATING_BALL_ENABLED,
	DEFAULT_TRANSLATION_DISPLAY_MODE,
	DEFAULT_TRANSLATION_PROVIDER,
	DEFAULT_TARGET_LANGUAGE,
	TRANSLATION_CACHE_KEY,
	TRANSLATION_CACHE_MAX_ENTRIES,
	TRANSLATION_CACHE_TTL_MS,
	getTranslationModelForProvider,
	type TranslationItem,
	type TranslationProvider,
	type TranslationSettings,
} from '@/lib/translation';
import { appendTranslationLog } from '@/lib/logging';
import {
	dispatchTranslationBatch,
} from '@/lib/translation-provider';

const CONTEXT_MENU_IDS = {
	page: 'revornix-context-menu-page',
	selection: 'revornix-context-menu-selection',
	link: 'revornix-context-menu-link',
	image: 'revornix-context-menu-image',
	translate: 'revornix-context-menu-translate-page',
	translateSelection: 'revornix-context-menu-translate-selection',
	restoreTranslation: 'revornix-context-menu-restore-page',
	} as const;

interface TranslationCacheEntry {
	sourceText: string;
	normalizedSourceText?: string;
	sourceContext?: string;
	normalizedSourceContext?: string;
	translatedText: string;
	updatedAt: number;
}

type TranslationCacheStore = Record<string, TranslationCacheEntry>;

chrome.runtime.onInstalled.addListener((details) => {
	createContextMenus();
	void appendTranslationLog({
		level: 'info',
		scope: 'background',
		message: `Extension installed event: ${details.reason}`,
	});

	if (details.reason === 'install') {
		chrome.runtime.openOptionsPage();
	}
});

chrome.runtime.onStartup.addListener(() => {
	createContextMenus();
	void appendTranslationLog({
		level: 'info',
		scope: 'background',
		message: 'Background startup completed',
	});
});

function createContextMenus() {
	chrome.contextMenus.removeAll(() => {
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.page,
		title: 'Save page to Revornix',
		contexts: ['page'],
	});
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.selection,
		title: 'Save content to Revornix',
		contexts: ['selection'],
	});
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.link,
		title: 'Save link to Revornix',
		contexts: ['link'],
	});
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.image,
		title: 'Save image to Revornix',
		contexts: ['image'],
	});
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.translate,
		title: 'Translate page with Revornix',
		contexts: ['page'],
	});
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.translateSelection,
		title: 'Translate selected text',
		contexts: ['selection'],
	});
	chrome.contextMenus.create({
		id: CONTEXT_MENU_IDS.restoreTranslation,
		title: 'Restore original page text',
		contexts: ['page'],
	});
	});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (!tab?.id) return;

	switch (info.menuItemId) {
		case CONTEXT_MENU_IDS.page:
			await sendMessageToTab(tab.id, {
				type: 'SHARE_PAGE_TO_REVORNIX',
				payload: { url: tab.url },
			});
			break;

		case CONTEXT_MENU_IDS.selection:
			await sendMessageToTab(tab.id, {
				type: 'SHARE_SELECTION_TO_REVORNIX',
				payload: {
					url: tab.url,
					text: info.selectionText,
				},
			});
			break;

		case CONTEXT_MENU_IDS.link:
			await sendMessageToTab(tab.id, {
				type: 'SHARE_LINK_TO_REVORNIX',
				payload: {
					url: info.linkUrl,
				},
			});
			break;

		case CONTEXT_MENU_IDS.image:
			await sendMessageToTab(tab.id, {
				type: 'SHARE_IMAGE_TO_REVORNIX',
				payload: {
					url: info.srcUrl,
				},
			});
			break;

		case CONTEXT_MENU_IDS.translate:
			void appendTranslationLog({
				level: 'info',
				scope: 'background',
				message: 'Context menu triggered page translation',
				details: tab.url || '',
			});
			await sendMessageToTab(tab.id, {
				type: 'TRANSLATE_PAGE',
			});
			break;

		case CONTEXT_MENU_IDS.translateSelection:
			await sendMessageToTab(tab.id, {
				type: 'TRANSLATE_SELECTION',
				payload: {
					text: info.selectionText,
				},
			});
			break;

		case CONTEXT_MENU_IDS.restoreTranslation:
			await sendMessageToTab(tab.id, {
				type: 'RESTORE_PAGE_TRANSLATION',
			});
			break;

		default:
			break;
	}
});

	chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
		if (message.type === 'OPEN_OPTIONS_PAGE') {
			const requestedTab = message.tab === 'logs' ? 'logs' : null;
			void appendTranslationLog({
				level: 'info',
				scope: 'background',
				message: requestedTab ? 'Opening logs page from content UI' : 'Opening options page from content UI',
			});
			const openPromise = requestedTab
				? chrome.tabs.create({
						url: chrome.runtime.getURL(`src/pages/options/index.html?tab=${requestedTab}`),
					})
				: chrome.runtime.openOptionsPage();
			void openPromise.then(() => {
				sendResponse({ success: true });
			}).catch((error) => {
			sendResponse({
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to open options page.',
			});
		});

		return true;
	}

	if (message.type !== 'TRANSLATE_TEXT_BATCH') {
		return false;
	}

	void translateItems(
		message.payload.items as TranslationItem[],
		message.payload.targetLanguage as string | undefined,
		message.payload.model as string | undefined,
		message.payload.provider as TranslationProvider | undefined
	)
		.then((translations) => {
			sendResponse({
				success: true,
				data: { translations },
			});
		})
		.catch((error) => {
			sendResponse({
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to translate page text.',
			});
		});

	return true;
});

async function translateItems(
	items: TranslationItem[],
	targetLanguage?: string,
	model?: string,
	provider?: TranslationProvider
): Promise<TranslationItem[]> {
	const settings = await getTranslationSettings();
	const target = targetLanguage || settings.translationTargetLanguage || DEFAULT_TARGET_LANGUAGE;
	const resolvedProvider = provider || settings.translationProvider;
	const resolvedModel = resolveTranslationModel(model, resolvedProvider, settings);
	const cacheStore = await getTranslationCacheStore();
	const now = Date.now();
	const results = new Map<string, string>();
	const itemsToTranslate: TranslationItem[] = [];
	const requestDedup = new Map<string, TranslationItem>();
	const itemById = new Map<string, TranslationItem>();
	let cacheHits = 0;

	for (const item of items) {
		itemById.set(item.id, item);
		const normalizedText = normalizeTranslationCacheText(item.text);
		const normalizedContext = normalizeTranslationCacheText(item.context || '');
		const cacheKey = buildTranslationCacheKey(
			normalizedText,
			normalizedContext,
			target,
			resolvedModel
		);
		const legacyCacheKey = buildTranslationCacheKey(
			item.text,
			item.context || '',
			target,
			resolvedModel
		);
		const cachedEntry = cacheStore[cacheKey] || cacheStore[legacyCacheKey];
		if (
			cachedEntry &&
			isMatchingCacheEntry(cachedEntry, item.text, normalizedText, item.context || '', normalizedContext) &&
			now - cachedEntry.updatedAt <= TRANSLATION_CACHE_TTL_MS
		) {
			results.set(item.id, cachedEntry.translatedText);
			cacheHits += 1;
			continue;
		}

		if (!requestDedup.has(cacheKey)) {
			requestDedup.set(cacheKey, item);
			itemsToTranslate.push(item);
		}
	}

	if (cacheHits > 0) {
		void appendTranslationLog({
			level: 'info',
			scope: 'background',
			message: `Translation cache hit (${cacheHits}/${items.length})`,
			details: `provider=${resolvedProvider}; model=${resolvedModel}; target=${target}`,
		});
	}

	if (itemsToTranslate.length === 0) {
		return items.map((item) => ({
			id: item.id,
			text: results.get(item.id) || item.text,
		}));
	}

	void appendTranslationLog({
		level: 'info',
		scope: 'background',
		message: `Dispatch translation batch (${itemsToTranslate.length} items)`,
		details: `provider=${resolvedProvider}; model=${resolvedModel}; target=${target}; cacheHits=${cacheHits}`,
	});
	const parsed = await dispatchTranslationBatch(
		itemsToTranslate,
		target,
		resolvedModel,
		resolvedProvider,
		settings
	);
	const expectedIds = new Set(itemsToTranslate.map((item) => item.id));
	const actualIds = new Set(parsed.map((item) => item.id));
	const hasUnknownIds = parsed.some((item) => !expectedIds.has(item.id));
	if (
		parsed.length !== itemsToTranslate.length ||
		actualIds.size !== expectedIds.size ||
		hasUnknownIds
	) {
		void appendTranslationLog({
			level: 'warn',
			scope: 'background',
			message: 'Translation response returned incomplete items',
			details: `expected=${itemsToTranslate.length}; actual=${parsed.length}; expectedIds=${Array.from(expectedIds).join(',')}; actualIds=${Array.from(actualIds).join(',')}; provider=${resolvedProvider}; model=${resolvedModel}`,
		});
		throw new Error('Translation service returned an incomplete result.');
	}

	for (const item of parsed) {
		results.set(item.id, item.text);
		const sourceItem = itemById.get(item.id);
		if (!sourceItem) {
			continue;
		}
		const normalizedSourceText = normalizeTranslationCacheText(sourceItem.text);
		const normalizedSourceContext = normalizeTranslationCacheText(sourceItem.context || '');
		cacheStore[
			buildTranslationCacheKey(
				normalizedSourceText,
				normalizedSourceContext,
				target,
				resolvedModel
			)
		] = {
			sourceText: sourceItem.text,
			normalizedSourceText,
			sourceContext: sourceItem.context || '',
			normalizedSourceContext,
			translatedText: item.text,
			updatedAt: now,
		};
	}

	for (const item of items) {
		if (results.has(item.id)) {
			continue;
		}
		const cacheKey = buildTranslationCacheKey(
			normalizeTranslationCacheText(item.text),
			normalizeTranslationCacheText(item.context || ''),
			target,
			resolvedModel
		);
		const primaryItem = requestDedup.get(cacheKey);
		if (primaryItem && results.has(primaryItem.id)) {
			results.set(item.id, results.get(primaryItem.id)!);
		}
	}

	await saveTranslationCacheStore(cacheStore, now);

	void appendTranslationLog({
		level: 'info',
		scope: 'background',
		message: `Translation batch completed (${items.length} items)`,
		details: `provider=${resolvedProvider}; model=${resolvedModel}; target=${target}; cacheHits=${cacheHits}; remote=${itemsToTranslate.length}`,
	});

	return items.map((item) => ({
		id: item.id,
		text: results.get(item.id) || item.text,
	}));
}

function resolveTranslationModel(
	model: string | undefined,
	provider: TranslationProvider,
	settings: TranslationSettings
) {
	if (model?.trim()) {
		return model.trim();
	}

	if (provider === 'openai-compatible' && settings.translationModel.trim()) {
		return settings.translationModel.trim();
	}

	return getTranslationModelForProvider(provider);
}


async function getTranslationCacheStore() {
	const result = await chrome.storage.local.get([TRANSLATION_CACHE_KEY]);
	const now = Date.now();
	const cacheStore = ((result[TRANSLATION_CACHE_KEY] || {}) as TranslationCacheStore);
	const prunedEntries = Object.entries(cacheStore)
		.filter(([, entry]) => now - entry.updatedAt <= TRANSLATION_CACHE_TTL_MS)
		.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
		.slice(0, TRANSLATION_CACHE_MAX_ENTRIES);
	const prunedStore = Object.fromEntries(prunedEntries) as TranslationCacheStore;

	if (Object.keys(prunedStore).length !== Object.keys(cacheStore).length) {
		await chrome.storage.local.set({
			[TRANSLATION_CACHE_KEY]: prunedStore,
		});
	}

	return prunedStore;
}

async function saveTranslationCacheStore(cacheStore: TranslationCacheStore, now: number) {
	const entries = Object.entries(cacheStore)
		.filter(([, entry]) => now - entry.updatedAt <= TRANSLATION_CACHE_TTL_MS)
		.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
		.slice(0, TRANSLATION_CACHE_MAX_ENTRIES);

	await chrome.storage.local.set({
		[TRANSLATION_CACHE_KEY]: Object.fromEntries(entries),
	});
}

function buildTranslationCacheKey(
	text: string,
	context: string,
	targetLanguage: string,
	model: string
) {
	return `${model}::${targetLanguage}::${hashTranslationText(`${text}@@${context}`)}`;
}

function normalizeTranslationCacheText(text: string) {
	return text.replace(/\s+/g, ' ').trim();
}

function isMatchingCacheEntry(
	entry: TranslationCacheEntry,
	sourceText: string,
	normalizedSourceText: string,
	sourceContext: string,
	normalizedSourceContext: string
) {
	if (
		entry.sourceText === sourceText &&
		(entry.sourceContext || '') === sourceContext
	) {
		return true;
	}

	if (entry.normalizedSourceText) {
		return (
			entry.normalizedSourceText === normalizedSourceText &&
			(entry.normalizedSourceContext || '') === normalizedSourceContext
		);
	}

	return (
		normalizeTranslationCacheText(entry.sourceText) === normalizedSourceText &&
		normalizeTranslationCacheText(entry.sourceContext || '') === normalizedSourceContext
	);
}

function hashTranslationText(text: string) {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}

function getTranslationSettings() {
	return new Promise<TranslationSettings>((resolve) => {
		chrome.storage.local.get(
			[
				'translationProvider',
				'translationBaseUrl',
				'translationApiKey',
				'translationModel',
				'translationTargetLanguage',
				'translationDisplayMode',
				'translationFloatingBallEnabled',
			],
				(result) => {
				const storage = result as Record<string, unknown>;
				resolve({
					translationProvider:
						(storage.translationProvider as TranslationProvider) ||
						DEFAULT_TRANSLATION_PROVIDER,
					translationBaseUrl: (storage.translationBaseUrl as string) || '',
					translationApiKey: (storage.translationApiKey as string) || '',
					translationModel:
						(storage.translationModel as string) || getTranslationModelForProvider(
							(storage.translationProvider as TranslationProvider) ||
								DEFAULT_TRANSLATION_PROVIDER
						),
					translationTargetLanguage:
						(storage.translationTargetLanguage as string) || DEFAULT_TARGET_LANGUAGE,
					translationDisplayMode:
						(storage.translationDisplayMode as TranslationSettings['translationDisplayMode']) ||
						DEFAULT_TRANSLATION_DISPLAY_MODE,
					translationFloatingBallEnabled:
						(storage.translationFloatingBallEnabled as boolean | undefined) ??
						DEFAULT_FLOATING_BALL_ENABLED,
				});
			}
		);
	});
}


async function sendMessageToTab(
	tabId: number,
	message: Record<string, unknown>
) {
	try {
		return await chrome.tabs.sendMessage(tabId, message);
	} catch (error) {
		console.warn('Failed to deliver message to tab', { tabId, message, error });
		return null;
	}
}
