import './index.css';
import { Toaster } from '@/components/ui/sonner';
import ReactQueryProvider from '@/provider/react-query-provider';

const RootLayout = ({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) => {
	return (
		<div>
			<ReactQueryProvider>
				<Toaster position='top-right' />
				{children}
			</ReactQueryProvider>
		</div>
	);
};
export default RootLayout;
