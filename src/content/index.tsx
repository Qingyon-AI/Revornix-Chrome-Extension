console.log('Revornix Extenson injected into page:', window.location.href);
import './clipper';
import { extractCoverImage, extractPageDescription } from '@/lib/utils';
import {
	handleShareImage,
	handleShareLink,
	handleSharePage,
	handleShareSelection,
} from './share';

chrome.runtime.onMessage.addListener(async (message, _, sendResponse) => {
	switch (message.type) {
		case 'GET_PAGE_DATA':
			sendResponse({
				title: document.title,
				description: extractPageDescription(),
				cover: extractCoverImage(),
				html: document.documentElement.outerHTML,
			});
			break;

		case 'SHARE_PAGE_TO_REVORNIX':
			await handleSharePage(message);
			break;

		case 'SHARE_SELECTION_TO_REVORNIX':
			await handleShareSelection(message);
			break;

		case 'SHARE_LINK_TO_REVORNIX':
			await handleShareLink(message);
			break;

		case 'SHARE_IMAGE_TO_REVORNIX':
			await handleShareImage(message);
			break;

		default:
			break;
	}

	return true; // 表示异步响应
});
