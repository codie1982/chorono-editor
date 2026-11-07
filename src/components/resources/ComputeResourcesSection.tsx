import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Null remains unavailable, while a valid zero-duration sample remains a measured zero. */
function milliseconds(value: number | null): string { return value === null ? 'Örnek yok' : `${value.toFixed(2)} ms` }

/** Shows measured application intervals and WebGL workload, distinct from OS/hardware utilization. */
export function ComputeResourcesSection({ snapshot: s }: { snapshot: ProjectResourceSnapshot }) {
  const { viewport, evaluation } = s.work
  return <>
    <h3>CPU / ana iş parçacığı <span className={styles.badge}>Ölçülen · süre</span></h3>
    <MetricList rows={[
      ['Viewport çizim/sn', s.isPlaying ? viewport.recentPerSecond : 'Beklemede'],
      ['Viewport · son süre', milliseconds(viewport.lastMs)],
      ['Viewport · ortalama / p95', `${milliseconds(viewport.meanMs)} / ${milliseconds(viewport.p95Ms)}`],
      ['Değerlendirme · son süre', milliseconds(evaluation.lastMs)],
      ['Değerlendirme · ortalama / p95', `${milliseconds(evaluation.meanMs)} / ${milliseconds(evaluation.p95Ms)}`],
      ['Viewport · son 1 sn toplamı', milliseconds(viewport.measuredMsPerSecond)],
      ['Değerlendirme · son 1 sn toplamı', milliseconds(evaluation.measuredMsPerSecond)],
      ['Son 5 sn örnek · çizim / değerlendirme', `${viewport.count} / ${evaluation.count}`],
    ]} />
    <p>performance.now: viewport çizimi (ghost dahil) ve animasyon değerlendirmesi ayrı ölçülür. p95 son 5 saniye / en fazla 120 örnek. Render/sunum FPS’i ve sistem CPU yüzdesi değildir; React, worker ve browser paint süreleri dışarıdadır.</p>
    <h3 className={styles.subheading}>GPU / WebGL <span className={styles.badge}>Ölçülen · iş yükü</span></h3>
    {s.gpu.length === 0 && <p>WebGL parçacık backend’i henüz çalışmadı. Canvas2D’nin GPU kullanımı tarayıcı tarafından yönetilir.</p>}
    {s.gpu.map((g, index) => <div key={index} className={styles.scope}>
      <h3>{g.backend}</h3>
      <MetricList rows={[
        ['Context', g.contextLost ? 'Kaybedildi' : 'Hazır'], ['Toplam instanced draw', g.drawCalls],
        ['Son draw · instance', g.lastInstances], ['Ayrılan buffer · tahmini', formatBytes(g.bufferBytes)],
        ['CPU staging buffer', formatBytes(g.stagingBytes)],
        ['GPU draw süresi', g.gpuMs !== null ? milliseconds(g.gpuMs) : g.timerSupported ? 'Örnek bekleniyor' : 'Timer desteklenmiyor'],
      ]} />
      <p>EXT_disjoint_timer_query_webgl2: son geçerli draw örneği. Asenkron ölçüm; Canvas2D birleşimi ve diğer GPU pass’leri dahil değil. Destek yoksa CPU süresi GPU süresi olarak gösterilmez.</p>
    </div>)}
    <MetricList rows={[
      ['Sistem CPU / GPU yüzdesi', 'Tarayıcı sağlamıyor'], ['Toplam GPU belleği', 'Tarayıcı sağlamıyor'],
    ]} />
  </>
}
