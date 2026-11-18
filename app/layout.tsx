import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0A0D12',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'MoneyScope — AI-Powered Personal Finance & Nutrition Intelligence Platform',
  description:
    'PWA personal finance untuk Android, iOS, dan desktop dengan analisis nutrisi dari foto makanan berbasis TKPI Kemenkes RI & USDA serta laporan otomatis via Telegram dan WhatsApp.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MoneyScope',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'MoneyScope — AI-Powered Personal Finance & Nutrition Intelligence Platform',
    description:
      'PWA personal finance untuk Android, iOS, dan desktop dengan analisis nutrisi dari foto makanan berbasis TKPI Kemenkes RI & USDA serta laporan otomatis via Telegram dan WhatsApp.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MoneyScope — AI-Powered Personal Finance & Nutrition Intelligence Platform',
    description:
      'PWA personal finance untuk Android, iOS, dan desktop dengan analisis nutrisi dari foto makanan berbasis TKPI Kemenkes RI & USDA serta laporan otomatis via Telegram dan WhatsApp.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

