'use client'
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
import styles from './ResourceMonitorPanel.module.css'

interface Props {
  scene: ChronoScene
  assets: AssetCache
  audio: Pick<AudioEngineHandle, 'getResources' | 'getState'>
  isPlaying: boolean
  source?: ProjectMonitorSource
}
const categories = ['Genel', 'Medya', 'CPU / GPU', 'Tamponlar'] as const

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
  const [category, setCategory] = useState<(typeof categories)[number]>('Genel')
  const [message, setMessage] = useState('')

  /** Reports safe cleanup once, without announcing every polling update. */
  function releaseIdle(): void {
    clearIdle()
    setMessage('Boş yüzeyler bırakıldı. Aktif yüzeyler korundu.')
  }

  /** Preserves native activation of controls instead of editor playback shortcuts. */
  function keepControlActivation(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  }

  return <section className={styles.panel} aria-label="Kaynak ve Performans" onKeyDown={keepControlActivation}>
    <header className={styles.header}>
      <div><h2>Kaynak ve Performans</h2><p>{paused ? 'İzleme duraklatıldı' : '500 ms’de bir güncellenir'}</p></div>
      <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'İzlemeyi sürdür' : 'İzlemeyi duraklat'}</button>
    </header>
    <div className={styles.tabs} role="group" aria-label="Kaynak kategorileri">
      {categories.map(name => <button type="button" key={name} aria-pressed={category === name}
        onClick={() => setCategory(name)}>{name}</button>)}
    </div>
    {category === 'Genel' && <OverviewSection snapshot={snapshot} onSampleMemory={() => { void requestMemorySample() }} />}
    {category === 'Medya' && <MediaResourcesSection snapshot={snapshot} query={mediaQuery} onQuery={changeMediaQuery} />}
    {category === 'CPU / GPU' && <ComputeResourcesSection snapshot={snapshot} />}
    {category === 'Tamponlar' && <SurfacePoolSection snapshot={snapshot.pool} onClearIdle={releaseIdle} />}
    <p role="status" className={styles.status}>{message}</p>
    <details className={styles.details}>
      <summary>Ölçüm kapsamı ve sınırlar</summary>
      <p>Bilinen kaynaklar editör oturumuna aittir; canvas/medya tahminleri, PCM ve izlenen parçacık tamponlarını kapsar. Tarayıcı kopyaları, decoder tamponları, tüm JS nesneleri, worker ve sürücü belleği bu toplamda tam izlenmez.</p>
      <p>Heap ve sayfa bellek örneği ayrı kapsamlardır; birbirleriyle veya kaynak toplamıyla toplanmaz. Toplam proje/işlem RAM’i ve sistem CPU/GPU yüzdesi tarayıcıdan kesin alınamaz.</p>
      <p>İzlemeyi duraklatmak animasyonu durdurmaz. Panel kapalı, etkin olmayan sekmede veya document gizliyken polling ve GPU query üretimi durur. Fiziksel RAM’in anında azalacağı iddia edilmez.</p>
    </details>
  </section>
}
