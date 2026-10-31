import type { Metadata } from 'next';
import TrackOrder from './TrackOrder';

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Securely check the status of your Durgamma Menswear order.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function TrackOrderPage() {
  return <TrackOrder />;
}
