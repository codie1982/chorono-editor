// ── FileTypeDetector ──────────────────────────────────────────────────────────
//
// Detects ImportFormat from File objects using three strategies in priority order:
//   1. Magic bytes (first 12 bytes of file content) — most reliable
//   2. MIME type from browser  — reliable for common formats
//   3. File extension          — fallback when MIME is missing/wrong
//
// Never solely relies on extension (zip bombs, misnamed files, etc.)

import type { ImportFormat } from './types'

// ── Magic Byte Signatures ─────────────────────────────────────────────────────

type MagicEntry = {
  bytes: number[]
  offset?: number
  format: ImportFormat
}

const MAGIC_SIGNATURES: MagicEntry[] = [
  // Images
  { bytes: [0xFF, 0xD8, 0xFF],                         format: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47],                   format: 'image/png'  },
  { bytes: [0x47, 0x49, 0x46, 0x38],                   format: 'image/gif'  }, // GIF87a / GIF89a
  { bytes: [0x52, 0x49, 0x46, 0x46],                   format: 'image/webp' }, // RIFF....WEBP
  // Video
  { bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], format: 'video/mp4' }, // ftyp box
  { bytes: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], format: 'video/mp4' },
  { bytes: [0x1A, 0x45, 0xDF, 0xA3],                   format: 'video/webm' }, // EBML
  // Audio
  { bytes: [0xFF, 0xFB],                               format: 'audio/mp3'  }, // MPEG
  { bytes: [0xFF, 0xF3],                               format: 'audio/mp3'  },
  { bytes: [0x49, 0x44, 0x33],                         format: 'audio/mp3'  }, // ID3 tag
  { bytes: [0x52, 0x49, 0x46, 0x46],                   format: 'audio/wav'  }, // RIFF....WAVE (need to distinguish from WEBP)
  { bytes: [0xFF, 0xF1],                               format: 'audio/aac'  }, // ADTS AAC
  { bytes: [0xFF, 0xF9],                               format: 'audio/aac'  },
  { bytes: [0x4F, 0x67, 0x67, 0x53],                   format: 'audio/ogg'  }, // OggS
  // Fonts
  { bytes: [0x77, 0x4F, 0x46, 0x32],                   format: 'font/woff2' }, // wOF2
  { bytes: [0x00, 0x01, 0x00, 0x00],                   format: 'font/ttf'   }, // TTF/OTF
  { bytes: [0x4F, 0x54, 0x54, 0x4F],                   format: 'font/otf'   }, // OTTO
  // PDF
  { bytes: [0x25, 0x50, 0x44, 0x46],                   format: 'application/pdf' }, // %PDF
  // dotLottie (zip)
  { bytes: [0x50, 0x4B, 0x03, 0x04],                   format: 'application/dotlottie' }, // PK.. (zip)
]

// ── Extension Map ─────────────────────────────────────────────────────────────

const EXTENSION_MAP: Record<string, ImportFormat> = {
  // Images
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.avif':  'image/avif',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  // Video
  '.mp4':   'video/mp4',
  '.mov':   'video/mov',
  '.webm':  'video/webm',
  '.avi':   'video/mp4',
  // Audio
  '.mp3':   'audio/mp3',
  '.wav':   'audio/wav',
  '.aac':   'audio/aac',
  '.ogg':   'audio/ogg',
  // Font
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  // Documents
  '.pdf':   'application/pdf',
  '.lottie': 'application/dotlottie',
  '.dxf':   'application/dxf',
  '.dwg':   'application/dwg',
  // JSON variants
  '.json':  'unknown', // resolved later by content
}

// ── MIME Map ──────────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, ImportFormat> = {
  'image/png':               'image/png',
  'image/jpeg':              'image/jpeg',
  'image/webp':              'image/webp',
  'image/avif':              'image/avif',
  'image/gif':               'image/gif',
  'image/svg+xml':           'image/svg+xml',
  'video/mp4':               'video/mp4',
  'video/quicktime':         'video/mov',
  'video/webm':              'video/webm',
  'audio/mpeg':              'audio/mp3',
  'audio/wav':               'audio/wav',
  'audio/aac':               'audio/aac',
  'audio/ogg':               'audio/ogg',
  'audio/mp4':               'audio/aac',
  'font/woff2':              'font/woff2',
  'font/ttf':                'font/ttf',
  'font/otf':                'font/otf',
  'application/pdf':         'application/pdf',
  'application/json':        'unknown', // resolved by content
  'application/octet-stream': 'unknown', // resolved by magic bytes
}

// ── Detector ──────────────────────────────────────────────────────────────────

export class FileTypeDetector {

  /**
   * Detect ImportFormat from a File.
   * Reads first 12 bytes for magic detection.
   * Falls back to MIME type, then extension.
   */
  async detect(file: File): Promise<ImportFormat> {
    // 1. Magic bytes (most reliable)
    const magic = await this.readMagicBytes(file, 12)
    const byMagic = this.detectByMagic(magic, file.name)
    if (byMagic !== 'unknown') {
      // dotLottie is a zip — check extension to confirm
      if (byMagic === 'application/dotlottie') {
        return this.isLottieExtension(file.name) ? 'application/dotlottie' : 'unknown'
      }
      // WAV vs WEBP both start with RIFF — check extension
      if (byMagic === 'image/webp' || byMagic === 'audio/wav') {
        return this.resolveRiff(magic, file.name, file.type)
      }
      return byMagic
    }

    // 2. MIME type
    const byMime = MIME_MAP[file.type]
    if (byMime && byMime !== 'unknown') return byMime

    // 3. Extension
    const byExt = this.detectByExtension(file.name)
    if (byExt !== 'unknown') return byExt

    // 4. Content sniff for JSON variants
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      return this.sniffJson(file)
    }

    return 'unknown'
  }

  /**
   * Detect format from a URL string (extension-only, no file access).
   */
  detectFromUrl(url: string): ImportFormat {
    try {
      const path = new URL(url).pathname
      return this.detectByExtension(path)
    } catch {
      return this.detectByExtension(url)
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private async readMagicBytes(file: File, count: number): Promise<Uint8Array> {
    const slice = file.slice(0, count)
    const buffer = await slice.arrayBuffer()
    return new Uint8Array(buffer)
  }

  private detectByMagic(bytes: Uint8Array, filename: string): ImportFormat {
    for (const sig of MAGIC_SIGNATURES) {
      const offset = sig.offset ?? 0
      if (bytes.length < offset + sig.bytes.length) continue
      const match = sig.bytes.every((b, i) => bytes[offset + i] === b)
      if (match) return sig.format
    }
    // SVG: starts with '<' (0x3C) or BOM + '<'
    if (bytes[0] === 0x3C || (bytes[0] === 0xEF && bytes[3] === 0x3C)) {
      if (filename.endsWith('.svg')) return 'image/svg+xml'
    }
    return 'unknown'
  }

  private detectByExtension(filename: string): ImportFormat {
    const lower = filename.toLowerCase()
    const dot = lower.lastIndexOf('.')
    if (dot === -1) return 'unknown'
    const ext = lower.slice(dot)
    return EXTENSION_MAP[ext] ?? 'unknown'
  }

  private resolveRiff(bytes: Uint8Array, filename: string, mime: string): ImportFormat {
    // RIFF....WEBP vs RIFF....WAVE
    if (bytes.length >= 12) {
      const sub = String.fromCharCode(...Array.from(bytes.slice(8, 12)))
      if (sub === 'WEBP') return 'image/webp'
      if (sub === 'WAVE') return 'audio/wav'
    }
    // Fallback to extension / mime
    if (mime === 'audio/wav' || filename.toLowerCase().endsWith('.wav')) return 'audio/wav'
    return 'image/webp'
  }

  private isLottieExtension(filename: string): boolean {
    return filename.toLowerCase().endsWith('.lottie')
  }

  private async sniffJson(file: File): Promise<ImportFormat> {
    try {
      const text = await file.slice(0, 512).text()
      const trimmed = text.trimStart()

      // Lottie JSON has "v" version field and "layers" array
      if (trimmed.includes('"v"') && trimmed.includes('"layers"')) {
        return 'application/lottie+json'
      }
      // Chorono scene has "formatVersion"
      if (trimmed.includes('"formatVersion"')) {
        return 'application/chorono+json'
      }
    } catch {
      // ignore parse errors
    }
    return 'unknown'
  }

  /**
   * Human-readable label for a format.
   */
  static label(format: ImportFormat): string {
    const labels: Partial<Record<ImportFormat, string>> = {
      'image/png':  'PNG Image',
      'image/jpeg': 'JPEG Image',
      'image/webp': 'WebP Image',
      'image/avif': 'AVIF Image',
      'image/gif':  'GIF Animation',
      'image/svg+xml': 'SVG Vector',
      'video/mp4':  'MP4 Video',
      'video/mov':  'QuickTime Video',
      'video/webm': 'WebM Video',
      'audio/mp3':  'MP3 Audio',
      'audio/wav':  'WAV Audio',
      'audio/aac':  'AAC Audio',
      'audio/ogg':  'OGG Audio',
      'font/woff2': 'WOFF2 Font',
      'font/ttf':   'TrueType Font',
      'font/otf':   'OpenType Font',
      'application/lottie+json': 'Lottie Animation',
      'application/dotlottie':   'dotLottie Package',
      'application/chorono+json': 'Chorono Scene',
      'application/ae-package':  'After Effects Package',
      'application/dxf':         'DXF CAD Drawing',
      'application/dwg':         'DWG CAD Drawing',
      'application/pdf':         'PDF Document',
      'application/figma':       'Figma Design',
      'application/psd':         'Photoshop Document',
      'unknown':    'Unknown Format',
    }
    return labels[format] ?? format
  }

  /**
   * Whether a format is supported by Phase 1 of the import pipeline.
   */
  static isSupported(format: ImportFormat): boolean {
    const supported: ImportFormat[] = [
      'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif',
      'image/svg+xml',
      'video/mp4', 'video/mov', 'video/webm',
      'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg',
      'font/woff2', 'font/ttf', 'font/otf',
      'application/lottie+json', 'application/dotlottie',
      'application/chorono+json',
    ]
    return supported.includes(format)
  }
}

/** Singleton for convenience */
export const fileTypeDetector = new FileTypeDetector()
