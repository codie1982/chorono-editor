'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { resourceHelpTopics } from '@/components/help/documentation'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetCache } from '@/app/hooks/useAssetCache'
import type { AudioEngineHandle } from '@/app/hooks/useAudioEngine'
import { ProjectResourceMonitor, type ProjectMonitorSource } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { useResourceMonitor } from './useResourceMonitor'
import { OverviewSection } from './OverviewSection'
import { MediaResourcesSection } from './MediaResourcesSection'
import { ComputeResourcesSection } from './ComputeResourcesSection'
import { SurfacePoolSection } from './SurfacePoolSection'
import { InteractionDiagnosticsSection } from './InteractionDiagnosticsSection'
import styles from './ResourceMonitorPanel.module.css'

interface Props {
  scene: ChronoScene
  assets: AssetCache
  audio: Pick<AudioEngineHandle, 'getResources' | 'getState'>
  isPlaying: boolean
  source?: ProjectMonitorSource
}
const categories = ['Overview', 'Media', 'CPU / GPU', 'Surfaces', 'Interaction'] as const

/**
 * Project diagnostics dock. Resource owners provide numeric estimates/readiness;
 * viewport timing and GPU query scope are explicit. Browser heap/page memory is
 * separate from partial known-resource accounting. No scene/history mutation.
 * Only the active dock panel mounts the bounded, visibility-aware observer.
 */
export default function ResourceMonitorPanel({ scene, assets, audio, isPlaying, source }: Props) {
  const inputs = { scene, media: assets, isPlaying, audio: audio.getResources, audioErrors: () => audio.getState().errors }
  const monitor = useMemo(() => new ProjectResourceMonitor(inputs), []) // current inputs are supplied below
  monitor.setInputs(inputs)
  const { snapshot, paused, setPaused, clearIdle, mediaQuery, changeMediaQuery, requestMemorySample } = useResourceMonitor(source ?? monitor)
  const [category, setCategory] = useState<(typeof categories)[number]>('Overview')
  const [message, setMessage] = useState('')

  /** Reports safe cleanup once, without announcing every polling update. */
  function releaseIdle(): void {
    clearIdle()
    setMessage('Unused managed resources released. Active and pinned allocations were preserved.')
  }

  /** Preserves native activation of controls instead of editor playback shortcuts. */
  function keepControlActivation(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  }

  return <section className={styles.panel} aria-label="Resources & Performance" onKeyDown={keepControlActivation}>
    <header className={styles.header}>
      <div><h2>Resources & Performance</h2><p>{paused ? 'Monitoring paused' : 'Updates every 500 ms'}</p></div>
      <div className="flex items-center gap-1"><DocumentationHelp topic={resourceHelpTopics[category]} compact />
      <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume monitoring' : 'Pause monitoring'}</button></div>
    </header>
    <div className={styles.tabs} role="group" aria-label="Resource categories">
      {categories.map(name => <button type="button" key={name} aria-pressed={category === name}
        onClick={() => setCategory(name)}>{name}</button>)}
    </div>
    {category === 'Overview' && <OverviewSection snapshot={snapshot} onSampleMemory={() => { void requestMemorySample() }} />}
    {category === 'Media' && <MediaResourcesSection snapshot={snapshot} query={mediaQuery} onQuery={changeMediaQuery} />}
    {category === 'CPU / GPU' && <ComputeResourcesSection snapshot={snapshot} />}
    {category === 'Surfaces' && <SurfacePoolSection snapshot={snapshot.pool} onClearIdle={releaseIdle} />}
    {category === 'Interaction' && <InteractionDiagnosticsSection />}
    <p role="status" className={styles.status}>{message}</p>
    <details className={styles.details}>
      <summary>Measurement scope and limitations</summary>
      <p>Tracked resources belong to this editor session. Estimates cover canvas surfaces, media, decoded audio, and particle buffers. Browser copies, decoder buffers, workers, and driver memory are not fully tracked.</p>
      <p>JavaScript heap, page memory, and tracked resources overlap and must not be added together. The browser does not expose exact project RAM, process RAM, or system CPU/GPU utilization.</p>
      <p>Pausing monitoring does not pause animation. Sampling stops while this panel is closed, inactive, or hidden. Releasing resources does not guarantee an immediate drop in physical RAM.</p>
    </details>
  </section>
}
