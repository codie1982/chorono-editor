// ── Import Accept Formats ─────────────────────────────────────────────────────
//
// Shared `accept` attribute for <input type="file"> import pickers.
// Covers every format the Phase-1 universal import pipeline can handle.
// Used by the File menu "From File…" picker and the AssetsPanel import control.

export const IMPORT_ACCEPT = [
  // Images
  'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif',
  'image/svg+xml',
  // Video
  'video/mp4', 'video/quicktime', 'video/webm',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg', 'audio/mp4', '.mp3', '.wav', '.aac', '.m4a', '.ogg',
  // Fonts (MIME + extension fallback — browsers are inconsistent here)
  'font/woff', 'font/woff2', 'font/ttf', 'font/otf', '.woff', '.woff2', '.ttf', '.otf',
  // Documents (Lottie JSON, dotLottie, Chorono scene)
  '.json', '.lottie',
].join(',')
