/// <reference types="chrome" />

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'revornix-context-menu-page',
    title: 'Save page to Revornix',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'revornix-context-menu-selection',
    title: 'Save content to Revornix',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'revornix-context-menu-link',
    title: 'Save link to Revornix',
    contexts: ["link"]
  });
  chrome.contextMenus.create({
    id: 'revornix-context-menu-image',
    title: 'Save image to Revornix',
    contexts: ["image"]
  });

  chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {

  if (!tab || !tab.id) return;

  switch (info.menuItemId) {

    case "revornix-context-menu-page":
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHARE_PAGE_TO_REVORNIX',
        payload: { url: tab.url }
      });
      break;

    case "revornix-context-menu-selection":
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHARE_SELECTION_TO_REVORNIX',
        payload: {
          url: tab.url,
          text: info.selectionText // 这里就是选中的文字
        }
      });
      break;

    case "revornix-context-menu-link":
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHARE_LINK_TO_REVORNIX',
        payload: {
          url: info.linkUrl // 链接的真实地址
        }
      });
      break;

    case "revornix-context-menu-image":
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHARE_IMAGE_TO_REVORNIX',
        payload: {
          url: info.srcUrl // 图片的真实地址
        }
      });
      break;

    default:
      break;

  }
});