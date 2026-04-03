console.log('Revornix Extenson injected into page:', window.location.href);
import { getUiCopy } from '@/lib/ui-copy';
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from '@/lib/ui-preferences';
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
let selectionTranslationCleanup: (() => void) | null = null;
let selectionSpeechUtterance: SpeechSynthesisUtterance | null = null;

const SPEAKER_ICON_SVG =
	'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
const STOP_ICON_SVG =
	'<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';

function detectSpeechLanguage(text: string) {
	const normalized = text.trim();
	if (!normalized) {
		return document.documentElement.lang || 'en-US';
	}

	if (/[\u4e00-\u9fff]/.test(normalized)) {
		return 'zh-CN';
	}

	if (/[\u3040-\u30ff]/.test(normalized)) {
		return 'ja-JP';
	}

	if (/[\uac00-\ud7af]/.test(normalized)) {
		return 'ko-KR';
	}

	return document.documentElement.lang || 'en-US';
}

function stopSelectionSpeech() {
	if ('speechSynthesis' in window) {
		window.speechSynthesis.cancel();
	}
	selectionSpeechUtterance = null;
}

function speakSelectionText(text: string) {
	if (!('speechSynthesis' in window) || !text.trim()) {
		return false;
	}

	stopSelectionSpeech();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = detectSpeechLanguage(text);
	utterance.rate = 0.96;
	utterance.pitch = 1;
	utterance.onend = () => {
		if (selectionSpeechUtterance === utterance) {
			selectionSpeechUtterance = null;
		}
	};
	utterance.onerror = () => {
		if (selectionSpeechUtterance === utterance) {
			selectionSpeechUtterance = null;
		}
	};
	selectionSpeechUtterance = utterance;
	window.speechSynthesis.speak(utterance);
	return true;
}

function collectSelectionContextText() {
	const selection = window.getSelection();
	const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
	const anchorNode = range?.commonAncestorContainer || selection?.anchorNode || null;
	const anchorElement =
		anchorNode instanceof Element
			? anchorNode
			: anchorNode?.parentElement || null;
	if (!anchorElement) {
		return '';
	}

	const contextCandidateSelectors = [
		'p',
		'li',
		'blockquote',
		'figcaption',
		'td',
		'th',
		'dd',
		'dt',
		'article',
		'section',
		'main',
		'div',
	];

	for (const selector of contextCandidateSelectors) {
		const candidate = anchorElement.closest(selector);
		const text = candidate?.textContent?.replace(/\s+/g, ' ').trim() || '';
		if (text.length >= 24 && text.length <= 1200) {
			return text;
		}
	}

	return anchorElement.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function getSelectionAnchorRect() {
	const selection = window.getSelection();
	const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
	const rect = range?.getBoundingClientRect();
	if (!rect) {
		return null;
	}

	return {
		top: rect.top,
		right: rect.right,
		bottom: rect.bottom,
		left: rect.left,
		width: rect.width,
		height: rect.height,
	};
}

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
				const text = (message.payload?.text as string | undefined)?.trim() || '';
				const anchorRect = getSelectionAnchorRect();
				const contextText = collectSelectionContextText();
				try {
					const defaults = await getDefaultTranslationOptions();
					const copy = getUiCopy(defaults.uiLanguage);
					if (!text) {
						showSelectionTranslationPopup({
							sourceText: '',
							translatedText: copy.selectionTranslateEmpty,
							targetLanguage: defaults.targetLanguage,
							provider: defaults.provider,
							uiLanguage: defaults.uiLanguage,
							anchorRect,
							isError: true,
						});
						sendResponse({ success: false, error: 'No selected text.' });
						return;
					}

					showSelectionTranslationPopup({
						sourceText: text,
						translatedText: copy.selectionTranslateLoading,
						targetLanguage: defaults.targetLanguage,
						provider: defaults.provider,
						uiLanguage: defaults.uiLanguage,
						anchorRect,
						isLoading: true,
					});

					const response = await chrome.runtime.sendMessage({
						type: 'TRANSLATE_TEXT_BATCH',
						payload: {
							items: [
								{
									id: 'selection-translation',
									text,
									context: contextText && contextText !== text ? contextText : undefined,
								},
							],
							targetLanguage: defaults.targetLanguage,
							provider: defaults.provider,
						},
					});
					if (!response?.success) {
						throw new Error(response?.error || 'Failed to translate selected text.');
					}

					const translatedText = response.data?.translations?.[0]?.text || text;
					showSelectionTranslationPopup({
						sourceText: text,
						translatedText,
						targetLanguage: defaults.targetLanguage,
						provider: defaults.provider,
						uiLanguage: defaults.uiLanguage,
						anchorRect,
					});
					sendResponse({ success: true, translatedText });
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: 'Failed to translate selected text.';
					const defaults = await getDefaultTranslationOptions();
					showSelectionTranslationPopup({
						sourceText: text,
						translatedText: errorMessage,
						targetLanguage: defaults.targetLanguage,
						provider: defaults.provider,
						uiLanguage: defaults.uiLanguage,
						anchorRect,
						isError: true,
					});
					sendResponse({ success: false, error: errorMessage });
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
		uiLanguage:
			(result.uiLanguage as UiLanguage | undefined) || DEFAULT_UI_LANGUAGE,
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
		stopSelectionSpeech();
	}, { once: true });
}

function showSelectionTranslationPopup({
	sourceText,
	translatedText,
	targetLanguage,
	provider,
	uiLanguage,
	anchorRect,
	isError = false,
	isLoading = false,
}: {
	sourceText: string;
	translatedText: string;
	targetLanguage: string;
	provider: string;
	uiLanguage: UiLanguage;
	anchorRect?: {
		top: number;
		right: number;
		bottom: number;
		left: number;
		width: number;
		height: number;
	} | null;
	isError?: boolean;
	isLoading?: boolean;
}) {
	const copy = getUiCopy(uiLanguage);
	const providerLabel =
		provider === 'google-free'
			? copy.translationProviderGoogleFree
			: copy.translationProviderOpenAI;

	if (!selectionTranslationPopup) {
		selectionTranslationPopup = document.createElement('div');
		selectionTranslationPopup.dataset.revornixSelectionTranslation = 'true';
		Object.assign(selectionTranslationPopup.style, {
			position: 'fixed',
			zIndex: '2147483647',
			width: 'min(420px, calc(100vw - 24px))',
			borderRadius: '24px',
			background: 'rgba(255, 255, 255, 0.96)',
			color: '#111827',
			boxShadow: '0 22px 56px rgba(15, 23, 42, 0.18)',
			backdropFilter: 'blur(18px)',
			border: '1px solid rgba(255,255,255,0.7)',
			overflow: 'hidden',
		} satisfies Partial<CSSStyleDeclaration>);
		(document.body || document.documentElement).appendChild(selectionTranslationPopup);
	}

	selectionTranslationPopup.innerHTML = '';

	const card = document.createElement('div');
	Object.assign(card.style, {
		padding: '18px',
		display: 'flex',
		flexDirection: 'column',
		gap: '16px',
		fontFamily:
			'"SF Pro Text","PingFang SC","Helvetica Neue",system-ui,sans-serif',
	});

	const header = document.createElement('div');
	Object.assign(header.style, {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: '12px',
	});

	const headerLeft = document.createElement('div');
	Object.assign(headerLeft.style, {
		display: 'flex',
		alignItems: 'center',
		gap: '10px',
		minWidth: '0',
	});

	const icon = document.createElement('div');
	icon.textContent = isLoading ? '…' : 'A';
	Object.assign(icon.style, {
		width: '32px',
		height: '32px',
		borderRadius: '10px',
		background: isError
			? 'linear-gradient(135deg, #fb7185, #be123c)'
			: isLoading
				? 'linear-gradient(135deg, #60a5fa, #2563eb)'
				: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
		color: '#fff',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontWeight: '700',
		fontSize: '14px',
		flexShrink: '0',
	});

	const headerText = document.createElement('div');
	Object.assign(headerText.style, {
		display: 'flex',
		flexDirection: 'column',
		gap: '3px',
		minWidth: '0',
	});

	const providerBadge = document.createElement('div');
	providerBadge.textContent = providerLabel;
	Object.assign(providerBadge.style, {
		fontSize: '15px',
		fontWeight: '700',
		color: '#111827',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	});

	const targetMeta = document.createElement('div');
	targetMeta.textContent = targetLanguage;
	Object.assign(targetMeta.style, {
		fontSize: '12px',
		color: '#6b7280',
	});

	headerText.append(providerBadge, targetMeta);
	headerLeft.append(icon, headerText);

	const headerActions = document.createElement('div');
	Object.assign(headerActions.style, {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		flexShrink: '0',
	});

	const speakButton = document.createElement('button');
	speakButton.type = 'button';
	speakButton.innerHTML = SPEAKER_ICON_SVG;
	speakButton.setAttribute('aria-label', copy.selectionTranslateSpeak);
	speakButton.title = copy.selectionTranslateSpeak;
	Object.assign(speakButton.style, {
		border: '0',
		borderRadius: '999px',
		background: '#f3f4f6',
		color: '#111827',
		padding: '8px',
		width: '32px',
		height: '32px',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		cursor: 'pointer',
	});
	speakButton.disabled = isLoading || !sourceText.trim();
	if (speakButton.disabled) {
		speakButton.style.opacity = '0.5';
		speakButton.style.cursor = 'default';
	}

	const copyButton = document.createElement('button');
	copyButton.type = 'button';
	copyButton.textContent = copy.revornixAiCopy;
	Object.assign(copyButton.style, {
		border: '0',
		borderRadius: '999px',
		background: '#f3f4f6',
		color: '#111827',
		padding: '8px 12px',
		fontSize: '12px',
		fontWeight: '600',
		cursor: 'pointer',
	});
	copyButton.disabled = isLoading || !translatedText.trim();
	if (copyButton.disabled) {
		copyButton.style.opacity = '0.5';
		copyButton.style.cursor = 'default';
	}

	const closeButton = document.createElement('button');
	closeButton.type = 'button';
	closeButton.textContent = '×';
	Object.assign(closeButton.style, {
		border: '0',
		background: 'transparent',
		color: '#9ca3af',
		fontSize: '26px',
		lineHeight: '1',
		cursor: 'pointer',
		padding: '0 4px',
	});

	headerActions.append(speakButton, copyButton, closeButton);
	header.append(headerLeft, headerActions);

	const createSection = (title: string, content: string, emphasize = false) => {
		const section = document.createElement('div');
		Object.assign(section.style, {
			borderRadius: '18px',
			background: emphasize ? '#f9fafb' : '#ffffff',
			border: emphasize ? '1px solid rgba(17,24,39,0.06)' : '1px solid rgba(17,24,39,0.08)',
			padding: '14px 16px',
			display: 'flex',
			flexDirection: 'column',
			gap: '8px',
		});

		const label = document.createElement('div');
		label.textContent = title;
		Object.assign(label.style, {
			fontSize: '12px',
			fontWeight: '700',
			color: '#9ca3af',
			textTransform: 'uppercase',
			letterSpacing: '0.08em',
		});

		const body = document.createElement('div');
		body.textContent = content;
		Object.assign(body.style, {
			fontSize: emphasize ? '16px' : '14px',
			lineHeight: emphasize ? '1.7' : '1.65',
			fontWeight: emphasize ? '600' : '500',
			color: isError && emphasize ? '#991b1b' : '#111827',
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word',
		});

		section.append(label, body);
		return section;
	};

	card.append(
		header,
		sourceText ? createSection(copy.revornixAiYou, sourceText) : document.createElement('div'),
		createSection(copy.revornixAiAssistant, translatedText, true),
	);

	if (!sourceText) {
		card.removeChild(card.children[1]);
	}

	selectionTranslationPopup.appendChild(card);

	const popupRect = selectionTranslationPopup.getBoundingClientRect();
	const popupWidth = popupRect.width || 420;
	const popupHeight = popupRect.height || 260;
	const gap = 12;
	const margin = 12;

	let left = margin;
	let top = margin;

	if (anchorRect) {
		const rightSpace = window.innerWidth - anchorRect.right - margin;
		const leftSpace = anchorRect.left - margin;
		const bottomSpace = window.innerHeight - anchorRect.bottom - margin;
		const topSpace = anchorRect.top - margin;

		if (rightSpace >= popupWidth + gap) {
			left = anchorRect.right + gap;
			top = anchorRect.top + anchorRect.height / 2 - popupHeight / 2;
		} else if (leftSpace >= popupWidth + gap) {
			left = anchorRect.left - popupWidth - gap;
			top = anchorRect.top + anchorRect.height / 2 - popupHeight / 2;
		} else if (bottomSpace >= popupHeight + gap) {
			left = anchorRect.left + anchorRect.width / 2 - popupWidth / 2;
			top = anchorRect.bottom + gap;
		} else if (topSpace >= popupHeight + gap) {
			left = anchorRect.left + anchorRect.width / 2 - popupWidth / 2;
			top = anchorRect.top - popupHeight - gap;
		} else {
			const horizontalPreference = rightSpace >= leftSpace;
			left = horizontalPreference
				? anchorRect.right + gap
				: anchorRect.left - popupWidth - gap;
			top = anchorRect.top + anchorRect.height / 2 - popupHeight / 2;
		}
	}

	selectionTranslationPopup.style.left = `${Math.min(
		window.innerWidth - popupWidth - margin,
		Math.max(margin, left),
	)}px`;
	selectionTranslationPopup.style.top = `${Math.min(
		window.innerHeight - popupHeight - margin,
		Math.max(margin, top),
	)}px`;

	const removePopup = () => {
		stopSelectionSpeech();
		if (selectionTranslationCleanup) {
			selectionTranslationCleanup();
			selectionTranslationCleanup = null;
		}
		if (selectionTranslationPopup) {
			selectionTranslationPopup.remove();
			selectionTranslationPopup = null;
		}
	};

	copyButton.onclick = async () => {
		if (isLoading || !translatedText.trim()) {
			return;
		}
		await navigator.clipboard.writeText(translatedText);
		copyButton.textContent = copy.revornixAiCopied;
		window.setTimeout(() => {
			copyButton.textContent = copy.revornixAiCopy;
		}, 1200);
	};
	speakButton.onclick = () => {
		if (isLoading || !sourceText.trim()) {
			return;
		}

		if (selectionSpeechUtterance) {
			stopSelectionSpeech();
			speakButton.innerHTML = SPEAKER_ICON_SVG;
			speakButton.setAttribute('aria-label', copy.selectionTranslateSpeak);
			speakButton.title = copy.selectionTranslateSpeak;
			return;
		}

		const started = speakSelectionText(sourceText);
		if (!started) {
			return;
		}

		speakButton.innerHTML = STOP_ICON_SVG;
		speakButton.setAttribute('aria-label', copy.selectionTranslateStop);
		speakButton.title = copy.selectionTranslateStop;
		window.setTimeout(() => {
			if (!selectionSpeechUtterance) {
				speakButton.innerHTML = SPEAKER_ICON_SVG;
				speakButton.setAttribute('aria-label', copy.selectionTranslateSpeak);
				speakButton.title = copy.selectionTranslateSpeak;
			}
		}, 0);
		if (selectionSpeechUtterance) {
			selectionSpeechUtterance.onend = () => {
				selectionSpeechUtterance = null;
				speakButton.innerHTML = SPEAKER_ICON_SVG;
				speakButton.setAttribute('aria-label', copy.selectionTranslateSpeak);
				speakButton.title = copy.selectionTranslateSpeak;
			};
			selectionSpeechUtterance.onerror = () => {
				selectionSpeechUtterance = null;
				speakButton.innerHTML = SPEAKER_ICON_SVG;
				speakButton.setAttribute('aria-label', copy.selectionTranslateSpeak);
				speakButton.title = copy.selectionTranslateSpeak;
			};
		}
	};
	closeButton.onclick = () => {
		removePopup();
	};

	const handleOutsidePointerDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (selectionTranslationPopup && target && !selectionTranslationPopup.contains(target)) {
			removePopup();
		}
	};

	selectionTranslationCleanup?.();
	selectionTranslationCleanup = () => {
		window.removeEventListener('pointerdown', handleOutsidePointerDown);
	};
	window.addEventListener('pointerdown', handleOutsidePointerDown);
}
