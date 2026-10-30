import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Durgamma Menswear',
    short_name: 'Durgamma',
    description: 'Considered menswear essentials. Wear your own story.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbfaf7',
    theme_color: '#171713',
    orientation: 'portrait-primary',
    categories: ['shopping', 'lifestyle'],
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
