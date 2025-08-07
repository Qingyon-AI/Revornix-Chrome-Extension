console.log("Injected into page:", window.location.href);

function extractCoverImage(): string | null {
    const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (og) return og;

    const twitter = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
    if (twitter) return twitter;

    const imgs = Array.from(document.images || []);
    const biggest = imgs.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
    return biggest?.src || null;
}

function extractPageDescription(): string | null {
    const desc = document.querySelector('meta[name="description"]')?.getAttribute('content');
    if (desc) return desc;

    const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
    if (ogDesc) return ogDesc;

    return null;
}


chrome.runtime.onMessage.addListener(async (message, _, sendResponse) => {

    switch (message.type) {

        case 'GET_PAGE_DATA':
            sendResponse({
                title: document.title,
                description: extractPageDescription(),
                cover: extractCoverImage(),
                html: document.documentElement.outerHTML
            });
            break;

        case 'SHARE_PAGE':
            chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
                const baseUrl = result.baseUrl;
                const apiKey = result.apiKey;
                if (!baseUrl || !apiKey) {
                    console.error('baseUrl or apiKey is not set');
                    return;
                }
                // const session = new Session(baseUrl, apiKey);
                // await session.createWebsiteDocument({
                //     title: message.payload.title,
                //     description: message.payload.description,
                //     cover: message.payload.cover,
                //     url: message.payload.url,
                //     labels: [],
                //     sections: [],
                //     auto_summary: false
                // })
            });
            break;

        default:
            break;

    }

    return true; // 表示异步响应
});

