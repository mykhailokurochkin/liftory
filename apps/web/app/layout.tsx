import type { Metadata, Viewport } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Liftory — your workout journal',
  description: 'Train at your own pace. Log sets, save workout plans, and track your progress.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Liftory' },
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f4f3ed',
  viewportFit: 'cover',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-shell-version={process.env.NEXT_PUBLIC_LIFTORY_BUILD ?? 'development'}>
        {children}
      </body>
    </html>
  );
}
