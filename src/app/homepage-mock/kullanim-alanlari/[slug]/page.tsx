import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { mockRoot, samples, useCases } from '../../content'
import { SampleCard } from '../../components'
import { Icon } from '../../visuals'

export function generateStaticParams() { return useCases.map(use => ({ slug: use.slug })) }
export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const use = useCases.find(item => item.slug === params.slug)
  return { title: `${use?.title ?? 'Kullanım alanı'} için animasyon fikirleri`, description: use?.description }
}

export default function UseCasePage({ params }: { params: { slug: string } }) {
  const use = useCases.find(item => item.slug === params.slug)
  if (!use) notFound()
  const matches = samples.filter(sample => sample.category === use.category || (use.slug === 'hikaye-anlatimi' && sample.category === 'İnfografik'))
  return <main id="icerik" className="hm-container hm-use-detail"><nav className="hm-breadcrumb" aria-label="İçerik yolu"><Link href={mockRoot}>Ana sayfa</Link><span>/</span><Link href={`${mockRoot}#kullanim-alanlari`}>Kullanım alanları</Link><span>/</span><span aria-current="page">{use.title}</span></nav><span className="hm-eyebrow">HAREKETİ DOĞRU YERDE KULLAN</span><h1>{use.title} için<br />animasyon fikirleri.</h1><p>{use.description} Her örneği kullanım amacına göre değerlendir; hareketin mesajı ve kullanıcı akışını desteklemesini sağla.</p><h2>Bu alan için seçtiğimiz örnekler.</h2><div className="hm-sample-grid">{matches.map(sample => <SampleCard key={sample.slug} sample={sample} index={samples.indexOf(sample)} />)}</div><Link href={`${mockRoot}#ornekler`} className="hm-text-link">Tüm örneklere dön <Icon name="arrow" size={18} /></Link></main>
}
