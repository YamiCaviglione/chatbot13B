import type { Metadata } from 'next';
//import './globals.css';

export const metadata: Metadata = {
  title: 'AI Todo Manager',
  description: 'Gestor de tareas inteligente con interfaz conversacional',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
