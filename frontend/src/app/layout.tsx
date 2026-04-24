import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Fraunces } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

// Fraunces - Display/headline font (editorial warmth)
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

// JetBrains Mono - Line gutter numbers + artifact type badges (Phase 85, weight 600)
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: {
    default: 'Pilot Space',
    template: '%s | Pilot Space',
  },
  description: 'AI-Augmented SDLC Platform with Note-First Workflow',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#191919' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
