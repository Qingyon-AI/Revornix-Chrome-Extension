import { useEffect, useMemo, useState } from 'react';
import {
	BadgePlus,
	Check,
	FolderPlus,
	LoaderCircle,
	PanelRightClose,
	RefreshCw,
	StickyNote,
	Waypoints,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
	createDocumentLabel,
	createQuickNoteDocument,
	createSection,
	createWebsiteDocument,
	getDocumentDetail,
	listDocumentLabels,
	listMineSections,
	searchMineDocuments,
	updateDocument,
	type RevornixDocumentLabel,
	type RevornixSectionInfo,
	type RevornixWebsiteDocumentDetail,
} from '@/lib/revornix-api';
import { getUiCopy } from '@/lib/ui-copy';
import { extractCoverImage, extractPageDescription } from '@/lib/utils';
import type { UiLanguage } from '@/lib/ui-preferences';

interface RevornixSidePanelProps {
	open: boolean;
	onClose: () => void;
	currentUrl: string;
	uiLanguage: UiLanguage;
}

interface PageDraft {
	url: string;
	title: string;
	description: string;
	cover: string;
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
				keywords.add(`${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, ''));
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
	targetUrl: string
) {
	const documentUrl = normalizeUrl(document.website_info?.url || '');
	const normalizedTargetUrl = normalizeUrl(targetUrl);
	return Boolean(documentUrl && normalizedTargetUrl && documentUrl === normalizedTargetUrl);
}

export function RevornixSidePanel({
	open,
	onClose,
	currentUrl,
	uiLanguage,
}: RevornixSidePanelProps) {
	const copy = getUiCopy(uiLanguage);
	const [baseUrl, setBaseUrl] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [draft, setDraft] = useState<PageDraft>(() => readDraftFromPage(currentUrl));
	const [comment, setComment] = useState('');
	const [availableLabels, setAvailableLabels] = useState<RevornixDocumentLabel[]>([]);
	const [availableSections, setAvailableSections] = useState<RevornixSectionInfo[]>([]);
	const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
	const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
	const [matchedDocument, setMatchedDocument] = useState<RevornixWebsiteDocumentDetail | null>(
		null
	);
	const [matchedDocuments, setMatchedDocuments] = useState<RevornixWebsiteDocumentDetail[]>([]);
	const [statusText, setStatusText] = useState('');
	const [loadingMetadata, setLoadingMetadata] = useState(false);
	const [creatingDocument, setCreatingDocument] = useState(false);
	const [updatingDocument, setUpdatingDocument] = useState(false);
	const [savingComment, setSavingComment] = useState(false);
	const [creatingLabel, setCreatingLabel] = useState(false);
	const [creatingSection, setCreatingSection] = useState(false);
	const [newLabelName, setNewLabelName] = useState('');
	const [newSectionTitle, setNewSectionTitle] = useState('');
	const [newSectionDescription, setNewSectionDescription] = useState('');

	useEffect(() => {
		setDraft(readDraftFromPage(currentUrl));
	}, [currentUrl]);

	useEffect(() => {
		void chrome.storage.local.get(['baseUrl', 'apiKey']).then((storage) => {
			setBaseUrl((storage.baseUrl as string) || '');
			setApiKey((storage.apiKey as string) || '');
		});

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string
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

	const configured = useMemo(() => Boolean(baseUrl && apiKey), [baseUrl, apiKey]);

	const loadPanelMetadata = async (nextUrl = currentUrl) => {
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
			const searchKeywords = buildSearchKeywords(nextUrl, draft.title);
			const [labels, sections, ...searchResults] = await Promise.all([
				listDocumentLabels(baseUrl, apiKey),
				listMineSections(baseUrl, apiKey),
				...searchKeywords.map((keyword) =>
					searchMineDocuments(baseUrl, apiKey, {
						keyword,
						limit: 6,
						desc: true,
					})
				),
			]);

			setAvailableLabels(labels);
			setAvailableSections(sections);

			const dedupedSearchItems = Array.from(
				new Map(
					searchResults
						.flatMap((result) => result.elements || [])
						.map((item) => [item.id, item])
				).values()
			).slice(0, 8);

			const detailResults = await Promise.all(
				dedupedSearchItems.map((item) =>
					getDocumentDetail(baseUrl, apiKey, item.id).catch(() => null)
				)
			);
			const websiteDocuments = detailResults.filter(
				(document): document is RevornixWebsiteDocumentDetail =>
					Boolean(document?.website_info?.url)
			);
			setMatchedDocuments(websiteDocuments);

			const exactMatch =
				websiteDocuments.find((document) => isExactWebsiteDocumentMatch(document, nextUrl)) ||
				null;
			setMatchedDocument(exactMatch);
			if (exactMatch) {
				setSelectedLabelIds(exactMatch.labels?.map((label) => label.id) || []);
				setSelectedSectionIds(exactMatch.sections?.map((section) => section.id) || []);
				setStatusText(copy.revornixMatchedCurrentDocument);
			} else {
				setSelectedLabelIds([]);
				setSelectedSectionIds([]);
				setStatusText(copy.revornixNoMatchedDocuments);
			}
		} catch (error) {
			setAvailableLabels([]);
			setAvailableSections([]);
			setMatchedDocuments([]);
			setMatchedDocument(null);
			setStatusText(error instanceof Error ? error.message : copy.revornixActionFailed);
		} finally {
			setLoadingMetadata(false);
		}
	};

	useEffect(() => {
		if (!open) {
			return;
		}

		void loadPanelMetadata();
	}, [open, configured, baseUrl, apiKey, currentUrl, draft.title, copy.revornixActionFailed, copy.revornixMatchedCurrentDocument, copy.revornixNoMatchedDocuments, copy.revornixPanelConfigRequired]);

	const refreshDraft = () => {
		const nextDraft = readDraftFromPage(window.location.href);
		setDraft(nextDraft);
		void loadPanelMetadata(nextDraft.url);
	};

	const toggleId = (
		currentIds: number[],
		id: number,
		setter: (nextValue: number[]) => void
	) => {
		setter(
			currentIds.includes(id)
				? currentIds.filter((currentId) => currentId !== id)
				: [...currentIds, id]
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
			setStatusText(error instanceof Error ? error.message : copy.revornixActionFailed);
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
			setStatusText(error instanceof Error ? error.message : copy.revornixActionFailed);
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
			setStatusText(copy.revornixCommentEmpty);
			return;
		}

		try {
			setSavingComment(true);
			setStatusText('');
			await createQuickNoteDocument(baseUrl, apiKey, {
				title: `${copy.revornixCommentDocumentPrefix}${draft.title || draft.url}`,
				description: draft.url,
				content: `${copy.revornixSourceLabel}${draft.url}\n\n${comment.trim()}`,
				labels: selectedLabelIds,
				sections: selectedSectionIds,
				auto_summary: false,
			});
			setComment('');
			setStatusText(copy.revornixCommentSaved);
		} catch (error) {
			setStatusText(error instanceof Error ? error.message : copy.revornixActionFailed);
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
			const created = await createDocumentLabel(baseUrl, apiKey, newLabelName.trim());
			const nextLabels = await listDocumentLabels(baseUrl, apiKey);
			setAvailableLabels(nextLabels);
			if (created.id) {
				setSelectedLabelIds((previous) =>
					previous.includes(created.id) ? previous : [...previous, created.id]
				);
			}
			setNewLabelName('');
			setStatusText(copy.revornixCreatedLabel);
		} catch (error) {
			setStatusText(error instanceof Error ? error.message : copy.revornixActionFailed);
		} finally {
			setCreatingLabel(false);
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
					previous.includes(created.id) ? previous : [...previous, created.id]
				);
			}
			setNewSectionTitle('');
			setNewSectionDescription('');
			setStatusText(copy.revornixCreatedSection);
		} catch (error) {
			setStatusText(error instanceof Error ? error.message : copy.revornixActionFailed);
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
				matchedDocument.labels?.map((label) => label.id) || []
			) ||
			!arraysEqual(
				selectedSectionIds,
				matchedDocument.sections?.map((section) => section.id) || []
			)
		);
	}, [draft, matchedDocument, selectedLabelIds, selectedSectionIds]);

	const hasExactMatch = useMemo(
		() => matchedDocuments.some((document) => isExactWebsiteDocumentMatch(document, draft.url)),
		[matchedDocuments, draft.url]
	);

	return (
		<div
			data-revornix-side-panel="true"
			data-state={open ? 'open' : 'closed'}
			className={`fixed inset-y-3 right-3 z-[2147483645] overflow-hidden rounded-[28px] border border-white/10 bg-[#0f1115]/98 text-white shadow-[-18px_0_48px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-[transform,opacity] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4 ${
				open ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-x-full opacity-0'
			}`}>
			<div className="flex h-full w-[392px] flex-col">
				<div className="border-b border-white/8 bg-white/[0.03] p-4 pb-3">
					<div className="mb-3 flex items-start justify-between gap-3">
						<div>
							<div className="text-base font-semibold tracking-tight">{copy.revornixPanelTitle}</div>
							<div className="mt-1 text-xs text-white/55">{copy.revornixPanelSubtitle}</div>
						</div>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
							onClick={onClose}>
							<PanelRightClose />
						</Button>
					</div>
					<div className="flex items-center gap-2">
						<div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-200">
							Revornix
						</div>
						<div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/60">
							Workspace
						</div>
					</div>
				</div>
				<div className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_25%)] p-4">
					<div className="rounded-[22px] border border-white/8 bg-white/[0.035] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
						<div className="mb-2 flex items-center justify-between gap-2">
							<div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
								{copy.revornixCurrentPage}
							</div>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 rounded-full px-2.5 text-white/70 hover:bg-white/8 hover:text-white"
								onClick={refreshDraft}>
								<RefreshCw />
								{copy.revornixRefreshPageData}
							</Button>
						</div>
						<div className="space-y-3">
							<div className="space-y-1.5">
								<div className="text-[11px] text-white/45">{copy.revornixPanelUrl}</div>
								<Input
									value={draft.url}
									readOnly
									className="border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
								/>
							</div>
							<div className="space-y-1.5">
								<div className="text-[11px] text-white/45">{copy.revornixPanelDocTitle}</div>
								<Input
									value={draft.title}
									onChange={(event) => {
										setDraft((prev) => ({ ...prev, title: event.target.value }));
									}}
									className="border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
								/>
							</div>
							<div className="space-y-1.5">
								<div className="text-[11px] text-white/45">
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
									className="min-h-24 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
								/>
							</div>
						</div>
					</div>

					<div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
						<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
							{copy.revornixExistingDocuments}
						</div>
						<div className="mb-3 text-xs text-white/52">
							{copy.revornixExistingDocumentsDesc}
						</div>
						{loadingMetadata ? (
							<div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
								<LoaderCircle className="size-4 animate-spin" />
								{copy.refreshing}
							</div>
						) : matchedDocuments.length === 0 ? (
							<div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/55">
								{copy.revornixNoMatchedDocuments}
							</div>
						) : (
							<div className="space-y-2">
								{matchedDocuments.map((document) => {
									const active = matchedDocument?.id === document.id;
									const exact = isExactWebsiteDocumentMatch(document, draft.url);
									return (
										<button
											key={document.id}
											type="button"
											className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
												active
													? 'border-emerald-400/25 bg-emerald-400/10'
													: 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'
											}`}
											onClick={() => {
												setMatchedDocument(document);
												setSelectedLabelIds(document.labels?.map((label) => label.id) || []);
												setSelectedSectionIds(
													document.sections?.map((section) => section.id) || []
												);
											}}>
											<div className="flex items-center justify-between gap-2">
												<div className="flex min-w-0 items-center gap-2">
													<div className="truncate text-sm font-medium text-white">
														{document.title}
													</div>
													{exact ? (
														<span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
															{copy.revornixMatchedCurrentDocument}
														</span>
													) : null}
												</div>
												{active ? <Check className="size-4 shrink-0 text-emerald-200" /> : null}
											</div>
											<div className="mt-1 text-xs text-white/52">
												{document.website_info?.url || document.description || ''}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>

					<div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
						<div className="mb-3 flex items-center gap-2">
							<div className="rounded-full border border-sky-400/15 bg-sky-400/10 p-2">
								<Waypoints className="size-4 text-sky-200" />
							</div>
							<div>
								<div className="text-sm font-semibold text-white">{copy.revornixLinkedDocument}</div>
								<div className="text-xs text-white/52">
									{copy.revornixLinkedDocumentDesc}
								</div>
							</div>
						</div>

						<div className="space-y-3">
							<div className="space-y-2">
								<div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
									{copy.revornixLabels}
								</div>
								<div className="flex flex-wrap gap-2">
									{availableLabels.map((label) => {
										const active = selectedLabelIds.includes(label.id);
										return (
											<button
												key={label.id}
												type="button"
												className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
													active
														? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
														: 'border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
												}`}
												onClick={() => {
													toggleId(selectedLabelIds, label.id, setSelectedLabelIds);
												}}>
												{label.name}
											</button>
										);
									})}
								</div>
								<div className="flex gap-2">
									<Input
										value={newLabelName}
										onChange={(event) => setNewLabelName(event.target.value)}
										placeholder={copy.revornixLabelPlaceholder}
										className="border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
									/>
									<Button
										type="button"
										variant="secondary"
										className="shrink-0 border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]"
										disabled={creatingLabel}
										onClick={() => {
											void handleCreateLabel();
										}}>
										{creatingLabel ? (
											<LoaderCircle className="animate-spin" />
										) : (
											<BadgePlus />
										)}
										{copy.revornixCreateLabel}
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
									{copy.revornixSections}
								</div>
								<div className="flex flex-wrap gap-2">
									{availableSections.map((section) => {
										const active = selectedSectionIds.includes(section.id);
										return (
											<button
												key={section.id}
												type="button"
												className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
													active
														? 'border-sky-400/20 bg-sky-400/10 text-sky-100'
														: 'border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
												}`}
												onClick={() => {
													toggleId(selectedSectionIds, section.id, setSelectedSectionIds);
												}}>
												{section.title}
											</button>
										);
									})}
								</div>
								<div className="space-y-2">
									<Input
										value={newSectionTitle}
										onChange={(event) => setNewSectionTitle(event.target.value)}
										placeholder={copy.revornixSectionTitlePlaceholder}
										className="border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
									/>
									<Textarea
										value={newSectionDescription}
										onChange={(event) => setNewSectionDescription(event.target.value)}
										placeholder={copy.revornixSectionDescPlaceholder}
										className="min-h-20 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
									/>
									<Button
										type="button"
										variant="secondary"
										className="w-full border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]"
										disabled={creatingSection}
										onClick={() => {
											void handleCreateSection();
										}}>
										{creatingSection ? (
											<LoaderCircle className="animate-spin" />
										) : (
											<FolderPlus />
										)}
										{copy.revornixCreateSection}
									</Button>
								</div>
							</div>
						</div>

						<div className="mt-3 grid grid-cols-1 gap-2">
							<Button
								type="button"
								className="h-10 w-full rounded-xl bg-white text-black hover:bg-white/90"
								onClick={() => {
									void handleCreateDocument();
								}}
								disabled={creatingDocument || hasExactMatch}>
								{creatingDocument ? (
									<LoaderCircle className="animate-spin" />
								) : (
									<Waypoints />
								)}
								{creatingDocument
									? copy.revornixCreatingLinkedDocument
									: copy.revornixCreateLinkedDocument}
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]"
								disabled={!matchedDocument || !hasMetadataChanges || updatingDocument}
								onClick={() => {
									void handleUpdateDocument();
								}}>
								{updatingDocument ? (
									<LoaderCircle className="animate-spin" />
								) : (
									<RefreshCw />
								)}
								{updatingDocument
									? copy.revornixUpdatingLinkedDocument
									: copy.revornixCreateLinkedDocumentUpdate}
							</Button>
						</div>
					</div>

					<div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
						<div className="mb-3 flex items-center gap-2">
							<div className="rounded-full border border-violet-400/15 bg-violet-400/10 p-2">
								<StickyNote className="size-4 text-violet-200" />
							</div>
							<div>
								<div className="text-sm font-semibold text-white">{copy.revornixCommentTitle}</div>
								<div className="text-xs text-white/52">{copy.revornixCommentDesc}</div>
							</div>
						</div>
						<Textarea
							value={comment}
							onChange={(event) => {
								setComment(event.target.value);
							}}
							placeholder={copy.revornixCommentPlaceholder}
							className="min-h-32 border-white/8 bg-white/[0.04] text-white placeholder:text-white/35"
						/>
						<Button
							type="button"
							variant="secondary"
							className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]"
							onClick={() => {
								void handleSaveComment();
							}}
							disabled={savingComment}>
							{savingComment ? (
								<LoaderCircle className="animate-spin" />
							) : (
								<StickyNote />
							)}
							{savingComment ? copy.revornixSavingComment : copy.revornixSaveComment}
						</Button>
					</div>

					<div className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-xs text-white/58">
						{configured ? statusText || copy.revornixPanelReady : copy.revornixPanelConfigRequired}
					</div>
				</div>
			</div>
		</div>
	);
}
