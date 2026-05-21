import { describe, it, expect } from 'vitest'
import { FileTypeDetector, fileTypeDetector } from '../FileTypeDetector'
import { getImportKind } from '../types'
import type { ImportFormat } from '../types'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fileFromBytes(bytes: number[], name: string, type = ''): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

function fileFromText(text: string, name: string, type = ''): File {
  return new File([text], name, { type })
}

// Magic byte prefixes
const PNG  = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const JPEG = [0xFF, 0xD8, 0xFF, 0xE0]
const GIF  = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const MP3_ID3 = [0x49, 0x44, 0x33, 0x04]
const OGG  = [0x4F, 0x67, 0x67, 0x53]
const WOFF2 = [0x77, 0x4F, 0x46, 0x32]
const PDF  = [0x25, 0x50, 0x44, 0x46, 0x2D]
// RIFF containers: "RIFF" + size(4) + format(4)
const RIFF = [0x52, 0x49, 0x46, 0x46]
function riff(format: string): number[] {
  return [...RIFF, 0, 0, 0, 0, ...format.split('').map(c => c.charCodeAt(0))]
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('FileTypeDetector — magic bytes', () => {
  const det = new FileTypeDetector()

  it('detects PNG', async () => {
    expect(await det.detect(fileFromBytes(PNG, 'x.png'))).toBe('image/png')
  })

  it('detects JPEG', async () => {
    expect(await det.detect(fileFromBytes(JPEG, 'x.jpg'))).toBe('image/jpeg')
  })

  it('detects GIF', async () => {
    expect(await det.detect(fileFromBytes(GIF, 'x.gif'))).toBe('image/gif')
  })

  it('detects MP3 via ID3 tag', async () => {
    expect(await det.detect(fileFromBytes(MP3_ID3, 'x.mp3'))).toBe('audio/mp3')
  })

  it('detects OGG', async () => {
    expect(await det.detect(fileFromBytes(OGG, 'x.ogg'))).toBe('audio/ogg')
  })

  it('detects WOFF2 font', async () => {
    expect(await det.detect(fileFromBytes(WOFF2, 'x.woff2'))).toBe('font/woff2')
  })

  it('detects PDF', async () => {
    expect(await det.detect(fileFromBytes(PDF, 'x.pdf'))).toBe('application/pdf')
  })
})

describe('FileTypeDetector — RIFF disambiguation', () => {
  const det = new FileTypeDetector()

  it('distinguishes WEBP from WAV by subtype', async () => {
    expect(await det.detect(fileFromBytes(riff('WEBP'), 'x.webp'))).toBe('image/webp')
  })

  it('distinguishes WAV from WEBP by subtype', async () => {
    expect(await det.detect(fileFromBytes(riff('WAVE'), 'x.wav'))).toBe('audio/wav')
  })
})

describe('FileTypeDetector — MIME fallback', () => {
  const det = new FileTypeDetector()

  it('uses MIME type when magic bytes are absent', async () => {
    // No recognizable magic — relies on MIME
    const f = fileFromBytes([0x00, 0x11, 0x22, 0x33], 'noext', 'image/avif')
    expect(await det.detect(f)).toBe('image/avif')
  })

  it('maps video/quicktime MIME to canonical video/mov', async () => {
    const f = fileFromBytes([0x00, 0x11, 0x22, 0x33], 'noext', 'video/quicktime')
    expect(await det.detect(f)).toBe('video/mov')
  })
})

describe('FileTypeDetector — extension fallback', () => {
  const det = new FileTypeDetector()

  it('falls back to extension when magic + MIME unknown', async () => {
    const f = fileFromBytes([0x00, 0x11, 0x22, 0x33], 'movie.webm')
    expect(await det.detect(f)).toBe('video/webm')
  })

  it('detects SVG by extension + leading "<"', async () => {
    const f = fileFromText('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'icon.svg', 'image/svg+xml')
    expect(await det.detect(f)).toBe('image/svg+xml')
  })

  it('returns unknown for unrecognized files', async () => {
    const f = fileFromBytes([0x00, 0x11, 0x22, 0x33], 'mystery.xyz')
    expect(await det.detect(f)).toBe('unknown')
  })
})

describe('FileTypeDetector — JSON sniffing', () => {
  const det = new FileTypeDetector()

  it('detects Lottie JSON by v + layers fields', async () => {
    const lottie = JSON.stringify({ v: '5.7.4', fr: 30, w: 100, h: 100, layers: [] })
    const f = fileFromText(lottie, 'anim.json', 'application/json')
    expect(await det.detect(f)).toBe('application/lottie+json')
  })

  it('detects Chorono scene JSON by formatVersion field', async () => {
    const chrono = JSON.stringify({ formatVersion: '1.0.0', layers: [], composition: {} })
    const f = fileFromText(chrono, 'scene.json', 'application/json')
    expect(await det.detect(f)).toBe('application/chorono+json')
  })

  it('returns unknown for ambiguous JSON', async () => {
    const f = fileFromText(JSON.stringify({ hello: 'world' }), 'data.json', 'application/json')
    expect(await det.detect(f)).toBe('unknown')
  })
})

describe('FileTypeDetector — detectFromUrl', () => {
  const det = new FileTypeDetector()

  it('detects format from a URL extension', () => {
    expect(det.detectFromUrl('https://cdn.example.com/path/logo.png')).toBe('image/png')
    expect(det.detectFromUrl('https://cdn.example.com/clip.mp4')).toBe('video/mp4')
  })

  it('returns unknown for extensionless URLs', () => {
    expect(det.detectFromUrl('https://example.com/api/asset')).toBe('unknown')
  })
})

describe('FileTypeDetector — static helpers', () => {
  it('label returns human-readable names', () => {
    expect(FileTypeDetector.label('image/png')).toBe('PNG Image')
    expect(FileTypeDetector.label('application/dxf')).toBe('DXF CAD Drawing')
  })

  it('isSupported reflects Phase 1 coverage', () => {
    expect(FileTypeDetector.isSupported('image/png')).toBe(true)
    expect(FileTypeDetector.isSupported('image/svg+xml')).toBe(true)
    expect(FileTypeDetector.isSupported('application/chorono+json')).toBe(true)
    expect(FileTypeDetector.isSupported('application/dwg')).toBe(false)
    expect(FileTypeDetector.isSupported('unknown')).toBe(false)
  })

  it('exports a singleton', () => {
    expect(fileTypeDetector).toBeInstanceOf(FileTypeDetector)
  })
})

describe('getImportKind', () => {
  it('classifies simple media as asset imports', () => {
    const assetFormats: ImportFormat[] = [
      'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif',
      'video/mp4', 'video/mov', 'video/webm',
      'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg',
      'font/woff2', 'font/ttf', 'font/otf',
    ]
    for (const f of assetFormats) expect(getImportKind(f)).toBe('asset')
  })

  it('classifies complex formats as document imports', () => {
    const docFormats: ImportFormat[] = [
      'image/svg+xml', 'application/lottie+json', 'application/dotlottie',
      'application/chorono+json', 'application/dxf', 'application/pdf',
    ]
    for (const f of docFormats) expect(getImportKind(f)).toBe('document')
  })
})
