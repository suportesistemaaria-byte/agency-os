import type { ReactNode } from 'react';

export const metadata = { title: 'Agency OS', robots: { index: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#1a1a18', background: '#fff' }}>{children}</body>
    </html>
  );
}
