import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCopy, getUiCopy } from '@/lib/ui-copy';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
	clearTranslationLogs,
	readTranslationLogs,
	TRANSLATION_LOGS_KEY,
	type TranslationLogEntry,
} from '@/lib/logging';
import { useAppProvider } from '@/provider/app-provider';
import { toast } from 'sonner';

type LevelFilter = 'all' | TranslationLogEntry['level'];
type ScopeFilter = 'all' | TranslationLogEntry['scope'];

const LEVEL_BADGE_CLASS: Record<TranslationLogEntry['level'], string> = {
	info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
	warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
	error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
};

const TranslationLogsPage = () => {
	const { uiLanguage } = useAppProvider();
	const copy = getUiCopy(uiLanguage);
	const [logs, setLogs] = useState<TranslationLogEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [level, setLevel] = useState<LevelFilter>('all');
	const [scope, setScope] = useState<ScopeFilter>('all');
	const [keyword, setKeyword] = useState('');

	const loadLogs = async () => {
		setLoading(true);
		try {
			const nextLogs = await readTranslationLogs();
			setLogs(nextLogs.slice().reverse());
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadLogs();

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string
		) => {
			if (areaName !== 'local' || !changes[TRANSLATION_LOGS_KEY]) {
				return;
			}

			const nextLogs = (changes[TRANSLATION_LOGS_KEY].newValue || []) as TranslationLogEntry[];
			setLogs(nextLogs.slice().reverse());
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	const filteredLogs = useMemo(() => {
		const normalizedKeyword = keyword.trim().toLowerCase();
		return logs.filter((log) => {
			if (level !== 'all' && log.level !== level) {
				return false;
			}
			if (scope !== 'all' && log.scope !== scope) {
				return false;
			}
			if (!normalizedKeyword) {
				return true;
			}
			const haystack = `${log.message} ${log.details || ''}`.toLowerCase();
			return haystack.includes(normalizedKeyword);
		});
	}, [keyword, level, logs, scope]);

	return (
		<div className='space-y-4'>
			<div className='rounded-2xl border bg-card p-5 shadow-sm'>
				<div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
					<div>
						<h2 className='text-lg font-semibold'>{copy.translationLogs}</h2>
						<p className='text-sm text-muted-foreground'>{copy.translationLogsDesc}</p>
					</div>
					<div className='flex shrink-0 gap-2'>
						<Button type='button' variant='secondary' onClick={() => void loadLogs()} disabled={loading}>
							{loading ? copy.refreshing : copy.refresh}
						</Button>
						<Button
							type='button'
							variant='outline'
							onClick={() => {
								void clearTranslationLogs().then(() => {
									setLogs([]);
									toast.success(copy.logsCleared);
								});
							}}>
							{copy.clear}
						</Button>
					</div>
				</div>
				<div className='mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]'>
					<div className='space-y-1.5'>
						<div className='text-xs font-medium text-muted-foreground'>{copy.searchLogs}</div>
						<Input
							value={keyword}
							onChange={(event) => setKeyword(event.target.value)}
							placeholder={copy.searchPlaceholder}
						/>
					</div>
					<div className='space-y-1.5'>
						<div className='text-xs font-medium text-muted-foreground'>{copy.level}</div>
						<Select value={level} onValueChange={(value) => setLevel(value as LevelFilter)}>
							<SelectTrigger className='w-full'>
								<SelectValue placeholder={copy.level} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='all'>{copy.allLevels}</SelectItem>
								<SelectItem value='info'>Info</SelectItem>
								<SelectItem value='warn'>Warn</SelectItem>
								<SelectItem value='error'>Error</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className='space-y-1.5'>
						<div className='text-xs font-medium text-muted-foreground'>{copy.scope}</div>
						<Select value={scope} onValueChange={(value) => setScope(value as ScopeFilter)}>
							<SelectTrigger className='w-full'>
								<SelectValue placeholder={copy.scope} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='all'>{copy.allScopes}</SelectItem>
								<SelectItem value='background'>Background</SelectItem>
								<SelectItem value='content'>Content</SelectItem>
								<SelectItem value='ui'>UI</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>

			<div className='rounded-2xl border bg-card shadow-sm'>
				<div className='flex items-center justify-between border-b px-4 py-3'>
					<div className='text-sm font-medium'>{copy.logList}</div>
					<div className='rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground'>
						{formatCopy(copy.logCount, { count: filteredLogs.length })}
					</div>
				</div>
				<div className='max-h-[68vh] overflow-y-auto'>
					{filteredLogs.length === 0 ? (
						<div className='px-4 py-10 text-center text-sm text-muted-foreground'>
							{copy.noMatchedLogs}
						</div>
					) : (
						filteredLogs.map((log) => (
							<div
								key={log.id}
								className='border-b px-4 py-3 transition-colors hover:bg-muted/20 last:border-b-0'>
								<div className='flex flex-wrap items-center gap-2'>
									<span
										className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_BADGE_CLASS[log.level]}`}>
										{log.level.toUpperCase()}
									</span>
									<span className='rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>
										{log.scope}
									</span>
									<span className='text-xs text-muted-foreground'>
										{new Date(log.timestamp).toLocaleString(
											uiLanguage === 'en' ? 'en-US' : 'zh-CN',
											{ hour12: false }
										)}
									</span>
								</div>
								<div className='mt-2 text-sm font-medium'>{log.message}</div>
								{log.details ? (
									<pre className='mt-2 overflow-x-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words'>
										{log.details}
									</pre>
								) : null}
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
};

export default TranslationLogsPage;
