console.log('Revornix Extenson injected into page:', window.location.href);
import { extractCoverImage, extractPageDescription } from '@/lib/utils';
import {
	DEFAULT_TRANSLATION_DISPLAY_MODE,
	DEFAULT_TRANSLATION_PROVIDER,
	DEFAULT_TARGET_LANGUAGE,
	TRANSLATION_SITE_RULES_KEY,
	type TranslationSiteRules,
} from '@/lib/translation';
import {
	handleShareImage,
	handleShareLink,
	handleSharePage,
	handleShareSelection,
} from './share';
import { floatingTranslationWidget } from './floating-translation-widget';
import { pageTranslator } from './page-translator';

void floatingTranslationWidget.mount();
startLocationWatcher();

let selectionTranslationPopup: HTMLDivElement | null = null;

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
	switch (message.type) {
		case 'GET_PAGE_DATA':
			sendResponse({
				title: document.title,
				description: extractPageDescription(),
				cover: extractCoverImage(),
				html: document.documentElement.outerHTML,
			});
			return false;

		case 'SHARE_PAGE_TO_REVORNIX':
			void handleSharePage(message);
			return false;

		case 'SHARE_SELECTION_TO_REVORNIX':
			void handleShareSelection(message);
			return false;

		case 'SHARE_LINK_TO_REVORNIX':
			void handleShareLink(message);
			return false;

		case 'SHARE_IMAGE_TO_REVORNIX':
			void handleShareImage(message);
			return false;

		case 'TRANSLATE_PAGE': {
			void (async () => {
				try {
					const defaults = await getDefaultTranslationOptions();
					const result = await pageTranslator.translatePage({
						targetLanguage: message.payload?.targetLanguage || defaults.targetLanguage,
						mode: message.payload?.mode || defaults.mode,
						model: message.payload?.model || defaults.model,
						provider: message.payload?.provider || defaults.provider,
					});
					sendResponse({ success: true, ...result });
				} catch (error) {
					sendResponse({
						success: false,
						error:
							error instanceof Error ? error.message : 'Failed to translate page.',
					});
				}
			})();
			return true;
		}

		case 'RESTORE_PAGE_TRANSLATION': {
			try {
				const result = pageTranslator.restorePage();
				sendResponse({ success: true, ...result });
			} catch (error) {
				sendResponse({
					success: false,
					error:
						error instanceof Error ? error.message : 'Failed to restore page.',
				});
			}
			return false;
		}

		case 'TRANSLATE_SELECTION': {
			void (async () => {
				try {
					const text = (message.payload?.text as string | undefined)?.trim();
					if (!text) {
						showSelectionTranslationPopup('请先选中要翻译的文本');
						sendResponse({ success: false, error: 'No selected text.' });
						return;
					}

					const defaults = await getDefaultTranslationOptions();
					const response = await chrome.runtime.sendMessage({
						type: 'TRANSLATE_TEXT_BATCH',
						payload: {
							items: [{ id: 'selection-translation', text }],
							targetLanguage: defaults.targetLanguage,
							model: defaults.model,
							provider: defaults.provider,
						},
					});
					if (!response?.success) {
						throw new Error(response?.error || 'Failed to translate selected text.');
					}

					const translatedText = response.data?.translations?.[0]?.text || text;
					showSelectionTranslationPopup(translatedText);
					sendResponse({ success: true, translatedText });
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: 'Failed to translate selected text.';
					showSelectionTranslationPopup(message, true);
					sendResponse({ success: false, error: message });
				}
			})();
			return true;
		}

		default:
			return false;
	}
});

async function getDefaultTranslationOptions() {
	const result = await chrome.storage.local.get([
		'translationTargetLanguage',
		'translationDisplayMode',
		TRANSLATION_SITE_RULES_KEY,
	]);
	const hostname = window.location.hostname;
	const siteRules = (result[TRANSLATION_SITE_RULES_KEY] || {}) as TranslationSiteRules;
	const siteRule = siteRules[hostname] || {};

	return {
		targetLanguage:
			siteRule.targetLanguage ||
			result.translationTargetLanguage ||
			DEFAULT_TARGET_LANGUAGE,
		mode:
			siteRule.displayMode ||
			result.translationDisplayMode ||
			DEFAULT_TRANSLATION_DISPLAY_MODE,
		provider:
			siteRule.provider ||
			result.translationProvider ||
			DEFAULT_TRANSLATION_PROVIDER,
		model: siteRule.model || result.translationModel || undefined,
	};
}

function startLocationWatcher() {
	let previousUrl = window.location.href;

	const syncLocation = () => {
		const nextUrl = window.location.href;
		if (nextUrl === previousUrl) {
			return;
		}

		pageTranslator.handleLocationChange(nextUrl, previousUrl);
		previousUrl = nextUrl;
	};

	const intervalId = window.setInterval(syncLocation, 300);
	window.addEventListener('popstate', syncLocation);
	window.addEventListener('hashchange', syncLocation);
	window.addEventListener('beforeunload', () => {
		window.clearInterval(intervalId);
		window.removeEventListener('popstate', syncLocation);
		window.removeEventListener('hashchange', syncLocation);
	}, { once: true });
}

function showSelectionTranslationPopup(text: string, isError = false) {
	const selection = window.getSelection();
	const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
	const rect = range?.getBoundingClientRect();

	if (!selectionTranslationPopup) {
		selectionTranslationPopup = document.createElement('div');
		selectionTranslationPopup.dataset.revornixSelectionTranslation = 'true';
		Object.assign(selectionTranslationPopup.style, {
			position: 'fixed',
			zIndex: '2147483647',
			maxWidth: '360px',
			padding: '12px 14px',
			borderRadius: '14px',
			background: 'rgba(15, 23, 42, 0.96)',
			color: '#fff',
			fontSize: '13px',
			lineHeight: '1.55',
			boxShadow: '0 18px 40px rgba(15, 23, 42, 0.35)',
			backdropFilter: 'blur(12px)',
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word',
		} satisfies Partial<CSSStyleDeclaration>);
		(document.body || document.documentElement).appendChild(selectionTranslationPopup);
	}

	selectionTranslationPopup.textContent = text;
	selectionTranslationPopup.style.background = isError
		? 'rgba(153, 27, 27, 0.96)'
		: 'rgba(15, 23, 42, 0.96)';
	selectionTranslationPopup.style.top = rect
		? `${Math.min(window.innerHeight - 24, rect.bottom + 12)}px`
		: '24px';
	selectionTranslationPopup.style.left = rect
		? `${Math.min(window.innerWidth - 384, Math.max(16, rect.left))}px`
		: '24px';

	window.setTimeout(() => {
		if (selectionTranslationPopup) {
			selectionTranslationPopup.remove();
			selectionTranslationPopup = null;
		}
	}, isError ? 4800 : 4200);
}
