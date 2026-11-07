import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { samples, stories, useCases } from '../../../homepage-mock/content'
import { Icon } from '../../../homepage-mock/visuals'
import { PlaygroundArt } from '../../art'

const root = '/homepage-playground'
type Params = { collection: string; slug: string }
export function generateStaticParams() { return [...samples.map(item => ({ collection:'ornekler',slug:item.slug })),...stories.map(item => ({ collection:'rehberler',slug:item.slug })),...useCases.map(item => ({ collection:'kullanim-alanlari',slug:item.slug }))] }
export function generateMetadata({ params }: { params: Params }): Metadata {
  const item = params.collection === 'ornekler' ? samples.find(x => x.slug === params.slug) : params.collection === 'rehberler' ? stories.find(x => x.slug === params.slug) : params.collection === 'kullanim-alanlari' ? useCases.find(x => x.slug === params.slug) : undefined
  return { title:item?.title ?? 'İçerik bulunamadı',description:item?.description }
}
export default function PlaygroundContent({ params }: { params: Params }) {
  const sample=params.collection === 'ornekler' ? samples.find(x => x.slug === params.slug) : undefined
  const story=params.collection === 'rehberler' ? stories.find(x => x.slug === params.slug) : undefined
  const use=params.collection === 'kullanim-alanlari' ? useCases.find(x => x.slug === params.slug) : undefined
  if(!sample && !story && !use) notFound()
  return <main id="pg-main" className="pg-content pg-frame"><nav className="pg-breadcrumb" aria-label="İçerik yolu"><Link href={root}>Playground</Link><span>/</span><Link href={`${root}#${story?'oku':'koleksiyon'}`}>{story?'Okuma odası':'Çalışmalar'}</Link><span>/</span><span aria-current="page">{sample?.title ?? story?.category ?? use?.title}</span></nav>
    {sample && <><div className="pg-detail-grid"><div className={`pg-detail-art pg-work-${sample.kind}`}>{sample.previewVideo ? <video src={sample.previewVideo} controls playsInline loop aria-label={sample.title} /> : <PlaygroundArt kind={sample.kind} />}</div><div className="pg-detail-copy"><span className="pg-detail-kicker">{sample.category} / EXPERIMENT {String(samples.indexOf(sample)+1).padStart(2,'0')}</span><h1>{sample.title}</h1><p>{sample.description}</p><dl><div><dt>Kullanım alanı</dt><dd>{sample.use}</dd></div><div><dt>Döngü süresi</dt><dd>{sample.duration}</dd></div></dl>{sample.projectUrl ? <a className="pg-button pg-button-ink" href={sample.projectUrl} download>Projeyi indir <Icon name="arrow" size={18} /></a> : <a className="pg-button pg-button-ink" href="/">Editörü aç <Icon name="arrow" size={18} /></a>}<p className="pg-detail-notice">Görsel tasarım demosu. Gerçek Chorono proje dosyası henüz bağlı değildir; editör mevcut yerel sahneyi açar.</p></div></div><Link className="pg-back-link" href={`${root}#koleksiyon`}>Playground’a dön <Icon name="arrow" size={19} /></Link></>}
    {story && <article className="pg-article"><span className="pg-detail-kicker">CHORONO NOTES / {story.category}</span><h1>{story.title}</h1><p className="pg-article-lead">{story.description}</p><div className="pg-article-meta"><span>CHORONO / ÖRNEK REHBER İÇERİĞİ</span><span>{story.time}</span></div>{story.sections.map((section,i) => <section key={section.title}><span>0{i+1}</span><div><h2>{section.title}</h2><p>{section.text}</p></div></section>)}<Link className="pg-back-link" href={`${root}#koleksiyon`}>Bir çalışmayla dene <Icon name="arrow" size={19} /></Link></article>}
    {use && <section className="pg-use-detail"><span className="pg-detail-kicker">HAREKETE ALAN AÇ</span><h1>{use.title} için<br /><em>yeni bir bakış.</em></h1><p>{use.description} Hareketi mesajına ve kullanıcının ihtiyacına göre değerlendir.</p><h2>Bu alan için seçtiğimiz çalışmalar.</h2><div>{samples.filter(item => item.category===use.category || (use.slug==='hikaye-anlatimi' && item.category==='İnfografik')).map(item => <Link key={item.slug} className="pg-use-sample" href={`${root}/ornekler/${item.slug}`}><span>{item.category}</span><h3>{item.title}</h3><Icon name="arrow" size={23} /></Link>)}</div></section>}
  </main>
}
