'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface AppContextProps {
	apiKey: string;
	baseUrl: string;
	setApiKey: (key: string) => void;
	setBaseUrl: (url: string) => void;
}

const AppContext = createContext<AppContextProps | null>(null);

const AppProvider = ({ children }: { children: React.ReactNode }) => {
	const [apiKey, _setApiKey] = useState<string>('');
	const [baseUrl, _setBaseUrl] = useState<string>('');

	// 设置并同步到 storage
	const setApiKey = (key: string) => {
		_setApiKey(key);
		chrome.storage.local.set({ apiKey: key });
	};

	const setBaseUrl = (url: string) => {
		_setBaseUrl(url);
		chrome.storage.local.set({ baseUrl: url });
	};

	useEffect(() => {
		// 初始化从 storage 读取
		chrome.storage.local.get(['baseUrl', 'apiKey'], (result) => {
			if (result.baseUrl) _setBaseUrl(result.baseUrl);
			if (result.apiKey) _setApiKey(result.apiKey);
		});

		// 监听 storage 改变
		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string
		) => {
			if (areaName !== 'local') return;

			if (changes.apiKey) {
				_setApiKey(changes.apiKey.newValue || '');
			}
			if (changes.baseUrl) {
				_setBaseUrl(changes.baseUrl.newValue || '');
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);

		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	return (
		<AppContext.Provider
			value={{
				apiKey,
				baseUrl,
				setApiKey,
				setBaseUrl,
			}}>
			{children}
		</AppContext.Provider>
	);
};

export const useAppProvider = () => {
	const userContext = useContext(AppContext);
	if (!userContext) {
		throw new Error('useAppProvider must be used within a AppProvider');
	}
	return userContext;
};

export default AppProvider;
