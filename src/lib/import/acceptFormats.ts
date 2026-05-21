// ── Import Accept Formats ─────────────────────────────────────────────────────
//
// Shared `accept` attribute for <input type="file"> import pickers.
// Covers every format the Phase-1 universal import pipeline can handle.
// Used by the toolbar ImportMenu and the AssetsPanel import control.

export const IMPORT_ACCEPT = [
  // Images
  'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif',
  'image/svg+xml',
  // Video
  'video/mp4', 'video/quicktime', 'video/webm',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg',
  // Fonts (MIME + extension fallback — browsers are inconsistent here)
  'font/woff2', 'font/ttf', 'font/otf', '.woff2', '.ttf', '.otf',
  // Documents (Lottie JSON, dotLottie, Chorono scene)
  '.json', '.lottie',
].join(',')

/** Short human-readable list of supported formats for tooltips/help text. */
export const IMPORT_FORMATS_LABEL =
  'Images, SVG, video, audio, fonts, Lottie, Chorono scenes'
