/// <reference types="chrome" />

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'revornix-context-menu-selection',
    title: 'Save content to Revornix',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'revornix-context-menu-page',
    title: 'Save page to Revornix',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'revornix-context-menu-link',
    title: 'Save link to Revornix',
    contexts: ["link"]
  });
  chrome.contextMenus.create({
    id: 'revornix-context-menu-image',
    title: 'Save file to Revornix',
    contexts: ["image"]
  });

  chrome.runtime.openOptionsPage();
});


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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  switch (info.menuItemId) {
    case "revornix-context-menu-page":
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const data = {
            url: tab.url,
            title: document.title,
            description: extractPageDescription(),
            cover: extractCoverImage(),
          };
          chrome.runtime.sendMessage({ type: 'SHARE_PAGE', payload: data });
        }
      });
      break;
    default:
      break;
  }
});