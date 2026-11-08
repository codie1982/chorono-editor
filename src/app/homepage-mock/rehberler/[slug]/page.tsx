import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { mockRoot, stories } from '../../content'
import { Icon, SampleArt } from '../../visuals'

export function generateStaticParams() { return stories.map(story => ({ slug: story.slug })) }
export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const story = stories.find(item => item.slug === params.slug)
  return { title: story?.title ?? 'Rehber bulunamadı', description: story?.description }
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const story = stories.find(item => item.slug === params.slug)
  if (!story) notFound()
  return <main id="icerik" className="hm-container hm-article"><nav className="hm-breadcrumb" aria-label="İçerik yolu"><Link href={mockRoot}>Ana sayfa</Link><span>/</span><Link href={`${mockRoot}#rehberler`}>Rehberler</Link></nav><article><header className="hm-article-header"><span className="hm-eyebrow">{story.category}</span><h1>{story.title}</h1><p>{story.description}</p><div className="hm-article-meta"><span>Chorono · Örnek rehber içeriği</span><span>{story.time}</span></div></header><div className={`hm-article-cover hm-tone-${story.tone}`}><SampleArt kind={story.kind} /></div><div className="hm-article-body">{story.sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}</div><aside className="hm-article-end"><h2>Bir örnekle denemeye başla.</h2><Link href={`${mockRoot}#ornekler`} className="hm-text-link">Animasyon fikirlerini keşfet <Icon name="arrow" size={18} /></Link><br /><a href="https://www.chorono.com/getting-started" className="hm-text-link">Chorono kurulum rehberi <Icon name="arrow" size={18} /></a></aside></article></main>
}
