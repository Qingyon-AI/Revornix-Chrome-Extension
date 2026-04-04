import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import {
	AlertCircle,
	AudioLines,
	BadgePlus,
	Bot,
	Check,
	Copy,
	ChevronDown,
	FolderPlus,
	GitBranchPlus,
	LoaderCircle,
	Pause,
	PanelRightClose,
	Play,
	RefreshCw,
	Send,
	Sparkles,
	StickyNote,
	Waypoints,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { RevornixGraphCanvas } from '@/content/revornix-graph-canvas';
import {
	askDocumentAiStream,
	createDocumentLabel,
	createDocumentNote,
	createSection,
	createWebsiteDocument,
	generateDocumentGraph,
	generateDocumentPodcast,
	getDocumentDetail,
	getDocumentDetailByUrl,
	getDocumentGraph,
	listDocumentLabels,
	listMineSections,
	searchDocumentNotes,
	searchMineDocuments,
	updateDocument,
	type RevornixChatMessage,
	type RevornixGraphResponse,
	type RevornixDocumentLabel,
	type RevornixDocumentNote,
	type RevornixSectionInfo,
	type RevornixWebsiteDocumentDetail,
} from '@/lib/revornix-api';
import { formatCopy, getUiCopy } from '@/lib/ui-copy';
import { extractCoverImage, extractPageDescription } from '@/lib/utils';
import type { UiLanguage } from '@/lib/ui-preferences';

interface RevornixSidePanelProps {
	open: boolean;
	onClose: () => void;
	currentUrl: string;
	uiLanguage: UiLanguage;
	resolvedTheme?: 'light' | 'dark';
}

interface PageDraft {
	url: string;
	title: string;
	description: string;
	cover: string;
}

interface PanelFrame {
	x: number;
	y: number;
	width: number;
	height: number;
}

const DOCUMENT_GRAPH_STATUS = {
	WAIT_TO: 0,
	BUILDING: 1,
	SUCCESS: 2,
	FAILED: 3,
} as const;

const DOCUMENT_PODCAST_STATUS = {
	WAIT_TO: 0,
	GENERATING: 1,
	SUCCESS: 2,
	FAILED: 3,
} as const;

const DOCUMENT_PROCESS_STATUS = {
	WAIT_TO: 0,
	PROCESSING: 1,
	SUCCESS: 2,
	FAILED: 3,
} as const;

const PODCAST_POLL_INTERVAL_MS = 4000;
const PANEL_MARGIN = 12;
const PANEL_MIN_WIDTH = 360;
const PANEL_MIN_HEIGHT = 520;

type PanelResizeEdge =
	| 'left'
	| 'right'
	| 'top'
	| 'bottom'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';

type RevornixAiPhase =
	| 'idle'
	| 'thinking'
	| 'writing'
	| 'tool'
	| 'tool_result'
	| 'done'
	| 'error';

interface RevornixAiMessage {
	chat_id: string;
	role: 'user' | 'assistant';
	content: string;
	phase?: RevornixAiPhase;
	label?: string;
	error?: string;
}

function readDraftFromPage(url: string): PageDraft {
	return {
		url,
		title: document.title || '',
		description: extractPageDescription() || '',
		cover: extractCoverImage() || '',
	};
}

function arraysEqual(left: number[], right: number[]) {
	if (left.length !== right.length) {
		return false;
	}
	const sortedLeft = left.slice().sort((a, b) => a - b);
	const sortedRight = right.slice().sort((a, b) => a - b);
	return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function normalizeUrl(value: string) {
	return value.trim().replace(/\/+$/, '');
}

function buildSearchKeywords(nextUrl: string, title: string) {
	const url = normalizeUrl(nextUrl);
	const keywords = new Set<string>();
	if (url) {
		keywords.add(url);
		try {
			const parsed = new URL(url);
			if (parsed.pathname && parsed.pathname !== '/') {
				keywords.add(
					`${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, ''),
				);
				keywords.add(parsed.pathname.replace(/\/+$/, ''));
			}
			keywords.add(parsed.hostname);
		} catch {
			// ignore invalid URL parsing and fall back to raw url keyword only
		}
	}

	const compactTitle = title.trim();
	if (compactTitle) {
		keywords.add(compactTitle);
	}

	return Array.from(keywords).filter(Boolean);
}

function isExactWebsiteDocumentMatch(
	document: RevornixWebsiteDocumentDetail,
	targetUrl: string,
) {
	const documentUrl = normalizeUrl(document.website_info?.url || '');
	const normalizedTargetUrl = normalizeUrl(targetUrl);
	return Boolean(
		documentUrl && normalizedTargetUrl && documentUrl === normalizedTargetUrl,
	);
}

function formatAudioTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) {
		return '00:00';
	}
	const totalSeconds = Math.floor(seconds);
	const minutes = Math.floor(totalSeconds / 60);
	const remainingSeconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateAiAssistantMessage(
	messages: RevornixAiMessage[],
	chatId: string,
	updater: (message: RevornixAiMessage) => RevornixAiMessage,
) {
	let found = false;
	const nextMessages = messages.map((message) => {
		if (message.chat_id !== chatId) {
			return message;
		}

		found = true;
		return updater(message);
	});

	if (found) {
		return nextMessages;
	}

	return [
		...nextMessages,
		updater({
			chat_id: chatId,
			role: 'assistant',
			content: '',
		}),
	];
}

function getDefaultPanelFrame(): PanelFrame {
	const width = Math.min(
		392,
		Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_MARGIN * 2),
	);
	const height = Math.min(
		Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_MARGIN * 2),
		window.innerHeight - PANEL_MARGIN * 2,
	);

	return {
		x: window.innerWidth - width - PANEL_MARGIN,
		y: PANEL_MARGIN,
		width,
		height,
	};
}

function clampPanelFrame(frame: PanelFrame): PanelFrame {
	const maxWidth = Math.max(
		PANEL_MIN_WIDTH,
		window.innerWidth - PANEL_MARGIN * 2,
	);
	const maxHeight = Math.max(
		PANEL_MIN_HEIGHT,
		window.innerHeight - PANEL_MARGIN * 2,
	);
	const width = Math.min(Math.max(frame.width, PANEL_MIN_WIDTH), maxWidth);
	const height = Math.min(Math.max(frame.height, PANEL_MIN_HEIGHT), maxHeight);
	const maxX = Math.max(PANEL_MARGIN, window.innerWidth - PANEL_MARGIN - width);
	const maxY = Math.max(
		PANEL_MARGIN,
		window.innerHeight - PANEL_MARGIN - height,
	);

	return {
		x: Math.min(Math.max(frame.x, PANEL_MARGIN), maxX),
		y: Math.min(Math.max(frame.y, PANEL_MARGIN), maxY),
		width,
		height,
	};
}

function normalizeAiWorkflowLabel(label?: string) {
	return label?.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function RevornixSidePanel({
	open,
	onClose,
	currentUrl,
	uiLanguage,
	resolvedTheme = 'light',
}: RevornixSidePanelProps) {
	const copy = getUiCopy(uiLanguage);
	const [scrollFade, setScrollFade] = useState(0);
	const [baseUrl, setBaseUrl] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [draft, setDraft] = useState<PageDraft>(() =>
		readDraftFromPage(currentUrl),
	);
	const [comment, setComment] = useState('');
	const [availableLabels, setAvailableLabels] = useState<
		RevornixDocumentLabel[]
	>([]);
	const [availableSections, setAvailableSections] = useState<
		RevornixSectionInfo[]
	>([]);
	const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
	const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
	const [matchedDocument, setMatchedDocument] =
		useState<RevornixWebsiteDocumentDetail | null>(null);
	const [matchedDocuments, setMatchedDocuments] = useState<
		RevornixWebsiteDocumentDetail[]
	>([]);
	const [statusText, setStatusText] = useState('');
	const [loadingMetadata, setLoadingMetadata] = useState(false);
	const [creatingDocument, setCreatingDocument] = useState(false);
	const [updatingDocument, setUpdatingDocument] = useState(false);
	const [savingComment, setSavingComment] = useState(false);
	const [recentNotes, setRecentNotes] = useState<RevornixDocumentNote[]>([]);
	const [graphData, setGraphData] = useState<RevornixGraphResponse | null>(
		null,
	);
	const [loadingGraph, setLoadingGraph] = useState(false);
	const [generatingGraph, setGeneratingGraph] = useState(false);
	const [generatingPodcast, setGeneratingPodcast] = useState(false);
	const [creatingLabel, setCreatingLabel] = useState(false);
	const [creatingSection, setCreatingSection] = useState(false);
	const [newLabelName, setNewLabelName] = useState('');
	const [newSectionTitle, setNewSectionTitle] = useState('');
	const [newSectionDescription, setNewSectionDescription] = useState('');
	const [labelsExpanded, setLabelsExpanded] = useState(false);
	const [sectionsExpanded, setSectionsExpanded] = useState(false);
	const [activeTab, setActiveTab] = useState<'editor' | 'info' | 'ai'>(
		'editor',
	);
	const [podcastPlaying, setPodcastPlaying] = useState(false);
	const [podcastCurrentTime, setPodcastCurrentTime] = useState(0);
	const [podcastDuration, setPodcastDuration] = useState(0);
	const [aiMessages, setAiMessages] = useState<RevornixAiMessage[]>([]);
	const [aiInput, setAiInput] = useState('');
	const [sendingAiMessage, setSendingAiMessage] = useState(false);
	const [shouldFollowAiOutput, setShouldFollowAiOutput] = useState(true);
	const [copiedAiMessageId, setCopiedAiMessageId] = useState<string | null>(null);
	const [panelFrame, setPanelFrame] = useState<PanelFrame>(() =>
		getDefaultPanelFrame(),
	);
	const podcastAudioRef = useRef<HTMLAudioElement | null>(null);
	const aiScrollContainerRef = useRef<HTMLDivElement | null>(null);
	const aiMessageEndRef = useRef<HTMLDivElement | null>(null);
	const metadataRequestIdRef = useRef(0);
	const panelFrameRef = useRef(panelFrame);
	const copiedMessageTimerRef = useRef<number | null>(null);

	useEffect(() => {
		panelFrameRef.current = panelFrame;
	}, [panelFrame]);

	useEffect(() => {
		return () => {
			if (copiedMessageTimerRef.current !== null) {
				window.clearTimeout(copiedMessageTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		setDraft(readDraftFromPage(currentUrl));
	}, [currentUrl]);

	useEffect(() => {
		const handleWindowResize = () => {
			updatePanelFrame((current) => current);
		};

		window.addEventListener('resize', handleWindowResize);
		return () => {
			window.removeEventListener('resize', handleWindowResize);
		};
	}, []);

	useEffect(() => {
		void chrome.storage.local.get(['baseUrl', 'apiKey']).then((storage) => {
			setBaseUrl((storage.baseUrl as string) || '');
			setApiKey((storage.apiKey as string) || '');
		});

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		) => {
			if (areaName !== 'local') {
				return;
			}

			if (changes.baseUrl) {
				setBaseUrl((changes.baseUrl.newValue as string) || '');
			}

			if (changes.apiKey) {
				setApiKey((changes.apiKey.newValue as string) || '');
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	const configured = useMemo(
		() => Boolean(baseUrl && apiKey),
		[baseUrl, apiKey],
	);

	const updatePanelFrame = (updater: (current: PanelFrame) => PanelFrame) => {
		setPanelFrame((current) => {
			const next = clampPanelFrame(updater(current));
			panelFrameRef.current = next;
			return next;
		});
	};

	const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) {
			return;
		}

		const interactiveTarget = (event.target as HTMLElement | null)?.closest(
			'button, input, textarea, a, [role="tab"], [data-panel-resize-handle="true"]',
		);
		if (interactiveTarget) {
			return;
		}

		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		const startFrame = panelFrameRef.current;
		document.body.style.userSelect = 'none';

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - startX;
			const deltaY = moveEvent.clientY - startY;
			updatePanelFrame((current) => ({
				...current,
				x: startFrame.x + deltaX,
				y: startFrame.y + deltaY,
			}));
		};

		const cleanup = () => {
			document.body.style.userSelect = '';
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', cleanup);
			window.removeEventListener('pointercancel', cleanup);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', cleanup, { once: true });
		window.addEventListener('pointercancel', cleanup, { once: true });
	};

	const beginResize = (
		edge: PanelResizeEdge,
		event: ReactPointerEvent<HTMLDivElement>,
	) => {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const startY = event.clientY;
		const startFrame = panelFrameRef.current;
		document.body.style.userSelect = 'none';

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - startX;
			const deltaY = moveEvent.clientY - startY;
			updatePanelFrame(() => {
				let next = { ...startFrame };

				if (edge.includes('left')) {
					next.x = startFrame.x + deltaX;
					next.width = startFrame.width - deltaX;
				}

				if (edge.includes('right')) {
					next.width = startFrame.width + deltaX;
				}

				if (edge.includes('top')) {
					next.y = startFrame.y + deltaY;
					next.height = startFrame.height - deltaY;
				}

				if (edge.includes('bottom')) {
					next.height = startFrame.height + deltaY;
				}

				return next;
			});
		};

		const cleanup = () => {
			document.body.style.userSelect = '';
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', cleanup);
			window.removeEventListener('pointercancel', cleanup);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', cleanup, { once: true });
		window.addEventListener('pointercancel', cleanup, { once: true });
	};

	const loadPanelMetadata = async (nextUrl = currentUrl) => {
		const requestId = metadataRequestIdRef.current + 1;
		metadataRequestIdRef.current = requestId;
		const nextDraft = readDraftFromPage(nextUrl);

		if (!configured) {
			setAvailableLabels([]);
			setAvailableSections([]);
			setMatchedDocuments([]);
			setMatchedDocument(null);
			setStatusText(copy.revornixPanelConfigRequired);
			return;
		}

		try {
			setLoadingMetadata(true);
			const currentMatchedUrl = normalizeUrl(
				matchedDocument?.website_info?.url || '',
			);
			if (currentMatchedUrl && currentMatchedUrl !== normalizeUrl(nextUrl)) {
				setMatchedDocument(null);
			}

			const searchKeywords = buildSearchKeywords(nextUrl, nextDraft.title);
			const [labels, sections, directMatchResult, ...searchResults] =
				await Promise.all([
					listDocumentLabels(baseUrl, apiKey),
					listMineSections(baseUrl, apiKey),
					getDocumentDetailByUrl(baseUrl, apiKey, nextUrl).catch(() => null),
					...searchKeywords.map((keyword) =>
						searchMineDocuments(baseUrl, apiKey, {
							keyword,
							limit: 6,
							desc: true,
						}),
					),
				]);
			if (metadataRequestIdRef.current !== requestId) {
				return;
			}

			setAvailableLabels(labels);
			setAvailableSections(sections);

			const dedupedSearchItems = Array.from(
				new Map(
					searchResults
						.flatMap((result) => result.elements || [])
						.map((item) => [item.id, item]),
				).values(),
			).slice(0, 8);

			const detailResults = await Promise.all(
				dedupedSearchItems.map((item) =>
					getDocumentDetail(baseUrl, apiKey, item.id).catch(() => null),
				),
			);
			if (metadataRequestIdRef.current !== requestId) {
				return;
			}

			const websiteDocuments = [directMatchResult, ...detailResults].filter(
				(document): document is RevornixWebsiteDocumentDetail =>
					Boolean(document?.website_info?.url),
			);
			const dedupedWebsiteDocuments = Array.from(
				new Map(
					websiteDocuments.map((document) => [document.id, document]),
				).values(),
			);
			setMatchedDocuments(dedupedWebsiteDocuments);

			const exactMatch =
				dedupedWebsiteDocuments.find((document) =>
					isExactWebsiteDocumentMatch(document, nextUrl),
				) ||
				directMatchResult ||
				null;
			setMatchedDocument(exactMatch);
			if (exactMatch) {
				setSelectedLabelIds(exactMatch.labels?.map((label) => label.id) || []);
				setSelectedSectionIds(
					exactMatch.sections?.map((section) => section.id) || [],
				);
				setStatusText(copy.revornixMatchedCurrentDocument);
			} else {
				setSelectedLabelIds([]);
				setSelectedSectionIds([]);
				setStatusText(copy.revornixNoMatchedDocuments);
			}
		} catch (error) {
			if (metadataRequestIdRef.current !== requestId) {
				return;
			}

			setAvailableLabels([]);
			setAvailableSections([]);
			setMatchedDocuments([]);
			setMatchedDocument(null);
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			if (metadataRequestIdRef.current === requestId) {
				setLoadingMetadata(false);
			}
		}
	};

	const loadNotes = async (documentId: number) => {
		if (!configured) {
			setRecentNotes([]);
			return;
		}

		try {
			const result = await searchDocumentNotes(baseUrl, apiKey, {
				document_id: documentId,
				limit: 8,
			});
			setRecentNotes(result.elements || []);
		} catch {
			setRecentNotes([]);
		}
	};

	const loadGraph = async (documentId: number, status?: number | null) => {
		if (!configured || !documentId) {
			setGraphData(null);
			return;
		}

		if (status !== DOCUMENT_GRAPH_STATUS.SUCCESS) {
			setGraphData(null);
			return;
		}

		try {
			setLoadingGraph(true);
			const result = await getDocumentGraph(baseUrl, apiKey, documentId);
			setGraphData(result);
		} catch {
			setGraphData(null);
		} finally {
			setLoadingGraph(false);
		}
	};

	useEffect(() => {
		if (!open) {
			return;
		}

		void loadPanelMetadata();
	}, [
		open,
		configured,
		baseUrl,
		apiKey,
		currentUrl,
		draft.title,
		copy.revornixActionFailed,
		copy.revornixMatchedCurrentDocument,
		copy.revornixNoMatchedDocuments,
		copy.revornixPanelConfigRequired,
	]);

	useEffect(() => {
		if (!open || !matchedDocument?.id) {
			setRecentNotes([]);
			return;
		}

		void loadNotes(matchedDocument.id);
	}, [open, matchedDocument?.id, configured, baseUrl, apiKey]);

	useEffect(() => {
		const currentProcessStatus = matchedDocument?.process_task?.status ?? null;
		const currentPodcastStatus = matchedDocument?.podcast_task?.status ?? null;
		const currentGraphStatus = matchedDocument?.graph_task?.status ?? null;
		const shouldPoll =
			currentProcessStatus === DOCUMENT_PROCESS_STATUS.WAIT_TO ||
			currentProcessStatus === DOCUMENT_PROCESS_STATUS.PROCESSING ||
			currentPodcastStatus === DOCUMENT_PODCAST_STATUS.WAIT_TO ||
			currentPodcastStatus === DOCUMENT_PODCAST_STATUS.GENERATING ||
			currentGraphStatus === DOCUMENT_GRAPH_STATUS.WAIT_TO ||
			currentGraphStatus === DOCUMENT_GRAPH_STATUS.BUILDING;
		if (!open || !configured || !matchedDocument?.id || !shouldPoll) {
			return;
		}

		let cancelled = false;
		const poll = async () => {
			try {
				const detail = await getDocumentDetail(
					baseUrl,
					apiKey,
					matchedDocument.id,
				);
				if (cancelled) {
					return;
				}
				setMatchedDocument(detail);
				setMatchedDocuments((previous) =>
					previous.map((item) => (item.id === detail.id ? detail : item)),
				);
			} catch {
				// Ignore polling errors and retry on next interval.
			}
		};

		void poll();
		const intervalId = window.setInterval(() => {
			void poll();
		}, PODCAST_POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
		};
	}, [
		open,
		configured,
		baseUrl,
		apiKey,
		matchedDocument?.id,
		matchedDocument?.process_task?.status,
		matchedDocument?.podcast_task?.status,
		matchedDocument?.graph_task?.status,
	]);

	useEffect(() => {
		if (!open || !matchedDocument?.id) {
			setGraphData(null);
			return;
		}

		void loadGraph(
			matchedDocument.id,
			matchedDocument.graph_task?.status ?? null,
		);
	}, [
		open,
		matchedDocument?.id,
		matchedDocument?.graph_task?.status,
		configured,
		baseUrl,
		apiKey,
	]);

	useEffect(() => {
		if (!open) {
			return;
		}
		setActiveTab(matchedDocument ? 'info' : 'editor');
	}, [open, currentUrl, matchedDocument?.id]);

	useEffect(() => {
		if (!shouldFollowAiOutput) {
			return;
		}

		aiMessageEndRef.current?.scrollIntoView({
			behavior: 'auto',
			block: 'end',
		});
	}, [shouldFollowAiOutput, aiMessages.length, aiMessages.at(-1)?.content]);

	useEffect(() => {
		const container = aiScrollContainerRef.current;
		if (!container) {
			return;
		}

		const handleScroll = () => {
			const offsetFromBottom =
				container.scrollHeight - container.scrollTop - container.clientHeight;
			setShouldFollowAiOutput(offsetFromBottom < 80);
		};

		handleScroll();
		container.addEventListener('scroll', handleScroll);
		return () => {
			container.removeEventListener('scroll', handleScroll);
		};
	}, [aiMessages.length]);

	useEffect(() => {
		setAiMessages([]);
		setAiInput('');
		setSendingAiMessage(false);
		setShouldFollowAiOutput(true);
		setCopiedAiMessageId(null);
	}, [matchedDocument?.id]);

	useEffect(() => {
		const audio = podcastAudioRef.current ?? new Audio();
		podcastAudioRef.current = audio;

		const handleTimeUpdate = () => {
			setPodcastCurrentTime(audio.currentTime || 0);
		};
		const handleLoadedMetadata = () => {
			setPodcastDuration(audio.duration || 0);
		};
		const handlePlay = () => setPodcastPlaying(true);
		const handlePause = () => setPodcastPlaying(false);
		const handleEnded = () => setPodcastPlaying(false);

		audio.addEventListener('timeupdate', handleTimeUpdate);
		audio.addEventListener('loadedmetadata', handleLoadedMetadata);
		audio.addEventListener('play', handlePlay);
		audio.addEventListener('pause', handlePause);
		audio.addEventListener('ended', handleEnded);

		return () => {
			audio.pause();
			audio.removeEventListener('timeupdate', handleTimeUpdate);
			audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
			audio.removeEventListener('play', handlePlay);
			audio.removeEventListener('pause', handlePause);
			audio.removeEventListener('ended', handleEnded);
		};
	}, []);

	const aiChatEnabled =
		Boolean(matchedDocument?.id) &&
		matchedDocument?.process_task?.status === DOCUMENT_PROCESS_STATUS.SUCCESS;

	const resolveAiPhaseLabel = (phase: RevornixAiPhase, label?: string) => {
		const normalizedLabel = normalizeAiWorkflowLabel(label);
		if (normalizedLabel) {
			const localizedLabelMap: Record<string, string> = {
				understanding: copy.revornixAiWorkflowThinking,
				'understanding context': copy.revornixAiWorkflowThinking,
				'thinking': copy.revornixAiWorkflowThinking,
				'thinking...': copy.revornixAiWorkflowThinking,
				'writing': copy.revornixAiWorkflowWriting,
				'writing answer': copy.revornixAiWorkflowWriting,
				'generating answer': copy.revornixAiWorkflowWriting,
				'using tools': copy.revornixAiWorkflowTool,
				'calling tool': copy.revornixAiWorkflowTool,
				'calling tools': copy.revornixAiWorkflowTool,
				'tool result received': copy.revornixAiWorkflowToolResult,
				'tool result': copy.revornixAiWorkflowToolResult,
				'answer complete': copy.revornixAiWorkflowDone,
				'done': copy.revornixAiWorkflowDone,
				'completed': copy.revornixAiWorkflowDone,
				'正在理解上下文': copy.revornixAiWorkflowThinking,
				'正在生成回答': copy.revornixAiWorkflowWriting,
				'正在调用工具': copy.revornixAiWorkflowTool,
				'工具结果已返回': copy.revornixAiWorkflowToolResult,
				'回答完成': copy.revornixAiWorkflowDone,
			};

			if (localizedLabelMap[normalizedLabel]) {
				return localizedLabelMap[normalizedLabel];
			}

			return label?.trim() || '';
		}

		switch (phase) {
			case 'thinking':
				return copy.revornixAiWorkflowThinking;
			case 'writing':
				return copy.revornixAiWorkflowWriting;
			case 'tool':
				return copy.revornixAiWorkflowTool;
			case 'tool_result':
				return copy.revornixAiWorkflowToolResult;
			case 'done':
				return copy.revornixAiWorkflowDone;
			case 'error':
				return copy.revornixAiError;
			default:
				return copy.revornixAiThinking;
		}
	};

	const handleCopyAiMessage = async (message: RevornixAiMessage) => {
		const content = message.content.trim();
		if (!content) {
			return;
		}

		try {
			await navigator.clipboard.writeText(content);
			setCopiedAiMessageId(message.chat_id);
			if (copiedMessageTimerRef.current !== null) {
				window.clearTimeout(copiedMessageTimerRef.current);
			}
			copiedMessageTimerRef.current = window.setTimeout(() => {
				setCopiedAiMessageId(null);
				copiedMessageTimerRef.current = null;
			}, 1500);
		} catch {
			setStatusText(copy.revornixActionFailed);
		}
	};

	const handleAiEvent = (event: {
		chat_id: string;
		type: string;
		payload?: any;
	}) => {
		switch (event.type) {
			case 'status': {
				const phase =
					(event.payload?.phase as RevornixAiPhase | undefined) || 'thinking';
				setAiMessages((current) =>
					updateAiAssistantMessage(current, event.chat_id, (message) => ({
						...message,
						phase,
						label: resolveAiPhaseLabel(phase, event.payload?.label),
					})),
				);
				return;
			}
			case 'output': {
				const payload = event.payload;
				if (payload?.kind === 'token') {
					setAiMessages((current) =>
						updateAiAssistantMessage(current, event.chat_id, (message) => ({
							...message,
							content: `${message.content}${payload.content || ''}`,
							phase: 'writing',
							label: resolveAiPhaseLabel('writing'),
						})),
					);
					return;
				}

				if (payload?.kind === 'system_text') {
					setAiMessages((current) =>
						updateAiAssistantMessage(current, event.chat_id, (message) => ({
							...message,
							content: `${message.content}${payload.paragraph_break ? '\n\n' : ''}${payload.message || ''}`,
							phase: 'writing',
							label: resolveAiPhaseLabel('writing'),
						})),
					);
				}
				return;
			}
			case 'done': {
				setAiMessages((current) =>
					updateAiAssistantMessage(current, event.chat_id, (message) => ({
						...message,
						phase: 'done',
						label: resolveAiPhaseLabel('done'),
					})),
				);
				return;
			}
			case 'error': {
				const errorMessage = event.payload?.message || copy.revornixAiError;
				setAiMessages((current) =>
					updateAiAssistantMessage(current, event.chat_id, (message) => ({
						...message,
						phase: 'error',
						label: errorMessage,
						error: errorMessage,
					})),
				);
			}
		}
	};

	const consumeAiSSE = async (response: Response) => {
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error(copy.revornixAiError);
		}

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split('\n\n');
			buffer = parts.pop() || '';

			for (let raw of parts) {
				if (!raw.trim()) {
					continue;
				}

				if (raw.startsWith('data:')) {
					raw = raw.slice(5).trim();
				}

				try {
					handleAiEvent(JSON.parse(raw));
				} catch (error) {
					console.error('Invalid Revornix document AI SSE chunk', raw, error);
				}
			}
		}
	};

	const handleAskDocumentAi = async () => {
		const content = aiInput.trim();
		if (
			!content ||
			!matchedDocument?.id ||
			!aiChatEnabled ||
			sendingAiMessage
		) {
			return;
		}

		const nextUserMessage: RevornixAiMessage = {
			chat_id: crypto.randomUUID(),
			role: 'user',
			content,
		};
		const nextMessages = [...aiMessages, nextUserMessage];
		setAiMessages(nextMessages);
		setAiInput('');
		setShouldFollowAiOutput(true);
		setSendingAiMessage(true);

		try {
			const response = await askDocumentAiStream(baseUrl, apiKey, {
				document_id: matchedDocument.id,
				messages: nextMessages.map<RevornixChatMessage>((message) => ({
					chat_id: message.chat_id,
					role: message.role,
					content: message.content,
				})),
				enable_mcp: false,
			});

			if (!response.ok) {
				const raw = await response.text();
				const parsed = raw ? JSON.parse(raw) : null;
				throw new Error(
					(parsed && typeof parsed.message === 'string' && parsed.message) ||
						raw ||
						copy.revornixAiError,
				);
			}

			await consumeAiSSE(response);
		} catch (error) {
			const errorMessage =
				error instanceof Error && error.message
					? error.message
					: copy.revornixAiError;
			setAiMessages((current) =>
				updateAiAssistantMessage(
					current,
					nextUserMessage.chat_id,
					(message) => ({
						...message,
						phase: 'error',
						label: errorMessage,
						error: errorMessage,
					}),
				),
			);
		} finally {
			setSendingAiMessage(false);
		}
	};

	useEffect(() => {
		const nextSource = matchedDocument?.podcast_task?.podcast_file_name || '';
		const audio = podcastAudioRef.current;
		if (!audio) {
			return;
		}
		if (audio.src !== nextSource) {
			audio.pause();
			audio.src = nextSource;
			audio.load();
			setPodcastPlaying(false);
			setPodcastCurrentTime(0);
			setPodcastDuration(0);
		}
	}, [matchedDocument?.podcast_task?.podcast_file_name]);

	useEffect(() => {
		if (!open) {
			setScrollFade(0);
			return;
		}

		let timeoutId: number | null = null;
		let frameId: number | null = null;
		let currentValue = 0;
		let targetValue = 0;

		const animate = () => {
			currentValue += (targetValue - currentValue) * 0.16;
			if (Math.abs(targetValue - currentValue) < 0.01) {
				currentValue = targetValue;
			}
			setScrollFade(currentValue);
			if (Math.abs(targetValue - currentValue) >= 0.01) {
				frameId = window.requestAnimationFrame(animate);
			} else {
				frameId = null;
			}
		};

		const ensureAnimation = () => {
			if (frameId === null) {
				frameId = window.requestAnimationFrame(animate);
			}
		};

		const handleScroll = () => {
			targetValue = 1;
			ensureAnimation();
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
			timeoutId = window.setTimeout(() => {
				targetValue = 0;
				ensureAnimation();
				timeoutId = null;
			}, 180);
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', handleScroll);
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
			}
		};
	}, [open]);

	const refreshDraft = () => {
		const nextDraft = readDraftFromPage(window.location.href);
		setDraft(nextDraft);
		void loadPanelMetadata(nextDraft.url);
	};

	const toggleId = (
		currentIds: number[],
		id: number,
		setter: (nextValue: number[]) => void,
	) => {
		setter(
			currentIds.includes(id)
				? currentIds.filter((currentId) => currentId !== id)
				: [...currentIds, id],
		);
	};

	const handleCreateDocument = async () => {
		if (!configured) {
			setStatusText(copy.revornixPanelConfigRequired);
			return;
		}

		try {
			setCreatingDocument(true);
			setStatusText('');
			await createWebsiteDocument(baseUrl, apiKey, {
				url: draft.url,
				title: draft.title,
				description: draft.description,
				cover: draft.cover,
				labels: selectedLabelIds,
				sections: selectedSectionIds,
				auto_summary: false,
			});
			setStatusText(copy.revornixLinkedDocumentCreated);
			await loadPanelMetadata(draft.url);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			setCreatingDocument(false);
		}
	};

	const handleUpdateDocument = async () => {
		if (!configured || !matchedDocument) {
			setStatusText(copy.revornixNoMatchedDocuments);
			return;
		}

		try {
			setUpdatingDocument(true);
			setStatusText('');
			await updateDocument(baseUrl, apiKey, {
				document_id: matchedDocument.id,
				title: draft.title,
				description: draft.description,
				cover: draft.cover,
				labels: selectedLabelIds,
				sections: selectedSectionIds,
			});
			setStatusText(copy.revornixLinkedDocumentUpdated);
			await loadPanelMetadata(draft.url);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			setUpdatingDocument(false);
		}
	};

	const handleSaveComment = async () => {
		if (!configured) {
			setStatusText(copy.revornixPanelConfigRequired);
			return;
		}

		if (!comment.trim()) {
			setStatusText(copy.revornixNoteEmpty);
			return;
		}

		if (!matchedDocument?.id) {
			setStatusText(copy.revornixNoteDocumentRequired);
			return;
		}

		try {
			setSavingComment(true);
			setStatusText('');
			await createDocumentNote(baseUrl, apiKey, {
				document_id: matchedDocument.id,
				content: comment.trim(),
			});
			setComment('');
			setStatusText(copy.revornixNoteSaved);
			await loadNotes(matchedDocument.id);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			setSavingComment(false);
		}
	};

	const handleCreateLabel = async () => {
		if (!configured) {
			setStatusText(copy.revornixPanelConfigRequired);
			return;
		}

		if (!newLabelName.trim()) {
			return;
		}

		try {
			setCreatingLabel(true);
			const created = await createDocumentLabel(
				baseUrl,
				apiKey,
				newLabelName.trim(),
			);
			const nextLabels = await listDocumentLabels(baseUrl, apiKey);
			setAvailableLabels(nextLabels);
			if (created.id) {
				setSelectedLabelIds((previous) =>
					previous.includes(created.id) ? previous : [...previous, created.id],
				);
			}
			setNewLabelName('');
			setStatusText(copy.revornixCreatedLabel);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			setCreatingLabel(false);
		}
	};

	const refreshMatchedDocumentDetail = async (documentId: number) => {
		const detail = await getDocumentDetail(baseUrl, apiKey, documentId);
		setMatchedDocument(detail);
		setMatchedDocuments((previous) =>
			previous.map((item) => (item.id === detail.id ? detail : item)),
		);
		return detail;
	};

	const handleGenerateGraph = async () => {
		if (!configured || !matchedDocument?.id) {
			setStatusText(copy.revornixNoMatchedDocuments);
			return;
		}

		try {
			setGeneratingGraph(true);
			setStatusText('');
			await generateDocumentGraph(baseUrl, apiKey, matchedDocument.id);
			setStatusText(copy.revornixGraphGenerating);
			const detail = await refreshMatchedDocumentDetail(matchedDocument.id);
			await loadGraph(detail.id, detail.graph_task?.status ?? null);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			setGeneratingGraph(false);
		}
	};

	const handleGeneratePodcast = async () => {
		if (!configured || !matchedDocument?.id) {
			setStatusText(copy.revornixNoMatchedDocuments);
			return;
		}

		try {
			setGeneratingPodcast(true);
			setStatusText('');
			setMatchedDocument((previous) =>
				previous
					? {
							...previous,
							podcast_task: {
								status: DOCUMENT_PODCAST_STATUS.WAIT_TO,
								podcast_file_name: null,
								create_time: previous.podcast_task?.create_time ?? null,
								update_time: new Date().toISOString(),
							},
						}
					: previous,
			);
			setMatchedDocuments((previous) =>
				previous.map((item) =>
					item.id === matchedDocument.id
						? {
								...item,
								podcast_task: {
									status: DOCUMENT_PODCAST_STATUS.WAIT_TO,
									podcast_file_name: null,
									create_time: item.podcast_task?.create_time ?? null,
									update_time: new Date().toISOString(),
								},
							}
						: item,
				),
			);
			await generateDocumentPodcast(baseUrl, apiKey, matchedDocument.id);
			setStatusText(copy.revornixPodcastPending);
			await refreshMatchedDocumentDetail(matchedDocument.id);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
			await refreshMatchedDocumentDetail(matchedDocument.id).catch(() => {
				// ignore restore failures; keep local optimistic state if refresh fails
			});
		} finally {
			setGeneratingPodcast(false);
		}
	};

	const handleCreateSection = async () => {
		if (!configured) {
			setStatusText(copy.revornixPanelConfigRequired);
			return;
		}

		if (!newSectionTitle.trim() || !newSectionDescription.trim()) {
			return;
		}

		try {
			setCreatingSection(true);
			const created = await createSection(baseUrl, apiKey, {
				title: newSectionTitle.trim(),
				description: newSectionDescription.trim(),
				labels: [],
			});
			const nextSections = await listMineSections(baseUrl, apiKey);
			setAvailableSections(nextSections);
			if (created.id) {
				setSelectedSectionIds((previous) =>
					previous.includes(created.id) ? previous : [...previous, created.id],
				);
			}
			setNewSectionTitle('');
			setNewSectionDescription('');
			setStatusText(copy.revornixCreatedSection);
		} catch (error) {
			setStatusText(
				error instanceof Error ? error.message : copy.revornixActionFailed,
			);
		} finally {
			setCreatingSection(false);
		}
	};

	const hasMetadataChanges = useMemo(() => {
		if (!matchedDocument) {
			return false;
		}

		return (
			(draft.title || '') !== (matchedDocument.title || '') ||
			(draft.description || '') !== (matchedDocument.description || '') ||
			(draft.cover || '') !== (matchedDocument.cover || '') ||
			!arraysEqual(
				selectedLabelIds,
				matchedDocument.labels?.map((label) => label.id) || [],
			) ||
			!arraysEqual(
				selectedSectionIds,
				matchedDocument.sections?.map((section) => section.id) || [],
			)
		);
	}, [draft, matchedDocument, selectedLabelIds, selectedSectionIds]);

	const hasExactMatch = useMemo(
		() =>
			matchedDocuments.some((document) =>
				isExactWebsiteDocumentMatch(document, draft.url),
			),
		[matchedDocuments, draft.url],
	);
	const selectedLabelNames = useMemo(
		() =>
			availableLabels
				.filter((label) => selectedLabelIds.includes(label.id))
				.map((label) => label.name),
		[availableLabels, selectedLabelIds],
	);
	const selectedSectionTitles = useMemo(
		() =>
			availableSections
				.filter((section) => selectedSectionIds.includes(section.id))
				.map((section) => section.title),
		[availableSections, selectedSectionIds],
	);
	const topGraphNodes = useMemo(
		() =>
			(graphData?.nodes || [])
				.slice()
				.sort((left, right) => (right.degree || 0) - (left.degree || 0))
				.slice(0, 12),
		[graphData],
	);
	const graphStatus = matchedDocument?.graph_task?.status ?? null;
	const podcastStatus = matchedDocument?.podcast_task?.status ?? null;
	const panelOpacity = open ? 1 - scrollFade * 1 : 0;
	const panelBackgroundAlpha = 0.62 - scrollFade * 0.62;
	const panelBorderAlpha = 0.11 - scrollFade * 0.11;
	const panelBlur = 24 - scrollFade * 24;

	const renderGraphSection = () => {
		if (!matchedDocument) {
			return (
				<div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/55'>
					{copy.revornixNoMatchedDocuments}
				</div>
			);
		}

		if (graphStatus == null) {
			return (
				<div className='space-y-3'>
					<div className='rounded-xl border border-amber-400/15 bg-amber-400/10 px-3 py-3 text-sm text-amber-100'>
						<div className='font-medium'>{copy.revornixGraphDesc}</div>
						<div className='mt-1 text-xs text-amber-100/80'>
							{copy.revornixGraphEmpty}
						</div>
					</div>
					<Button
						type='button'
						className='h-10 w-full rounded-xl bg-white text-black hover:bg-white/90'
						disabled={generatingGraph}
						onClick={() => {
							void handleGenerateGraph();
						}}>
						{generatingGraph ? (
							<LoaderCircle className='animate-spin' />
						) : (
							<GitBranchPlus />
						)}
						{generatingGraph
							? copy.revornixGraphGenerating
							: copy.revornixGraphGenerate}
					</Button>
				</div>
			);
		}

		if (graphStatus === DOCUMENT_GRAPH_STATUS.WAIT_TO) {
			return (
				<div className='rounded-xl border border-amber-400/15 bg-amber-400/10 px-3 py-3 text-sm text-amber-100'>
					<div className='flex items-center gap-2 font-medium'>
						<Sparkles className='size-4' />
						{copy.revornixGraphPending}
					</div>
				</div>
			);
		}

		if (graphStatus === DOCUMENT_GRAPH_STATUS.BUILDING) {
			return (
				<div className='rounded-xl border border-sky-400/15 bg-sky-400/10 px-3 py-3 text-sm text-sky-100'>
					<div className='flex items-center gap-2 font-medium'>
						<LoaderCircle className='size-4 animate-spin' />
						{copy.revornixGraphBuilding}
					</div>
				</div>
			);
		}

		if (graphStatus === DOCUMENT_GRAPH_STATUS.FAILED) {
			return (
				<div className='space-y-3'>
					<div className='rounded-xl border border-rose-400/15 bg-rose-400/10 px-3 py-3 text-sm text-rose-100'>
						<div className='flex items-center gap-2 font-medium'>
							<AlertCircle className='size-4' />
							{copy.revornixGraphFailed}
						</div>
					</div>
					<Button
						type='button'
						variant='secondary'
						className='h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
						disabled={generatingGraph}
						onClick={() => {
							void handleGenerateGraph();
						}}>
						{generatingGraph ? (
							<LoaderCircle className='animate-spin' />
						) : (
							<RefreshCw />
						)}
						{generatingGraph
							? copy.revornixGraphGenerating
							: copy.revornixGraphRegenerate}
					</Button>
				</div>
			);
		}

		return (
			<div className='space-y-3'>
				<div className='flex flex-wrap items-center gap-2'>
					<div className='rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100'>
						{copy.revornixGraphReady}
					</div>
					<div className='rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70'>
						{formatCopy(copy.revornixGraphNodes, {
							count: graphData?.nodes.length || 0,
						})}
					</div>
					<div className='rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70'>
						{formatCopy(copy.revornixGraphEdges, {
							count: graphData?.edges.length || 0,
						})}
					</div>
				</div>
				<div className='rounded-xl border border-white/8 bg-black/15 p-3'>
					<div className='mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45'>
						{copy.revornixGraphTopEntities}
					</div>
					{loadingGraph ? (
						<div className='flex items-center gap-2 text-sm text-white/65'>
							<LoaderCircle className='size-4 animate-spin' />
							{copy.refreshing}
						</div>
					) : topGraphNodes.length === 0 ? (
						<div className='text-sm text-white/52'>
							{copy.revornixGraphEmpty}
						</div>
					) : (
						<div className='space-y-3'>
							<div className='h-72 overflow-hidden rounded-2xl border border-white/8 bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]'>
								<RevornixGraphCanvas
									nodes={graphData?.nodes || []}
									edges={graphData?.edges || []}
									className='h-full w-full'
								/>
							</div>
						</div>
					)}
				</div>
				<Button
					type='button'
					variant='secondary'
					className='h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
					disabled={generatingGraph}
					onClick={() => {
						void handleGenerateGraph();
					}}>
					{generatingGraph ? (
						<LoaderCircle className='animate-spin' />
					) : (
						<RefreshCw />
					)}
					{generatingGraph
						? copy.revornixGraphGenerating
						: copy.revornixGraphRegenerate}
				</Button>
			</div>
		);
	};

	const renderPodcastSection = () => {
		if (!matchedDocument) {
			return (
				<div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/55'>
					{copy.revornixNoMatchedDocuments}
				</div>
			);
		}

		const hasPodcastAudio = Boolean(
			matchedDocument.podcast_task?.podcast_file_name,
		);
		const progressPercent =
			podcastDuration > 0
				? Math.min(100, (podcastCurrentTime / podcastDuration) * 100)
				: 0;

		return (
			<div className='space-y-3'>
				<div className='rounded-xl border border-white/8 bg-black/15 p-3'>
					<div className='mb-2 flex items-center justify-between gap-2'>
						<div className='text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45'>
							{copy.revornixPodcastAudio}
						</div>
						{podcastStatus === DOCUMENT_PODCAST_STATUS.SUCCESS ? (
							<div className='rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100'>
								{copy.revornixPodcastReady}
							</div>
						) : null}
					</div>

					{podcastStatus == null ? (
						<div className='text-sm text-white/52'>
							{copy.revornixNoPodcast}
						</div>
					) : null}
					{podcastStatus === DOCUMENT_PODCAST_STATUS.WAIT_TO ? (
						<div className='flex items-center gap-2 text-sm text-amber-100'>
							<Sparkles className='size-4' />
							{copy.revornixPodcastPending}
						</div>
					) : null}
					{podcastStatus === DOCUMENT_PODCAST_STATUS.GENERATING ? (
						<div className='flex items-center gap-2 text-sm text-sky-100'>
							<LoaderCircle className='size-4 animate-spin' />
							{copy.revornixPodcastProcessing}
						</div>
					) : null}
					{podcastStatus === DOCUMENT_PODCAST_STATUS.FAILED ? (
						<div className='flex items-center gap-2 text-sm text-rose-100'>
							<AlertCircle className='size-4' />
							{copy.revornixPodcastFailed}
						</div>
					) : null}
					{podcastStatus === DOCUMENT_PODCAST_STATUS.SUCCESS &&
					hasPodcastAudio ? (
						<div className='mt-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3'>
							<div className='flex items-center gap-3'>
								<Button
									type='button'
									size='icon'
									variant='secondary'
									className='size-10 shrink-0 rounded-full border border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.12]'
									onClick={() => {
										const audio = podcastAudioRef.current;
										if (!audio) {
											return;
										}
										if (audio.paused) {
											void audio.play().catch(() => {
												setPodcastPlaying(false);
											});
										} else {
											audio.pause();
										}
									}}>
									{podcastPlaying ? (
										<Pause className='size-4' />
									) : (
										<Play className='size-4' />
									)}
								</Button>
								<div className='min-w-0 flex-1'>
									<div className='truncate text-sm font-medium text-white'>
										{matchedDocument.title || copy.revornixPodcastTitle}
									</div>
									<div className='mt-1 flex items-center justify-between gap-3 text-[11px] text-white/52'>
										<span>{copy.revornixPodcastReady}</span>
										<span>
											{formatAudioTime(podcastCurrentTime)} /{' '}
											{formatAudioTime(podcastDuration)}
										</span>
									</div>
									<input
										type='range'
										min={0}
										max={podcastDuration || 0}
										step={0.1}
										value={Math.min(podcastCurrentTime, podcastDuration || 0)}
										onChange={(event) => {
											const audio = podcastAudioRef.current;
											const nextTime = Number(event.target.value);
											setPodcastCurrentTime(nextTime);
											if (audio) {
												audio.currentTime = nextTime;
											}
										}}
										className='mt-3 w-full accent-white'
										style={{
											background: `linear-gradient(to right, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.82) ${progressPercent}%, rgba(255,255,255,0.12) ${progressPercent}%, rgba(255,255,255,0.12) 100%)`,
										}}
									/>
								</div>
							</div>
						</div>
					) : null}
				</div>

				<Button
					type='button'
					className='h-10 w-full rounded-xl bg-white text-black hover:bg-white/90'
					disabled={generatingPodcast}
					onClick={() => {
						void handleGeneratePodcast();
					}}>
					{generatingPodcast ? (
						<LoaderCircle className='animate-spin' />
					) : (
						<AudioLines />
					)}
					{generatingPodcast
						? copy.revornixPodcastGenerating
						: podcastStatus === DOCUMENT_PODCAST_STATUS.SUCCESS
							? copy.revornixPodcastRegenerate
							: copy.revornixPodcastGenerate}
				</Button>
			</div>
		);
	};

	return (
		<div
			data-revornix-side-panel='true'
			data-state={open ? 'open' : 'closed'}
			className={`revornix-widget-scope fixed z-[2147483645] overflow-hidden rounded-[28px] shadow-[-18px_0_48px_rgba(0,0,0,0.22)] transition-[transform,opacity,background-color,border-color,backdrop-filter,color] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4 ${
				'dark'
			} ${
				open
					? 'pointer-events-auto opacity-100'
					: 'pointer-events-none translate-x-full opacity-0'
			}`}
			style={{
				left: `${panelFrame.x}px`,
				top: `${panelFrame.y}px`,
				width: `${panelFrame.width}px`,
				height: `${panelFrame.height}px`,
				opacity: panelOpacity,
				color: 'rgba(246,248,255,0.95)',
				backgroundColor: `rgba(30, 33, 40, ${Math.max(panelBackgroundAlpha, 0.1)})`,
				border: `1px solid rgba(255,255,255,${Math.max(panelBorderAlpha, 0.03)})`,
				backdropFilter: `blur(${Math.max(panelBlur, 10)}px) saturate(${1.02 - scrollFade * 0.08})`,
			}}>
			<div
				data-panel-resize-handle='true'
				className='absolute inset-y-0 left-0 z-40 w-2 cursor-ew-resize'
				onPointerDown={(event) => beginResize('left', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute inset-y-0 right-0 z-40 w-2 cursor-ew-resize'
				onPointerDown={(event) => beginResize('right', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute inset-x-0 top-0 z-40 h-2 cursor-ns-resize'
				onPointerDown={(event) => beginResize('top', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute inset-x-0 bottom-0 z-40 h-2 cursor-ns-resize'
				onPointerDown={(event) => beginResize('bottom', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute left-0 top-0 z-50 size-3 cursor-nwse-resize'
				onPointerDown={(event) => beginResize('top-left', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute right-0 top-0 z-50 size-3 cursor-nesw-resize'
				onPointerDown={(event) => beginResize('top-right', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute bottom-0 left-0 z-50 size-3 cursor-nesw-resize'
				onPointerDown={(event) => beginResize('bottom-left', event)}
			/>
			<div
				data-panel-resize-handle='true'
				className='absolute bottom-0 right-0 z-50 size-3 cursor-nwse-resize'
				onPointerDown={(event) => beginResize('bottom-right', event)}
			/>
			<div className='flex h-full w-full flex-col'>
				<div
					className='cursor-grab bg-white/[0.028] p-4 pb-0 active:cursor-grabbing'
					onPointerDown={beginDrag}>
					<div className='mb-3 flex items-start justify-between gap-3'>
						<div>
							<div className='text-base font-semibold tracking-tight'>
								{copy.revornixPanelTitle}
							</div>
							<div className='mt-1 text-xs text-white/55'>
								{copy.revornixPanelSubtitle}
							</div>
						</div>
						<Button
							type='button'
							size='icon'
							variant='ghost'
							className='rounded-full border border-white/8 bg-white/[0.035] text-white hover:bg-white/[0.06] hover:text-white'
							onClick={onClose}>
							<PanelRightClose />
						</Button>
					</div>
				</div>
				<Tabs
					value={activeTab}
					onValueChange={(value) => {
						setActiveTab(value as 'editor' | 'info' | 'ai');
					}}
					className='flex min-h-0 flex-1 flex-col bg-white/[0.028]'>
					<div className='sticky top-0 z-10 px-2'>
						<TabsList className='grid h-10 w-full grid-cols-3 rounded-xl border border-white/6 bg-white/[0.028] p-[3px]'>
							<TabsTrigger
								value='editor'
								className='rounded-[10px] border border-transparent px-2 py-1 text-[13px] font-medium text-white/56 data-[state=active]:border-white/7 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white data-[state=active]:shadow-none'>
								{copy.revornixEditorTab}
							</TabsTrigger>
							<TabsTrigger
								value='info'
								className='rounded-[10px] border border-transparent px-2 py-1 text-[13px] font-medium text-white/56 data-[state=active]:border-white/7 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white data-[state=active]:shadow-none'>
								{copy.revornixInfoTab}
							</TabsTrigger>
							<TabsTrigger
								value='ai'
								className='rounded-[10px] border border-transparent px-2 py-1 text-[13px] font-medium text-white/56 data-[state=active]:border-white/7 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white data-[state=active]:shadow-none'>
								{copy.revornixAiTab}
							</TabsTrigger>
						</TabsList>
					</div>
					<div className='min-h-0 flex-1 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.045),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_25%)] p-4'>
						<TabsContent
							value='editor'
							className='mt-0 h-full space-y-4 overflow-y-auto pr-1'>
							{loadingMetadata || matchedDocuments.length > 0 ? (
								<div className='rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
									<div className='mb-3 flex items-start justify-between gap-3'>
										<div>
											<div className='text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45'>
												{copy.revornixExistingDocuments}
											</div>
											<div className='mt-1 text-xs text-white/52'>
												{copy.revornixExistingDocumentsDesc}
											</div>
										</div>
										<Button
											type='button'
											size='sm'
											variant='ghost'
											className='h-8 rounded-full border border-white/8 bg-white/[0.03] px-3 text-white/72 hover:bg-white/[0.06] hover:text-white'
											disabled={loadingMetadata}
											onClick={() => {
												void loadPanelMetadata(draft.url);
											}}>
											<RefreshCw
												className={loadingMetadata ? 'animate-spin' : ''}
											/>
											{copy.refresh}
										</Button>
									</div>
									{loadingMetadata ? (
										<div className='flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/70'>
											<LoaderCircle className='size-4 animate-spin' />
											{copy.refreshing}
										</div>
									) : (
										<div className='space-y-2'>
											{matchedDocuments.map((document) => {
												const active = matchedDocument?.id === document.id;
												const exact = isExactWebsiteDocumentMatch(
													document,
													draft.url,
												);
												return (
													<button
														key={document.id}
														type='button'
														className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
															active
																? 'border-emerald-400/25 bg-emerald-400/10'
																: 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'
														}`}
														onClick={() => {
															setMatchedDocument(document);
															setSelectedLabelIds(
																document.labels?.map((label) => label.id) || [],
															);
															setSelectedSectionIds(
																document.sections?.map(
																	(section) => section.id,
																) || [],
															);
														}}>
														<div className='flex items-center justify-between gap-2'>
															<div className='flex min-w-0 items-center gap-2'>
																<div className='truncate text-sm font-medium text-white'>
																	{document.title}
																</div>
																{exact ? (
																	<span className='shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100'>
																		{copy.revornixMatchedCurrentDocument}
																	</span>
																) : null}
															</div>
															{active ? (
																<Check className='size-4 shrink-0 text-emerald-200' />
															) : null}
														</div>
														<div className='mt-1 text-xs text-white/52'>
															{document.website_info?.url ||
																document.description ||
																''}
														</div>
													</button>
												);
											})}
										</div>
									)}
								</div>
							) : null}

							<div className='rounded-[22px] border border-white/8 bg-white/[0.035] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'>
								<div className='mb-2 flex items-center justify-between gap-2'>
									<div className='text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45'>
										{copy.revornixCurrentPage}
									</div>
									<Button
										type='button'
										size='sm'
										variant='ghost'
										className='h-7 rounded-full px-2.5 text-white/70 hover:bg-white/8 hover:text-white'
										onClick={refreshDraft}>
										<RefreshCw />
										{copy.revornixRefreshPageData}
									</Button>
								</div>
								<div className='space-y-3'>
									<div className='space-y-1.5'>
										<div className='text-[11px] text-white/45'>
											{copy.revornixPanelUrl}
										</div>
										<Input
											value={draft.url}
											readOnly
											className='border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
										/>
									</div>
									<div className='space-y-1.5'>
										<div className='text-[11px] text-white/45'>
											{copy.revornixPanelDocTitle}
										</div>
										<Input
											value={draft.title}
											onChange={(event) => {
												setDraft((prev) => ({
													...prev,
													title: event.target.value,
												}));
											}}
											className='border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
										/>
									</div>
									<div className='space-y-1.5'>
										<div className='text-[11px] text-white/45'>
											{copy.revornixPanelDocDescription}
										</div>
										<Textarea
											value={draft.description}
											onChange={(event) => {
												setDraft((prev) => ({
													...prev,
													description: event.target.value,
												}));
											}}
											className='min-h-24 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
										/>
									</div>
								</div>
							</div>

							<div className='rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
								<div className='mb-3 flex items-center gap-2'>
									<div className='rounded-full border border-sky-400/15 bg-sky-400/10 p-2'>
										<Waypoints className='size-4 text-sky-200' />
									</div>
									<div>
										<div className='text-sm font-semibold text-white'>
											{copy.revornixLinkedDocument}
										</div>
										<div className='text-xs text-white/52'>
											{copy.revornixLinkedDocumentDesc}
										</div>
									</div>
								</div>

								<div className='space-y-3'>
									<div className='space-y-2'>
										<button
											type='button'
											className='flex w-full items-start justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.05]'
											onClick={() => {
												setLabelsExpanded((prev) => !prev);
											}}>
											<div>
												<div className='text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45'>
													{copy.revornixLabels}
												</div>
												<div className='mt-1 text-xs text-white/58'>
													{selectedLabelNames.length > 0
														? selectedLabelNames.join(' / ')
														: copy.revornixLabelPlaceholder}
												</div>
											</div>
											<ChevronDown
												className={`mt-0.5 size-4 text-white/55 transition-transform ${
													labelsExpanded ? 'rotate-180' : ''
												}`}
											/>
										</button>
										{labelsExpanded ? (
											<div className='space-y-2 rounded-xl border border-white/8 bg-black/15 p-3'>
												<div className='flex flex-wrap gap-2'>
													{availableLabels.map((label) => {
														const active = selectedLabelIds.includes(label.id);
														return (
															<button
																key={label.id}
																type='button'
																className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
																	active
																		? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
																		: 'border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
																}`}
																onClick={() => {
																	toggleId(
																		selectedLabelIds,
																		label.id,
																		setSelectedLabelIds,
																	);
																}}>
																{label.name}
															</button>
														);
													})}
												</div>
												<div className='flex gap-2'>
													<Input
														value={newLabelName}
														onChange={(event) =>
															setNewLabelName(event.target.value)
														}
														placeholder={copy.revornixLabelPlaceholder}
														className='border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
													/>
													<Button
														type='button'
														variant='secondary'
														className='shrink-0 border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
														disabled={creatingLabel}
														onClick={() => {
															void handleCreateLabel();
														}}>
														{creatingLabel ? (
															<LoaderCircle className='animate-spin' />
														) : (
															<BadgePlus />
														)}
														{copy.revornixCreateLabel}
													</Button>
												</div>
											</div>
										) : null}
									</div>

									<div className='space-y-2'>
										<button
											type='button'
											className='flex w-full items-start justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.05]'
											onClick={() => {
												setSectionsExpanded((prev) => !prev);
											}}>
											<div>
												<div className='text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45'>
													{copy.revornixSections}
												</div>
												<div className='mt-1 text-xs text-white/58'>
													{selectedSectionTitles.length > 0
														? selectedSectionTitles.join(' / ')
														: copy.revornixSectionTitlePlaceholder}
												</div>
											</div>
											<ChevronDown
												className={`mt-0.5 size-4 text-white/55 transition-transform ${
													sectionsExpanded ? 'rotate-180' : ''
												}`}
											/>
										</button>
										{sectionsExpanded ? (
											<div className='space-y-2 rounded-xl border border-white/8 bg-black/15 p-3'>
												<div className='flex flex-wrap gap-2'>
													{availableSections.map((section) => {
														const active = selectedSectionIds.includes(
															section.id,
														);
														return (
															<button
																key={section.id}
																type='button'
																className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
																	active
																		? 'border-sky-400/20 bg-sky-400/10 text-sky-100'
																		: 'border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
																}`}
																onClick={() => {
																	toggleId(
																		selectedSectionIds,
																		section.id,
																		setSelectedSectionIds,
																	);
																}}>
																{section.title}
															</button>
														);
													})}
												</div>
												<div className='space-y-2'>
													<Input
														value={newSectionTitle}
														onChange={(event) =>
															setNewSectionTitle(event.target.value)
														}
														placeholder={copy.revornixSectionTitlePlaceholder}
														className='border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
													/>
													<Textarea
														value={newSectionDescription}
														onChange={(event) =>
															setNewSectionDescription(event.target.value)
														}
														placeholder={copy.revornixSectionDescPlaceholder}
														className='min-h-20 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
													/>
													<Button
														type='button'
														variant='secondary'
														className='w-full border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
														disabled={creatingSection}
														onClick={() => {
															void handleCreateSection();
														}}>
														{creatingSection ? (
															<LoaderCircle className='animate-spin' />
														) : (
															<FolderPlus />
														)}
														{copy.revornixCreateSection}
													</Button>
												</div>
											</div>
										) : null}
									</div>
								</div>

								<div className='mt-3 grid grid-cols-1 gap-2'>
									<Button
										type='button'
										className='h-10 w-full rounded-xl bg-white text-black hover:bg-white/90'
										onClick={() => {
											void handleCreateDocument();
										}}
										disabled={creatingDocument || hasExactMatch}>
										{creatingDocument ? (
											<LoaderCircle className='animate-spin' />
										) : (
											<Waypoints />
										)}
										{creatingDocument
											? copy.revornixCreatingLinkedDocument
											: copy.revornixCreateLinkedDocument}
									</Button>
									<Button
										type='button'
										variant='secondary'
										className='h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
										disabled={
											!matchedDocument ||
											!hasMetadataChanges ||
											updatingDocument
										}
										onClick={() => {
											void handleUpdateDocument();
										}}>
										{updatingDocument ? (
											<LoaderCircle className='animate-spin' />
										) : (
											<RefreshCw />
										)}
										{updatingDocument
											? copy.revornixUpdatingLinkedDocument
											: copy.revornixCreateLinkedDocumentUpdate}
									</Button>
								</div>
							</div>

							<div className='rounded-[20px] border border-white/8 bg-black/20 p-3 text-xs text-white/58'>
								{configured
									? statusText || copy.revornixPanelReady
									: copy.revornixPanelConfigRequired}
							</div>
						</TabsContent>

						<TabsContent
							value='info'
							className='mt-0 h-full space-y-4 overflow-y-auto pr-1'>
							{matchedDocument ? (
								<div className='rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
									<div className='space-y-3'>
										<div className='space-y-1.5'>
											<div className='text-[11px] text-white/45'>
												{copy.revornixPanelUrl}
											</div>
											<Input
												value={matchedDocument.website_info?.url || ''}
												readOnly
												className='border-white/8 bg-white/[0.04] text-white'
											/>
										</div>
										<div className='space-y-1.5'>
											<div className='text-[11px] text-white/45'>
												{copy.revornixPanelDocTitle}
											</div>
											<Input
												value={matchedDocument.title || ''}
												readOnly
												className='border-white/8 bg-white/[0.04] text-white'
											/>
										</div>
										<div className='space-y-1.5'>
											<div className='text-[11px] text-white/45'>
												{copy.revornixPanelDocDescription}
											</div>
											<Textarea
												value={matchedDocument.description || ''}
												readOnly
												className='min-h-24 border-white/8 bg-white/[0.04] text-white'
											/>
										</div>
									</div>
								</div>
							) : null}

							<div className='rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
								<div className='mb-3 flex items-center gap-2'>
									<div className='rounded-full border border-sky-400/15 bg-sky-400/10 p-2'>
										<GitBranchPlus className='size-4 text-sky-200' />
									</div>
									<div>
										<div className='text-sm font-semibold text-white'>
											{copy.revornixGraphTitle}
										</div>
										<div className='text-xs text-white/52'>
											{copy.revornixGraphDesc}
										</div>
									</div>
								</div>
								{renderGraphSection()}
							</div>

							<div className='rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
								<div className='mb-3 flex items-center gap-2'>
									<div className='rounded-full border border-amber-400/15 bg-amber-400/10 p-2'>
										<AudioLines className='size-4 text-amber-200' />
									</div>
									<div>
										<div className='text-sm font-semibold text-white'>
											{copy.revornixPodcastTitle}
										</div>
										<div className='text-xs text-white/52'>
											{copy.revornixPodcastDesc}
										</div>
									</div>
								</div>
								{renderPodcastSection()}
							</div>

							<div className='rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
								<div className='mb-3 flex items-center gap-2'>
									<div className='rounded-full border border-violet-400/15 bg-violet-400/10 p-2'>
										<StickyNote className='size-4 text-violet-200' />
									</div>
									<div>
										<div className='text-sm font-semibold text-white'>
											{copy.revornixNoteTitle}
										</div>
										<div className='text-xs text-white/52'>
											{copy.revornixNoteDesc}
										</div>
									</div>
								</div>
								{matchedDocument ? (
									<div className='mb-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/62'>
										{copy.revornixMatchedCurrentDocument}:{' '}
										{matchedDocument.title}
									</div>
								) : null}
								<Textarea
									value={comment}
									onChange={(event) => {
										setComment(event.target.value);
									}}
									placeholder={copy.revornixNotePlaceholder}
									className='min-h-32 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
								/>
								<Button
									type='button'
									variant='secondary'
									className='mt-3 h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
									onClick={() => {
										void handleSaveComment();
									}}
									disabled={savingComment || !matchedDocument}>
									{savingComment ? (
										<LoaderCircle className='animate-spin' />
									) : (
										<StickyNote />
									)}
									{savingComment
										? copy.revornixSavingNote
										: copy.revornixSaveNote}
								</Button>
								<div className='mt-3 space-y-2'>
									<div className='text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45'>
										{copy.revornixRecentNotes}
									</div>
									{recentNotes.length === 0 ? (
										<div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/52'>
											{matchedDocument
												? copy.revornixNoteDesc
												: copy.revornixNoteDocumentRequired}
										</div>
									) : (
										<div className='space-y-2'>
											{recentNotes.map((note) => (
												<div
													key={note.id}
													className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2'>
													<div className='text-sm text-white/90'>
														{note.content}
													</div>
													<div className='mt-1 text-[11px] text-white/45'>
														{new Date(note.create_time).toLocaleString(
															uiLanguage === 'en' ? 'en-US' : 'zh-CN',
															{
																year: 'numeric',
																month: '2-digit',
																day: '2-digit',
																hour: '2-digit',
																minute: '2-digit',
																hour12: false,
															},
														)}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							</div>

							<div className='rounded-[20px] border border-white/8 bg-black/20 p-3 text-xs text-white/58'>
								{configured
									? statusText || copy.revornixPanelReady
									: copy.revornixPanelConfigRequired}
							</div>
						</TabsContent>

						<TabsContent
							value='ai'
							className='mt-0 flex h-full min-h-0 flex-col gap-4 overflow-hidden'>
							<div className='shrink-0 rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
								<div className='mb-3 flex items-center gap-2'>
									<div className='rounded-full border border-cyan-400/15 bg-cyan-400/10 p-2'>
										<Bot className='size-4 text-cyan-200' />
									</div>
									<div>
										<div className='text-sm font-semibold text-white'>
											{copy.revornixAiTitle}
										</div>
										<div className='text-xs text-white/52'>
											{copy.revornixAiDesc}
										</div>
									</div>
								</div>
								{!matchedDocument ? (
									<div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/55'>
										{copy.revornixAiUnavailable}
									</div>
								) : !aiChatEnabled ? (
									<div className='rounded-xl border border-amber-400/15 bg-amber-400/10 px-3 py-3 text-sm text-amber-100'>
										<div className='font-medium'>
											{copy.revornixAiProcessingRequired}
										</div>
										<div className='mt-1 text-xs text-amber-100/80'>
											{matchedDocument.process_task?.status ===
											DOCUMENT_PROCESS_STATUS.FAILED
												? copy.revornixActionFailed
												: copy.revornixAiDesc}
										</div>
									</div>
								) : (
									<div className='rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100'>
										{copy.revornixAiReady}
									</div>
								)}
							</div>

							<div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
								<div
									ref={aiScrollContainerRef}
									className='min-h-0 flex-1 overflow-y-auto px-3.5 pb-4 pt-3.5'>
									{aiMessages.length === 0 ? (
										<div className='flex min-h-full items-center justify-center'>
											<div className='w-full max-w-lg rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-white/58'>
												{copy.revornixAiEmpty}
											</div>
										</div>
									) : (
										<div className='mx-auto flex w-full max-w-2xl flex-col gap-3'>
											{aiMessages.map((message) => (
												<div
													key={message.chat_id}
													className={`rounded-2xl border px-3 py-3 ${
														message.role === 'user'
															? 'ml-8 border-sky-400/15 bg-sky-400/10'
															: 'mr-8 border-white/8 bg-black/20'
													}`}>
													<div className='mb-2 flex items-center justify-between gap-3'>
														<div className='flex min-w-0 items-center gap-3'>
															<div className='text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45'>
																{message.role === 'user'
																	? copy.revornixAiYou
																	: copy.revornixAiAssistant}
															</div>
															{message.role === 'assistant' && message.label ? (
																<div
																	className={`truncate text-[11px] ${
																		message.phase === 'error'
																			? 'text-rose-200'
																			: 'text-white/45'
																	}`}>
																	{message.label}
																</div>
															) : null}
														</div>
														<Button
															type='button'
															size='sm'
															variant='ghost'
															className='h-7 rounded-full border border-white/8 bg-white/[0.03] px-2.5 text-white/70 hover:bg-white/[0.06] hover:text-white'
															disabled={!message.content.trim()}
															onClick={() => {
																void handleCopyAiMessage(message);
															}}>
															<Copy className='size-3.5' />
															{copiedAiMessageId === message.chat_id
																? copy.revornixAiCopied
																: copy.revornixAiCopy}
														</Button>
													</div>
													{message.role === 'assistant' ? (
														<Markdown
															content={
																message.content ||
																(message.phase === 'thinking'
																	? copy.revornixAiThinking
																	: '')
															}
														/>
													) : (
														<div className='text-sm leading-6 whitespace-pre-wrap text-white/88'>
															{message.content}
														</div>
													)}
												</div>
											))}
											<div ref={aiMessageEndRef} />
										</div>
									)}
								</div>

								<div className='shrink-0 border-t border-white/8 bg-black/10 px-3.5 pb-3.5 pt-3'>
									<Textarea
										value={aiInput}
										onChange={(event) => {
											setAiInput(event.target.value);
										}}
										placeholder={copy.revornixAiPlaceholder}
										disabled={!aiChatEnabled || sendingAiMessage}
										className='min-h-24 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35'
										onKeyDown={(event) => {
											if (
												(event.metaKey || event.ctrlKey) &&
												event.key === 'Enter'
											) {
												event.preventDefault();
												void handleAskDocumentAi();
											}
										}}
									/>
									<div className='mt-3 flex items-center justify-between gap-3'>
										<div className='text-[11px] text-white/45'>
											{matchedDocument?.title || copy.revornixAiUnavailable}
										</div>
										<Button
											type='button'
											className='rounded-xl bg-white text-black hover:bg-white/90'
											disabled={
												!aiChatEnabled || !aiInput.trim() || sendingAiMessage
											}
											onClick={() => {
												void handleAskDocumentAi();
											}}>
											{sendingAiMessage ? (
												<LoaderCircle className='animate-spin' />
											) : (
												<Send className='size-4' />
											)}
											{copy.revornixAiAsk}
										</Button>
									</div>
								</div>
							</div>
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	);
}
