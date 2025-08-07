import { Button } from '@/components/ui/button';
import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Session } from 'revornix';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import MultipleSelector, { Option } from '@/components/ui/multiple-selector';
import { Skeleton } from '@/components/ui/skeleton';

const CreateDocument = () => {
	const [baseUrl, setBaseUrl] = useState('');
	const [apiKey, setApiKey] = useState('');

	const formSchema = z.object({
		url: z.url(),
		title: z.string().optional(),
		description: z.string().optional(),
		labels: z.array(z.number()),
		cover: z.string().optional(),
		sections: z.array(z.number()),
		auto_summary: z.boolean(),
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			url: '',
			sections: [],
			auto_summary: false,
		},
	});

	const { data: labels } = useQuery({
		queryKey: ['getDocumentLabels'],
		queryFn: () => {
			const session = new Session(baseUrl, apiKey);
			return session.getMineAllDocumentLabels();
		},
		enabled: !!baseUrl && !!apiKey,
	});

	const { data: sections } = useQuery({
		queryKey: ['getMineDocumentSections'],
		queryFn: () => {
			const session = new Session(baseUrl, apiKey);
			return session.getMineAllSection();
		},
		enabled: !!baseUrl && !!apiKey,
	});

	const getLabelByValue = (value: number): Option | undefined => {
		if (!labels) return;
		return labels.data.data
			.map((label) => {
				return { label: label.name, value: label.id };
			})
			.find((label) => label.value === value);
	};

	const getSectionByValue = (value: number): Option | undefined => {
		if (!sections) return;
		return sections.data.data
			.map((section) => {
				return { label: section.title, value: section.id };
			})
			.find((section) => section.value === value);
	};

	const handleGetPageData = async () => {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab.id) return;
		chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' }, (res) => {
			if (chrome.runtime.lastError) {
				console.warn(
					'无法连接 content-script：',
					chrome.runtime.lastError.message
				);
			} else {
				console.log('收到数据：', res);
				if (tab.url) {
					form.setValue('url', tab.url);
				}
				form.setValue('title', res.title);
				form.setValue('cover', res.cover);
				form.setValue('description', res.description);
			}
		});
	};

	const mutateCreateDocument = useMutation({
		mutationFn: async (data: z.infer<typeof formSchema>) => {
			const session = new Session(baseUrl, apiKey);
			await session.createWebsiteDocument({
				url: data.url,
				title: data.title,
				description: data.description,
				cover: data.cover,
				sections: data.sections,
				auto_summary: data.auto_summary,
			});
		},
		onSuccess() {
			toast.success('Document created successfully');
		},
		onError() {
			toast.error('Error creating document');
		},
	});

	const handleSubmit = async (data: z.infer<typeof formSchema>) => {
		console.log(data);
		mutateCreateDocument.mutate(data);
	};

	useEffect(() => {
		handleGetPageData();
		chrome.storage.local.get(['baseUrl', 'apiKey'], (result) => {
			setBaseUrl(result.baseUrl);
			setApiKey(result.apiKey);
		});
	}, []);

	return (
		<div className='p-5'>
			<h1 className='font-bold text-3xl whitespace-nowrap mb-5'>
				Revornix Chrome Extension
			</h1>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(handleSubmit)}
					className='space-y-5 mb-5'
					id='add-form'>
					<FormField
						name='cover'
						control={form.control}
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel>Cover</FormLabel>
									<img
										src={field.value}
										alt='cover'
										className='w-full h-32 rounded object-cover'
									/>
									<FormMessage />
								</FormItem>
							);
						}}
					/>
					<FormField
						name='url'
						control={form.control}
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel>URL</FormLabel>
									<Input {...field} />
									<FormMessage />
								</FormItem>
							);
						}}
					/>
					<FormField
						name='title'
						control={form.control}
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel>Title</FormLabel>
									<Input {...field} value={field.value || ''} />
									<FormMessage />
								</FormItem>
							);
						}}
					/>
					<FormField
						name='description'
						control={form.control}
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<Textarea {...field} value={field.value || ''} />
									<FormMessage />
								</FormItem>
							);
						}}
					/>
					{labels ? (
						<FormField
							control={form.control}
							name='labels'
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Label</FormLabel>
										<MultipleSelector
											defaultOptions={labels.data.data.map((label) => {
												return { label: label.name, value: label.id };
											})}
											onChange={(value) => {
												field.onChange(value.map(({ value }) => value));
											}}
											value={
												field.value &&
												field.value
													.map((id) => getLabelByValue(id))
													.filter((option) => !!option)
											}
											emptyIndicator={
												<p className='text-center text-sm leading-10 text-gray-600 dark:text-gray-400'>
													Empty for now
												</p>
											}
										/>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
					) : (
						<Skeleton className='h-10' />
					)}
					{sections ? (
						<FormField
							control={form.control}
							name='sections'
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Section</FormLabel>
										<MultipleSelector
											defaultOptions={sections.data.data.map((section) => {
												return { label: section.title, value: section.id };
											})}
											onChange={(value) => {
												field.onChange(value.map(({ value }) => value));
											}}
											value={
												field.value &&
												field.value
													.map((id) => getSectionByValue(id))
													.filter((option) => !!option)
											}
											emptyIndicator={
												<p className='text-center text-sm leading-10 text-gray-600 dark:text-gray-400'>
													Empty for now
												</p>
											}
										/>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
					) : (
						<Skeleton className='h-10' />
					)}
				</form>
			</Form>
			<div className='flex justify-end gap-3'>
				<Button
					variant={'secondary'}
					onClick={() => {
						window.close();
					}}>
					Cancel
				</Button>
				<Button
					type='submit'
					form='add-form'
					disabled={mutateCreateDocument.isPending}>
					Save
					{mutateCreateDocument.isPending && (
						<Loader2 className='h-4 w-4 animate-spin' />
					)}
				</Button>
			</div>
		</div>
	);
};

export default CreateDocument;
