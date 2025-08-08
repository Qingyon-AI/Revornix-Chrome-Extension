import { extractCoverImage, extractPageDescription } from "@/lib/utils";
import { Session } from "revornix";

export const handleSharePage = async (message: any) => {
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const baseUrl = result.baseUrl;
        const apiKey = result.apiKey;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        const session = new Session(baseUrl, apiKey);
        await session.createWebsiteDocument({
            title: document.title,
            description: extractPageDescription(),
            cover: extractCoverImage(),
            url: message.payload.url,
            labels: [],
            sections: [],
            auto_summary: false
        })
    });
}

export const handleShareSelection = async (message: any) => {
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const baseUrl = result.baseUrl;
        const apiKey = result.apiKey;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        const session = new Session(baseUrl, apiKey);
        await session.createQuickNoteDocument({
            title: document.title,
            description: extractPageDescription(),
            cover: extractCoverImage(),
            content: message.payload.text,
            labels: [],
            sections: [],
            auto_summary: false
        })
    });
}

export const handleShareImage = async (message: any) => {
    console.log(message)
    chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
        const baseUrl = result.baseUrl;
        const apiKey = result.apiKey;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        // const session = new Session(baseUrl, apiKey);
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
        const baseUrl = result.baseUrl;
        const apiKey = result.apiKey;
        if (!baseUrl || !apiKey) {
            console.error('baseUrl or apiKey is not set');
            return;
        }
        const session = new Session(baseUrl, apiKey);
        await session.createWebsiteDocument({
            url: message.payload.url,
            labels: [],
            sections: [],
            auto_summary: false
        })
    });
}