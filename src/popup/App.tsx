import ReactDOM from 'react-dom/client';
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
import './index.css';
import { useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';

export function App() {
	const formSchema = z.object({
		url: z.url(),
		title: z.string().optional(),
		description: z.string().optional(),
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

	const handleSubmit = async (data: z.infer<typeof formSchema>) => {
		console.log(data);
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

	useEffect(() => {
		handleGetPageData();
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
										className='w-20 h-20 rounded'
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
									<FormLabel>URL</FormLabel>
									<Textarea {...field} value={field.value || ''} />
									<FormMessage />
								</FormItem>
							);
						}}
					/>
				</form>
			</Form>
			<Button type='submit' form='add-form'>
				Save
			</Button>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
