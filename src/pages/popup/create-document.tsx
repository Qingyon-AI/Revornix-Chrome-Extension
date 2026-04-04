import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	ArrowUpRight,
	Globe,
	Loader2,
	RefreshCw,
	ScanText,
	Settings2,
	Sparkles,
	Tags,
	Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import MultipleSelector, { type Option } from '@/components/ui/multiple-selector';
import { useAppProvider } from '@/provider/app-provider';
import {
	createWebsiteDocument,
	listDocumentLabels,
	listMineSections,
} from '@/lib/revornix-api';

const formSchema = z.object({
	url: z.url(),
	title: z.string().optional(),
	description: z.string().optional(),
	labels: z.array(z.number()),
	cover: z.string().optional(),
	sections: z.array(z.number()),
	auto_summary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

type PageData = {
	url: string;
	title: string;
	description: string;
	cover: string;
};

const EMPTY_PAGE_DATA: PageData = {
	url: '',
	title: '',
	description: '',
	cover: '',
};

function mapToOptions(items: Array<{ id: number; name?: string; title?: string }>) {
	return items.map((item) => ({
		label: item.name || item.title || String(item.id),
		value: item.id,
	}));
}

const CreateDocument = () => {
	const { baseUrl, apiKey } = useAppProvider();
	const [pageData, setPageData] = useState<PageData>(EMPTY_PAGE_DATA);
	const [loadingPageData, setLoadingPageData] = useState(true);
	const [translatingPage, setTranslatingPage] = useState(false);
	const [restoringPage, setRestoringPage] = useState(false);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			url: '',
			title: '',
			description: '',
			cover: '',
			labels: [],
			sections: [],
			auto_summary: true,
		},
	});

	const { data: labels, isLoading: loadingLabels } = useQuery({
		queryKey: ['popup-document-labels'],
		queryFn: () => listDocumentLabels(baseUrl, apiKey),
		enabled: Boolean(baseUrl && apiKey),
	});

	const { data: sections, isLoading: loadingSections } = useQuery({
		queryKey: ['popup-document-sections'],
		queryFn: () => listMineSections(baseUrl, apiKey),
		enabled: Boolean(baseUrl && apiKey),
	});

	const labelOptions = useMemo(
		() => mapToOptions(labels || []),
		[labels]
	);
	const sectionOptions = useMemo(
		() => mapToOptions(sections || []),
		[sections]
	);

	const getOptionByValue = (options: Option[], value: number) =>
		options.find((option) => option.value === value);

	const handleGetPageData = async () => {
		setLoadingPageData(true);
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (!tab?.id) {
				throw new Error('No active tab found.');
			}

			const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' });
			if (!response) {
				throw new Error('Unable to read current page data.');
			}

			const nextPageData = {
				url: tab.url || '',
				title: response.title || '',
				description: response.description || '',
				cover: response.cover || '',
			};
			setPageData(nextPageData);
			form.reset({
				...form.getValues(),
				url: nextPageData.url,
				title: nextPageData.title,
				description: nextPageData.description,
				cover: nextPageData.cover,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to load current page.';
			toast.error(message);
		} finally {
			setLoadingPageData(false);
		}
	};

	const sendMessageToActiveTab = async (
		type: 'TRANSLATE_PAGE' | 'RESTORE_PAGE_TRANSLATION'
	) => {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab?.id) {
			throw new Error('No active tab found.');
		}

		const response = await chrome.tabs.sendMessage(tab.id, { type });
		if (!response?.success) {
			throw new Error(response?.error || 'Unable to communicate with page.');
		}

		return response;
	};

	const createDocumentMutation = useMutation({
		mutationFn: async (data: FormValues) => {
			await createWebsiteDocument(baseUrl, apiKey, {
				url: data.url,
				title: data.title,
				description: data.description,
				cover: data.cover,
				labels: data.labels,
				sections: data.sections,
				auto_summary: data.auto_summary,
			});
		},
		onSuccess: () => {
			toast.success('Document created successfully');
			window.close();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : 'Error creating document'
			);
		},
	});

	const handleSubmit = async (data: FormValues) => {
		createDocumentMutation.mutate(data);
	};

	useEffect(() => {
		void handleGetPageData();
	}, []);

	const configMissing = !baseUrl || !apiKey;
	const selectedLabels = form.watch('labels');
	const selectedSections = form.watch('sections');
	const autoSummaryEnabled = form.watch('auto_summary');

	return (
		<div className='min-w-[420px] p-4'>
			<div className='mx-auto flex max-w-[440px] flex-col gap-4'>
				<div className='rounded-[28px] border bg-card/85 p-5 shadow-[0_18px_48px_rgba(68,92,136,0.14)] backdrop-blur-xl'>
					<div className='flex items-start justify-between gap-4'>
						<div className='space-y-1'>
							<div className='inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground'>
								<Sparkles className='size-3.5' />
								Popup Workspace
							</div>
							<h1 className='text-2xl font-semibold tracking-tight'>
								Revornix Popup
							</h1>
							<p className='text-sm text-muted-foreground'>
								整理当前页面信息，快速创建文档，并直接触发网页翻译。
							</p>
						</div>
						<Button
							type='button'
							variant='outline'
							size='icon'
							className='rounded-full'
							onClick={() => {
								void chrome.runtime.openOptionsPage();
							}}>
							<Settings2 />
						</Button>
					</div>
				</div>

				<div className='grid gap-4'>
					<div className='rounded-[24px] border bg-card/85 p-4 shadow-sm backdrop-blur-sm'>
						<div className='mb-3 flex items-center justify-between gap-3'>
							<div>
								<div className='text-sm font-semibold'>Current Page</div>
								<div className='text-xs text-muted-foreground'>
									自动提取当前标签页信息，可随时刷新。
								</div>
							</div>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={() => {
									void handleGetPageData();
								}}
								disabled={loadingPageData}>
								<RefreshCw className={loadingPageData ? 'animate-spin' : ''} />
								Refresh
							</Button>
						</div>

						<div className='grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]'>
							<div className='overflow-hidden rounded-2xl border bg-muted/40'>
								{loadingPageData ? (
									<Skeleton className='h-[120px] w-full rounded-none' />
								) : pageData.cover ? (
									<img
										src={pageData.cover}
										alt='page cover'
										className='h-[120px] w-full object-cover'
									/>
								) : (
									<div className='flex h-[120px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(105,155,255,0.15),transparent_52%),linear-gradient(180deg,rgba(148,163,184,0.12),rgba(148,163,184,0.04))] text-muted-foreground'>
										<Globe className='size-6' />
									</div>
								)}
							</div>
							<div className='space-y-2 rounded-2xl border bg-background/65 p-3'>
								<div className='line-clamp-2 text-sm font-medium'>
									{loadingPageData ? 'Loading page title...' : pageData.title || 'No title detected'}
								</div>
								<div className='flex items-start gap-2 text-xs text-muted-foreground'>
									<ArrowUpRight className='mt-0.5 size-3.5 shrink-0' />
									<div className='line-clamp-2 break-all'>
										{loadingPageData ? 'Loading url...' : pageData.url || 'No url detected'}
									</div>
								</div>
								<div className='line-clamp-3 text-xs leading-5 text-muted-foreground'>
									{loadingPageData
										? 'Loading description...'
										: pageData.description || 'No description detected from this page yet.'}
								</div>
							</div>
						</div>
					</div>

					{configMissing ? (
						<div className='rounded-[24px] border border-amber-300/30 bg-amber-50/80 p-4 text-amber-950 shadow-sm dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-100'>
							<div className='text-sm font-semibold'>Configuration Required</div>
							<div className='mt-1 text-xs leading-5 opacity-90'>
								请先在设置页填写 Revornix Base Url 和 Api Key，之后才能创建文档或同步标签与分区。
							</div>
						</div>
					) : null}

					<div className='rounded-[24px] border bg-card/88 p-4 shadow-sm backdrop-blur-sm'>
						<div className='mb-4 flex items-start justify-between gap-3'>
							<div>
								<div className='text-sm font-semibold'>Website Translation</div>
								<div className='text-xs text-muted-foreground'>
									直接翻译当前页面，或恢复原文。
								</div>
							</div>
							<div className='rounded-full border bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground'>
								Quick Action
							</div>
						</div>

						<div className='grid grid-cols-2 gap-3'>
							<Button
								type='button'
								className='h-11 rounded-xl'
								disabled={translatingPage}
								onClick={async () => {
									try {
										setTranslatingPage(true);
										const response = await sendMessageToActiveTab('TRANSLATE_PAGE');
										toast.success(`Translated ${response.count ?? 0} text nodes`);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: 'Failed to translate current page'
										);
									} finally {
										setTranslatingPage(false);
									}
								}}>
								<ScanText />
								Translate Page
								{translatingPage ? <Loader2 className='animate-spin' /> : null}
							</Button>
							<Button
								type='button'
								variant='outline'
								className='h-11 rounded-xl'
								disabled={restoringPage}
								onClick={async () => {
									try {
										setRestoringPage(true);
										await sendMessageToActiveTab('RESTORE_PAGE_TRANSLATION');
										toast.success('Original page restored');
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: 'Failed to restore current page'
										);
									} finally {
										setRestoringPage(false);
									}
								}}>
								<Wand2 />
								Restore Original
								{restoringPage ? <Loader2 className='animate-spin' /> : null}
							</Button>
						</div>
					</div>

					<div className='rounded-[24px] border bg-card/88 p-4 shadow-sm backdrop-blur-sm'>
						<div className='mb-4'>
							<div className='text-sm font-semibold'>Create Linked Document</div>
							<div className='text-xs text-muted-foreground'>
								编辑页面信息，选择标签与分区，然后保存到 Revornix。
							</div>
						</div>

						<Form {...form}>
							<form
								id='add-form'
								onSubmit={form.handleSubmit(handleSubmit)}
								className='space-y-4'>
								<FormField
									name='cover'
									control={form.control}
									render={({ field }) => (
										<FormItem>
											<FormLabel>Cover</FormLabel>
											<FormControl>
												<div className='overflow-hidden rounded-2xl border bg-muted/30'>
													{field.value ? (
														<img
															src={field.value}
															alt='cover'
															className='h-36 w-full object-cover'
														/>
													) : (
														<div className='flex h-36 items-center justify-center text-sm text-muted-foreground'>
															No cover image detected
														</div>
													)}
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className='grid gap-4'>
									<FormField
										name='url'
										control={form.control}
										render={({ field }) => (
											<FormItem>
												<FormLabel>URL</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										name='title'
										control={form.control}
										render={({ field }) => (
											<FormItem>
												<FormLabel>Title</FormLabel>
												<FormControl>
													<Input {...field} value={field.value || ''} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										name='description'
										control={form.control}
										render={({ field }) => (
											<FormItem>
												<FormLabel>Description</FormLabel>
												<FormControl>
													<Textarea
														{...field}
														value={field.value || ''}
														className='min-h-28'
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								<div className='grid gap-4'>
									<FormField
										control={form.control}
										name='labels'
										render={({ field }) => (
											<FormItem>
												<FormLabel>Labels</FormLabel>
												<FormControl>
													{loadingLabels ? (
														<Skeleton className='h-10 w-full rounded-xl' />
													) : (
														<MultipleSelector
															defaultOptions={labelOptions}
															placeholder='Select labels'
															onChange={(value) => {
																field.onChange(value.map(({ value }) => Number(value)));
															}}
															value={(field.value || [])
																.map((id) => getOptionByValue(labelOptions, id))
																.filter(Boolean) as Option[]}
															emptyIndicator={
																<p className='py-3 text-center text-sm text-muted-foreground'>
																	No labels available
																</p>
															}
														/>
													)}
												</FormControl>
												<div className='text-xs text-muted-foreground'>
													已选 {selectedLabels.length} 个标签
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name='sections'
										render={({ field }) => (
											<FormItem>
												<FormLabel>Sections</FormLabel>
												<FormControl>
													{loadingSections ? (
														<Skeleton className='h-10 w-full rounded-xl' />
													) : (
														<MultipleSelector
															defaultOptions={sectionOptions}
															placeholder='Select sections'
															onChange={(value) => {
																field.onChange(value.map(({ value }) => Number(value)));
															}}
															value={(field.value || [])
																.map((id) => getOptionByValue(sectionOptions, id))
																.filter(Boolean) as Option[]}
															emptyIndicator={
																<p className='py-3 text-center text-sm text-muted-foreground'>
																	No sections available
																</p>
															}
														/>
													)}
												</FormControl>
												<div className='text-xs text-muted-foreground'>
													已选 {selectedSections.length} 个分区
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								<FormField
									control={form.control}
									name='auto_summary'
									render={({ field }) => (
										<FormItem className='rounded-2xl border bg-background/65 p-4'>
											<div className='flex items-center justify-between gap-3'>
												<div className='space-y-1'>
													<div className='flex items-center gap-2 text-sm font-medium'>
														<Tags className='size-4 text-muted-foreground' />
														Auto Summary
													</div>
													<div className='text-xs text-muted-foreground'>
														保存后自动生成摘要，适合快速沉淀网页内容。
													</div>
												</div>
												<FormControl>
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
												</FormControl>
											</div>
										</FormItem>
									)}
								/>
							</form>
						</Form>
					</div>
				</div>

				<div className='flex items-center justify-between rounded-[24px] border bg-card/88 px-4 py-3 shadow-sm backdrop-blur-sm'>
					<div className='text-xs text-muted-foreground'>
						{configMissing
							? '配置缺失时只能使用页面读取和翻译快捷操作。'
							: '保存后会将当前页面创建为 Revornix 网站文档。'}
					</div>
					<div className='flex items-center gap-2'>
						<Button
							type='button'
							variant='secondary'
							onClick={() => {
								window.close();
							}}>
							Cancel
						</Button>
						<Button
							type='submit'
							form='add-form'
							disabled={configMissing || createDocumentMutation.isPending}>
							Save Document
							{createDocumentMutation.isPending ? (
								<Loader2 className='animate-spin' />
							) : null}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CreateDocument;
