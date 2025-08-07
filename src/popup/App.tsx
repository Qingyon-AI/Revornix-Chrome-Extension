import ReactDOM from 'react-dom/client';
import CreateDocument from './create-document';
import RootLayout from './layout';

export function App() {
	return (
		<RootLayout>
			<CreateDocument />
		</RootLayout>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
