import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { ChronoScene } from '@/lib/types'
import { gpuCapabilities } from '@/lib/render/gpu/GPUCapabilities'
import { BaselineAssetsBridge } from './BaselineAssetsBridge'
import { BrowserBaselineHost } from './BrowserBaselineHost'
import { BaselineRunner } from '../BaselineRunner'
import { DEFAULT_BASELINE_PROTOCOL } from '../types'

interface ManifestFixture { id: string; file: string; sha256: string; layers: number; description: string }
interface Manifest { build: Record<string, unknown>; fixtures: ManifestFixture[] }

/** Hashes fetched fixture bytes before parse so the report identifies the exact immutable source. */
async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Minimal local test page; status/results are plain DOM so CUA can read evidence without evaluating app internals. */
async function main(): Promise<void> {
  // A failed warmup must remain failed. This explicit separate profile only
  // verifies six visual references within the SAME guards; never compare its
  // unwarmed CPU samples with the timing baseline.
  const staticGroups = new URL(location.href).searchParams.get('staticGroups') === '1'
  const surfaceRegions = new URL(location.href).searchParams.get('surfaceRegions') !== '0'
  const requestedLod = new URL(location.href).searchParams.get('lodZoom')
  const lodZoom = requestedLod === null ? undefined : Number(requestedLod)
  if (lodZoom !== undefined && (!Number.isFinite(lodZoom) || lodZoom <= 0 || lodZoom > 1)) throw new Error('Invalid LOD zoom')
  const visualOnly = new URL(location.href).searchParams.get('profile') === 'visual-only'
  const protocol = visualOnly ? { ...DEFAULT_BASELINE_PROTOCOL, warmupMs: 0, repetitions: 1 } : DEFAULT_BASELINE_PROTOCOL
  const expectedSamples = protocol.sampleFractions.length * protocol.repetitions
  document.body.innerHTML = `<style>
    body{font:14px system-ui;background:#101827;color:#e5e7eb;margin:24px}a{color:#93c5fd}
    button,select{padding:8px 12px;margin:6px;background:#26364f;color:white;border:1px solid #64748b;border-radius:5px}
    canvas{display:block;width:min(800px,95vw);height:auto;border:1px solid #475569;margin:16px 0}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#172238;padding:14px;max-width:1100px}
    #report{display:none}canvas[hidden]{display:none}img{max-width:800px;width:95vw}small{display:block;color:#a7b4c8}
  </style><h1>Chorono OPT0 — başlangıç ölçümü</h1>
  <p>${visualOnly ? 'Yalnız görsel kontrol: ısınma yok, 6 zaman noktası × 1 tekrar. CPU süreleri performans karşılaştırmasında kullanılmaz.' : 'Renderer ölçümü: 60 saniye görünür ısınma + 6 zaman noktası × 10 tekrar. Sürekli oynatma/FPS veya tam işlem RAM’i testi değildir.'}</p>
  <nav id="fixtures" aria-label="Ölçüm sahneleri"></nav><p id="status" role="status">Hazırlanıyor…</p>
  <button id="start">Ölçümü başlat</button><button id="cancel" disabled>İptal</button>
  <canvas id="canvas"></canvas><div id="assets"></div><pre id="summary"></pre>
  <a id="download" hidden>JSON raporunu indir</a><pre id="report"></pre>`
  const status = document.getElementById('status')!, summary = document.getElementById('summary')!
  const start = document.getElementById('start') as HTMLButtonElement
  const cancel = document.getElementById('cancel') as HTMLButtonElement
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const manifest: Manifest = await (await fetch('manifest.json')).json()
  const selected = new URL(location.href).searchParams.get('case') ?? manifest.fixtures[0].id
  for (const fixture of manifest.fixtures) {
    const link = document.createElement('a'); link.href = `?case=${encodeURIComponent(fixture.id)}`
    link.textContent = `${fixture.id} · `; document.getElementById('fixtures')!.appendChild(link)
  }
  const fixture = manifest.fixtures.find(value => value.id === selected)
  if (!fixture) throw new Error('Unknown baseline fixture')
  const response = await fetch(fixture.file)
  if (!response.ok) throw new Error('Fixture unavailable')
  const bytes = await response.arrayBuffer()
  if (await sha256(bytes) !== fixture.sha256) throw new Error('Fixture hash changed; prepare a new baseline')
  let scene: ChronoScene = JSON.parse(new TextDecoder().decode(bytes))
  if (scene.layers.length !== fixture.layers) throw new Error('Unexpected fixture layer count')
  if (staticGroups && fixture.id !== 'groups-transparent') throw new Error('Static derivation is only defined for the groups fixture')
  if (staticGroups) scene = { ...scene, timelines: [] } // Test-only held geometry; original portable bytes stay untouched.
  const effectiveSceneSha256 = await sha256(new TextEncoder().encode(JSON.stringify(scene)).buffer as ArrayBuffer)
  const root = createRoot(document.getElementById('assets')!)
  const onError = (error: Error) => {
    status.textContent = `ERROR: ${error.message}`; start.disabled = true
    document.getElementById('report')!.textContent = JSON.stringify({ schemaVersion: 1,
      kind: 'sparse-render-baseline', fixture, status: 'incomplete', reason: error.message, build: manifest.build })
  }
  let ran = false
  start.onclick = () => {
    if (ran) return
    ran = true; start.disabled = true
    let hostStarted = false
    root.render(createElement(BaselineAssetsBridge, { scene, onError, onReady: async (assets, audio) => {
      if (hostStarted) return
      hostStarted = true
      const host = new BrowserBaselineHost(scene, canvas, assets, audio, lodZoom, surfaceRegions)
      const controller = new AbortController()
      cancel.disabled = false; cancel.onclick = () => controller.abort()
      const runStartedAt = new Date().toISOString()
      let lastProgress = -Infinity
      try {
        const result = await new BaselineRunner(protocol).run(host, controller.signal, value => {
          if (performance.now() - lastProgress < 500) return
          lastProgress = performance.now()
          status.textContent = value.phase === 'warming'
            ? `${fixture.id}: ısınma ${(value.warmupMs / 1000).toFixed(1)} / 60 sn`
            : value.phase === 'sampling' ? `${fixture.id}: ölçüm ${value.samples} / ${expectedSamples}` : `${fixture.id}: görsel referanslar hazırlanıyor`
        })
        if (staticGroups && lodZoom !== undefined && !result.samples.some(sample => (sample.lodGroups ?? 0) > 0)) {
          result.status = 'incomplete'; result.reason = 'no-proxies-in-static-lod-acceptance'
        }
        const endSnapshot = host.getSnapshot()
        await new Promise(resolve => setTimeout(resolve, 2250))
        const idleSnapshot = host.getSnapshot()
        const report = { ...result, purpose: visualOnly ? 'visual-checkpoints-only' : 'timing-baseline',
          fixture: { ...fixture, sourceBytes: bytes.byteLength },
          runStartedAt, runFinishedAt: new Date().toISOString(), build: manifest.build,
          environment: { userAgent: navigator.userAgent, logicalCpuCount: navigator.hardwareConcurrency,
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            visibility: document.visibilityState, gpu: endSnapshot.gpu.length ? gpuCapabilities.getReport() : null,
            rendererMode: 'standalone-preview', surfaceRegions, lodZoom: lodZoom ?? null, staticGroupsDerived: staticGroups, effectiveSceneSha256, sceneSize: scene.composition,
            editorPanelsMounted: false, videoTransportExercised: false, systemProcessMemory: null },
          lodQuality: host.getLodQuality(), endResources: endSnapshot, idleAfterMs: 2250, idleResources: idleSnapshot }
        document.getElementById('report')!.textContent = JSON.stringify(report, null, 2)
        summary.textContent = JSON.stringify({ fixture: fixture.id, status: result.status, reason: result.reason,
          warmup: result.warmup, summary: result.summary, layerCount: scene.layers.length,
          assets: scene.assets.length, endKnownMiB: endSnapshot.knownBytes / 1024 ** 2,
          idleKnownMiB: idleSnapshot.knownBytes / 1024 ** 2 }, null, 2)
        status.textContent = `${result.status.toUpperCase()}: ${fixture.id} — ${result.samples.length} ölçüm`
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const download = document.getElementById('download') as HTMLAnchorElement
        download.href = url; download.download = `${fixture.id}.json`; download.hidden = false
        window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true })
        const thumbnail = document.createElement('canvas')
        thumbnail.width = 800; thumbnail.height = Math.round(800 * canvas.height / canvas.width)
        thumbnail.getContext('2d')!.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height)
        const preview = document.createElement('img'); preview.alt = 'Son ölçüm karesi'
        preview.src = thumbnail.toDataURL('image/png'); thumbnail.width = thumbnail.height = 0
        canvas.after(preview); canvas.hidden = true
      } catch (error) { onError(error instanceof Error ? error : new Error('Baseline failed')) }
      finally { cancel.disabled = true; host.dispose() }
    } }))
  }
  status.textContent = `Hazır: ${fixture.id} · ${fixture.description}`
}

void main().catch(error => {
  const status = document.getElementById('status')
  if (status) status.textContent = `ERROR: ${error instanceof Error ? error.message : 'Initialization failed'}`
})
