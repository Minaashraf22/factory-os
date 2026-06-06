import './globals.css';
import type { Metadata } from 'next';
import { Inter, Cairo } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { I18nProvider } from '@/lib/i18n';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo' });

export const metadata: Metadata = {
  title: 'FactoryOS — Shoe Factory ERP',
  description: 'Industrial-grade manufacturing ERP for shoe production management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body className={`${inter.variable} ${cairo.variable} font-sans`}
        style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}>
        <I18nProvider>
          {children}
        </I18nProvider>
        <Toaster position="top-right" theme="dark" richColors />
      </body>
    </html>
  );
}
