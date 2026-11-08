'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { categories, samples, type Sample } from '../homepage-mock/content'
import { Icon } from '../homepage-mock/visuals'
import { StudioArtwork } from './artwork'

export const studioRoot = '/homepage-studio'

export function StudioHeader() {
  const [open, setOpen] = useState(false)
  return <header className="cs-header"><div className="cs-shell cs-header-inner"><Link className="cs-wordmark" href={studioRoot} aria-label="Chorono Studio ana sayfa"><span className="cs-brand-symbol">c</span>CHORONO<span className="cs-brand-sub">MOTION<br />STUDIO</span></Link><nav className={open ? 'cs-nav cs-nav-open' : 'cs-nav'} aria-label="Ana menü" onClick={() => setOpen(false)}><Link href={`${studioRoot}#arsiv`}>Örnek arşivi</Link><Link href={`${studioRoot}#akis`}>Üretim akışı</Link><Link href={`${studioRoot}#notlar`}>Studio notları</Link></nav><div className="cs-header-end"><a href="https://github.com/codie1982/chorono-editor" className="cs-source-link"><span /> Açık kaynak</a><a href="/" className="cs-button cs-button-small">Editörü aç <Icon name="arrow" size={15} /></a><button className="cs-menu" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button></div></div></header>
}

export function Workbench() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const showcase = [samples[0], samples[2], samples[4]]
  const sample = showcase[active]
  const stageNames = ['FORM / Yörünge', 'TYPE / Ritmik başlık', 'DATA / Akış çizgisi']
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? true), { threshold: .05 })
    const element = stageRef.current
    if (element) observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={stageRef} className="cs-workbench" data-paused={paused || !visible}>
    <div className="cs-workbench-top"><div><span className="cs-live-dot" /><span>CANVAS / 0{active + 1}</span><span className="cs-stage-file">{sample.slug}.study</span></div><span className="cs-stage-demo">ETKİLEŞİMLİ TASARIM DEMOSU</span><button onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Sahneyi oynat' : 'Sahneyi durdur'}><Icon name={paused ? 'play' : 'pause'} size={14} /><span>{paused ? 'Oynat' : 'Durdur'}</span></button></div>
    <div className="cs-stage" key={sample.slug}><div className="cs-stage-cross cs-cross-one" /><div className="cs-stage-cross cs-cross-two" /><div className="cs-stage-coordinate"><span>× 0480</span><span>y 0270</span></div><div className="cs-stage-side">CHORONO EXPERIMENTS — VOL. 01</div><StudioArtwork kind={sample.kind} /><div className="cs-stage-caption"><span className="cs-mono">STUDY 0{active + 1} / {sample.category.toLocaleUpperCase('tr')}</span><h2>{['Biçimin bir sonraki hâli.', 'Kelimelere alan aç.', 'Değişimi görünür kıl.'][active]}</h2></div><Link className="cs-stage-detail" href={`${studioRoot}/ornekler/${sample.slug}`} aria-label={`${sample.title} detayını aç`}><Icon name="arrow" size={23} /></Link><div className="cs-stage-scale"><i /><i /><i /><i /><i /><span>100%</span></div></div>
    <div className="cs-timeline"><div className="cs-timeline-label"><Icon name="layers" size={16} /><span>SCENE<br />SELECTOR</span></div><div className="cs-timeline-tracks" role="group" aria-label="Sahne seçimi">{showcase.map((item, i) => <button key={item.slug} onClick={() => setActive(i)} aria-pressed={active === i} className={active === i ? 'cs-track cs-track-active' : 'cs-track'}><span className="cs-track-ticks"><i /><i /><i /><i /><i /></span><span><b>0{i + 1}</b>{stageNames[i]}<span className="cs-track-diamond" /></span></button>)}</div><span className="cs-timeline-duration">3 SCENES<br /><b>∞ IDEAS</b></span></div>
    <p className="cs-sr" role="status" aria-atomic="true">Seçili sahne: {sample.title}.</p>
  </div>
}

export function StudyRow({ sample, index }: { sample: Sample; index: number }) {
  return <Link href={`${studioRoot}/ornekler/${sample.slug}`} className="cs-study-row"><span className="cs-study-index">{String(index + 1).padStart(2, '0')}</span><div className="cs-study-thumb"><StudioArtwork kind={sample.kind} /></div><div className="cs-study-title"><h3>{sample.title}</h3><span>{sample.category} / Görsel çalışma</span></div><span className="cs-study-duration">{sample.duration}<small>DÖNGÜ</small></span><span className="cs-study-arrow"><Icon name="arrow" size={21} /></span></Link>
}

export function StudyIndex() {
  const [category, setCategory] = useState('Tümü')
  const [query, setQuery] = useState('')
  const filtered = samples.filter(sample => (category === 'Tümü' || category === sample.category) && `${sample.title} ${sample.description} ${sample.category}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
  return <section className="cs-index cs-shell" id="arsiv" aria-labelledby="cs-index-heading"><div className="cs-section-heading"><span className="cs-section-code">01 / THE MOTION INDEX</span><h2 id="cs-index-heading">Hareket arşivi<span>({String(samples.length).padStart(2, '0')})</span></h2><p>Bir sonuçtan fazlası.<br />Üzerine düşünebileceğin bir başlangıç.</p></div><div className="cs-index-layout"><aside className="cs-index-sidebar"><label className="cs-search"><Icon name="search" size={17} /><span className="cs-sr">Örneklerde ara</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Bir hareket ara…" /></label><span className="cs-mono cs-index-label">ÇALIŞMA ALANI</span><div className="cs-category-list" role="group" aria-label="Çalışma kategorileri">{categories.map((item, i) => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={category === item ? 'cs-category-active' : ''}><span>{item}</span><span>{i === 0 ? '08' : String(samples.filter(sample => sample.category === item).length).padStart(2, '0')}</span></button>)}</div><div className="cs-index-note"><Icon name="layers" size={22} /><p>Bir hareketi anlamanın<br />en iyi yolu, onu kurcalamak.</p><a href="/">Editörü aç <Icon name="arrow" size={14} /></a></div></aside><div><div className="cs-index-table-head"><span>ÇALIŞMA / İSİM</span><span>SÜRE</span></div><p className="cs-sr" role="status" aria-atomic="true">{filtered.length} çalışma gösteriliyor.</p><div className="cs-study-list">{filtered.map(sample => <StudyRow key={sample.slug} sample={sample} index={samples.indexOf(sample)} />)}</div>{!filtered.length && <div className="cs-empty"><h3>Bu hareket henüz arşivde yok.</h3><p>Başka bir kelime dene.</p><button className="cs-button" onClick={() => {setCategory('Tümü');setQuery('')}}>Aramayı temizle <Icon name="arrow" size={17} /></button></div>}</div></div></section>
}
