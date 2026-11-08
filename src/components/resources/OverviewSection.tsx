import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { formatBytes } from '@/lib/format/formatBytes'
import { PaintResourcesSection } from './PaintResourcesSection'
import { ManagedBudgetSection } from './ManagedBudgetSection'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Project-wide inventory plus separate owned-resource, heap and browser-page estimates. Never adds overlapping totals. */
export function OverviewSection({ snapshot: s, onSampleMemory }: { snapshot: ProjectResourceSnapshot; onSampleMemory: () => void }) {
  const { heap, page } = s.browser
  return <>
    <div className={styles.scope}>
      <h3>Project and editor resources</h3>
      <span className={styles.badge}>Estimated · tracked resources</span>
      <div className={styles.bigValue}>{formatBytes(s.knownBytes)}</div>
      <p>Canvas surfaces, images, one video frame, decoded audio, and tracked GPU buffers. This is not total process RAM.</p>
    </div>
    <MetricList rows={[
      ['Layers / timelines', `${s.project.layers} / ${s.project.timelines}`],
      ['Tracks / keyframes', `${s.project.tracks} / ${s.project.keyframes}`],
      ['Media assets', s.project.assets],
      ['Original blob URLs · owned / borrowed', `${s.sources.ownedUrls} / ${s.sources.borrowedUrls}`],
      ['Source references / pending / failed', `${s.sources.references} / ${s.sources.pendingUrls} / ${s.sources.failedUrls}`],
      ['Canvas2D surfaces · RGBA8', `${formatBytes(s.canvases.canvas2dBytes)} · ${s.canvases.canvas2dCount} surfaces`],
      ['Images / sprites · RGBA8', formatBytes(s.media.imageBytes)],
      ['Video · one RGBA frame', formatBytes(s.media.videoFrameBytes)],
      ['Decoded audio · Float32', `${formatBytes(s.audio.bytes)} · ${s.audio.bufferCount} buffers`],
      ['GPU color surfaces · RGBA8', formatBytes(s.canvases.webglBytes)],
      ['GPU particle buffers', formatBytes(s.gpuBufferBytes)],
      ['CPU particle staging', formatBytes(s.stagingBytes)],
      ['LOD cache · usage / budget', `${formatBytes(s.lod.residentBytes)} / ${formatBytes(s.lod.maxBytes)}`],
      ['LOD cache · pixels / metadata', `${formatBytes(s.lod.pixelBytes)} / ${formatBytes(s.lod.metadataBytes)}`],
      ['LOD cache · entries / hits / misses', `${s.lod.entries} / ${s.lod.hits} / ${s.lod.misses}`],
      ['LOD cache · pinned / retired', `${formatBytes(s.lod.pinnedBytes)} / ${s.lod.retiredEntries} retired entries`],
      ['LOD cache · evictions / budget denials', `${s.lod.evictions} / ${s.lod.budgetDenials}`],
    ]} />
    <p>Original source handles belong to document, history and pending jobs. These counts are separate from decoded media bytes and do not measure source-file RAM.</p>
    <p>LOD pixels are already included in Canvas2D memory; they are not counted twice. Cached previews and version keys share a default 64 MiB budget. Unused previews expire after 2 seconds.</p>
    {!s.canvases.supported && <p>Canvas tracking is unavailable in this browser; the tracked total is incomplete.</p>}
    <ManagedBudgetSection snapshot={s.budget} />
    <PaintResourcesSection snapshot={s} />
    <h3>Browser memory <span className={styles.badge}>Separate scope</span></h3>
    <MetricList rows={[
      ['JavaScript heap · estimated', heap ? formatBytes(heap.used) : 'Unavailable'],
      ['Heap allocated / limit', heap ? `${formatBytes(heap.allocated)} / ${formatBytes(heap.limit)}` : 'Unavailable'],
      ['Page-memory sample', page.bytes === null ? page.status === 'pending' ? 'Measuring…' : 'No samples' : formatBytes(page.bytes)],
    ]} />
    <button type="button" onClick={onSampleMemory} disabled={page.status === 'unsupported' || page.status === 'pending'}>
      {page.status === 'pending' ? 'Measuring…' : 'Measure page memory'}
    </button>
    {page.reason && <p>{page.reason}</p>}
    {page.sampledAt && <p>Sampled at: {new Date(page.sampledAt).toLocaleTimeString('en-GB')}</p>}
    <p>Heap uses the approximate Chromium performance.memory API. Page samples use measureUserAgentSpecificMemory. These may include shared data outside this project and must not be added to the tracked-resource total.</p>
  </>
}
