export const DEFAULT_TRANSLATION_MODEL = 'gpt-4.1-mini';
export const DEFAULT_TARGET_LANGUAGE = '简体中文';
export const DEFAULT_TRANSLATION_PROVIDER = 'openai-compatible';
export const TRANSLATION_MAX_CHUNK_CHARS = 3200;
export const TRANSLATION_MAX_CHUNK_ITEMS = 8;
export const TRANSLATION_MAX_CONCURRENCY = 40;
export const TRANSLATION_CACHE_KEY = 'translationCache';
export const TRANSLATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const TRANSLATION_CACHE_MAX_ENTRIES = 1500;
export const DEFAULT_TRANSLATION_DISPLAY_MODE = 'translated-only';
export const DEFAULT_FLOATING_BALL_ENABLED = true;
export const TRANSLATION_SITE_RULES_KEY = 'translationSiteRules';
export const COMMON_TRANSLATION_MODELS = [
	'gpt-4.1-mini',
	'gpt-4.1',
	'gpt-4o-mini',
	'gpt-4o',
	'gemini-2.5-flash',
	'gemini-2.5-pro',
	'claude-3-5-sonnet',
];

export const TRANSLATION_PROVIDER_OPTIONS = [
	'openai-compatible',
	'google-translate-free',
] as const;

export type TranslationProvider = (typeof TRANSLATION_PROVIDER_OPTIONS)[number];

export const TRANSLATION_PROVIDER_DEFAULT_MODELS: Record<TranslationProvider, string> = {
	'openai-compatible': DEFAULT_TRANSLATION_MODEL,
	'google-translate-free': 'google-translate-free',
};

export function getTranslationModelForProvider(provider: TranslationProvider) {
	return TRANSLATION_PROVIDER_DEFAULT_MODELS[provider];
}

export type TranslationDisplayMode = 'translated-only' | 'bilingual';

export interface TranslationSiteRule {
	autoTranslate?: boolean;
	targetLanguage?: string;
	displayMode?: TranslationDisplayMode;
	model?: string;
	provider?: TranslationProvider;
}

export type TranslationSiteRules = Record<string, TranslationSiteRule>;

export interface TranslationSettings {
	translationProvider: TranslationProvider;
	translationBaseUrl: string;
	translationApiKey: string;
	translationModel: string;
	translationTargetLanguage: string;
	translationDisplayMode: TranslationDisplayMode;
	translationFloatingBallEnabled: boolean;
	translationFloatingBallTop?: number;
	translationFloatingBallSide?: 'left' | 'right';
}

export interface TranslationItem {
	id: string;
	text: string;
	context?: string;
}

export interface TranslationRequestMessage {
	type: 'TRANSLATE_TEXT_BATCH';
	payload: {
		items: TranslationItem[];
		targetLanguage?: string;
		model?: string;
		provider?: TranslationProvider;
	};
}

export interface TranslationResponse {
	translations: TranslationItem[];
}
