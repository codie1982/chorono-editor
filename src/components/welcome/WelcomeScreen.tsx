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
const labels: Record<string, string> = { youtube: 'Landscape', square: 'Square', story: 'Portrait' }

/**
 * Accessible startup surface using native dialog focus containment/inertness.
 * Closing preserves the current workspace. Project replacement stays behind
 * the editor's existing confirmation/reset boundary; only the startup toggle
 * is persisted. No project payloads or synthetic recent-file list are stored.
 */
export default function WelcomeScreen(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('Untitled project')
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
        <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">c<span /></span>chorono<span className={styles.brandDivider} /> <span className={styles.brandCaption}>ANIMATION STUDIO</span></div>
        <button type="button" className={styles.quietButton} onClick={props.onContinue}>Open editor <WelcomeIcon name="arrow" size={18} /></button>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div className={styles.eyebrow}><span /> FROM IDEA TO FIRST FRAME</div>
          <h1 id="welcome-title">Start with an idea.<br /><span>Make it move.</span></h1>
          <p className={styles.description}>Create with AI. Fine-tune every detail.<br className={styles.desktopBreak} /> Your story starts with the first frame.</p>
          <div className={styles.artwork}><WelcomeArtwork /></div>
          <div className={styles.capabilities}><span><WelcomeIcon name="layers" size={16} /> Vectors & layers</span><span>Timeline</span><span>State machines</span></div>
        </section>

        <section className={styles.projectPanel} aria-labelledby="new-project-title">
          <div className={styles.panelLabel}>A FRESH START</div>
          <h2 id="new-project-title">Set up your canvas.</h2>
          <p className={styles.panelDescription}>Choose a format. Create your first animation.</p>
          <form onSubmit={create}>
            <label className={styles.field}>Project name
              <input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="off" />
            </label>
            <fieldset className={styles.formats}>
              <legend>Canvas size</legend>
              <div className={styles.formatGrid}>{formats.map(preset => <button type="button" key={preset.id}
                className={`${styles.format} ${presetId === preset.id ? styles.selectedFormat : ''}`}
                aria-pressed={presetId === preset.id} onClick={() => setPresetId(preset.id)}>
                <span className={styles.formatPreview}><span style={{ aspectRatio: `${preset.width}/${preset.height}` }} /></span>
                <strong>{labels[preset.id]}</strong><small>{preset.width} × {preset.height}</small>
              </button>)}</div>
            </fieldset>
            <div className={styles.frameRateRow}><label htmlFor="welcome-fps">Frame rate</label>
              <select id="welcome-fps" value={frameRate} onChange={event => setFrameRate(Number(event.target.value))}>
                {[24, 30, 60].map(value => <option value={value} key={value}>{value} FPS</option>)}
              </select>
            </div>
            {(formError || props.error) && <p className={styles.error} role="alert">{formError || props.error}</p>}
            <button className={styles.primaryButton} type="submit">Create animation <WelcomeIcon name="arrow" /></button>
          </form>
          <div className={styles.or}><span />or<span /></div>
          <button className={styles.openButton} type="button" onClick={props.onOpenProject}><WelcomeIcon name="folder" /> Open project file <span>.json</span></button>
          {props.layerCount > 0 && <button className={styles.currentProject} type="button" onClick={props.onContinue}>
            <span className={styles.currentProjectIcon}><WelcomeIcon name="play" size={17} /></span>
            <span><strong>Return to workspace</strong><small>{props.composition.id} · {props.layerCount} {props.layerCount === 1 ? 'layer' : 'layers'}</small></span>
            <WelcomeIcon name="arrow" size={16} />
          </button>}
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Runs in your browser. You’re in control.</span>
        <label><input type="checkbox" checked={props.showOnStartup} onChange={event => props.onStartupChange(event.target.checked)} /> Show this screen on startup</label>
      </footer>
    </div>
  </dialog>
}
