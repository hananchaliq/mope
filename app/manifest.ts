import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'MoneyScope — Personal Finance & Nutrition Intelligence',
    short_name: 'MoneyScope',
    description:
      'Aplikasi pelacak keuangan pribadi Rupiah, analitik pengeluaran, estimasi nutrisi foto makanan berbasis TKPI/USDA, dan laporan terjadwal Telegram/WhatsApp.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'id',
    background_color: '#090D16',
    theme_color: '#10B981',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
