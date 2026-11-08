import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import type { MediaQuery } from '@/lib/resources/monitor/mediaResources'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

const stateLabels = { ready: 'Ready', loading: 'Loading', error: 'Error', untracked: 'Not tracked', notResident: 'Not resident' }

/** Paged media inventory includes readiness/error and decoded size, never exposes source URLs or changes playback. */
export function MediaResourcesSection({ snapshot: s, query, onQuery }: {
  snapshot: ProjectResourceSnapshot; query: MediaQuery; onQuery: (query: MediaQuery) => void
}) {
  const m = s.media
  return <>
    <h3>Output preparation <span className={styles.badge}>Policy · jobs and retained output</span></h3>
    <MetricList rows={[
      ['Output jobs · active / queued',`${s.outputs.jobs.active} / ${s.outputs.jobs.queued}`],
      ['Output jobs · active / queue limits',`${s.outputs.jobs.concurrency} / ${s.outputs.jobs.maxQueued}`],
      ['Output jobs · cancelled / denied',`${s.outputs.jobs.cancelled} / ${s.outputs.jobs.denied}`],
      ['Output · policy charge / limit',`${formatBytes(s.outputs.residency.chargedBytes)} / ${formatBytes(s.outputs.residency.maxBytes)}`],
      ['Output · protected / pending',`${formatBytes(s.outputs.residency.protectedBytes)} / ${formatBytes(s.outputs.residency.reservedBytes)}`],
      ['Output · records / failed cleanup',`${s.outputs.residency.entries} / ${s.outputs.residency.failedEntries}`],
    ]}/>
    <p>Raster, frame ZIP, offline WAV, text/HTML/SVG, file/server saves and MCP packaging share this output policy and the session budget. Folder writes also serialize locally before entering this queue; local waits are excluded from these job counts. Cancelled native work stays active until it settles. Temporary canvases, text/binary copies and download pins overlap these charges; do not add them to known-resource or browser-memory totals. Native encoder, OfflineAudioContext, file and network internals are policy estimates.</p>
    <h3>Import preparation <span className={styles.badge}>Measured · jobs</span></h3>
    <MetricList rows={[
      ['Import pipeline · active / queued', `${s.importPreparation.active} / ${s.importPreparation.queued}`],
      ['Import pipeline · active / queue limits', `${s.importPreparation.concurrency} / ${s.importPreparation.maxQueued}`],
      ['Import pipeline · cancelled / denied', `${s.importPreparation.cancelled} / ${s.importPreparation.denied}`],
    ]} />
    <p>File, URL, clipboard, scene opening and preflight jobs share this outer queue. Active includes IO, conversion and actual settlement after cancellation. An import may wait for the media queue below; these overlapping counts must not be added as native concurrency or CPU usage.</p>
    <h3>Shared media preparation <span className={styles.badge}>Measured · jobs</span></h3>
    <MetricList rows={[
      ['Media pipeline · active / queued', `${s.mediaPreparation.active} / ${s.mediaPreparation.queued}`],
      ['Media pipeline · active / queue limits', `${s.mediaPreparation.concurrency} / ${s.mediaPreparation.maxQueued}`],
      ['Media pipeline · cancelled / denied', `${s.mediaPreparation.cancelled} / ${s.mediaPreparation.denied}`],
    ]} />
    <p>The shared pipeline limits audio, image/video, metadata probes, sprite previews, GIF, font registration and outline-font parsing across this editor session. Active covers fetch, native preparation, and settlement cleanup; it is not CPU utilization. Local active jobs below may be waiting for a shared slot and must not be added to this total.</p>
    <h3>Metadata and previews <span className={styles.badge}>Policy · transient resources</span></h3>
    <MetricList rows={[
      ['Probes · local active / queued',`${s.probes.preparation.active} / ${s.probes.preparation.queued}`],
      ['Probes · executing / shared wait',`${s.probes.preparation.executing} / ${s.probes.preparation.waitingForExecutor}`],
      ['Probes · policy charge / limit',`${formatBytes(s.probes.residency.chargedBytes)} / ${formatBytes(s.probes.residency.maxBytes)}`],
      ['Probes · protected / pending',`${formatBytes(s.probes.residency.protectedBytes)} / ${formatBytes(s.probes.residency.reservedBytes)}`],
      ['Probes · records / failed cleanup',`${s.probes.residency.entries} / ${s.probes.residency.failedEntries}`],
      ['Outline fonts · local active / queued',`${s.outlines.preparation.active} / ${s.outlines.preparation.queued}`],
      ['Outline fonts · policy charge / limit',`${formatBytes(s.outlines.residency.chargedBytes)} / ${formatBytes(s.outlines.residency.maxBytes)}`],
      ['Outline fonts · records / failed cleanup',`${s.outlines.residency.entries} / ${s.outlines.residency.failedEntries}`],
    ]}/>
    <p>Image headers are read with bounded input before supported-frame admission. Opaque image/video/audio decoder memory uses explicit policy estimates. Preview pins keep one native image alive until the modal releases it. Parsed outline fonts keep their encoded input lease; these policy and input charges overlap the shared budget and are excluded from the known-resource total.</p>
    <h3>Media assets <span className={styles.badge}>Measured · counts</span></h3>
    <MetricList rows={[
      ['Total / ready', `${m.total} / ${m.ready}`], ['Loading / errors', `${m.loading} / ${m.errors}`],
      ['Not tracked', m.untracked], ['Images / videos', `${m.images} / ${m.videos}`],
      ['Not resident', m.notResident],
      ['Playing videos', m.playingVideos],
      ['Source files · metadata', formatBytes(m.sourceBytes)], ['Assets with unknown size', m.unknownSourceSizes],
      ['Decoded audio · Float32', formatBytes(s.audio.bytes)], ['Pending audio decodes', s.audio.pendingCount],
      ['Audio preparation · local active / queued', s.audio.preparation ? `${s.audio.preparation.active} / ${s.audio.preparation.queued}` : 'Not tracked'],
      ['Audio preparation · local active limit', s.audio.preparation?.concurrency ?? 'Not tracked'],
      ['Audio preparation · executing / shared wait', s.audio.preparation?.executing === undefined ? 'Not tracked' : `${s.audio.preparation.executing} / ${s.audio.preparation.waitingForExecutor ?? 0}`],
      ['Audio preparation · cancelled / denied', s.audio.preparation ? `${s.audio.preparation.cancelled} / ${s.audio.preparation.denied}` : 'Not tracked'],
      ['Local PCM · charge / limit', s.audio.residency ? `${formatBytes(s.audio.residency.chargedBytes)} / ${formatBytes(s.audio.residency.maxBytes)}` : 'Not tracked'],
      ['PCM · protected / reclaimable', s.audio.residency ? `${formatBytes(s.audio.residency.protectedBytes)} / ${formatBytes(s.audio.residency.reclaimableBytes)}` : 'Not tracked'],
      ['PCM · pending estimate', s.audio.residency ? formatBytes(s.audio.residency.reservedBytes) : 'Not tracked'],
      ['Visual preparation · local active / queued', `${s.visual.preparation.active} / ${s.visual.preparation.queued}`],
      ['Visual preparation · executing / shared wait', `${s.visual.preparation.executing} / ${s.visual.preparation.waitingForExecutor}`],
      ['Local visual · charge / limit', `${formatBytes(s.visual.residency.chargedBytes)} / ${formatBytes(s.visual.residency.maxBytes)}`],
      ['Visual · protected / reclaimable', `${formatBytes(s.visual.residency.protectedBytes)} / ${formatBytes(s.visual.residency.reclaimableBytes)}`],
      ['Visual · pending estimate / failed cleanup', `${formatBytes(s.visual.residency.reservedBytes)} / ${s.visual.residency.failedEntries}`],
      ['Font preparation · local active / queued', `${s.fonts.preparation.active} / ${s.fonts.preparation.queued}`],
      ['Font preparation · executing / shared wait', `${s.fonts.preparation.executing} / ${s.fonts.preparation.waitingForExecutor}`],
      ['Font admission · records / failed cleanup', `${s.fonts.residency.entries} / ${s.fonts.residency.failedEntries}`],
      ['Font admission · policy charge / limit', `${formatBytes(s.fonts.residency.chargedBytes)} / ${formatBytes(s.fonts.residency.maxBytes)}`],
      ['Font admission · protected / reclaimable', `${formatBytes(s.fonts.residency.protectedBytes)} / ${formatBytes(s.fonts.residency.reclaimableBytes)}`],
    ]} />
    <p>Source-file size differs from decoded memory. Video estimates cover one frame and exclude decoder buffers, network buffers, and GPU copies. Audio buffers are shared for the editor session.</p>
    <p>Audio preparation counts fetch and decode jobs. Cancelled native decoding remains active until it settles. PCM charge includes pending estimates and overlaps the shared allocation budget; do not add these totals. Native decoder copies and internal peak memory are outside this estimate.</p>
    <p>Managed image and video leases share the allocation budget. Video charges estimate one RGBA frame per clip, excluding decoder buffers and GPU copies. Local visual totals include warm and retired pins across editor consumers; the media list describes this project's current viewport map.</p>
    <p>Font registrations have independent consumer pins and a bounded preparation queue. Font admission charges use a policy estimate; native font and glyph-cache memory is unavailable and excluded from the known-resource total. Cancelled native loads retain their slot and charge until they settle.</p>
    <label className={styles.search}>Search assets
      <input type="search" value={query.search} onChange={event => onQuery({ page: 0, search: event.target.value })} />
    </label>
    <ul className={styles.mediaList}>
      {m.rows.map(row => <li key={row.id}>
        <strong>{row.name}</strong>
        <span>{row.type} · {stateLabels[row.state]}</span>
        <span>{row.bytes === null ? 'Memory size unknown' : `${formatBytes(row.bytes)} · decoded estimate`}</span>
      </li>)}
    </ul>
    {m.filteredCount === 0 && <p>{m.total === 0 ? 'This project has no media assets.' : 'No assets match your search.'}</p>}
    <div className={styles.pagination}>
      <button type="button" disabled={m.page === 0} onClick={() => onQuery({ ...query, page: m.page - 1 })}>Previous</button>
      <span>{m.page + 1} / {m.pages} · {m.filteredCount} assets</span>
      <button type="button" disabled={m.page + 1 >= m.pages} onClick={() => onQuery({ ...query, page: m.page + 1 })}>Next</button>
    </div>
  </>
}
