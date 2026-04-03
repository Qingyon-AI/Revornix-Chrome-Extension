export type UiLanguage = 'zh-CN' | 'en';
export type UiTheme = 'light' | 'dark' | 'system';

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh-CN';
export const DEFAULT_UI_THEME: UiTheme = 'system';

export function resolveUiTheme(theme: UiTheme) {
	if (theme === 'system') {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	return theme;
}
