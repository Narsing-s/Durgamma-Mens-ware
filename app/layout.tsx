import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://durgamma-menswear.vercel.app'),
  title: { default: 'Durgamma Menswear | Defined by Style', template: '%s | Durgamma Menswear' },
  description: 'Discover the Durgamma Menswear edit: considered shirts, tees, denim and everyday essentials. Modern fits, timeless confidence.',
  applicationName: 'Durgamma Menswear',
  keywords: ['Durgamma Menswear','menswear India','mens shirts','mens t-shirts','mens denim','everyday fashion'],
  openGraph: { type: 'website', title: 'Durgamma Menswear — Wear Your Own Story', description: 'Considered essentials. Confident fits. Made for your everyday.', siteName: 'Durgamma Menswear' },
  twitter: { card: 'summary_large_image', title: 'Durgamma Menswear', description: 'Wear your own story.' },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: '#171713', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
