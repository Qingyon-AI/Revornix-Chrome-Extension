export const TRANSLATION_LOGS_KEY = 'translationLogs';
const MAX_LOG_ENTRIES = 200;
let logWriteQueue = Promise.resolve();

export interface TranslationLogEntry {
	id: string;
	timestamp: string;
	level: 'info' | 'warn' | 'error';
	scope: 'background' | 'content' | 'ui';
	message: string;
	details?: string;
}

export async function appendTranslationLog(
	entry: Omit<TranslationLogEntry, 'id' | 'timestamp'>
) {
	logWriteQueue = logWriteQueue
		.catch(() => undefined)
		.then(async () => {
			const result = await chrome.storage.local.get([TRANSLATION_LOGS_KEY]);
			const current = ((result[TRANSLATION_LOGS_KEY] || []) as TranslationLogEntry[]).slice(
				-MAX_LOG_ENTRIES + 1
			);
			const nextEntry: TranslationLogEntry = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				timestamp: new Date().toISOString(),
				...entry,
			};

			await chrome.storage.local.set({
				[TRANSLATION_LOGS_KEY]: [...current, nextEntry],
			});
		});

	return logWriteQueue;
}

export async function readTranslationLogs() {
	const result = await chrome.storage.local.get([TRANSLATION_LOGS_KEY]);
	return (result[TRANSLATION_LOGS_KEY] || []) as TranslationLogEntry[];
}

export async function clearTranslationLogs() {
	await chrome.storage.local.set({
		[TRANSLATION_LOGS_KEY]: [],
	});
}
