import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Durgamma Menswear | Modern Essentials, Timeless Style', description: 'Discover refined menswear at Durgamma Menswear — shirts, tees, denim and more.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
