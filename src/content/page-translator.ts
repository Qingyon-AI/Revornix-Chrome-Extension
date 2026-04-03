import {
	DEFAULT_TRANSLATION_DISPLAY_MODE,
	DEFAULT_TRANSLATION_PROVIDER,
	TRANSLATION_MAX_CHUNK_ITEMS,
	DEFAULT_TARGET_LANGUAGE,
	TRANSLATION_MAX_CONCURRENCY,
	TRANSLATION_MAX_CHUNK_CHARS,
	type TranslationDisplayMode,
	type TranslationItem,
	type TranslationProvider,
	type TranslationResponse,
} from '@/lib/translation';
import { appendTranslationLog } from '@/lib/logging';

interface TranslationEntry {
	id: string;
	node: Text;
	originalText: string;
	translatedText: string;
	blockElement: HTMLElement;
	anchorElement: HTMLElement;
}

interface EntryPriority {
	bucket: number;
	distance: number;
}

type TranslationRequestState = 'idle' | 'inflight' | 'done';

type TranslationStatus = 'idle' | 'translating' | 'cancelling' | 'translated';

interface TranslatorStateSnapshot {
	status: TranslationStatus;
	targetLanguage: string | null;
	mode: TranslationDisplayMode;
	model: string | null;
	provider: TranslationProvider;
	totalNodes: number;
	completedNodes: number;
	totalChunks: number;
	completedChunks: number;
}

interface TranslatePageOptions {
	targetLanguage?: string;
	mode?: TranslationDisplayMode;
	model?: string;
	provider?: TranslationProvider;
}

const SKIPPED_TAGS = new Set([
	'SCRIPT',
	'STYLE',
	'NOSCRIPT',
	'TEXTAREA',
	'INPUT',
	'SELECT',
	'OPTION',
	'CODE',
	'PRE',
	'KBD',
	'SAMP',
]);

const BLOCK_TAGS = new Set([
	'P',
	'DIV',
	'SECTION',
	'ARTICLE',
	'MAIN',
	'ASIDE',
	'HEADER',
	'FOOTER',
	'NAV',
	'LI',
	'BLOCKQUOTE',
	'FIGCAPTION',
	'TD',
	'TH',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
]);

const PRIORITY_VIEWPORT_MARGIN_PX = 480;
const PRIORITY_SMALL_CHUNK_ENTRY_COUNT = 24;
const PRIORITY_SMALL_CHUNK_MAX_ITEMS = 4;
const PRIORITY_SMALL_CHUNK_MAX_CHARS = 1200;
const SCROLL_RESPONSIVE_DISPATCH_WINDOW = 16;
const SCROLL_FOLLOW_MODE_MS = 1600;
const FOLLOW_CHUNK_MAX_ITEMS = 2;
const FOLLOW_CHUNK_MAX_CHARS = 520;

class PageTranslator {
	private entries = new Map<string, TranslationEntry>();
	private entryByNode = new WeakMap<Text, TranslationEntry>();
	private entryIdsByAnchor = new Map<HTMLElement, Set<string>>();
	private requestStateByEntryId = new Map<string, TranslationRequestState>();
	private bilingualBlocks = new Map<HTMLElement, HTMLDivElement>();
	private loadingBlocks = new Map<HTMLElement, HTMLDivElement>();
	private runtimeStyles: HTMLStyleElement | null = null;
	private observer: MutationObserver | null = null;
	private observeTimer: number | null = null;
	private queueReprioritizeTimer: number | null = null;
	private lastScrollPriorityAt = 0;
	private pendingNodes = new Set<Node>();
	private originalTitle: string | null = null;
	private status: TranslationStatus = 'idle';
	private indicator: HTMLDivElement | null = null;
	private currentTargetLanguage: string | null = null;
	private currentMode: TranslationDisplayMode = DEFAULT_TRANSLATION_DISPLAY_MODE;
	private currentModel: string | null = null;
	private currentProvider: TranslationProvider = DEFAULT_TRANSLATION_PROVIDER;
	private entryIdCounter = 0;
	private runSequence = 0;
	private activeRunId = 0;
	private totalNodes = 0;
	private completedNodes = 0;
	private totalChunks = 0;
	private completedChunks = 0;
	private listeners = new Set<(state: TranslatorStateSnapshot) => void>();

	async translatePage(options: TranslatePageOptions = {}) {
		const targetLanguage = options.targetLanguage || DEFAULT_TARGET_LANGUAGE;
		const mode = options.mode || DEFAULT_TRANSLATION_DISPLAY_MODE;
		const model = options.model;
		const provider = options.provider || DEFAULT_TRANSLATION_PROVIDER;

		if (this.status === 'translating') {
			throw new Error('Translation is already running.');
		}

		if (this.status === 'translated') {
			this.showIndicator(`Page already translated to ${targetLanguage}.`, 'info');
			return {
				status: 'already_translated' as const,
				count: this.entries.size,
			};
		}

		if (this.pageAlreadyMatchesTarget(targetLanguage)) {
			this.showIndicator(`This page already appears to be in ${targetLanguage}.`, 'info');
			return {
				status: 'skipped' as const,
				count: 0,
			};
		}

			this.status = 'translating';
			const runId = ++this.runSequence;
			this.activeRunId = runId;
		this.currentTargetLanguage = targetLanguage;
		this.currentMode = mode;
		this.currentModel = model || null;
		this.currentProvider = provider;
		this.totalNodes = 0;
		this.completedNodes = 0;
		this.totalChunks = 0;
		this.completedChunks = 0;
		this.emitState();
		void appendTranslationLog({
			level: 'info',
			scope: 'content',
			message: 'Page translation started',
			details: `url=${window.location.href}; target=${targetLanguage}; mode=${mode}; model=${model || 'default'}`,
		});
		this.updateLoadingIndicator();
		this.startObserving();

		try {
			const entries = this.collectEntriesFromNode(document.body);
			if (entries.length === 0) {
				this.stopObserving();
				this.status = 'idle';
				this.currentTargetLanguage = null;
				this.currentMode = DEFAULT_TRANSLATION_DISPLAY_MODE;
				this.currentModel = null;
				this.showIndicator('No translatable text found on this page.', 'info');
				void appendTranslationLog({
					level: 'warn',
					scope: 'content',
					message: 'No translatable text found on page',
					details: window.location.href,
				});
				return {
					status: 'empty' as const,
					count: 0,
				};
			}

			this.originalTitle = document.title;
				this.totalNodes = entries.length;
				this.emitState();
				this.updateLoadingIndicator();
				await Promise.all([
					this.translateEntries(entries, targetLanguage, mode, model, runId, provider),
					this.translateTitle(targetLanguage, model, runId, provider),
				]);

				if (runId !== this.activeRunId) {
					this.fullRestore();
					return {
						status: 'cancelled' as const,
						count: 0,
					};
				}

			document.documentElement.setAttribute('data-revornix-translated', 'true');
				document.documentElement.setAttribute(
					'data-revornix-target-language',
					targetLanguage
				);
				document.documentElement.setAttribute(
					'data-revornix-display-mode',
					this.currentMode
				);

			this.status = 'translated';
			this.completedNodes = this.totalNodes;
			this.completedChunks = this.totalChunks;
			this.emitState();
			this.flushPendingObservedNodes(120);
			void appendTranslationLog({
				level: 'info',
				scope: 'content',
				message: `Page translation completed (${this.entries.size} nodes)`,
				details: `url=${window.location.href}; target=${targetLanguage}; mode=${mode}`,
			});
			this.showIndicator(
				`Translated ${this.entries.size} text nodes to ${targetLanguage}.`,
				'success'
			);
			return {
				status: 'translated' as const,
				count: this.entries.size,
			};
			} catch (error) {
				if (error instanceof Error && error.message === 'Translation cancelled.') {
					this.fullRestore();
					this.showIndicator('Translation cancelled.', 'info');
					void appendTranslationLog({
						level: 'info',
						scope: 'content',
						message: 'Page translation cancelled',
						details: window.location.href,
					});
					return {
						status: 'cancelled' as const,
						count: 0,
					};
				}
				this.fullRestore();
			const message =
				error instanceof Error ? error.message : 'Translation failed unexpectedly.';
			void appendTranslationLog({
				level: 'error',
				scope: 'content',
				message: 'Page translation failed',
				details: message,
			});
			this.showIndicator(message, 'error', 6000);
			throw error;
		}
	}

	restorePage() {
		if (this.status === 'translating') {
			throw new Error('Please wait for the current translation to finish.');
		}

		if (this.entries.size === 0) {
			this.showIndicator('This page is already showing the original text.', 'info');
			return {
				status: 'idle' as const,
				count: 0,
			};
		}

		const restoredCount = this.entries.size;
		this.fullRestore();
		void appendTranslationLog({
			level: 'info',
			scope: 'content',
			message: `Page restored to original text (${restoredCount} nodes)`,
			details: window.location.href,
		});
		this.showIndicator('Original page restored.', 'success');
		return {
			status: 'restored' as const,
			count: restoredCount,
		};
	}

	cancelTranslation() {
		if (this.status !== 'translating' && this.status !== 'cancelling') {
			return {
				status: 'idle' as const,
			};
		}

		if (this.status === 'cancelling') {
			return {
				status: 'cancelling' as const,
			};
		}

		this.status = 'cancelling';
		this.activeRunId = ++this.runSequence;
		this.emitState();
		this.showIndicator('Stopping translation...', 'loading', 0);
		void appendTranslationLog({
			level: 'info',
			scope: 'content',
			message: 'Translation cancellation requested',
			details: window.location.href,
		});
		return {
			status: 'cancelling' as const,
		};
	}

	handleLocationChange(nextUrl: string, previousUrl: string) {
		if (nextUrl === previousUrl) {
			return {
				status: 'unchanged' as const,
			};
		}

		if (this.status === 'idle' && this.entries.size === 0) {
			return {
				status: 'idle' as const,
			};
		}

		const hadActiveTranslation = this.status === 'translating';
		const restoredCount = this.entries.size;
		this.fullRestore();
		void appendTranslationLog({
			level: 'info',
			scope: 'content',
			message: hadActiveTranslation
				? 'Stopped unfinished translation after navigation'
				: 'Cleared translated page state after navigation',
			details: `from=${previousUrl}; to=${nextUrl}; restoredNodes=${restoredCount}`,
		});
		if (hadActiveTranslation) {
			this.showIndicator('Page changed. Stopped the previous translation task.', 'info', 2400);
		}

		return {
			status: hadActiveTranslation ? ('cancelled' as const) : ('restored' as const),
			count: restoredCount,
		};
	}

	getState() {
		return {
			status: this.status,
			targetLanguage: this.currentTargetLanguage,
			mode: this.currentMode,
			model: this.currentModel,
			provider: this.currentProvider,
			totalNodes: this.totalNodes,
			completedNodes: this.completedNodes,
			totalChunks: this.totalChunks,
			completedChunks: this.completedChunks,
		};
	}

	subscribe(listener: (state: TranslatorStateSnapshot) => void) {
		this.listeners.add(listener);
		listener(this.getState());
		return () => {
			this.listeners.delete(listener);
		};
	}

	setDisplayMode(mode: TranslationDisplayMode) {
		if (this.currentMode === mode) {
			return;
		}

		this.currentMode = mode;
		if (this.status !== 'idle') {
			document.documentElement.setAttribute('data-revornix-display-mode', mode);
		}
		this.rerenderEntriesForMode();
		this.emitState();
		void appendTranslationLog({
			level: 'info',
			scope: 'content',
			message: `Switched display mode to ${mode}`,
			details: `status=${this.status}; translatedNodes=${this.completedNodes}`,
		});
	}

	private async translateEntries(
		entries: TranslationEntry[],
		targetLanguage: string,
		_mode: TranslationDisplayMode,
		model: string | undefined,
		runId: number,
		provider: TranslationProvider
	) {
		const queue = this.buildTranslationQueue(entries);
		const workerCount = Math.min(
			TRANSLATION_MAX_CONCURRENCY,
			SCROLL_RESPONSIVE_DISPATCH_WINDOW,
			queue.length
		);
		void appendTranslationLog({
			level: 'info',
			scope: 'content',
			message: 'Prepared translation queue',
			details: `nodes=${entries.length}; dispatchWindow=${workerCount}; maxChunkItems=${TRANSLATION_MAX_CHUNK_ITEMS}; maxChunkChars=${TRANSLATION_MAX_CHUNK_CHARS}`,
		});
		this.emitState();

		const cleanupScrollPriority = this.setupScrollPriority(queue, runId);
		const worker = async () => {
			while (true) {
				if (runId !== this.activeRunId) {
					throw new Error('Translation cancelled.');
				}

				const chunk = this.takeNextChunk(queue);
				if (!chunk) {
					return;
				}
				const pendingAnchors = new Set(chunk.map((entry) => entry.anchorElement));
				this.totalChunks += 1;
				this.emitState();
				for (const anchor of pendingAnchors) {
					this.syncLoadingBlock(anchor);
				}

				const translatedItems = await this.translateTexts(
					chunk.map((entry) => ({
						id: entry.id,
						text: entry.originalText,
					})),
					targetLanguage,
					model,
					provider
				);

				if (runId !== this.activeRunId) {
					throw new Error('Translation cancelled.');
				}

				const updatedAnchors = new Set<HTMLElement>();
				let appliedCount = 0;
				for (const item of translatedItems) {
					const entry = this.entries.get(item.id);
					this.requestStateByEntryId.set(item.id, 'done');
					if (!entry || !entry.node.isConnected) {
						continue;
					}
					entry.translatedText = item.text;
					appliedCount += 1;
					updatedAnchors.add(entry.anchorElement);
					this.applyEntryRender(entry);
				}

				if (this.currentMode === 'bilingual') {
					for (const anchor of updatedAnchors) {
						this.syncBilingualBlock(anchor);
					}
				}

				for (const entry of chunk) {
					if (this.requestStateByEntryId.get(entry.id) === 'inflight') {
						this.requestStateByEntryId.set(entry.id, 'done');
					}
				}
				for (const anchor of pendingAnchors) {
					this.syncLoadingBlock(anchor);
				}

				this.completedNodes = Math.min(
					this.totalNodes,
					this.completedNodes + Math.max(appliedCount, translatedItems.length)
				);
				this.completedChunks += 1;
				this.emitState();
				void appendTranslationLog({
					level: 'info',
					scope: 'content',
					message: `Chunk translated (${this.completedChunks}/${this.totalChunks})`,
					details: `target=${targetLanguage}; mode=${this.currentMode}; chunkSize=${chunk.length}`,
				});
				this.updateLoadingIndicator();
			}
		};

		try {
			await Promise.all(Array.from({ length: workerCount }, () => worker()));
		} finally {
			cleanupScrollPriority();
			for (const entry of entries) {
				if (this.requestStateByEntryId.get(entry.id) !== 'done') {
					this.requestStateByEntryId.delete(entry.id);
				}
			}
		}
	}

	private buildTranslationQueue(entries: TranslationEntry[]) {
		const prioritizedEntries = this.prioritizeEntries(entries);
		const prioritizedVisibleEntries = prioritizedEntries.filter(
			(entry) => this.getEntryPriority(entry).bucket <= 1
		);
		const visibleIds = new Set(prioritizedVisibleEntries.map((entry) => entry.id));
		const firstPhaseEntries =
			prioritizedVisibleEntries.length > 0
				? prioritizedVisibleEntries
				: prioritizedEntries.slice(0, PRIORITY_SMALL_CHUNK_ENTRY_COUNT);
		const firstPhaseIds = new Set(firstPhaseEntries.map((entry) => entry.id));
		const secondPhaseEntries = prioritizedEntries.filter(
			(entry) => !visibleIds.has(entry.id) && !firstPhaseIds.has(entry.id)
		);

		for (const entry of entries) {
			this.requestStateByEntryId.set(entry.id, 'idle');
		}

		return [...firstPhaseEntries, ...secondPhaseEntries];
	}

	private takeNextChunk(queue: TranslationEntry[]) {
		const nextEntries = queue.filter(
			(entry) => this.requestStateByEntryId.get(entry.id) === 'idle'
		);
		if (nextEntries.length === 0) {
			return null;
		}

		const shouldFollowScroll = Date.now() - this.lastScrollPriorityAt <= SCROLL_FOLLOW_MODE_MS;
		if (shouldFollowScroll) {
			const visibleEntries = this.prioritizeEntries(
				nextEntries.filter((entry) => this.getEntryPriority(entry).bucket <= 1)
			);
			const followChunk = this.chunkEntries(visibleEntries, 'follow')[0];
			if (followChunk) {
				for (const entry of followChunk) {
					this.requestStateByEntryId.set(entry.id, 'inflight');
				}
				return followChunk;
			}
		}

		const isPriorityPhase = this.completedNodes < PRIORITY_SMALL_CHUNK_ENTRY_COUNT;
		const chunk = this.chunkEntries(
			nextEntries,
			isPriorityPhase ? 'priority' : 'default'
		)[0];
		if (!chunk) {
			return null;
		}

		for (const entry of chunk) {
			this.requestStateByEntryId.set(entry.id, 'inflight');
		}

		return chunk;
	}

	private setupScrollPriority(queue: TranslationEntry[], runId: number) {
		const reprioritize = () => {
			if (runId !== this.activeRunId || this.status !== 'translating') {
				return;
			}

			const idleEntries = queue.filter(
				(entry) => this.requestStateByEntryId.get(entry.id) === 'idle'
			);
			if (idleEntries.length < 2) {
				return;
			}

			const reprioritizedIdleEntries = this.prioritizeEntries(idleEntries);
			const idleIds = new Set(reprioritizedIdleEntries.map((entry) => entry.id));
			const lockedEntries = queue.filter((entry) => !idleIds.has(entry.id));
			queue.splice(0, queue.length, ...lockedEntries, ...reprioritizedIdleEntries);
		};

		const scheduleReprioritize = () => {
			this.lastScrollPriorityAt = Date.now();
			if (this.queueReprioritizeTimer !== null) {
				window.clearTimeout(this.queueReprioritizeTimer);
			}

			this.queueReprioritizeTimer = window.setTimeout(() => {
				this.queueReprioritizeTimer = null;
				reprioritize();
			}, 120);
		};

		window.addEventListener('scroll', scheduleReprioritize, { passive: true });
		return () => {
			window.removeEventListener('scroll', scheduleReprioritize);
			if (this.queueReprioritizeTimer !== null) {
				window.clearTimeout(this.queueReprioritizeTimer);
				this.queueReprioritizeTimer = null;
			}
		};
	}

	private async translateTitle(
		targetLanguage: string,
		model: string | undefined,
		runId: number,
		provider: TranslationProvider
	) {
		if (!this.originalTitle) {
			return;
		}

		const [translatedTitle] = await this.translateTexts(
			[{ id: 'document-title', text: this.originalTitle }],
			targetLanguage,
			model,
			provider
		);
		if (
			translatedTitle?.text &&
			runId === this.activeRunId &&
			(this.status === 'translating' || this.status === 'cancelling')
		) {
			document.title = translatedTitle.text;
		}
	}

	private collectEntriesFromNode(root: Node | null) {
		if (!(root instanceof HTMLElement) && root !== document.body) {
			return [] as TranslationEntry[];
		}

		const scope = root || document.body;
		if (!scope) {
			return [] as TranslationEntry[];
		}

		const entries: TranslationEntry[] = [];
		const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text)) {
					return NodeFilter.FILTER_REJECT;
				}

				if (this.entryByNode.has(node)) {
					return NodeFilter.FILTER_REJECT;
				}

				const parent = node.parentElement;
				if (!parent || SKIPPED_TAGS.has(parent.tagName) || parent.isContentEditable) {
					return NodeFilter.FILTER_REJECT;
				}

				if (
					parent.closest('[data-revornix-translation-indicator="true"]') ||
					parent.closest('[data-revornix-bilingual-block="true"]') ||
					parent.closest('[data-revornix-loading-block="true"]') ||
					parent.closest('#revornix-translation-widget-root')
				) {
					return NodeFilter.FILTER_REJECT;
				}

				const value = node.textContent ?? '';
				if (!this.isTranslatableText(value)) {
					return NodeFilter.FILTER_REJECT;
				}

				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let currentNode = walker.nextNode();
		while (currentNode) {
			if (currentNode instanceof Text) {
				const blockElement = this.findBlockElement(currentNode.parentElement);
					const entry: TranslationEntry = {
						id: `entry-${this.entryIdCounter++}`,
						node: currentNode,
						originalText: currentNode.textContent ?? '',
						translatedText: '',
						blockElement,
						anchorElement: this.findBilingualAnchor(
							currentNode.parentElement,
							blockElement
						),
					};
				this.registerEntry(entry);
				entries.push(entry);
			}
			currentNode = walker.nextNode();
		}

		return entries;
	}

	private chunkEntries(
		entries: TranslationEntry[],
		phase: 'follow' | 'priority' | 'default' = 'default'
	) {
		const chunks: TranslationEntry[][] = [];
		let currentChunk: TranslationEntry[] = [];
		let currentLength = 0;

		for (const [index, entry] of entries.entries()) {
			const maxChunkChars =
				phase === 'follow'
					? Math.min(TRANSLATION_MAX_CHUNK_CHARS, FOLLOW_CHUNK_MAX_CHARS)
					: phase === 'priority' && index < PRIORITY_SMALL_CHUNK_ENTRY_COUNT
					? Math.min(TRANSLATION_MAX_CHUNK_CHARS, PRIORITY_SMALL_CHUNK_MAX_CHARS)
					: TRANSLATION_MAX_CHUNK_CHARS;
			const maxChunkItems =
				phase === 'follow'
					? Math.min(TRANSLATION_MAX_CHUNK_ITEMS, FOLLOW_CHUNK_MAX_ITEMS)
					: phase === 'priority' && index < PRIORITY_SMALL_CHUNK_ENTRY_COUNT
					? Math.min(TRANSLATION_MAX_CHUNK_ITEMS, PRIORITY_SMALL_CHUNK_MAX_ITEMS)
					: TRANSLATION_MAX_CHUNK_ITEMS;
			const nextLength = currentLength + entry.originalText.length;
			if (
				currentChunk.length > 0 &&
				(nextLength > maxChunkChars || currentChunk.length >= maxChunkItems)
			) {
				chunks.push(currentChunk);
				currentChunk = [];
				currentLength = 0;
			}
			currentChunk.push(entry);
			currentLength += entry.originalText.length;
		}

		if (currentChunk.length > 0) {
			chunks.push(currentChunk);
		}

		return chunks;
	}

	private prioritizeEntries(entries: TranslationEntry[]) {
		return entries.slice().sort((left, right) => {
			const leftPriority = this.getEntryPriority(left);
			const rightPriority = this.getEntryPriority(right);
			if (leftPriority.bucket !== rightPriority.bucket) {
				return leftPriority.bucket - rightPriority.bucket;
			}

			if (leftPriority.distance !== rightPriority.distance) {
				return leftPriority.distance - rightPriority.distance;
			}

			return left.id.localeCompare(right.id);
		});
	}

	private getEntryPriority(entry: TranslationEntry) {
		if (!entry.anchorElement.isConnected) {
			return {
				bucket: 3,
				distance: Number.MAX_SAFE_INTEGER,
			} satisfies EntryPriority;
		}

		const rect = entry.anchorElement.getBoundingClientRect();
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
		const marginTop = -PRIORITY_VIEWPORT_MARGIN_PX;
		const marginBottom = viewportHeight + PRIORITY_VIEWPORT_MARGIN_PX;

		if (rect.bottom >= 0 && rect.top <= viewportHeight) {
			return {
				bucket: 0,
				distance: Math.abs(rect.top),
			} satisfies EntryPriority;
		}

		if (rect.bottom >= marginTop && rect.top <= marginBottom) {
			const distanceToViewport =
				rect.top > viewportHeight ? rect.top - viewportHeight : Math.abs(rect.bottom);
			return {
				bucket: 1,
				distance: distanceToViewport,
			} satisfies EntryPriority;
		}

		return {
			bucket: 2,
			distance: rect.top > viewportHeight ? rect.top - viewportHeight : Math.abs(rect.bottom),
		} satisfies EntryPriority;
	}

	private async translateTexts(
		items: TranslationItem[],
		targetLanguage: string,
		model?: string,
		provider?: TranslationProvider
	): Promise<TranslationItem[]> {
		const response = await chrome.runtime.sendMessage({
			type: 'TRANSLATE_TEXT_BATCH',
			payload: {
				items,
				targetLanguage,
				model,
				provider,
			},
		});

		if (!response?.success) {
			throw new Error(response?.error || 'Translation service is unavailable.');
		}

		const data = response.data as TranslationResponse;
		return data.translations;
	}

	private syncBilingualBlock(anchorElement: HTMLElement) {
		const entryIds = this.entryIdsByAnchor.get(anchorElement);
		if (!entryIds || entryIds.size === 0) {
			this.removeBilingualBlock(anchorElement);
			return;
		}

		const translatedEntries = Array.from(entryIds)
			.map((entryId) => this.entries.get(entryId))
			.filter((entry): entry is TranslationEntry => Boolean(entry?.translatedText));
		const existingBlock = this.bilingualBlocks.get(anchorElement);
		if (translatedEntries.length === 0) {
			if (existingBlock?.parentNode) {
				existingBlock.parentNode.removeChild(existingBlock);
			}
			this.bilingualBlocks.delete(anchorElement);
			return;
		}

		const translatedClone = this.buildTranslatedAnchorClone(anchorElement);
		if (!translatedClone) {
			this.removeBilingualBlock(anchorElement);
			return;
		}

		if (existingBlock) {
			existingBlock.replaceChildren(translatedClone);
			return;
		}

		const translatedBlock = document.createElement('div');
		translatedBlock.dataset.revornixBilingualBlock = 'true';
		Object.assign(translatedBlock.style, {
			display: 'block',
			marginTop: '0.28em',
			padding: '0',
			border: 'none',
			background: 'transparent',
			borderRadius: '0',
			fontSize: '0.94em',
			lineHeight: '1.5',
			color: 'inherit',
			opacity: '0.82',
			fontWeight: '400',
			letterSpacing: '0',
			wordBreak: 'normal',
			overflowWrap: 'normal',
			whiteSpace: 'normal',
		} satisfies Partial<CSSStyleDeclaration>);
		translatedBlock.appendChild(translatedClone);
		if (this.shouldMountBilingualOutside(anchorElement) && anchorElement.parentElement) {
			anchorElement.insertAdjacentElement('afterend', translatedBlock);
		} else {
			anchorElement.appendChild(translatedBlock);
		}
		this.bilingualBlocks.set(anchorElement, translatedBlock);
	}

	private buildTranslatedAnchorClone(anchorElement: HTMLElement) {
		const clone = anchorElement.cloneNode(true);
		if (!(clone instanceof HTMLElement)) {
			return null;
		}

		clone.querySelectorAll('[data-revornix-bilingual-block="true"]').forEach((element) => {
			element.remove();
		});
		this.stripCloneIds(clone);

		const originalTextNodes = this.collectAnchorTextNodes(anchorElement);
		const clonedTextNodes = this.collectAnchorTextNodes(clone);
		const nodeCount = Math.min(originalTextNodes.length, clonedTextNodes.length);

		for (let index = 0; index < nodeCount; index += 1) {
			const originalNode = originalTextNodes[index];
			const clonedNode = clonedTextNodes[index];
			const entry = this.entryByNode.get(originalNode);
			if (entry && entry.anchorElement === anchorElement) {
				clonedNode.textContent = entry.translatedText || entry.originalText;
			}
		}

		return clone;
	}

	private collectAnchorTextNodes(root: HTMLElement) {
		const nodes: Text[] = [];
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text)) {
					return NodeFilter.FILTER_REJECT;
				}

				const parent = node.parentElement;
				if (
					!parent ||
					parent.closest('[data-revornix-bilingual-block="true"]') ||
					parent.closest('#revornix-translation-widget-root')
				) {
					return NodeFilter.FILTER_REJECT;
				}

				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let currentNode = walker.nextNode();
		while (currentNode) {
			if (currentNode instanceof Text) {
				nodes.push(currentNode);
			}
			currentNode = walker.nextNode();
		}

		return nodes;
	}

	private stripCloneIds(element: HTMLElement) {
		element.removeAttribute('id');
		element.querySelectorAll('[id]').forEach((node) => {
			node.removeAttribute('id');
		});
	}

	private syncLoadingBlock(anchorElement: HTMLElement) {
		const shouldShow = this.hasInflightEntries(anchorElement);
		const existingBlock = this.loadingBlocks.get(anchorElement);
		this.setAnchorLoadingState(anchorElement, shouldShow);
		if (!shouldShow) {
			if (existingBlock?.parentNode) {
				existingBlock.parentNode.removeChild(existingBlock);
			}
			this.loadingBlocks.delete(anchorElement);
			return;
		}

		if (existingBlock) {
			const label = existingBlock.querySelector(
				'[data-revornix-loading-label="true"]'
			) as HTMLDivElement | null;
			if (label) {
				label.textContent = this.getLoadingCopy();
			}
			return;
		}

		this.ensureRuntimeStyles();
		const loadingBlock = document.createElement('div');
		loadingBlock.dataset.revornixLoadingBlock = 'true';
		Object.assign(loadingBlock.style, {
			display: 'inline-flex',
			alignItems: 'center',
			gap: '0.42em',
			marginTop: '0.28em',
			padding: '0.1em 0 0',
			border: 'none',
			background: 'transparent',
			fontSize: '0.82em',
			lineHeight: '1.45',
			color: 'inherit',
			opacity: '0.72',
			fontStyle: 'normal',
		} satisfies Partial<CSSStyleDeclaration>);
		const spinner = document.createElement('span');
		spinner.dataset.revornixLoadingSpinner = 'true';
		spinner.textContent = '◌';
		Object.assign(spinner.style, {
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			width: '1em',
			height: '1em',
			fontSize: '0.95em',
			lineHeight: '1',
			opacity: '0.9',
			animation: 'revornix-spin 0.9s linear infinite',
			transformOrigin: '50% 50%',
		} satisfies Partial<CSSStyleDeclaration>);
		loadingBlock.appendChild(spinner);
		const label = document.createElement('div');
		label.dataset.revornixLoadingLabel = 'true';
		label.textContent = this.getLoadingCopy();
		Object.assign(label.style, {
			fontSize: '0.82em',
			lineHeight: '1.35',
			opacity: '0.78',
		} satisfies Partial<CSSStyleDeclaration>);
		loadingBlock.appendChild(label);

		if (this.shouldMountBilingualOutside(anchorElement) && anchorElement.parentElement) {
			anchorElement.insertAdjacentElement('afterend', loadingBlock);
		} else {
			anchorElement.appendChild(loadingBlock);
		}
		this.loadingBlocks.set(anchorElement, loadingBlock);
	}

	private hasInflightEntries(anchorElement: HTMLElement) {
		const entryIds = this.entryIdsByAnchor.get(anchorElement);
		if (!entryIds || entryIds.size === 0) {
			return false;
		}

		for (const entryId of entryIds) {
			if (this.requestStateByEntryId.get(entryId) === 'inflight') {
				return true;
			}
		}

		return false;
	}

	private getLoadingCopy() {
		const pageLanguage = (document.documentElement.lang || '').toLowerCase();
		if (
			pageLanguage.startsWith('zh') ||
			this.currentTargetLanguage?.includes('中文')
		) {
			return '正在翻译...';
		}

		return 'Translating...';
	}

	private setAnchorLoadingState(anchorElement: HTMLElement, loading: boolean) {
		if (loading) {
			if (anchorElement.dataset.revornixLoadingActive !== 'true') {
				anchorElement.dataset.revornixLoadingActive = 'true';
				anchorElement.dataset.revornixLoadingOriginalOpacity = anchorElement.style.opacity || '';
				anchorElement.dataset.revornixLoadingOriginalTransition =
					anchorElement.style.transition || '';
			}
			anchorElement.style.opacity = this.currentMode === 'translated-only' ? '0.78' : '0.9';
			anchorElement.style.transition = 'opacity 180ms ease';
			anchorElement.setAttribute('aria-busy', 'true');
			return;
		}

		if (anchorElement.dataset.revornixLoadingActive === 'true') {
			anchorElement.style.opacity =
				anchorElement.dataset.revornixLoadingOriginalOpacity || '';
			anchorElement.style.transition =
				anchorElement.dataset.revornixLoadingOriginalTransition || '';
			delete anchorElement.dataset.revornixLoadingOriginalOpacity;
			delete anchorElement.dataset.revornixLoadingOriginalTransition;
			delete anchorElement.dataset.revornixLoadingActive;
		}
		anchorElement.removeAttribute('aria-busy');
	}

	private applyEntryRender(entry: TranslationEntry) {
		if (!entry.node.isConnected) {
			return;
		}

		if (this.currentMode === 'translated-only') {
			entry.node.textContent = entry.translatedText || entry.originalText;
			this.removeBilingualBlock(entry.anchorElement);
			this.syncLoadingBlock(entry.anchorElement);
			return;
		}

		entry.node.textContent = entry.originalText;
		if (entry.translatedText) {
			this.syncBilingualBlock(entry.anchorElement);
		} else {
			this.removeBilingualBlock(entry.anchorElement);
		}
		this.syncLoadingBlock(entry.anchorElement);
	}

	private rerenderEntriesForMode() {
		const renderedAnchors = new Set<HTMLElement>();
		if (this.currentMode === 'translated-only') {
			for (const entry of this.entries.values()) {
				this.applyEntryRender(entry);
			}
			return;
		}

		for (const entry of this.entries.values()) {
			if (!entry.node.isConnected) {
				continue;
			}
			entry.node.textContent = entry.originalText;
			if (entry.translatedText) {
				renderedAnchors.add(entry.anchorElement);
			} else {
				this.removeBilingualBlock(entry.anchorElement);
			}
			this.syncLoadingBlock(entry.anchorElement);
		}

		for (const anchor of renderedAnchors) {
			this.syncBilingualBlock(anchor);
		}
	}

	private removeBilingualBlock(anchorElement: HTMLElement) {
		const existingBlock = this.bilingualBlocks.get(anchorElement);
		if (existingBlock?.parentNode) {
			existingBlock.parentNode.removeChild(existingBlock);
		}
		this.bilingualBlocks.delete(anchorElement);
	}

	private shouldMountBilingualOutside(blockElement: HTMLElement) {
		const style = window.getComputedStyle(blockElement);
		const overflowY = style.overflowY || style.overflow;
		const overflowX = style.overflowX || style.overflow;
		const lineClampValue =
			(style.getPropertyValue('-webkit-line-clamp') || style.getPropertyValue('line-clamp'))
				.trim();
		const hasClampedLines =
			style.display === '-webkit-box' ||
			(lineClampValue !== '' && lineClampValue !== 'none');
		const hasClippedOverflow = ['hidden', 'clip', 'scroll', 'auto'].includes(overflowY) ||
			['hidden', 'clip', 'scroll', 'auto'].includes(overflowX);
		const hasFixedHeight =
			(style.maxHeight && style.maxHeight !== 'none') ||
			(style.height && style.height !== 'auto' && style.height !== '0px');

		return Boolean(
			(hasClampedLines || hasClippedOverflow || hasFixedHeight) && blockElement.parentElement
		);
	}

	private findBilingualAnchor(
		element: HTMLElement | null,
		blockElement: HTMLElement
	): HTMLElement {
		let current = element;
		let candidate: HTMLElement | null = null;

		while (current && current !== blockElement) {
			if (this.isSemanticTextContainer(current)) {
				candidate = current;
			}
			current = current.parentElement;
		}

		return candidate || blockElement;
	}

	private isSemanticTextContainer(element: HTMLElement) {
		if (
			['P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']
				.includes(element.tagName)
		) {
			return true;
		}

		const style = window.getComputedStyle(element);
		return (
			style.display === 'block' ||
			style.display === '-webkit-box' ||
			style.display === 'list-item' ||
			style.display === 'table-cell'
		);
	}

	private startObserving() {
		this.stopObserving();

		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'characterData' && mutation.target instanceof Text) {
					this.handleObservedTextMutation(mutation.target);
					continue;
				}

				for (const node of Array.from(mutation.addedNodes)) {
					if (node instanceof HTMLElement || node instanceof Text) {
						this.pendingNodes.add(node);
					}
				}
			}

			if (this.pendingNodes.size === 0 || this.status !== 'translated') {
				return;
			}

			if (this.observeTimer !== null) {
				window.clearTimeout(this.observeTimer);
			}

			this.observeTimer = window.setTimeout(() => {
				void this.translatePendingNodes();
			}, 350);
		});

		if (document.body) {
			this.observer.observe(document.body, {
				childList: true,
				characterData: true,
				subtree: true,
			});
		}
	}

	private handleObservedTextMutation(node: Text) {
		const trackedEntry = this.entryByNode.get(node);
		if (trackedEntry) {
			const currentText = node.textContent ?? '';
			if (
				currentText === trackedEntry.originalText ||
				currentText === trackedEntry.translatedText
			) {
				return;
			}

			trackedEntry.translatedText = '';
			this.syncBilingualBlock(trackedEntry.anchorElement);
			this.unregisterEntry(trackedEntry);
		}

		this.pendingNodes.add(node);
	}

	private stopObserving() {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.observeTimer !== null) {
			window.clearTimeout(this.observeTimer);
			this.observeTimer = null;
		}
		this.pendingNodes.clear();
	}

	private async translatePendingNodes() {
		if (this.status !== 'translated' || !this.currentTargetLanguage) {
			return;
		}

		const roots = Array.from(this.pendingNodes);
		this.pendingNodes.clear();
		this.observeTimer = null;

		const newEntries = roots.flatMap((node) => {
			if (node instanceof Text) {
				return this.collectEntriesFromNode(node.parentElement);
			}
			return this.collectEntriesFromNode(node);
		});

		if (newEntries.length === 0) {
			return;
		}

			const previousStatus = this.status;
			this.status = 'translating';
			this.totalNodes += newEntries.length;
			this.emitState();
			this.updateLoadingIndicator();
		try {
			void appendTranslationLog({
				level: 'info',
				scope: 'content',
				message: `Dynamic content detected (${newEntries.length} nodes)`,
				details: window.location.href,
			});
				await this.translateEntries(
					newEntries,
					this.currentTargetLanguage,
					this.currentMode,
					this.currentModel || undefined,
					this.activeRunId,
					this.currentProvider
				);
			this.status = previousStatus;
			this.emitState();
		} catch (error) {
			this.status = previousStatus;
			this.emitState();
			void appendTranslationLog({
				level: 'warn',
				scope: 'content',
				message: 'Dynamic content translation failed',
				details: error instanceof Error ? error.message : String(error),
			});
			console.warn('Failed to translate dynamically added content', error);
		} finally {
			this.flushPendingObservedNodes(120);
		}
	}

	private fullRestore() {
		for (const entry of this.entries.values()) {
			if (entry.node.isConnected) {
				entry.node.textContent = entry.originalText;
			}
		}

		for (const block of this.bilingualBlocks.values()) {
			if (block.parentNode) {
				block.parentNode.removeChild(block);
			}
		}

		for (const [anchorElement, block] of this.loadingBlocks.entries()) {
			if (block.parentNode) {
				block.parentNode.removeChild(block);
			}
			this.setAnchorLoadingState(anchorElement, false);
		}

		this.entries.clear();
		this.entryByNode = new WeakMap<Text, TranslationEntry>();
		this.entryIdsByAnchor.clear();
		this.requestStateByEntryId.clear();
		this.bilingualBlocks.clear();
		this.loadingBlocks.clear();
		this.stopObserving();
		this.activeRunId = ++this.runSequence;

		if (this.originalTitle) {
			document.title = this.originalTitle;
		}

		this.originalTitle = null;
		this.currentTargetLanguage = null;
		this.currentMode = DEFAULT_TRANSLATION_DISPLAY_MODE;
		this.currentModel = null;
		this.currentProvider = DEFAULT_TRANSLATION_PROVIDER;
		this.status = 'idle';
		this.totalNodes = 0;
		this.completedNodes = 0;
		this.totalChunks = 0;
		this.completedChunks = 0;
		this.emitState();
		document.documentElement.removeAttribute('data-revornix-translated');
		document.documentElement.removeAttribute('data-revornix-target-language');
		document.documentElement.removeAttribute('data-revornix-display-mode');
	}

	private findBlockElement(element: HTMLElement | null): HTMLElement {
		let current = element;
		while (current && current !== document.body) {
			if (BLOCK_TAGS.has(current.tagName)) {
				return current;
			}

			const style = window.getComputedStyle(current);
			if (
				style.display === 'block' ||
				style.display === 'list-item' ||
				style.display === 'table-cell' ||
				style.display === 'flex' ||
				style.display === 'grid'
			) {
				return current;
			}
			current = current.parentElement;
		}

		return element || document.body;
	}

	private isTranslatableText(value: string) {
		const normalized = value.replace(/\s+/g, ' ').trim();
		if (normalized.length < 2) {
			return false;
		}
		if (normalized.length > 1200) {
			return false;
		}
		return /[\p{L}]/u.test(normalized);
	}

	private pageAlreadyMatchesTarget(targetLanguage: string) {
		const pageLang = (document.documentElement.lang || '').toLowerCase();
		const normalizedTarget = targetLanguage.toLowerCase();

		if (!pageLang) {
			return false;
		}

		if (
			(pageLang.startsWith('zh') && normalizedTarget.includes('中文')) ||
			(pageLang.startsWith('en') && normalizedTarget.includes('english')) ||
			(pageLang.startsWith('ja') && normalizedTarget.includes('日本語')) ||
			(pageLang.startsWith('ko') && normalizedTarget.includes('한국어'))
		) {
			return true;
		}

		return false;
	}

	private registerEntry(entry: TranslationEntry) {
		this.entries.set(entry.id, entry);
		this.entryByNode.set(entry.node, entry);
		const anchorEntries = this.entryIdsByAnchor.get(entry.anchorElement);
		if (anchorEntries) {
			anchorEntries.add(entry.id);
			return;
		}

		this.entryIdsByAnchor.set(entry.anchorElement, new Set([entry.id]));
	}

	private unregisterEntry(entry: TranslationEntry) {
		this.entries.delete(entry.id);
		this.entryByNode.delete(entry.node);
		this.requestStateByEntryId.delete(entry.id);
		const anchorEntries = this.entryIdsByAnchor.get(entry.anchorElement);
		if (!anchorEntries) {
			return;
		}

		anchorEntries.delete(entry.id);
		if (anchorEntries.size === 0) {
			this.entryIdsByAnchor.delete(entry.anchorElement);
		}
	}

	private flushPendingObservedNodes(delay = 120) {
		if (this.status !== 'translated' || this.pendingNodes.size === 0) {
			return;
		}

		if (this.observeTimer !== null) {
			window.clearTimeout(this.observeTimer);
		}

		this.observeTimer = window.setTimeout(() => {
			void this.translatePendingNodes();
		}, delay);
	}

	private ensureIndicator() {
		if (this.indicator) {
			return this.indicator;
		}

		const indicator = document.createElement('div');
		indicator.dataset.revornixTranslationIndicator = 'true';
		Object.assign(indicator.style, {
			position: 'fixed',
			top: '16px',
			right: '16px',
			zIndex: '2147483647',
			maxWidth: '320px',
			padding: '10px 14px',
			borderRadius: '12px',
			background: 'rgba(17, 24, 39, 0.92)',
			color: '#fff',
			fontSize: '13px',
			lineHeight: '1.5',
			boxShadow: '0 12px 30px rgba(15, 23, 42, 0.28)',
			fontFamily:
				'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
			transition: 'opacity 160ms ease, transform 160ms ease',
			opacity: '0',
			transform: 'translateY(-6px)',
			pointerEvents: 'none',
		} satisfies Partial<CSSStyleDeclaration>);
		(document.body || document.documentElement).appendChild(indicator);
		this.indicator = indicator;
		return indicator;
	}

	private ensureRuntimeStyles() {
		if (this.runtimeStyles?.isConnected) {
			return;
		}

		const style = document.createElement('style');
		style.dataset.revornixRuntimeStyles = 'true';
		style.textContent = `
			@keyframes revornix-spin {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}
		`;
		(document.head || document.documentElement).appendChild(style);
		this.runtimeStyles = style;
	}

	private showIndicator(
		message: string,
		variant: 'loading' | 'success' | 'error' | 'info',
		duration = 2600
	) {
		const indicator = this.ensureIndicator();
		indicator.textContent = message;

		const backgroundByVariant = {
			loading: 'rgba(17, 24, 39, 0.92)',
			success: 'rgba(22, 101, 52, 0.94)',
			error: 'rgba(153, 27, 27, 0.94)',
			info: 'rgba(30, 41, 59, 0.94)',
		};

		indicator.style.background = backgroundByVariant[variant];
		indicator.style.opacity = '1';
		indicator.style.transform = 'translateY(0)';

		if (duration <= 0 || variant === 'loading') {
			return;
		}

		window.setTimeout(() => {
			if (!this.indicator || this.status === 'translating') {
				return;
			}
			this.indicator.style.opacity = '0';
			this.indicator.style.transform = 'translateY(-6px)';
		}, duration);
	}

	private updateLoadingIndicator() {
		if (this.status !== 'translating' || !this.currentTargetLanguage) {
			return;
		}

		this.showIndicator(
			`Translating page to ${this.currentTargetLanguage}... (${this.completedNodes}/${this.totalNodes})`,
			'loading'
		);
	}

	private emitState() {
		const snapshot = this.getState();
		for (const listener of this.listeners) {
			listener(snapshot);
		}
	}
}

export const pageTranslator = new PageTranslator();
