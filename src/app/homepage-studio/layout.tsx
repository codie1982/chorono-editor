import type { Metadata } from 'next'
import Link from 'next/link'
import { StudioHeader } from './studio-client'
import { Icon } from '../homepage-mock/visuals'
import './studio.css'

export const metadata: Metadata = {
  title: { default: 'Chorono Studio — Hareketi sen yönet', template: '%s | Chorono Studio' },
  description: 'Chorono ile düzenlenebilir 2D animasyonları keşfet. Hareket çalışmalarını incele, yaratıcı süreci öğren ve kendi sahneni oluştur.',
  robots: { index: false, follow: false },
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <div className="cs-site"><a className="cs-skip" href="#cs-main">İçeriğe geç</a><StudioHeader />{children}<footer className="cs-footer cs-shell"><div className="cs-footer-top"><Link className="cs-wordmark" href="/homepage-studio"><span className="cs-brand-symbol">c</span>CHORONO</Link><p>Açık kaynak.<br />Açık olasılıklar.</p><div><a href="https://www.chorono.com/getting-started">Başlangıç rehberi <Icon name="arrow" size={14} /></a><a href="https://github.com/codie1982/chorono-editor">GitHub <Icon name="arrow" size={14} /></a><Link href="/homepage-mock">İlk tasarımla karşılaştır <Icon name="arrow" size={14} /></Link></div></div><div className="cs-footer-bottom"><span>© {new Date().getFullYear()} CHORONO</span><span>STUDIO DIRECTION / 02 — TASARIM ÖNİZLEMESİ</span><span>MADE TO BE EDITED.</span></div></footer></div>
}
