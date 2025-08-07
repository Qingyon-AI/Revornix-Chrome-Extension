import z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Loader2 } from 'lucide-react';
import { useAppProvider } from '@/provider/app-provider';

const ConfigForm = () => {
	const [submitting, setSubmitting] = useState(false);
	const { setBaseUrl, setApiKey, baseUrl, apiKey } = useAppProvider();

	const formSchema = z.object({
		baseUrl: z.url(),
		apiKey: z.string(),
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			baseUrl: baseUrl,
			apiKey: apiKey,
		},
	});

	const handleSubmit = async (data: z.infer<typeof formSchema>) => {
		setSubmitting(true);
		chrome.storage.local.set(data, () => {
			setBaseUrl(data.baseUrl);
			setApiKey(data.apiKey);
			setSubmitting(false);
			toast.success('Save Successfully');
		});
	};

	useEffect(() => {
		form.reset({ baseUrl, apiKey });
	}, [baseUrl, apiKey]);

	return (
		<div className='p-5'>
			<div className='max-w-3xl mx-auto'>
				<img
					src='/logo.png'
					alt='cover'
					className='w-full object-cover mb-5 rounded dark:hidden'
				/>
				<img
					src='/logo-dark.png'
					alt='cover'
					className='w-full object-cover mb-5 rounded hidden dark:block'
				/>
				<Alert className='mb-5 bg-transparent backdrop-blur-2xl'>
					<Info />
					<AlertTitle>Notes</AlertTitle>
					<AlertDescription>
						Make sure your Docker service is deployed before using this Chrome
						extension.
					</AlertDescription>
				</Alert>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className='space-y-5 mb-5'
						id='update-form'>
						<FormField
							name='baseUrl'
							control={form.control}
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Base Url</FormLabel>
										<Input {...field} />
										<FormMessage />
									</FormItem>
								);
							}}
						/>
						<FormField
							name='apiKey'
							control={form.control}
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Api Key</FormLabel>
										<Input {...field} />
										<FormMessage />
									</FormItem>
								);
							}}
						/>
					</form>
				</Form>
				<div className='flex justify-end gap-3'>
					<Button type='submit' form='update-form' disabled={submitting}>
						Save
						{submitting && <Loader2 className='ml-2 h-4 w-4 animate-spin' />}
					</Button>
				</div>
			</div>
		</div>
	);
};
export default ConfigForm;
