// ── IPlaybackController ───────────────────────────────────────────────────────
// Abstract playback contract. Timeline-based modes (2D, video, 3D) share a
// simple play/pause/seek model. Game engine mode uses event-driven playback
// (StateMachine dispatch) but still satisfies this interface so UI controls
// remain generic.

import type { EditorMode } from './EditorMode'

export interface IPlaybackController {
  mode: EditorMode
  currentTimeMs: number
  isPlaying: boolean

  play(): void
  pause(): void
  /** Jump to an absolute time position. */
  seek(timeMs: number): void
  /** Stop and return to the start. */
  stop(): void
  /**
   * Advance internal time by `deltaMs`. Called every animation frame.
   * Timeline-based: increments currentTimeMs and handles looping.
   * Game-based: flushes queued events through the state machine.
   */
  update(deltaMs: number): void
}
