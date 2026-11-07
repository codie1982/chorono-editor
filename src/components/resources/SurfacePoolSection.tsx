import type { CanvasSurfacePoolSnapshot } from '@/lib/render/resources/CanvasSurfacePool'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Shared host/effect/mask scratch counters with safe idle-only cleanup; no second resource collector. */
export function SurfacePoolSection({ snapshot: s, onClearIdle }: { snapshot: CanvasSurfacePoolSnapshot; onClearIdle: () => void }) {
  const percent = s.maxBytes > 0 ? Math.min(100, s.residentBytes / s.maxBytes * 100) : 0
  return <>
    <div className={styles.scope}>
      <h3>Maske ve efekt tamponları</h3><span className={styles.badge}>Tahmini · RGBA8</span>
      <p>Katman içeriği, yerleşik efektler ve maskeler için ortak havuz. Canvas2D toplamının alt kümesi; ikinci kez eklenmez.</p>
    </div>
    <div className={styles.budget}>
      <div className={styles.budgetHeading}><span>Havuz rezervasyonu</span><strong>{formatBytes(s.residentBytes)}</strong></div>
      <progress max={100} value={percent} aria-label="Geçici tampon havuzu bütçe kullanımı"
        aria-valuetext={`${formatBytes(s.residentBytes)} / ${formatBytes(s.maxBytes)}`} />
      <div className={styles.budgetCaption}><span>Bütçe: {formatBytes(s.maxBytes)}</span><span>{percent.toFixed(1)}%</span></div>
    </div>
    <MetricList rows={[
      ['Aktif', `${formatBytes(s.activeBytes)} · ${s.activeSurfaces} yüzey`],
      ['Boş / tekrar kullanılabilir', `${formatBytes(s.idleBytes)} · ${s.idleSurfaces} yüzey`],
      ['Tepe rezervasyon', formatBytes(s.peakResidentBytes)],
      ['Tahsis', s.allocations], ['Yeniden kullanım', s.reuses], ['Bırakılan yüzey', s.evictions], ['Bütçe nedeniyle ret', s.budgetDenials],
    ]} />
    <button type="button" className={styles.cleanup} onClick={onClearIdle}>Boş yüzeyleri bırak</button>
    <p>Aktif yüzeyler korunur. Boş yüzeyler normalde 2 saniyede bırakılır. Sayaçlar bu sayfa açıldığından beri; kaynak: CanvasSurfacePool.getSnapshot().</p>
  </>
}
