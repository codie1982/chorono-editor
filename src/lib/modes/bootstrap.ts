// ── Mode Bootstrap ────────────────────────────────────────────────────────────
// Import this once at app startup (e.g. layout.tsx or page.tsx) to register
// all built-in modes with ModeRegistry. Future modes add one import here.

import { modeRegistry } from './ModeRegistry'
import { Animation2DDescriptor } from './animation2d/descriptor'

modeRegistry.register(Animation2DDescriptor)
