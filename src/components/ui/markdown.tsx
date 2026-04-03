import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

export function Markdown({
	content,
	className,
}: {
	content: string;
	className?: string;
}) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				p: ({ className: localClassName, ...props }) => (
					<p className={cn('mb-3 last:mb-0', localClassName)} {...props} />
				),
				ul: ({ className: localClassName, ...props }) => (
					<ul className={cn('mb-3 ml-5 list-disc space-y-1 last:mb-0', localClassName)} {...props} />
				),
				ol: ({ className: localClassName, ...props }) => (
					<ol className={cn('mb-3 ml-5 list-decimal space-y-1 last:mb-0', localClassName)} {...props} />
				),
				li: ({ className: localClassName, ...props }) => (
					<li className={cn('pl-1', localClassName)} {...props} />
				),
				blockquote: ({ className: localClassName, ...props }) => (
					<blockquote
						className={cn(
							'mb-3 border-l-2 border-white/15 pl-4 text-white/72 italic last:mb-0',
							localClassName
						)}
						{...props}
					/>
				),
				a: ({ className: localClassName, ...props }) => (
					<a
						className={cn('text-sky-200 underline underline-offset-4', localClassName)}
						target="_blank"
						rel="noreferrer"
						{...props}
					/>
				),
				code: ({ className: localClassName, children, ...props }) => {
					const isBlock = Boolean(localClassName?.includes('language-'));
					if (isBlock) {
						return (
							<code
								className={cn(
									'block overflow-x-auto rounded-xl bg-black/35 px-3 py-2 text-[12px] leading-6 text-white/92',
									localClassName
								)}
								{...props}>
								{children}
							</code>
						);
					}

					return (
						<code
							className={cn(
								'rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[12px] text-white/92',
								localClassName
							)}
							{...props}>
							{children}
						</code>
					);
				},
				pre: ({ className: localClassName, ...props }) => (
					<pre
						className={cn(
							'mb-3 overflow-x-auto rounded-xl bg-black/35 p-0 text-[12px] leading-6 text-white/92 last:mb-0',
							localClassName
						)}
						{...props}
					/>
				),
				h1: ({ className: localClassName, ...props }) => (
					<h1 className={cn('mb-3 text-lg font-semibold text-white last:mb-0', localClassName)} {...props} />
				),
				h2: ({ className: localClassName, ...props }) => (
					<h2 className={cn('mb-3 text-base font-semibold text-white last:mb-0', localClassName)} {...props} />
				),
				h3: ({ className: localClassName, ...props }) => (
					<h3 className={cn('mb-2 text-sm font-semibold text-white last:mb-0', localClassName)} {...props} />
				),
				hr: ({ className: localClassName, ...props }) => (
					<hr className={cn('my-4 border-white/10', localClassName)} {...props} />
				),
				table: ({ className: localClassName, ...props }) => (
					<div className="mb-3 overflow-x-auto last:mb-0">
						<table className={cn('w-full border-collapse text-left text-sm', localClassName)} {...props} />
					</div>
				),
				th: ({ className: localClassName, ...props }) => (
					<th className={cn('border border-white/10 bg-white/[0.06] px-3 py-2 font-medium text-white', localClassName)} {...props} />
				),
				td: ({ className: localClassName, ...props }) => (
					<td className={cn('border border-white/10 px-3 py-2 text-white/82', localClassName)} {...props} />
				),
			}}
			className={cn('text-sm leading-6 text-white/88', className)}>
			{content}
		</ReactMarkdown>
	);
}
