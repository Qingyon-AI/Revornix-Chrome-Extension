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

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.type === 'GET_PAGE_DATA') {
        const title = document.title;
        const description = extractPageDescription();
        const cover = extractCoverImage();
        const html = document.documentElement.outerHTML;
        sendResponse({ title, description, cover, html });
    }

    return true; // 表示异步响应
});