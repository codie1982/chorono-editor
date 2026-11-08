import type { Metadata } from 'next'
import { Header, Footer, MotionCanvas } from './components'
import './homepage.css'

export const metadata: Metadata = {
  title: { default: 'Chorono — Fikirlerine hareket kat', template: '%s | Chorono' },
  description: '2D animasyon örneklerini keşfet. Arayüz hareketleri, kinetik tipografi ve yaratıcı sahnelerden ilham al; Chorono ile düzenlenebilir animasyonlar oluştur.',
  robots: { index: false, follow: false },
}

export default function HomepageMockLayout({ children }: { children: React.ReactNode }) {
  return <div className="hm-site"><a className="hm-skip-link" href="#icerik">İçeriğe geç</a><Header /><MotionCanvas>{children}</MotionCanvas><Footer /></div>
}
