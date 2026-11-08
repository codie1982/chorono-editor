import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { formatBytes } from '@/lib/format/formatBytes'
import { PaintResourcesSection } from './PaintResourcesSection'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Null remains unavailable, while a valid zero-duration sample remains a measured zero. */
function milliseconds(value: number | null): string { return value === null ? 'No samples' : `${value.toFixed(2)} ms` }

/** Shows measured application intervals and WebGL workload, distinct from OS/hardware utilization. */
export function ComputeResourcesSection({ snapshot: s }: { snapshot: ProjectResourceSnapshot }) {
  const { viewport, evaluation } = s.work
  return <>
    <PaintResourcesSection snapshot={s} />
    <h3>CPU / Main thread <span className={styles.badge}>Measured · time</span></h3>
    <MetricList rows={[
      ['Viewport renders / second', s.isPlaying ? viewport.recentPerSecond : 'Idle'],
      ['Viewport · last duration', milliseconds(viewport.lastMs)],
      ['Viewport · mean / p95', `${milliseconds(viewport.meanMs)} / ${milliseconds(viewport.p95Ms)}`],
      ['Evaluation · last duration', milliseconds(evaluation.lastMs)],
      ['Evaluation · mean / p95', `${milliseconds(evaluation.meanMs)} / ${milliseconds(evaluation.p95Ms)}`],
      ['Viewport · work in last second', milliseconds(viewport.measuredMsPerSecond)],
      ['Evaluation · work in last second', milliseconds(evaluation.measuredMsPerSecond)],
      ['Samples in last 5 s · render / evaluation', `${viewport.count} / ${evaluation.count}`],
    ]} />
    <p>Viewport rendering, including onion skin, and animation evaluation are timed separately. p95 uses the last 5 seconds, up to 120 samples. These are not presentation FPS or system CPU utilization; React, worker, and browser-paint time are excluded.</p>
    <h3 className={styles.subheading}>GPU / WebGL <span className={styles.badge}>Measured · workload</span></h3>
    {s.gpu.length === 0 && <p>No WebGL backend has been initialized yet. Canvas2D GPU use is managed by the browser.</p>}
    {s.gpu.map((g, index) => <div key={index} className={styles.scope}>
      <h3>{g.backend}</h3>
      <MetricList rows={[
        ['Context', g.cleanupFailed ? 'Cleanup failed · still charged' : g.contextLost ? 'Lost' : 'Ready'],
        [g.drawKind === 'effect' ? 'Total effect passes' : 'Total instanced draws', g.drawCalls],
        ...(g.drawKind === 'effect' ? [] : [['Instances in last draw', g.lastInstances]] as [string, number][]),
        ['Allocated buffers · estimated', formatBytes(g.bufferBytes)],
        ['Texture stores · RGBA8 estimate', g.textureBytes === undefined ? 'Not tracked' : formatBytes(g.textureBytes)],
        ['CPU staging buffers', formatBytes(g.stagingBytes)],
        ['GPU draw duration', g.gpuMs !== null ? milliseconds(g.gpuMs) : g.timerSupported ? 'Awaiting sample' : 'Timer unavailable'],
      ]} />
      <p>GPU timing uses the last valid asynchronous WebGL timer sample. Canvas2D compositing and other GPU passes are excluded. CPU time is never substituted for unavailable GPU timing.</p>
    </div>)}
    <MetricList rows={[
      ['System CPU / GPU utilization', 'Not exposed by browser'], ['Total GPU memory', 'Not exposed by browser'],
    ]} />
  </>
}
