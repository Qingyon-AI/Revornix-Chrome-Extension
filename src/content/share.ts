import { extractCoverImage, extractPageDescription } from "@/lib/utils";
import {
    createQuickNoteDocument,
    createWebsiteDocument,
} from "@/lib/revornix-api";

export const handleSharePage = async (message: any) => {
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const storage = result as Record<string, unknown>;
        const baseUrl = storage.baseUrl as string | undefined;
        const apiKey = storage.apiKey as string | undefined;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        await createWebsiteDocument(baseUrl, apiKey, {
            title: document.title,
            description: extractPageDescription(),
            cover: extractCoverImage(),
            url: message.payload.url,
            labels: [],
            sections: [],
            auto_summary: false
        });
    });
}

export const handleShareSelection = async (message: any) => {
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const storage = result as Record<string, unknown>;
        const baseUrl = storage.baseUrl as string | undefined;
        const apiKey = storage.apiKey as string | undefined;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        await createQuickNoteDocument(baseUrl, apiKey, {
            title: document.title,
            description: extractPageDescription(),
            cover: extractCoverImage(),
            content: message.payload.text,
            labels: [],
            sections: [],
            auto_summary: false
        });
    });
}

export const handleShareImage = async (message: any) => {
    console.log(message)
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const storage = result as Record<string, unknown>;
        const baseUrl = storage.baseUrl as string | undefined;
        const apiKey = storage.apiKey as string | undefined;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        // TODO: update image to the file service
        // await session.createFileDocument({
        //     file_name: '',
        //     labels: [],
        //     sections: [],
        //     auto_summary: false
        // })
    });
}

export const handleShareLink = async (message: any) => {
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const storage = result as Record<string, unknown>;
        const baseUrl = storage.baseUrl as string | undefined;
        const apiKey = storage.apiKey as string | undefined;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        await createWebsiteDocument(baseUrl, apiKey, {
            url: message.payload.url,
            labels: [],
            sections: [],
            auto_summary: false
        });
    });
}
