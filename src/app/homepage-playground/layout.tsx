import type { Metadata } from 'next'
import { PlaygroundShell } from './client'
import './playground.css'

export const metadata: Metadata = {
  title: { default: 'Chorono Playground — Fikirlerine alan aç', template: '%s | Chorono Playground' },
  description: 'Animasyon çalışmalarına göz at, hareketli tasarım fikirlerini keşfet ve Chorono ile düzenlenebilir 2D sahneler oluştur. Örnekler, rehberler ve yaratıcı deneyler.',
  robots: { index: false, follow: false },
}

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return <PlaygroundShell>{children}</PlaygroundShell>
}
