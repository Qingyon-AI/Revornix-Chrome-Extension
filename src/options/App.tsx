import ReactDOM from 'react-dom/client';
import RootLayout from './layout';
import ConfigForm from './config-form';

export function App() {
	
	return (
		<RootLayout>
			<ConfigForm />
		</RootLayout>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
