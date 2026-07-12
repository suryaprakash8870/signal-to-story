import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import './globals.css';
import Shell from './components/Shell';

// Litera-style geometric sans. Exposed as a CSS variable (--font-poppins) that
// globals.css applies to the body.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata = {
  title: 'Compete Agent',
  description: 'A personal competitive agent for your sales and GTM teams — always watching, always ready.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
