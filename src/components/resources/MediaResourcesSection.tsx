import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import type { MediaQuery } from '@/lib/resources/monitor/mediaResources'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

const stateLabels = { ready: 'Hazır', loading: 'Yükleniyor', error: 'Hata', untracked: 'Durum izlenmiyor' }

/** Paged media inventory includes readiness/error and decoded size, never exposes source URLs or changes playback. */
export function MediaResourcesSection({ snapshot: s, query, onQuery }: {
  snapshot: ProjectResourceSnapshot; query: MediaQuery; onQuery: (query: MediaQuery) => void
}) {
  const m = s.media
  return <>
    <h3>Medya kaynakları <span className={styles.badge}>Ölçülen · adet</span></h3>
    <MetricList rows={[
      ['Toplam / hazır', `${m.total} / ${m.ready}`], ['Yükleniyor / hata', `${m.loading} / ${m.errors}`],
      ['Durumu izlenmeyen', m.untracked], ['Görüntü / video', `${m.images} / ${m.videos}`],
      ['Oynayan video', m.playingVideos],
      ['Kaynak dosyalar · metadata', formatBytes(m.sourceBytes)], ['Boyutu bilinmeyen kaynak', m.unknownSourceSizes],
      ['Çözülmüş ses · Float32', formatBytes(s.audio.bytes)], ['Bekleyen ses decode', s.audio.pendingCount],
    ]} />
    <p>Dosya boyutu decoded bellek değildir. Video tahmini bir kareyi kapsar; decoder, ağ tamponu ve GPU kopyaları dahil değildir. Ses önbelleği editör oturumu boyunca paylaşılır.</p>
    <label className={styles.search}>Kaynaklarda ara
      <input type="search" value={query.search} onChange={event => onQuery({ page: 0, search: event.target.value })} />
    </label>
    <ul className={styles.mediaList}>
      {m.rows.map(row => <li key={row.id}>
        <strong>{row.name}</strong>
        <span>{row.type} · {stateLabels[row.state]}</span>
        <span>{row.bytes === null ? 'Bellek boyutu bilinmiyor' : `${formatBytes(row.bytes)} · decoded tahmini`}</span>
      </li>)}
    </ul>
    {m.filteredCount === 0 && <p>{m.total === 0 ? 'Projede medya kaynağı yok.' : 'Aramayla eşleşen kaynak yok.'}</p>}
    <div className={styles.pagination}>
      <button type="button" disabled={m.page === 0} onClick={() => onQuery({ ...query, page: m.page - 1 })}>Önceki</button>
      <span>{m.page + 1} / {m.pages} · {m.filteredCount} kaynak</span>
      <button type="button" disabled={m.page + 1 >= m.pages} onClick={() => onQuery({ ...query, page: m.page + 1 })}>Sonraki</button>
    </div>
  </>
}
