import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Latest main viewport frame, with unique layers separated from traversal work.
 * Failed/absent samples are explicit. The panel's existing pause/sampling policy
 * owns refresh; this component introduces no renderer calls or timers. */
export function PaintResourcesSection({ snapshot: s }: { snapshot: ProjectResourceSnapshot }) {
  const p = s.paint
  return <>
    <h3>Layer rendering <span className={styles.badge}>Last viewport frame</span></h3>
    {p ? <>
      <MetricList rows={[
        ['Total layers', p.total], ['Submitted layers', p.processed],
        ['Culled layers', p.culled], ['Layers represented by LOD', p.lodRepresented ?? 0],
        ['LOD groups / new previews', `${p.lodGroups ?? 0} / ${p.lodBuilds ?? 0}`],
        ['Layers rasterized for LOD', p.lodRasterizedLayers ?? 0], ['Unvisited layers', p.unvisited],
        ['Layer visits / culled visits', `${p.visits} / ${p.culledVisits}`],
        ['Frame status', p.completed ? 'Complete' : 'Interrupted · partial counters'],
      ]} />
      <p>Submitted layers are unique layers sent for drawing, including groups and mask sources. Culled layers are skipped when safely offscreen or fully transparent. A source with a visible copy is still counted as submitted.</p>
      <p>Unvisited layers include hidden, inactive, filtered, and helper layers. LOD replaces child drawing with a cached preview while preserving source data. Repeated copies increase visits. These are not GPU draw calls; onion-skin frames are excluded.</p>
    </> : <p>No viewport frame has been recorded for this project yet.</p>}
  </>
}
