import z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { getUiCopy } from '@/lib/ui-copy';
import { useAppProvider } from '@/provider/app-provider';
import {
	DEFAULT_FLOATING_BALL_ENABLED,
	DEFAULT_TRANSLATION_DISPLAY_MODE,
	DEFAULT_TRANSLATION_PROVIDER,
	DEFAULT_TARGET_LANGUAGE,
	TRANSLATION_PROVIDER_OPTIONS,
	type TranslationDisplayMode,
	type TranslationProvider,
} from '@/lib/translation';
import { Switch } from '@/components/ui/switch';

const TARGET_LANGUAGE_OPTIONS = ['简体中文', '繁體中文', 'English', '日本語', '한국어'];

const ConfigForm = () => {
	const [submitting, setSubmitting] = useState(false);
	const {
		setBaseUrl,
		setApiKey,
		baseUrl,
		apiKey,
		translationApiKey,
		translationProvider,
		translationBaseUrl,
		translationModel,
		translationTargetLanguage,
		translationDisplayMode,
		translationFloatingBallEnabled,
		setTranslationApiKey,
		setTranslationProvider,
		setTranslationBaseUrl,
		setTranslationModel,
		setTranslationTargetLanguage,
		setTranslationDisplayMode,
		setTranslationFloatingBallEnabled,
		uiLanguage,
	} = useAppProvider();
	const copy = getUiCopy(uiLanguage);

	const formSchema = z.object({
		baseUrl: z.url(),
		apiKey: z.string(),
		translationBaseUrl: z.union([z.literal(''), z.url()]),
		translationApiKey: z.string(),
		translationProvider: z.enum(TRANSLATION_PROVIDER_OPTIONS),
		translationModel: z.string(),
		translationTargetLanguage: z.string(),
		translationDisplayMode: z.enum(['translated-only', 'bilingual']),
		translationFloatingBallEnabled: z.boolean(),
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			baseUrl: baseUrl,
			apiKey: apiKey,
			translationBaseUrl: translationBaseUrl,
			translationApiKey: translationApiKey,
			translationProvider: translationProvider,
			translationModel: translationModel,
			translationTargetLanguage: translationTargetLanguage,
			translationDisplayMode: translationDisplayMode,
			translationFloatingBallEnabled: translationFloatingBallEnabled,
		},
	});
	const selectedTranslationProvider = form.watch('translationProvider');

	const handleSubmit = async (data: z.infer<typeof formSchema>) => {
		setSubmitting(true);
		chrome.storage.local.set(data, () => {
			setBaseUrl(data.baseUrl);
			setApiKey(data.apiKey);
			setTranslationBaseUrl(data.translationBaseUrl);
			setTranslationApiKey(data.translationApiKey);
			setTranslationProvider(data.translationProvider);
			setTranslationModel(data.translationModel);
			setTranslationTargetLanguage(data.translationTargetLanguage);
			setTranslationDisplayMode(data.translationDisplayMode);
			setTranslationFloatingBallEnabled(data.translationFloatingBallEnabled);
			setSubmitting(false);
			toast.success(copy.saveSuccess);
		});
	};

	useEffect(() => {
		form.reset({
			baseUrl,
			apiKey,
			translationBaseUrl,
			translationApiKey,
			translationProvider: translationProvider || DEFAULT_TRANSLATION_PROVIDER,
			translationModel,
			translationTargetLanguage:
				translationTargetLanguage || DEFAULT_TARGET_LANGUAGE,
			translationDisplayMode:
				translationDisplayMode || DEFAULT_TRANSLATION_DISPLAY_MODE,
			translationFloatingBallEnabled:
				translationFloatingBallEnabled ?? DEFAULT_FLOATING_BALL_ENABLED,
		});
	}, [
		apiKey,
		baseUrl,
		form,
		translationApiKey,
		translationBaseUrl,
		translationProvider,
		translationModel,
		translationDisplayMode,
		translationFloatingBallEnabled,
		translationTargetLanguage,
	]);

	return (
				<div className='w-full space-y-5'>
					<div className='rounded-2xl border bg-card p-5 shadow-sm'>
						<div className='flex items-start justify-between gap-4'>
							<div className='space-y-1'>
								<div className='text-sm font-medium text-muted-foreground'>
									{copy.coreConfiguration}
								</div>
								<h2 className='text-xl font-semibold'>{copy.extensionSettings}</h2>
								<p className='max-w-2xl text-sm text-muted-foreground'>
									{copy.extensionSettingsDesc}
								</p>
							</div>
							<div className='rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground'>
								Revornix
							</div>
						</div>
					</div>
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(handleSubmit)}
							className='space-y-5 mb-5'
							id='update-form'>
							<div className='rounded-2xl border bg-card p-5 shadow-sm space-y-5'>
								<div>
									<h2 className='text-lg font-semibold'>{copy.revornixApi}</h2>
									<p className='text-sm text-muted-foreground'>
										{copy.revornixApiDesc}
									</p>
								</div>
								<div className='grid gap-5 md:grid-cols-2'>
									<FormField
										name='baseUrl'
										control={form.control}
										render={({ field }) => {
											return (
												<FormItem>
													<FormLabel>{copy.baseUrl}</FormLabel>
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
													<FormLabel>{copy.apiKey}</FormLabel>
													<Input {...field} />
													<FormMessage />
												</FormItem>
											);
										}}
									/>
								</div>
							</div>
							<div className='rounded-2xl border bg-card p-5 shadow-sm space-y-5'>
							<div>
									<h2 className='text-lg font-semibold'>{copy.websiteTranslation}</h2>
									<p className='text-sm text-muted-foreground'>
										{copy.websiteTranslationDesc}
									</p>
								</div>
							<FormField
								name='translationProvider'
								control={form.control}
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{copy.translationProvider}</FormLabel>
											<FormControl>
												<Select
													value={field.value}
													onValueChange={(value) => {
														field.onChange(value as TranslationProvider);
													}}>
													<SelectTrigger className='w-full'>
														<SelectValue placeholder={copy.translationProvider} />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value='openai-compatible'>
															{copy.translationProviderOpenAI}
														</SelectItem>
														<SelectItem value='google-translate-free'>
															{copy.translationProviderGoogleFree}
														</SelectItem>
													</SelectContent>
												</Select>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							{selectedTranslationProvider === 'openai-compatible' ? (
								<>
									<FormField
										name='translationBaseUrl'
										control={form.control}
										render={({ field }) => {
											return (
												<FormItem>
													<FormLabel>{copy.translationBaseUrl}</FormLabel>
													<Input {...field} placeholder='https://api.openai.com/v1' />
													<FormMessage />
												</FormItem>
											);
										}}
									/>
									<FormField
										name='translationModel'
										control={form.control}
										render={({ field }) => {
											return (
												<FormItem>
													<FormLabel>{copy.translationModel}</FormLabel>
													<Input
														{...field}
														placeholder='gpt-4.1-mini'
													/>
													<FormMessage />
												</FormItem>
											);
										}}
									/>
									<FormField
										name='translationApiKey'
										control={form.control}
										render={({ field }) => {
											return (
												<FormItem>
													<FormLabel>{copy.translationApiKey}</FormLabel>
													<Input
														{...field}
														type='password'
														placeholder='sk-...'
													/>
													<FormMessage />
												</FormItem>
											);
										}}
									/>
								</>
							) : null}
							<FormField
								name='translationTargetLanguage'
								control={form.control}
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{copy.targetLanguage}</FormLabel>
											<FormControl>
												<Select
													value={field.value}
													onValueChange={field.onChange}>
													<SelectTrigger className='w-full'>
														<SelectValue placeholder={DEFAULT_TARGET_LANGUAGE} />
													</SelectTrigger>
													<SelectContent>
														{TARGET_LANGUAGE_OPTIONS.map((language) => (
															<SelectItem key={language} value={language}>
																{language}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								name='translationDisplayMode'
								control={form.control}
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{copy.defaultDisplayMode}</FormLabel>
											<FormControl>
												<Select
													value={field.value}
													onValueChange={(value) => {
														field.onChange(value as TranslationDisplayMode);
													}}>
													<SelectTrigger className='w-full'>
														<SelectValue placeholder={copy.defaultDisplayMode} />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value='translated-only'>
															{copy.translatedOnly}
														</SelectItem>
														<SelectItem value='bilingual'>
															{copy.bilingual}
														</SelectItem>
													</SelectContent>
												</Select>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								name='translationFloatingBallEnabled'
								control={form.control}
								render={({ field }) => {
									return (
										<FormItem className='flex items-center justify-between rounded-lg border p-3'>
											<div>
													<FormLabel>{copy.floatingButton}</FormLabel>
													<p className='text-sm text-muted-foreground'>
														{copy.floatingButtonDesc}
													</p>
											</div>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormItem>
									);
								}}
							/>
						</div>
					</form>
				</Form>
					<div className='flex justify-end gap-3'>
						<Button type='submit' form='update-form' disabled={submitting}>
							{copy.save}
						{submitting && <Loader2 className='ml-2 h-4 w-4 animate-spin' />}
						</Button>
					</div>
				</div>
	);
};
export default ConfigForm;
