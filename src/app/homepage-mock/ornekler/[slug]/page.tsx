import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { mockRoot, samples } from '../../content'
import { SampleCard } from '../../components'
import { Icon, SampleArt } from '../../visuals'

export function generateStaticParams() { return samples.map(sample => ({ slug: sample.slug })) }
export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const sample = samples.find(item => item.slug === params.slug)
  return { title: sample?.title ?? 'Örnek bulunamadı', description: sample?.description }
}

export default function SamplePage({ params }: { params: { slug: string } }) {
  const sample = samples.find(item => item.slug === params.slug)
  if (!sample) notFound()
  const related = samples.filter(item => item.slug !== sample.slug).sort((a, b) => Number(b.category === sample.category) - Number(a.category === sample.category)).slice(0, 3)
  return <main id="icerik" className="hm-container hm-detail"><nav className="hm-breadcrumb" aria-label="İçerik yolu"><Link href={mockRoot}>Ana sayfa</Link><span>/</span><Link href={`${mockRoot}#ornekler`}>Animasyon örnekleri</Link><span>/</span><span aria-current="page">{sample.title}</span></nav><div className="hm-detail-grid"><div className={`hm-detail-visual hm-tone-${sample.tone}`}>{sample.previewVideo ? <video className="hm-art-video" src={sample.previewVideo} controls loop playsInline aria-label={sample.title} /> : <SampleArt kind={sample.kind} />}</div><div className="hm-detail-copy"><span className="hm-eyebrow">{sample.category} · ANİMASYON FİKRİ</span><h1>{sample.title}</h1><p>{sample.description}</p><dl><div><dt>KULLANIM ALANI</dt><dd>{sample.use}</dd></div><div><dt>ÖNİZLEME DÖNGÜSÜ</dt><dd>{sample.duration}</dd></div></dl>{sample.projectUrl ? <a className="hm-button hm-button-dark" href={sample.projectUrl} download>Proje dosyasını indir <Icon name="arrow" size={18} /></a> : <a className="hm-button hm-button-dark" href="/">Editörü aç <Icon name="arrow" size={18} /></a>}<p className="hm-detail-notice">Bu örnek, tasarım mock’u için hazırlanmış bir görsel önizlemedir. Chorono proje dosyası henüz bağlı değildir; editör mevcut yerel sahneni açar.</p></div></div><section className="hm-detail-related" aria-labelledby="related-heading"><h2 id="related-heading">Biraz daha ilham.</h2><div className="hm-sample-grid">{related.map(item => <SampleCard key={item.slug} sample={item} index={samples.indexOf(item)} />)}</div></section></main>
}
