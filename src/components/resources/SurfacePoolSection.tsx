import type { CanvasSurfacePoolSnapshot } from '@/lib/render/resources/CanvasSurfacePool'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Shared host/effect/mask scratch counters with safe idle-only cleanup; no second resource collector. */
export function SurfacePoolSection({ snapshot: s, onClearIdle }: { snapshot: CanvasSurfacePoolSnapshot; onClearIdle: () => void }) {
  const percent = s.maxBytes > 0 ? Math.min(100, s.residentBytes / s.maxBytes * 100) : 0
  return <>
    <div className={styles.scope}>
      <h3>Mask and effect surfaces</h3><span className={styles.badge}>Estimated · RGBA8</span>
      <p>Shared scratch surfaces for layer content, built-in effects, and masks. Already included in Canvas2D memory; not counted twice.</p>
    </div>
    <div className={styles.budget}>
      <div className={styles.budgetHeading}><span>Pool reservation</span><strong>{formatBytes(s.residentBytes)}</strong></div>
      <progress max={100} value={percent} aria-label="Scratch surface pool budget usage"
        aria-valuetext={`${formatBytes(s.residentBytes)} / ${formatBytes(s.maxBytes)}`} />
      <div className={styles.budgetCaption}><span>Budget: {formatBytes(s.maxBytes)}</span><span>{percent.toFixed(1)}%</span></div>
    </div>
    <MetricList rows={[
      ['Active', `${formatBytes(s.activeBytes)} · ${s.activeSurfaces} surfaces`],
      ['Idle / reusable', `${formatBytes(s.idleBytes)} · ${s.idleSurfaces} surfaces`],
      ['Peak reservation', formatBytes(s.peakResidentBytes)],
      ['Allocations', s.allocations], ['Reuses', s.reuses], ['Evicted surfaces', s.evictions], ['Budget denials', s.budgetDenials],
    ]} />
    <button type="button" className={styles.cleanup} onClick={onClearIdle}>Release unused resources</button>
    <p>Active surfaces are preserved. Idle surfaces normally expire after 2 seconds. Counters accumulate for this page session.</p>
  </>
}
