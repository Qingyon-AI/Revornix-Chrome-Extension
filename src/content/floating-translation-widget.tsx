import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import widgetStyles from './index.css?inline';
import {
	ChevronUp,
	Languages,
	LoaderCircle,
	PanelRightClose,
	RotateCcw,
	Settings2,
	Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
	appendTranslationLog,
	readTranslationLogs,
	TRANSLATION_LOGS_KEY,
	type TranslationLogEntry,
} from '@/lib/logging';
import { formatCopy, getUiCopy } from '@/lib/ui-copy';
import { DEFAULT_UI_LANGUAGE, DEFAULT_UI_THEME, resolveUiTheme, type UiLanguage, type UiTheme } from '@/lib/ui-preferences';
import {
	COMMON_TRANSLATION_MODELS,
	DEFAULT_FLOATING_BALL_ENABLED,
	DEFAULT_TARGET_LANGUAGE,
	DEFAULT_TRANSLATION_DISPLAY_MODE,
	DEFAULT_TRANSLATION_PROVIDER,
	TRANSLATION_PROVIDER_OPTIONS,
	TRANSLATION_SITE_RULES_KEY,
	type TranslationDisplayMode,
	type TranslationProvider,
	type TranslationSiteRules,
} from '@/lib/translation';
import { pageTranslator } from './page-translator';
import { RevornixSidePanel } from './revornix-side-panel';

interface WidgetSettings {
	translationTargetLanguage: string;
	translationDisplayMode: TranslationDisplayMode;
	translationProvider: TranslationProvider;
	translationModel: string;
	translationFloatingBallEnabled: boolean;
	translationFloatingBallTop: number;
	translationFloatingBallSide: 'left' | 'right';
	autoTranslateCurrentSite: boolean;
	uiLanguage: UiLanguage;
	uiTheme: UiTheme;
}

const TARGET_LANGUAGE_OPTIONS = [
	'简体中文',
	'繁體中文',
	'English',
	'日本語',
	'한국어',
];

const STORAGE_KEYS: string[] = [
	'translationTargetLanguage',
	'translationDisplayMode',
	'translationProvider',
	'translationModel',
	'translationFloatingBallEnabled',
	'translationFloatingBallTop',
	'translationFloatingBallSide',
	'uiLanguage',
	'uiTheme',
	TRANSLATION_SITE_RULES_KEY,
] as const;

function getDefaultSettings(): WidgetSettings {
	return {
		translationTargetLanguage: DEFAULT_TARGET_LANGUAGE,
		translationDisplayMode: DEFAULT_TRANSLATION_DISPLAY_MODE,
		translationProvider: DEFAULT_TRANSLATION_PROVIDER,
		translationModel: '',
		translationFloatingBallEnabled: DEFAULT_FLOATING_BALL_ENABLED,
		translationFloatingBallTop: 0.5,
		translationFloatingBallSide: 'right',
		autoTranslateCurrentSite: false,
		uiLanguage: DEFAULT_UI_LANGUAGE,
		uiTheme: DEFAULT_UI_THEME,
	};
}

async function loadWidgetSettings(): Promise<WidgetSettings> {
	const result = (await chrome.storage.local.get(STORAGE_KEYS)) as Record<string, unknown>;
	const hostname = window.location.hostname;
	const siteRules = (result[TRANSLATION_SITE_RULES_KEY] || {}) as TranslationSiteRules;
	const siteRule = siteRules[hostname] || {};

	return {
		translationTargetLanguage:
			siteRule.targetLanguage ||
			(result.translationTargetLanguage as string) ||
			DEFAULT_TARGET_LANGUAGE,
		translationDisplayMode:
			siteRule.displayMode ||
			(result.translationDisplayMode as TranslationDisplayMode) ||
			DEFAULT_TRANSLATION_DISPLAY_MODE,
		translationProvider:
			siteRule.provider ||
			(result.translationProvider as TranslationProvider) ||
			DEFAULT_TRANSLATION_PROVIDER,
		translationModel: siteRule.model || (result.translationModel as string) || '',
		translationFloatingBallEnabled:
			(result.translationFloatingBallEnabled as boolean | undefined) ?? DEFAULT_FLOATING_BALL_ENABLED,
		translationFloatingBallTop:
			typeof result.translationFloatingBallTop === 'number'
				? result.translationFloatingBallTop
				: 0.5,
			translationFloatingBallSide:
				result.translationFloatingBallSide === 'left' ? 'left' : 'right',
			autoTranslateCurrentSite: Boolean(siteRule.autoTranslate),
				uiLanguage: (result.uiLanguage as UiLanguage) || DEFAULT_UI_LANGUAGE,
				uiTheme: (result.uiTheme as UiTheme) || DEFAULT_UI_THEME,
			};
}

async function updateSiteRule(nextRule: {
	autoTranslate?: boolean;
	targetLanguage?: string;
	displayMode?: TranslationDisplayMode;
	provider?: TranslationProvider;
	model?: string;
}) {
	const hostname = window.location.hostname;
	const result = await chrome.storage.local.get([TRANSLATION_SITE_RULES_KEY]);
	const siteRules = (result[TRANSLATION_SITE_RULES_KEY] || {}) as TranslationSiteRules;
	siteRules[hostname] = {
		...siteRules[hostname],
		...nextRule,
	};
	await chrome.storage.local.set({
		[TRANSLATION_SITE_RULES_KEY]: siteRules,
	});
}

function FloatingTranslationWidgetApp({
}: {
	portalContainer?: HTMLElement | null;
}) {
	const [settings, setSettings] = useState<WidgetSettings>(getDefaultSettings());
	const [expanded, setExpanded] = useState(false);
	const [shortcutExpanded, setShortcutExpanded] = useState(false);
	const [translating, setTranslating] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [dragPreview, setDragPreview] = useState<{ left: number; top: number } | null>(null);
	const [movedDuringPointer, setMovedDuringPointer] = useState(false);
	const [translatorState, setTranslatorState] = useState(pageTranslator.getState());
	const [selectContainer, setSelectContainer] = useState<HTMLElement | null>(null);
	const [logs, setLogs] = useState<TranslationLogEntry[]>([]);
	const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
	const [currentUrl, setCurrentUrl] = useState(window.location.href);
	const [revornixPanelOpen, setRevornixPanelOpen] = useState(false);
	const closeTimerRef = useRef<number | null>(null);
	const lastAutoTranslatedUrlRef = useRef<string | null>(null);
	const dragOffsetRef = useRef(0);
	const dragOffsetXRef = useRef(0);
	const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
	const dragPreviewRef = useRef<{ left: number; top: number } | null>(null);
	const floatingTopRef = useRef(settings.translationFloatingBallTop);
	const floatingSideRef = useRef(settings.translationFloatingBallSide);
	const scopeRef = useRef<HTMLDivElement | null>(null);
	const copy = getUiCopy(settings.uiLanguage);

	useEffect(() => {
		floatingTopRef.current = settings.translationFloatingBallTop;
	}, [settings.translationFloatingBallTop]);

	useEffect(() => {
		floatingSideRef.current = settings.translationFloatingBallSide;
	}, [settings.translationFloatingBallSide]);

	useEffect(() => {
		if (scopeRef.current) {
			setSelectContainer(scopeRef.current);
		}
	}, []);

	useEffect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) {
				return;
			}

			const rootNode = scopeRef.current;
			const insideWidget = Boolean(rootNode?.contains(target));
			const insideRevornixPanel =
				target instanceof Element &&
				Boolean(target.closest('[data-revornix-side-panel="true"]'));
			if (insideWidget || insideRevornixPanel) {
				return;
			}

			setExpanded(false);
			setShortcutExpanded(false);
		};

		window.addEventListener('pointerdown', handlePointerDown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
		};
	}, []);

	useEffect(() => {
		let previousUrl = window.location.href;
		const syncUrl = () => {
			if (window.location.href === previousUrl) {
				return;
			}

			previousUrl = window.location.href;
			setCurrentUrl(previousUrl);
		};

		const intervalId = window.setInterval(syncUrl, 400);
		window.addEventListener('popstate', syncUrl);
		window.addEventListener('hashchange', syncUrl);
		return () => {
			window.clearInterval(intervalId);
			window.removeEventListener('popstate', syncUrl);
			window.removeEventListener('hashchange', syncUrl);
		};
	}, []);

	useEffect(() => {
		const applyTheme = () => {
			setResolvedTheme(resolveUiTheme(settings.uiTheme));
		};
		applyTheme();
		if (settings.uiTheme !== 'system') {
			return;
		}
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => applyTheme();
		mediaQuery.addEventListener('change', handler);
		return () => {
			mediaQuery.removeEventListener('change', handler);
		};
	}, [settings.uiTheme]);

	useEffect(() => {
		return pageTranslator.subscribe((nextState) => {
			setTranslatorState(nextState);
			setTranslating(
				nextState.status === 'translating' || nextState.status === 'cancelling'
			);
		});
	}, []);

	useEffect(() => {
		void loadWidgetSettings().then((next) => {
			setSettings(next);
		});

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string
		) => {
			if (areaName !== 'local') {
				return;
			}

				if (
					changes.translationTargetLanguage ||
					changes.translationDisplayMode ||
					changes.translationProvider ||
						changes.translationModel ||
					changes.translationFloatingBallEnabled ||
					changes.translationFloatingBallTop ||
					changes.translationFloatingBallSide ||
					changes.uiLanguage ||
					changes.uiTheme ||
					changes[TRANSLATION_SITE_RULES_KEY]
				) {
				void loadWidgetSettings().then((next) => {
					setSettings(next);
				});
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	useEffect(() => {
		void readTranslationLogs().then((nextLogs) => {
			setLogs(nextLogs.slice(-8).reverse());
		});

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string
		) => {
			if (areaName !== 'local' || !changes[TRANSLATION_LOGS_KEY]) {
				return;
			}

			const nextLogs = (changes[TRANSLATION_LOGS_KEY].newValue || []) as TranslationLogEntry[];
			setLogs(nextLogs.slice(-8).reverse());
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	useEffect(() => {
		if (!settings.autoTranslateCurrentSite) {
			lastAutoTranslatedUrlRef.current = null;
		}
	}, [settings.autoTranslateCurrentSite, currentUrl]);

	useEffect(() => {
		if (
			!settings.translationFloatingBallEnabled ||
			!settings.autoTranslateCurrentSite
		) {
			return;
		}

		if (lastAutoTranslatedUrlRef.current === currentUrl) {
			return;
		}

		lastAutoTranslatedUrlRef.current = currentUrl;
		window.setTimeout(() => {
			void runTranslate(true).catch((error) => {
				lastAutoTranslatedUrlRef.current = null;
				console.warn('Auto translate failed', error);
			});
		}, 250);
	}, [currentUrl, settings.autoTranslateCurrentSite, settings.translationFloatingBallEnabled]);

	const cancelCloseTimer = () => {
		if (closeTimerRef.current !== null) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	};

	const persistSetting = async <K extends keyof WidgetSettings>(
		key: K,
		value: WidgetSettings[K]
	) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
		await chrome.storage.local.set({
			[key]: value,
		});
	};

	const runTranslate = async (forceRetranslate = false) => {
		if (translating) {
			return;
		}

		const state = pageTranslator.getState();
		const shouldRetranslate =
			forceRetranslate ||
			(state.status === 'translated' &&
				(state.targetLanguage !== settings.translationTargetLanguage ||
					state.mode !== settings.translationDisplayMode ||
					state.model !== (settings.translationModel || null)));

		setTranslating(true);
		try {
			if (shouldRetranslate && state.status === 'translated') {
				pageTranslator.restorePage();
			}

				await pageTranslator.translatePage({
					targetLanguage: settings.translationTargetLanguage,
					mode: settings.translationDisplayMode,
					provider: settings.translationProvider,
					model: settings.translationModel || undefined,
				});
			} finally {
				setTranslating(false);
			}
		};

	const runRestore = async () => {
		pageTranslator.restorePage();
	};

	const runCancel = async () => {
		pageTranslator.cancelTranslation();
	};

	const progressPercent =
		translatorState.totalNodes > 0
			? Math.min(
					100,
					Math.round((translatorState.completedNodes / translatorState.totalNodes) * 100)
				)
			: 0;

	const floatingCenterTop = dragPreview
		? dragPreview.top
		: Math.round(settings.translationFloatingBallTop * window.innerHeight);
	const shortcutDirectionX = settings.translationFloatingBallSide === 'left' ? 1 : -1;
	const orbitVerticalMode =
		floatingCenterTop < 120 ? 'down' : floatingCenterTop > window.innerHeight - 120 ? 'up' : 'split';
	const shortcutXOffset = shortcutDirectionX * 58;
	const shortcutYOffsets =
		orbitVerticalMode === 'down'
			? [18, 62]
			: orbitVerticalMode === 'up'
				? [-62, -18]
				: [-28, 28];
	const translationShortcutStyle =
		{
			transform: `translate(${shortcutXOffset}px, ${shortcutYOffsets[0]}px)`,
		};
	const revornixShortcutStyle =
		{
			transform: `translate(${shortcutXOffset}px, ${shortcutYOffsets[1]}px)`,
		};
	const panelMaxHeight = Math.min(Math.round(window.innerHeight * 0.7), 560);
	const floatingButtonSize = 40;
	const panelVerticalAnchor =
		floatingCenterTop < window.innerHeight * 0.33
			? 'below'
			: floatingCenterTop > window.innerHeight * 0.67
				? 'above'
				: 'center';
	const panelRelativeTop =
		panelVerticalAnchor === 'below'
			? 0
			: panelVerticalAnchor === 'above'
				? floatingButtonSize - panelMaxHeight
				: floatingButtonSize / 2 - panelMaxHeight / 2;
	const panelVerticalAnimationClass =
		panelVerticalAnchor === 'below'
			? 'data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2'
			: panelVerticalAnchor === 'above'
				? 'data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2'
				: settings.translationFloatingBallSide === 'left'
					? 'data-[state=closed]:slide-out-to-left-2 data-[state=open]:slide-in-from-left-2'
					: 'data-[state=closed]:slide-out-to-right-2 data-[state=open]:slide-in-from-right-2';

	const handleBallClick = async () => {
		if (movedDuringPointer) {
			setMovedDuringPointer(false);
			return;
		}

		setExpanded(false);
		setShortcutExpanded((prev) => !prev);
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const button = event.currentTarget;
		event.preventDefault();
		event.stopPropagation();
		cancelCloseTimer();
		setDragging(false);
		setDragPreview(null);
		setMovedDuringPointer(false);
		pointerStartRef.current = { x: event.clientX, y: event.clientY };
		const buttonRect = button.getBoundingClientRect();
		dragOffsetRef.current = event.clientY - buttonRect.top;
		dragOffsetXRef.current =
			event.clientX - buttonRect.left;
		button.setPointerCapture(event.pointerId);
		document.body.style.userSelect = 'none';

		const onPointerMove = (moveEvent: PointerEvent) => {
			const startPoint = pointerStartRef.current;
			if (!startPoint) {
				return;
			}

			const movedX = Math.abs(moveEvent.clientX - startPoint.x);
			const movedY = Math.abs(moveEvent.clientY - startPoint.y);
			if (!dragging && movedX < 4 && movedY < 4) {
				return;
			}

			const centerY =
				moveEvent.clientY -
				dragOffsetRef.current +
				button.offsetHeight / 2;
			const normalized = centerY / window.innerHeight;
			const clamped = Math.min(0.92, Math.max(0.08, normalized));
			const nextTop = Math.round(clamped * window.innerHeight);
			const nextLeft = Math.min(
				window.innerWidth - button.offsetWidth - 8,
				Math.max(8, moveEvent.clientX - dragOffsetXRef.current)
			);
			setDragging(true);
			setMovedDuringPointer(true);
			floatingTopRef.current = clamped;
			const nextPreview = {
				left: nextLeft,
				top: nextTop,
			};
			dragPreviewRef.current = nextPreview;
			setDragPreview(nextPreview);
		};

		const cleanupPointerTracking = () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerCancel);
			document.body.style.userSelect = '';
			pointerStartRef.current = null;
			if (button.isConnected && button.hasPointerCapture(event.pointerId)) {
				button.releasePointerCapture(event.pointerId);
			}
		};

		const onPointerUp = () => {
			cleanupPointerTracking();
			if (!dragPreviewRef.current && !dragging) {
				return;
			}
			const currentLeft =
				dragPreviewRef.current?.left ?? button.getBoundingClientRect().left;
			const snappedSide: 'left' | 'right' =
				currentLeft + button.offsetWidth / 2 < window.innerWidth / 2
					? 'left'
					: 'right';
			setSettings((prev) => ({
				...prev,
				translationFloatingBallTop: floatingTopRef.current,
				translationFloatingBallSide: snappedSide,
			}));
			void chrome.storage.local.set({
				translationFloatingBallTop: floatingTopRef.current,
				translationFloatingBallSide: snappedSide,
			});
			dragPreviewRef.current = null;
			setDragPreview(null);
			window.setTimeout(() => {
				setDragging(false);
			}, 0);
		};

		const onPointerCancel = () => {
			cleanupPointerTracking();
			dragPreviewRef.current = null;
			setDragPreview(null);
			window.setTimeout(() => {
				setDragging(false);
			}, 0);
		};

		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp, { once: true });
		window.addEventListener('pointercancel', onPointerCancel, { once: true });
	};

	if (!settings.translationFloatingBallEnabled) {
		return null;
	}

	return (
		<>
			<div
				ref={scopeRef}
				className={`revornix-widget-scope fixed z-[2147483646] ${resolvedTheme === 'dark' ? 'dark' : ''}`}
				style={{
					top: dragPreview
						? `${dragPreview.top}px`
						: `${Math.round(settings.translationFloatingBallTop * 100)}%`,
					transform: dragPreview ? 'translateY(-50%)' : 'translateY(-50%)',
					left:
						dragPreview
							? `${dragPreview.left}px`
							: settings.translationFloatingBallSide === 'left'
								? '18px'
								: undefined,
					right:
						dragPreview
							? undefined
							: settings.translationFloatingBallSide === 'right'
								? '18px'
							: undefined,
				}}>
				<div
					className="relative flex items-center"
					onMouseEnter={() => {
						cancelCloseTimer();
						setShortcutExpanded(true);
					}}
					onMouseLeave={() => {
						if (!expanded) {
							cancelCloseTimer();
							setShortcutExpanded(false);
						}
					}}>
					<div className="pointer-events-none absolute left-1/2 top-1/2 h-[180px] w-[160px] -translate-x-1/2 -translate-y-1/2">
						<div
							className={`absolute inset-0 transition-opacity duration-200 ${
								shortcutExpanded
									? 'pointer-events-auto opacity-100'
									: 'pointer-events-none opacity-0'
							}`}>
						<Button
							type="button"
							size="icon"
							variant="secondary"
							className="absolute left-1/2 top-1/2 z-20 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background/95 shadow-xl transition-[transform,opacity] duration-200"
							style={translationShortcutStyle}
							onMouseEnter={cancelCloseTimer}
							onPointerDown={(event) => {
								event.preventDefault();
								event.stopPropagation();
							}}
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								cancelCloseTimer();
								setShortcutExpanded(false);
								setRevornixPanelOpen(false);
								setExpanded(true);
							}}>
							<Languages className="size-4" />
						</Button>
						<Button
							type="button"
							size="icon"
							variant="secondary"
							className="absolute left-1/2 top-1/2 z-20 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background/95 shadow-xl transition-[transform,opacity] duration-200"
							style={revornixShortcutStyle}
							onMouseEnter={cancelCloseTimer}
							onPointerDown={(event) => {
								event.preventDefault();
								event.stopPropagation();
							}}
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								cancelCloseTimer();
								setShortcutExpanded(false);
								setExpanded(false);
								setRevornixPanelOpen(true);
							}}>
							<PanelRightClose className="size-4" />
						</Button>
					</div>
					</div>
					<div
						data-state={expanded ? 'open' : 'closed'}
						className={`absolute z-30 w-[280px] rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur transition-[opacity,transform] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${panelVerticalAnimationClass} ${
							settings.translationFloatingBallSide === 'left'
								? 'left-[52px]'
								: 'right-[52px]'
						} ${
							expanded ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
						}`}
						style={{
							top: `${panelRelativeTop}px`,
							maxHeight: `${panelMaxHeight}px`,
						}}
						onMouseEnter={() => {
							cancelCloseTimer();
							setExpanded(true);
							setShortcutExpanded(true);
						}}
						onMouseLeave={() => {
							cancelCloseTimer();
						}}>
						<div className="mb-3">
							<p className="text-sm font-semibold">{copy.widgetTitle}</p>
							<p className="text-xs text-muted-foreground">
								{copy.widgetSubtitle}
							</p>
						</div>
						<div
							className="space-y-3 overflow-y-auto px-0.5 pr-1"
							style={{ maxHeight: `${panelMaxHeight - 72}px` }}>
							<div className="space-y-1.5">
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									{copy.targetLanguage}
								</div>
							<Select
								value={settings.translationTargetLanguage}
								onValueChange={(value) => {
									void persistSetting('translationTargetLanguage', value);
									void updateSiteRule({ targetLanguage: value });
									}}>
									<SelectTrigger className="w-full" size="sm">
										<SelectValue placeholder={copy.targetLanguage} />
									</SelectTrigger>
								<SelectContent container={selectContainer}>
									{TARGET_LANGUAGE_OPTIONS.map((option) => (
										<SelectItem key={option} value={option}>
											{option}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

							<div className="space-y-1.5">
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									{copy.translationProvider}
								</div>
							<Select
								value={settings.translationProvider}
								onValueChange={(value) => {
									void persistSetting(
										'translationProvider',
										value as TranslationProvider
									);
									void updateSiteRule({
										provider: value as TranslationProvider,
									});
								}}>
								<SelectTrigger className="w-full" size="sm">
									<SelectValue placeholder={copy.translationProvider} />
								</SelectTrigger>
									<SelectContent container={selectContainer}>
										<SelectItem value={TRANSLATION_PROVIDER_OPTIONS[0]}>
											{copy.translationProviderOpenAI}
										</SelectItem>
										<SelectItem value={TRANSLATION_PROVIDER_OPTIONS[1]}>
											{copy.translationProviderGoogleFree}
										</SelectItem>
									</SelectContent>
								</Select>
						</div>

							<div className="space-y-1.5">
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									{copy.translationModel}
								</div>
							<Input
								list="revornix-translation-models"
								value={settings.translationModel}
								onChange={(event) => {
									setSettings((prev) => ({
										...prev,
										translationModel: event.target.value,
									}));
								}}
								onBlur={() => {
									void persistSetting('translationModel', settings.translationModel);
									void updateSiteRule({ model: settings.translationModel });
								}}
								placeholder="例如 gpt-4.1-mini"
								className="h-8 text-sm"
							/>
							<datalist id="revornix-translation-models">
								{COMMON_TRANSLATION_MODELS.map((model) => (
									<option key={model} value={model} />
								))}
							</datalist>
						</div>

							<div className="space-y-1.5">
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									{copy.displayMode}
								</div>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									size="sm"
									variant={
										settings.translationDisplayMode === 'translated-only'
											? 'default'
											: 'outline'
									}
										onClick={() => {
											void persistSetting(
												'translationDisplayMode',
												'translated-only'
											);
											void updateSiteRule({
												displayMode: 'translated-only',
											});
											pageTranslator.setDisplayMode('translated-only');
										}}>
										{copy.translatedOnly}
								</Button>
								<Button
									type="button"
									size="sm"
									variant={
										settings.translationDisplayMode === 'bilingual'
											? 'default'
											: 'outline'
									}
										onClick={() => {
											void persistSetting('translationDisplayMode', 'bilingual');
											void updateSiteRule({ displayMode: 'bilingual' });
											pageTranslator.setDisplayMode('bilingual');
										}}>
										{copy.bilingual}
								</Button>
							</div>
						</div>

							<div className="flex items-center justify-between rounded-lg border px-3 py-2">
								<div>
									<div className="text-sm font-medium">{copy.autoTranslateSite}</div>
									<div className="text-xs text-muted-foreground">
										{copy.autoTranslateSiteDesc}
									</div>
								</div>
							<Switch
								checked={settings.autoTranslateCurrentSite}
								onCheckedChange={(checked) => {
									setSettings((prev) => ({
										...prev,
										autoTranslateCurrentSite: checked,
									}));
									void updateSiteRule({ autoTranslate: checked });
								}}
							/>
						</div>

						<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									size="sm"
									variant={
										translatorState.status === 'cancelling' ? 'secondary' : 'default'
									}
									disabled={translatorState.status === 'cancelling'}
									onClick={() => {
										if (
											translatorState.status === 'translating' ||
											translatorState.status === 'cancelling'
										) {
											void runCancel().catch((error) => {
												console.warn('Cancel translation failed', error);
											});
											return;
										}

										void runTranslate(true).catch((error) => {
											console.warn('Manual translation failed', error);
										});
									}}>
										{translatorState.status === 'cancelling' ? (
											<LoaderCircle className="animate-spin" />
										) : (
											<Languages />
										)}
										{translatorState.status === 'cancelling'
											? copy.cancellingTranslation
											: translating
												? copy.cancelTranslation
												: copy.translateCurrentPage}
									</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={translatorState.status !== 'translated' || translating}
								onClick={() => {
									void runRestore().catch((error) => {
										console.warn('Restore translation failed', error);
									});
									}}>
									<RotateCcw />
									{copy.restoreOriginal}
								</Button>
							</div>

							<Button
								type="button"
								size="sm"
								variant="secondary"
								className="w-full"
								onClick={() => {
									void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' });
								}}>
								<Settings2 />
								{copy.openSettings}
							</Button>
							<div className="text-[11px] text-muted-foreground">
								{translatorState.status === 'translating'
									? formatCopy(copy.translatingProgress, {
											done: translatorState.completedNodes,
											total: translatorState.totalNodes,
										})
									: translatorState.status === 'cancelling'
										? copy.cancellingTranslationHint
									: translatorState.status === 'translated'
										? formatCopy(copy.translatedTo, {
												language:
													translatorState.targetLanguage || settings.translationTargetLanguage,
											})
										: copy.currentStateIdle}
							</div>
							<div className="space-y-1">
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
										style={{
											width:
												translatorState.status === 'translated'
													? '100%'
													: `${progressPercent}%`,
										}}
									/>
								</div>
								<div className="text-[10px] text-muted-foreground">
									{translatorState.status === 'translating'
										? formatCopy(copy.batchesCompleted, {
												done: translatorState.completedChunks,
												total: translatorState.totalChunks,
											})
										: translatorState.status === 'translated'
											? formatCopy(copy.processedNodes, {
													count: translatorState.totalNodes,
												})
											: copy.progressHint}
								</div>
							</div>
							<div className="min-w-0 space-y-1.5 rounded-xl border bg-muted/30 p-2 pb-3">
									<div className="flex items-center justify-between">
										<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
											{copy.translationLogs}
										</div>
										<div className="flex items-center gap-2">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												className="h-6 px-2 text-[10px]"
												onClick={() => {
													void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', tab: 'logs' });
													void appendTranslationLog({
														level: 'info',
														scope: 'ui',
														message: copy.logsPageOpened,
													});
												}}>
												{copy.openLogs}
											</Button>
											<div className="text-[10px] text-muted-foreground">
												{formatCopy(copy.recentLogs, { count: logs.length })}
											</div>
										</div>
									</div>
									<div className="min-w-0 max-h-28 space-y-1 overflow-x-hidden overflow-y-auto pr-1 pb-1">
										{logs.length === 0 ? (
											<div className="text-[11px] text-muted-foreground">
												{copy.recentLogsEmpty}
											</div>
										) : (
										logs.map((log) => (
											<div
												key={log.id}
												className="min-w-0 rounded-md bg-background/80 px-2 py-1.5 text-[10px] leading-4">
												<div className="flex min-w-0 items-start justify-between gap-2">
													<span className="min-w-0 break-words font-medium text-foreground">
														[{log.scope}] {log.message}
													</span>
														<span className="shrink-0 text-muted-foreground">
															{new Date(log.timestamp).toLocaleTimeString(
																settings.uiLanguage === 'en' ? 'en-US' : 'zh-CN',
																{
																hour: '2-digit',
																minute: '2-digit',
																second: '2-digit',
																hour12: false,
																}
															)}
														</span>
												</div>
												{log.details ? (
													<div className="mt-1 break-all text-muted-foreground">
														{log.details}
													</div>
												) : null}
											</div>
										))
									)}
								</div>
							</div>
						</div>
					</div>

					<Button
						type="button"
						size="icon"
						className={`relative z-10 size-10 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 ${
							expanded || shortcutExpanded ? 'ring-4 ring-ring/20' : ''
						} ${dragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}`}
						onPointerDown={handlePointerDown}
						onClick={() => {
							void handleBallClick();
						}}>
						{shortcutExpanded ? <ChevronUp /> : <Sparkles className="size-4" />}
					</Button>
				</div>
			</div>
			<RevornixSidePanel
				open={revornixPanelOpen}
				onClose={() => {
					setRevornixPanelOpen(false);
				}}
				currentUrl={currentUrl}
				uiLanguage={settings.uiLanguage}
			/>
		</>
	);
}

class FloatingTranslationWidget {
	private host: HTMLDivElement | null = null;
	private shadowRoot: ShadowRoot | null = null;
	private root: ReactDOM.Root | null = null;

	async mount() {
		if (this.host) {
			return;
		}

		this.host = document.createElement('div');
		this.host.id = 'revornix-translation-widget-root';
		this.shadowRoot = this.host.attachShadow({ mode: 'open' });
		const styleElement = document.createElement('style');
		styleElement.textContent = widgetStyles;
		this.shadowRoot.appendChild(styleElement);

		const appRoot = document.createElement('div');
		this.shadowRoot.appendChild(appRoot);
		document.body.appendChild(this.host);
		this.root = ReactDOM.createRoot(appRoot);
		this.root.render(<FloatingTranslationWidgetApp />);
		await appendTranslationLog({
			level: 'info',
			scope: 'ui',
			message: 'Mounted React floating translation widget in Shadow DOM',
		});
	}
}

export const floatingTranslationWidget = new FloatingTranslationWidget();
