import ReactDOM from 'react-dom/client';
import './index.css';
import { Button } from '@/components/ui/button';
import { Session } from 'revornix';
import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';

export function App() {
	const formSchema = z.object({
		url: z.url(),
		sections: z.array(z.number()),
		auto_summary: z.boolean(),
	});
	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			url: '',
			sections: [],
			auto_summary: false,
		},
	});
	const handleSubmit = async (data: z.infer<typeof formSchema>) => {
		console.log(data);
		// const session = new Session(
		// 	'',
		// 	''
		// );
		// const res = await session.createWebsiteDocument({
		// 	url: 'https://kinda.info',
		// 	sections: [],
		// 	auto_summary: false,
		// });
		// console.log(res);
	};
	return (
		<div className='p-5'>
			<h1 className='font-bold text-3xl whitespace-nowrap mb-5'>
				Revornix Chrome Extension
			</h1>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(handleSubmit)}
					className='space-y-5 mb-5'
					id='add-form'>
					<FormField
						name='url'
						control={form.control}
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel>URL</FormLabel>
									<Input {...field} />
									<FormMessage />
								</FormItem>
							);
						}}
					/>
				</form>
			</Form>
			<Button type='submit' form='add-form'>
				Save
			</Button>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
