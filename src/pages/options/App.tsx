import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ModeToggle } from '@/components/mode-toggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUiCopy } from '@/lib/ui-copy';
import { type UiLanguage } from '@/lib/ui-preferences';
import { useAppProvider } from '@/provider/app-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RootLayout from './layout';
import ConfigForm from './config-form';
import TranslationLogsPage from './translation-logs-page';

function OptionsShell() {
	const initialTab = useMemo(() => {
		const params = new URLSearchParams(window.location.search);
		return params.get('tab') === 'logs' ? 'logs' : 'settings';
	}, []);
	const [tab, setTab] = useState(initialTab);
	const { uiLanguage, setUiLanguage } = useAppProvider();
	const copy = getUiCopy(uiLanguage);

	const handleTabChange = (nextTab: string) => {
		setTab(nextTab);
		const url = new URL(window.location.href);
		if (nextTab === 'logs') {
			url.searchParams.set('tab', 'logs');
		} else {
			url.searchParams.delete('tab');
		}
		window.history.replaceState({}, '', url.toString());
	};

	return (
			<div className='p-5'>
				<div className='mx-auto max-w-6xl'>
					<Tabs value={tab} onValueChange={handleTabChange} className='gap-4'>
						<div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
							<div>
								<h1 className='text-2xl font-semibold'>{copy.optionsTitle}</h1>
								<p className='text-sm text-muted-foreground'>
									{copy.optionsSubtitle}
								</p>
							</div>
							<div className='flex flex-wrap items-center justify-end gap-2'>
								<div className='min-w-[140px]'>
									<Select
										value={uiLanguage}
										onValueChange={(value) => setUiLanguage(value as UiLanguage)}>
										<SelectTrigger className='w-full'>
											<SelectValue placeholder={copy.languageLabel} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='zh-CN'>简体中文</SelectItem>
											<SelectItem value='en'>English</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<ModeToggle
									labels={{
										light: copy.light,
										dark: copy.dark,
										system: copy.system,
										toggle: copy.themeLabel,
									}}
								/>
								<TabsList>
									<TabsTrigger value='settings'>{copy.settingsTab}</TabsTrigger>
									<TabsTrigger value='logs'>{copy.logsTab}</TabsTrigger>
								</TabsList>
							</div>
						</div>
						<TabsContent value='settings' className='w-full'>
							<ConfigForm />
							</TabsContent>
							<TabsContent value='logs' className='w-full'>
								<TranslationLogsPage />
							</TabsContent>
					</Tabs>
				</div>
			</div>
	);
}

export function App() {
	return (
		<RootLayout>
			<OptionsShell />
		</RootLayout>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
