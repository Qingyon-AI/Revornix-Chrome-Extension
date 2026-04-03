const WEBSITE_CATEGORY = 1;
const QUICK_NOTE_CATEGORY = 2;

export interface RevornixDocumentLabel {
	id: number;
	name: string;
}

export interface RevornixSectionInfo {
	id: number;
	title: string;
	description?: string | null;
}

export interface RevornixDocumentSearchItem {
	id: number;
	category: number;
	title: string;
	description?: string | null;
	cover?: string | null;
}

export interface RevornixWebsiteDocumentDetail {
	id: number;
	title: string;
	description?: string | null;
	cover?: string | null;
	labels?: RevornixDocumentLabel[];
	sections?: RevornixSectionInfo[];
	creator?: {
		id?: number;
		nickname?: string | null;
		avatar?: string | null;
	} | null;
	website_info?: {
		url: string;
	} | null;
	audio_info?: RevornixAudioInfo | null;
	process_task?: RevornixProcessTask | null;
	graph_task?: RevornixGraphTask | null;
	podcast_task?: RevornixPodcastTask | null;
}

export interface RevornixAudioInfo {
	audio_file_name: string;
}

export interface RevornixGraphTask {
	status: number;
	create_time?: string | null;
	update_time?: string | null;
}

export interface RevornixProcessTask {
	status: number;
	create_time?: string | null;
	update_time?: string | null;
}

export interface RevornixPodcastTask {
	status: number;
	podcast_file_name: string | null;
	create_time?: string | null;
	update_time?: string | null;
}

export interface RevornixGraphNode {
	id: string;
	text: string;
	degree?: number;
	sources?: Array<{
		doc_id?: number;
		doc_title?: string | null;
		chunk_id?: string | null;
	}>;
}

export interface RevornixGraphEdge {
	src_node: string;
	tgt_node: string;
}

export interface RevornixGraphResponse {
	nodes: RevornixGraphNode[];
	edges: RevornixGraphEdge[];
}

export interface RevornixDocumentNote {
	id: number;
	content: string;
	user?: {
		id?: number;
		name?: string | null;
		nickname?: string | null;
		email?: string | null;
		avatar?: string | null;
	} | null;
	create_time: string;
	update_time?: string | null;
}

export interface CreateDocumentPayload {
	category: number;
	title?: string;
	description?: string;
	cover?: string;
	content?: string;
	url?: string;
	labels?: number[];
	sections?: number[];
	auto_summary?: boolean;
	auto_podcast?: boolean;
	auto_transcribe?: boolean;
	auto_tag?: boolean;
}

interface RevornixRequestOptions {
	baseUrl: string;
	apiKey: string;
	path: string;
	body?: Record<string, unknown>;
}

export interface RevornixChatMessage {
	chat_id: string;
	role: string;
	content: string;
	images?: string[];
}

export async function listDocumentLabels(baseUrl: string, apiKey: string) {
	const response = await requestRevornix<{ data: RevornixDocumentLabel[] }>({
		baseUrl,
		apiKey,
		path: '/tp/document/label/list',
	});
	return response.data;
}

export async function listMineSections(baseUrl: string, apiKey: string) {
	const response = await requestRevornix<{ data: RevornixSectionInfo[] }>({
		baseUrl,
		apiKey,
		path: '/tp/section/mine/all',
	});
	return response.data;
}

export async function createDocumentLabel(baseUrl: string, apiKey: string, name: string) {
	return requestRevornix<{ id: number; name?: string }>({
		baseUrl,
		apiKey,
		path: '/tp/document/label/create',
		body: {
			name,
		},
	});
}

export async function createSection(
	baseUrl: string,
	apiKey: string,
	payload: {
		title: string;
		description: string;
		cover?: string;
		labels?: number[];
	}
) {
	return requestRevornix<{ id: number }>({
		baseUrl,
		apiKey,
		path: '/tp/section/create',
		body: {
			title: payload.title,
			description: payload.description,
			cover: payload.cover || undefined,
			labels: payload.labels || [],
			auto_publish: false,
			auto_podcast: false,
			auto_illustration: false,
			process_task_trigger_type: 0,
		},
	});
}

export async function searchMineDocuments(
	baseUrl: string,
	apiKey: string,
	payload: {
		keyword?: string;
		start?: number;
		limit?: number;
		label_ids?: number[];
		desc?: boolean;
	}
) {
	return requestRevornix<{
		total: number;
		elements: RevornixDocumentSearchItem[];
		has_more: boolean;
		next_start?: number | null;
	}>({
		baseUrl,
		apiKey,
		path: '/tp/document/search/mine',
		body: payload,
	});
}

export async function getDocumentDetail(
	baseUrl: string,
	apiKey: string,
	documentId: number
) {
	return requestRevornix<RevornixWebsiteDocumentDetail>({
		baseUrl,
		apiKey,
		path: '/tp/document/detail',
		body: {
			document_id: documentId,
		},
	});
}

export async function getDocumentDetailByUrl(
	baseUrl: string,
	apiKey: string,
	url: string
) {
	return requestRevornix<RevornixWebsiteDocumentDetail>({
		baseUrl,
		apiKey,
		path: '/tp/document/detail',
		body: {
			url,
		},
	});
}

export async function updateDocument(
	baseUrl: string,
	apiKey: string,
	payload: {
		document_id: number;
		title?: string;
		description?: string;
		cover?: string;
		labels?: number[];
		sections?: number[];
	}
) {
	return requestRevornix<{
		success?: boolean;
		message?: string;
	}>({
		baseUrl,
		apiKey,
		path: '/tp/document/update',
		body: payload,
	});
}

export async function createDocumentNote(
	baseUrl: string,
	apiKey: string,
	payload: {
		document_id: number;
		content: string;
	}
) {
	return requestRevornix<{ success?: boolean; message?: string }>({
		baseUrl,
		apiKey,
		path: '/tp/document/note/create',
		body: payload,
	});
}

export async function getDocumentGraph(
	baseUrl: string,
	apiKey: string,
	documentId: number
) {
	return requestRevornix<RevornixGraphResponse>({
		baseUrl,
		apiKey,
		path: '/tp/graph/document',
		body: {
			document_id: documentId,
		},
	});
}

export async function generateDocumentGraph(
	baseUrl: string,
	apiKey: string,
	documentId: number
) {
	return requestRevornix<{ success?: boolean; message?: string }>({
		baseUrl,
		apiKey,
		path: '/tp/document/graph/generate',
		body: {
			document_id: documentId,
		},
	});
}

export async function generateDocumentPodcast(
	baseUrl: string,
	apiKey: string,
	documentId: number
) {
	return requestRevornix<{ success?: boolean; message?: string }>({
		baseUrl,
		apiKey,
		path: '/tp/document/podcast/generate',
		body: {
			document_id: documentId,
		},
	});
}

export async function searchDocumentNotes(
	baseUrl: string,
	apiKey: string,
	payload: {
		document_id: number;
		keyword?: string;
		start?: number;
		limit?: number;
	}
) {
	return requestRevornix<{
		total: number;
		elements: RevornixDocumentNote[];
		has_more: boolean;
		next_start?: number | null;
	}>({
		baseUrl,
		apiKey,
		path: '/tp/document/note/search',
		body: payload,
	});
}

export async function createWebsiteDocument(
	baseUrl: string,
	apiKey: string,
	payload: Omit<CreateDocumentPayload, 'category'>
) {
	return requestRevornix<{ document_id: number }>({
		baseUrl,
		apiKey,
		path: '/tp/document/create',
		body: {
			category: WEBSITE_CATEGORY,
			labels: [],
			sections: [],
			auto_summary: false,
			auto_podcast: false,
			auto_transcribe: false,
			auto_tag: false,
			...payload,
		},
	});
}

export async function createQuickNoteDocument(
	baseUrl: string,
	apiKey: string,
	payload: Omit<CreateDocumentPayload, 'category'>
) {
	return requestRevornix<{ document_id: number }>({
		baseUrl,
		apiKey,
		path: '/tp/document/create',
		body: {
			category: QUICK_NOTE_CATEGORY,
			labels: [],
			sections: [],
			auto_summary: false,
			auto_podcast: false,
			auto_transcribe: false,
			auto_tag: false,
			...payload,
		},
	});
}

export async function askDocumentAiStream(
	baseUrl: string,
	apiKey: string,
	payload: {
		document_id: number;
		messages: RevornixChatMessage[];
		enable_mcp?: boolean;
	}
) {
	return fetch(`${baseUrl.replace(/\/$/, '')}/tp/document/ask`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'api-key': apiKey,
			'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
		body: JSON.stringify(payload),
	});
}

async function requestRevornix<T>({
	baseUrl,
	apiKey,
	path,
	body,
}: RevornixRequestOptions): Promise<T> {
	const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'api-key': apiKey,
			'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	const text = await response.text();
	const data = text ? tryParseJson(text) : null;

	if (!response.ok) {
		const errorMessage = extractErrorMessage(data, text, response.status);
		throw new Error(errorMessage);
	}

	return data as T;
}

function tryParseJson(value: string) {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function extractErrorMessage(data: unknown, text: string, status: number) {
	if (
		data &&
		typeof data === 'object' &&
		'message' in data &&
		typeof data.message === 'string' &&
		data.message
	) {
		return data.message;
	}

	if (text) {
		return text;
	}

	return `Request failed with status ${status}`;
}
