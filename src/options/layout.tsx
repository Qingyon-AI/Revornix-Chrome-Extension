import './index.css';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import ReactQueryProvider from '@/provider/react-query-provider';

const RootLayout = ({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) => {
	return (
		<div>
			<ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
				<ReactQueryProvider>
					<Toaster position='top-right' />
					{children}
				</ReactQueryProvider>
			</ThemeProvider>
		</div>
	);
};
export default RootLayout;
