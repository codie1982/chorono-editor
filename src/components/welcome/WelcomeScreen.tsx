'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { COMPOSITION_PRESETS, type Composition, type CompositionPreset } from '@/lib/types'
import type { WelcomeProjectSettings } from '@/lib/editor/welcomeProject'
import { WelcomeArtwork } from './WelcomeArtwork'
import { WelcomeIcon } from './WelcomeIcon'
import styles from './WelcomeScreen.module.css'

interface Props {
  composition: Composition
  layerCount: number
  showOnStartup: boolean
  error: string | null
  onStartupChange: (show: boolean) => void
  onCreate: (settings: WelcomeProjectSettings) => boolean
  onOpenProject: () => void
  onContinue: () => void
}

const formats = ['youtube', 'square', 'story']
  .map(id => COMPOSITION_PRESETS.find(preset => preset.id === id))
  .filter((preset): preset is CompositionPreset => !!preset)
const labels: Record<string, string> = { youtube: 'Yatay', square: 'Kare', story: 'Dikey' }

/**
 * Accessible startup surface using native dialog focus containment/inertness.
 * Closing preserves the current workspace. Project replacement stays behind
 * the editor's existing confirmation/reset boundary; only the startup toggle
 * is persisted. No project payloads or synthetic recent-file list are stored.
 */
export default function WelcomeScreen(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('İsimsiz proje')
  const [presetId, setPresetId] = useState('youtube')
  const [frameRate, setFrameRate] = useState(30)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])

  /** Uses native form validation; rejected/cancelled replacements keep this view open. */
  const create = (event: FormEvent) => {
    event.preventDefault()
    try { props.onCreate({ name, presetId, frameRate }) }
    catch (error) { setFormError((error as Error).message) }
  }

  return <dialog ref={dialog} className={styles.screen} aria-labelledby="welcome-title"
    onCancel={event => { event.preventDefault(); props.onContinue() }}
    onKeyDown={event => event.stopPropagation()}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">c<span /></span>chorono<span className={styles.brandDivider} /> <span className={styles.brandCaption}>ANİMASYON STÜDYOSU</span></div>
        <button type="button" className={styles.quietButton} onClick={props.onContinue}>Editörü aç <WelcomeIcon name="arrow" size={18} /></button>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div className={styles.eyebrow}><span /> FİKİRDEN İLK KAREYE</div>
          <h1 id="welcome-title">Bir fikirle başla.<br /><span>Harekete dönüştür.</span></h1>
          <p className={styles.description}>AI ile oluştur, her ayrıntıyı kendin düzenle.<br className={styles.desktopBreak} /> Hikâyenin ilk karesi burada başlıyor.</p>
          <div className={styles.artwork}><WelcomeArtwork /></div>
          <div className={styles.capabilities}><span><WelcomeIcon name="layers" size={16} /> Vektör & katmanlar</span><span>Zaman çizelgesi</span><span>State machine</span></div>
        </section>

        <section className={styles.projectPanel} aria-labelledby="new-project-title">
          <div className={styles.panelLabel}>YENİ BİR BAŞLANGIÇ</div>
          <h2 id="new-project-title">Tuvalini hazırla.</h2>
          <p className={styles.panelDescription}>Boyutunu seç, ilk hareketini oluştur.</p>
          <form onSubmit={create}>
            <label className={styles.field}>Proje adı
              <input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="off" />
            </label>
            <fieldset className={styles.formats}>
              <legend>Tuval boyutu</legend>
              <div className={styles.formatGrid}>{formats.map(preset => <button type="button" key={preset.id}
                className={`${styles.format} ${presetId === preset.id ? styles.selectedFormat : ''}`}
                aria-pressed={presetId === preset.id} onClick={() => setPresetId(preset.id)}>
                <span className={styles.formatPreview}><span style={{ aspectRatio: `${preset.width}/${preset.height}` }} /></span>
                <strong>{labels[preset.id]}</strong><small>{preset.width} × {preset.height}</small>
              </button>)}</div>
            </fieldset>
            <div className={styles.frameRateRow}><label htmlFor="welcome-fps">Kare hızı</label>
              <select id="welcome-fps" value={frameRate} onChange={event => setFrameRate(Number(event.target.value))}>
                {[24, 30, 60].map(value => <option value={value} key={value}>{value} FPS</option>)}
              </select>
            </div>
            {(formError || props.error) && <p className={styles.error} role="alert">{formError || props.error}</p>}
            <button className={styles.primaryButton} type="submit">Animasyon oluştur <WelcomeIcon name="arrow" /></button>
          </form>
          <div className={styles.or}><span />veya<span /></div>
          <button className={styles.openButton} type="button" onClick={props.onOpenProject}><WelcomeIcon name="folder" /> Proje dosyası aç <span>.json</span></button>
          {props.layerCount > 0 && <button className={styles.currentProject} type="button" onClick={props.onContinue}>
            <span className={styles.currentProjectIcon}><WelcomeIcon name="play" size={17} /></span>
            <span><strong>Çalışma alanına dön</strong><small>{props.composition.id} · {props.layerCount} katman</small></span>
            <WelcomeIcon name="arrow" size={16} />
          </button>}
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Tarayıcında çalışır. Kontrol sende.</span>
        <label><input type="checkbox" checked={props.showOnStartup} onChange={event => props.onStartupChange(event.target.checked)} /> Başlangıçta bu ekranı göster</label>
      </footer>
    </div>
  </dialog>
}
