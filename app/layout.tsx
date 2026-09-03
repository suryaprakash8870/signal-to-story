import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import Shell from './components/Shell';

// Product and body font, per reference/design/design/design-system.md section 2.
// The design system names 'Inter Custom' first, which is a licensed variant we
// do not have; standard Inter is the documented fallback and is what the spec's
// own stack falls through to.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

// Optional serif display face. Only Regular (400) and Medium (500) are declared:
// the design system is explicit that heavier weights must never be requested,
// because the family has none and the browser fakes them.
const tripsis = localFont({
  src: [
    { path: './fonts/TripsisL-Regular.otf', weight: '400', style: 'normal' },
    { path: './fonts/TripsisL-Italic.otf', weight: '400', style: 'italic' },
    { path: './fonts/TripsisL-Medium.otf', weight: '500', style: 'normal' },
    { path: './fonts/TripsisL-MediumItalic.otf', weight: '500', style: 'italic' },
  ],
  variable: '--font-tripsis',
  display: 'swap',
});

export const metadata = {
  title: 'Compete Agent',
  description: 'A personal competitive agent for your sales and GTM teams - always watching, always ready.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${tripsis.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
