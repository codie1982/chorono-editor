import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { samples, stories, useCases } from '../../../homepage-mock/content'
import { Icon } from '../../../homepage-mock/visuals'
import { StudioArtwork } from '../../artwork'
import { StudyRow } from '../../studio-client'

const root = '/homepage-studio'
type Params = { collection: string; slug: string }

export function generateStaticParams() {
  return [
    ...samples.map(item => ({ collection: 'ornekler', slug: item.slug })),
    ...stories.map(item => ({ collection: 'rehberler', slug: item.slug })),
    ...useCases.map(item => ({ collection: 'kullanim-alanlari', slug: item.slug })),
  ]
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const content = params.collection === 'ornekler' ? samples.find(item => item.slug === params.slug) : params.collection === 'rehberler' ? stories.find(item => item.slug === params.slug) : params.collection === 'kullanim-alanlari' ? useCases.find(item => item.slug === params.slug) : undefined
  return { title: content?.title ?? 'İçerik bulunamadı', description: content?.description }
}

export default function StudioContentPage({ params }: { params: Params }) {
  const sample = params.collection === 'ornekler' ? samples.find(item => item.slug === params.slug) : undefined
  const story = params.collection === 'rehberler' ? stories.find(item => item.slug === params.slug) : undefined
  const use = params.collection === 'kullanim-alanlari' ? useCases.find(item => item.slug === params.slug) : undefined
  if (!sample && !story && !use) notFound()
  return <main id="cs-main" className="cs-shell cs-content"><nav className="cs-breadcrumb" aria-label="İçerik yolu"><Link href={root}>Studio</Link><span>/</span><Link href={`${root}#${sample ? 'arsiv' : story ? 'notlar' : 'akis'}`}>{sample ? 'Hareket arşivi' : story ? 'Studio notları' : 'Kullanım alanları'}</Link><span>/</span><span aria-current="page">{sample?.title ?? story?.category ?? use?.title}</span></nav>
    {sample && <><div className="cs-detail-grid"><div className="cs-detail-art">{sample.previewVideo ? <video controls playsInline loop src={sample.previewVideo} aria-label={sample.title} /> : <StudioArtwork kind={sample.kind} />}</div><div className="cs-detail-copy"><span className="cs-kicker">{sample.category} / GÖRSEL ÇALIŞMA</span><h1>{sample.title}</h1><p>{sample.description}</p><dl><div><dt>KULLANIM ALANI</dt><dd>{sample.use}</dd></div><div><dt>DÖNGÜ</dt><dd>{sample.duration}</dd></div></dl>{sample.projectUrl ? <a className="cs-button" href={sample.projectUrl} download>Projeyi indir <Icon name="arrow" size={18} /></a> : <a className="cs-button" href="/">Editörü aç <Icon name="arrow" size={18} /></a>}<p className="cs-content-notice">Tasarım mock’u için görsel önizleme. Gerçek Chorono projesi henüz bağlı değildir; editör mevcut yerel sahneni açar.</p></div></div><section className="cs-related"><h2>Arşivden devam et.</h2>{samples.filter(item => item.slug !== sample.slug).slice(0, 3).map(item => <StudyRow key={item.slug} sample={item} index={samples.indexOf(item)} />)}</section></>}
    {story && <article className="cs-article"><span className="cs-kicker">{story.category} / FIELD NOTES</span><h1>{story.title}</h1><p className="cs-article-lead">{story.description}</p><div className="cs-article-meta"><span>CHORONO STUDIO / ÖRNEK REHBER İÇERİĞİ</span><span>{story.time}</span></div><div className="cs-article-art"><StudioArtwork kind={story.kind} /></div>{story.sections.map(section => <section className="cs-article-section" key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}<Link className="cs-line-link" href={`${root}#arsiv`}>Bir çalışmayla dene <Icon name="arrow" size={18} /></Link></article>}
    {use && <section className="cs-use-detail"><span className="cs-kicker">HAREKETİ DOĞRU YERDE KULLAN</span><h1>{use.title} için<br />animasyon fikirleri.</h1><p>{use.description} Her hareketi kullanıcının ihtiyacına ve anlatmak istediğin mesaja göre değerlendir.</p><h2>Bu alan için seçtiğimiz çalışmalar.</h2>{samples.filter(item => item.category === use.category || (use.slug === 'hikaye-anlatimi' && item.category === 'İnfografik')).map(item => <StudyRow key={item.slug} sample={item} index={samples.indexOf(item)} />)}<Link className="cs-line-link" href={`${root}#arsiv`}>Tüm arşive dön <Icon name="arrow" size={18} /></Link></section>}
  </main>
}
