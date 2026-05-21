// ── Editor Mode ───────────────────────────────────────────────────────────────
// Discriminant string shared across all mode interfaces.
// '2danimation' is the only implemented mode; extend the union as new modes land.

export type EditorMode =
  | '2danimation'
  | 'video-editor'
  | 'game-engine'
  | '3d-modeling'
