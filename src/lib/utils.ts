import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function extractCoverImage(): string | undefined {
  const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (og) return og;

  const twitter = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
  if (twitter) return twitter;

  const imgs = Array.from(document.images || []);
  const biggest = imgs.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
  return biggest?.src;
}

export function extractPageDescription(): string | undefined {
  const desc = document.querySelector('meta[name="description"]')?.getAttribute('content');
  if (desc) return desc;

  const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
  if (ogDesc) return ogDesc;

  return;
}
