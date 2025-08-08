import './index.css';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import ReactQueryProvider from '@/provider/react-query-provider';
import AppProvider from '@/provider/app-provider';

const RootLayout = ({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) => {
	return (
		<div>
			<ThemeProvider defaultTheme='system' storageKey='vite-ui-theme'>
				<ReactQueryProvider>
					<AppProvider>
						<Toaster position='top-right' />
						{children}
					</AppProvider>
				</ReactQueryProvider>
			</ThemeProvider>
		</div>
	);
};
export default RootLayout;
