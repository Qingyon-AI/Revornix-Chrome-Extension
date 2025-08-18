import { Button } from '@/components/ui/button';
import ReactDOM from 'react-dom/client';
import './index.css';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import Logo from '@/components/logo';
import { extractCoverImage, extractPageDescription } from '@/lib/utils';
import { Session } from 'revornix';

// const Clipper = () => {
// 	const handleClick = async () => {
// 		chrome.storage.local.get(['baseUrl', 'apiKey'], async (result) => {
// 			const baseUrl = result.baseUrl;
// 			const apiKey = result.apiKey;
// 			if (!baseUrl || !apiKey) {
// 				console.error('baseUrl or apiKey is not set');
// 				return;
// 			}
// 			const session = new Session(baseUrl, apiKey);
// 			await session.createWebsiteDocument({
// 				url: document.URL,
// 				title: document.title,
// 				description: extractPageDescription(),
// 				cover: extractCoverImage(),
// 				labels: [],
// 				sections: [],
// 				auto_summary: false,
// 			});
// 			toast.success('Page Saved');
// 		});
// 	};

// 	return (
// 		<>
// 			<Toaster position={'top-right'} />
// 			<Button
// 				size={'icon'}
// 				onClick={handleClick}
// 				className='fixed top-[50%] right-1 translate-y-[-50%] z-50 w-10 h-10 rounded-full cursor-pointer'
// 				title='Save this page'>
// 				<Logo />
// 			</Button>
// 		</>
// 	);
// };

// // 挂载到 Shadow DOM，避免样式冲突
// const mountClipper = () => {
// 	const existing = document.getElementById('revornix-clipper-root');
// 	if (existing) return;

// 	const host = document.createElement('div');
// 	host.id = 'revornix-clipper-root';
// 	host.style.all = 'initial'; // 清空继承样式

// 	// Shadow DOM
// 	const shadow = host.attachShadow({ mode: 'open' });

// 	document.body.appendChild(host);

// 	// 创建 root 并渲染
// 	const root = ReactDOM.createRoot(shadow);
// 	root.render(<Clipper />);
// };

// mountClipper();