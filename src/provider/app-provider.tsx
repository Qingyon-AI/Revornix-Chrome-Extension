'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
	DEFAULT_FLOATING_BALL_ENABLED,
	DEFAULT_TRANSLATION_DISPLAY_MODE,
	DEFAULT_TRANSLATION_PROVIDER,
	DEFAULT_TARGET_LANGUAGE,
	DEFAULT_TRANSLATION_MODEL,
	type TranslationDisplayMode,
	type TranslationProvider,
} from '@/lib/translation';
import {
	DEFAULT_UI_LANGUAGE,
	DEFAULT_UI_THEME,
	type UiLanguage,
	type UiTheme,
} from '@/lib/ui-preferences';

interface AppContextProps {
	apiKey: string;
	baseUrl: string;
	translationApiKey: string;
	translationProvider: TranslationProvider;
	translationBaseUrl: string;
	translationModel: string;
	translationTargetLanguage: string;
	translationDisplayMode: TranslationDisplayMode;
	translationFloatingBallEnabled: boolean;
	uiLanguage: UiLanguage;
	uiTheme: UiTheme;
	setApiKey: (key: string) => void;
	setBaseUrl: (url: string) => void;
	setTranslationApiKey: (key: string) => void;
	setTranslationProvider: (provider: TranslationProvider) => void;
	setTranslationBaseUrl: (url: string) => void;
	setTranslationModel: (model: string) => void;
	setTranslationTargetLanguage: (language: string) => void;
	setTranslationDisplayMode: (mode: TranslationDisplayMode) => void;
	setTranslationFloatingBallEnabled: (enabled: boolean) => void;
	setUiLanguage: (language: UiLanguage) => void;
	setUiTheme: (theme: UiTheme) => void;
}

const AppContext = createContext<AppContextProps | null>(null);

const AppProvider = ({ children }: { children: React.ReactNode }) => {
	const [apiKey, _setApiKey] = useState<string>('');
	const [baseUrl, _setBaseUrl] = useState<string>('');
	const [translationApiKey, _setTranslationApiKey] = useState<string>('');
	const [translationProvider, _setTranslationProvider] =
		useState<TranslationProvider>(DEFAULT_TRANSLATION_PROVIDER);
	const [translationBaseUrl, _setTranslationBaseUrl] = useState<string>('');
	const [translationModel, _setTranslationModel] = useState<string>(
		DEFAULT_TRANSLATION_MODEL
	);
	const [translationTargetLanguage, _setTranslationTargetLanguage] =
		useState<string>(DEFAULT_TARGET_LANGUAGE);
	const [translationDisplayMode, _setTranslationDisplayMode] =
		useState<TranslationDisplayMode>(DEFAULT_TRANSLATION_DISPLAY_MODE);
	const [translationFloatingBallEnabled, _setTranslationFloatingBallEnabled] =
		useState<boolean>(DEFAULT_FLOATING_BALL_ENABLED);
	const [uiLanguage, _setUiLanguage] = useState<UiLanguage>(DEFAULT_UI_LANGUAGE);
	const [uiTheme, _setUiTheme] = useState<UiTheme>(DEFAULT_UI_THEME);

	// 设置并同步到 storage
	const setApiKey = (key: string) => {
		_setApiKey(key);
		chrome.storage.local.set({ apiKey: key });
	};

	const setBaseUrl = (url: string) => {
		_setBaseUrl(url);
		chrome.storage.local.set({ baseUrl: url });
	};

	const setTranslationApiKey = (key: string) => {
		_setTranslationApiKey(key);
		chrome.storage.local.set({ translationApiKey: key });
	};

	const setTranslationProvider = (provider: TranslationProvider) => {
		_setTranslationProvider(provider);
		chrome.storage.local.set({ translationProvider: provider });
	};

	const setTranslationBaseUrl = (url: string) => {
		_setTranslationBaseUrl(url);
		chrome.storage.local.set({ translationBaseUrl: url });
	};

	const setTranslationModel = (model: string) => {
		_setTranslationModel(model);
		chrome.storage.local.set({ translationModel: model });
	};

	const setTranslationTargetLanguage = (language: string) => {
		_setTranslationTargetLanguage(language);
		chrome.storage.local.set({ translationTargetLanguage: language });
	};

	const setTranslationDisplayMode = (mode: TranslationDisplayMode) => {
		_setTranslationDisplayMode(mode);
		chrome.storage.local.set({ translationDisplayMode: mode });
	};

	const setTranslationFloatingBallEnabled = (enabled: boolean) => {
		_setTranslationFloatingBallEnabled(enabled);
		chrome.storage.local.set({ translationFloatingBallEnabled: enabled });
	};

	const setUiLanguage = (language: UiLanguage) => {
		_setUiLanguage(language);
		chrome.storage.local.set({ uiLanguage: language });
	};

	const setUiTheme = (theme: UiTheme) => {
		_setUiTheme(theme);
		chrome.storage.local.set({ uiTheme: theme });
	};

	useEffect(() => {
		// 初始化从 storage 读取
			chrome.storage.local.get(
			[
				'baseUrl',
				'apiKey',
				'translationBaseUrl',
				'translationApiKey',
				'translationProvider',
				'translationModel',
					'translationTargetLanguage',
					'translationDisplayMode',
					'translationFloatingBallEnabled',
					'uiLanguage',
					'uiTheme',
				],
				(result) => {
					const storage = result as Record<string, unknown>;
					if (storage.baseUrl) _setBaseUrl(storage.baseUrl as string);
					if (storage.apiKey) _setApiKey(storage.apiKey as string);
					if (storage.translationBaseUrl) {
						_setTranslationBaseUrl(storage.translationBaseUrl as string);
					}
					if (storage.translationApiKey) {
						_setTranslationApiKey(storage.translationApiKey as string);
					}
					if (storage.translationProvider) {
						_setTranslationProvider(storage.translationProvider as TranslationProvider);
					}
					if (storage.translationModel) {
						_setTranslationModel(storage.translationModel as string);
					}
					if (storage.translationTargetLanguage) {
						_setTranslationTargetLanguage(storage.translationTargetLanguage as string);
					}
					if (storage.translationDisplayMode) {
						_setTranslationDisplayMode(storage.translationDisplayMode as TranslationDisplayMode);
					}
						if (typeof storage.translationFloatingBallEnabled === 'boolean') {
							_setTranslationFloatingBallEnabled(storage.translationFloatingBallEnabled);
						}
						if (storage.uiLanguage) {
							_setUiLanguage(storage.uiLanguage as UiLanguage);
						}
						if (storage.uiTheme) {
							_setUiTheme(storage.uiTheme as UiTheme);
						}
					}
				);

		// 监听 storage 改变
		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string
		) => {
			if (areaName !== 'local') return;

				if (changes.apiKey) {
					_setApiKey((changes.apiKey.newValue as string) || '');
				}
				if (changes.baseUrl) {
					_setBaseUrl((changes.baseUrl.newValue as string) || '');
				}
				if (changes.translationApiKey) {
					_setTranslationApiKey((changes.translationApiKey.newValue as string) || '');
				}
				if (changes.translationProvider) {
					_setTranslationProvider(
						(changes.translationProvider.newValue as TranslationProvider) ||
							DEFAULT_TRANSLATION_PROVIDER
					);
				}
				if (changes.translationBaseUrl) {
					_setTranslationBaseUrl((changes.translationBaseUrl.newValue as string) || '');
				}
				if (changes.translationModel) {
					_setTranslationModel(
						(changes.translationModel.newValue as string) || DEFAULT_TRANSLATION_MODEL
					);
				}
				if (changes.translationTargetLanguage) {
					_setTranslationTargetLanguage(
						(changes.translationTargetLanguage.newValue as string) || DEFAULT_TARGET_LANGUAGE
					);
				}
				if (changes.translationDisplayMode) {
					_setTranslationDisplayMode(
						(changes.translationDisplayMode.newValue as TranslationDisplayMode) ||
							DEFAULT_TRANSLATION_DISPLAY_MODE
					);
				}
				if (changes.translationFloatingBallEnabled) {
					_setTranslationFloatingBallEnabled(
						(changes.translationFloatingBallEnabled.newValue as boolean | undefined) ??
							DEFAULT_FLOATING_BALL_ENABLED
					);
				}
					if (changes.uiLanguage) {
						_setUiLanguage((changes.uiLanguage.newValue as UiLanguage) || DEFAULT_UI_LANGUAGE);
					}
					if (changes.uiTheme) {
						_setUiTheme((changes.uiTheme.newValue as UiTheme) || DEFAULT_UI_THEME);
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
				translationApiKey,
				translationProvider,
				translationBaseUrl,
				translationModel,
				translationTargetLanguage,
					translationDisplayMode,
					translationFloatingBallEnabled,
					uiLanguage,
					uiTheme,
					setApiKey,
				setBaseUrl,
				setTranslationApiKey,
				setTranslationProvider,
				setTranslationBaseUrl,
				setTranslationModel,
				setTranslationTargetLanguage,
					setTranslationDisplayMode,
					setTranslationFloatingBallEnabled,
					setUiLanguage,
					setUiTheme,
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
