import type { ReactNode } from 'react';
import './globals.css';
import Shell from './components/Shell';

export const metadata = {
  title: 'Signal-to-Story Engine',
  description: 'Competitive intelligence, from raw signal to audience-ready content.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
