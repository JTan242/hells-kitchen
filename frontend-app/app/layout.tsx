import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Recipe Manager',
  description: 'Browse, search and scale recipes with calculated nutrition.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        <header className="site-header">
          <div className="inner">
            <h1>
              <Link href="/recipes">Recipe Manager</Link>
            </h1>
            <span>Search, filter and scale</span>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
