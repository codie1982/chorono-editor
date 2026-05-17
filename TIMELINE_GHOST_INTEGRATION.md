# Timeline Ghost/Onion-Skin Feature — Integration Guide

## Overview

Timeline Ghost rendering shows intermediate frames of animated layers at N-frame intervals before/after the playhead. This helps visualize motion paths and animation arcs.

## Files Created

- `src/lib/animation/ghostFrames.ts` — Frame interpolation utility
- `src/lib/types/editor.ts` — TimelineGhostSettings type (added)
- `src/components/timeline/hooks/useTimelineGhost.ts` — State hook + persistence
- `src/components/timeline/TimelineGhostControl.tsx` — UI dropdown component
- `src/lib/render/renderGhostFrames.ts` — Canvas rendering utilities

## Integration Steps

### 1. Add Ghost State to TimelinePanel

In `src/components/TimelinePanel.tsx`:

```typescript
import { useTimelineGhost } from './timeline/hooks/useTimelineGhost'

export default function TimelinePanel({
  // ... existing props
}) {
  // ... existing state
  
  // Add ghost hook
  const {
    ghostSettings,
    updateGhostSettings,
    toggleGhost,
    applyPreset,
  } = useTimelineGhost()

  // ... rest of component
}
```

### 2. Add Ghost Control to TimelineToolbar

In `src/components/timeline/TimelineToolbar.tsx`:

```typescript
import TimelineGhostControl from './TimelineGhostControl'

interface Props {
  // ... existing props
  ghostSettings: TimelineGhostSettings
  selectedLayerIds: Set<string>
  onGhostUpdate: (patch: Partial<TimelineGhostSettings>) => void
  onGhostToggle: () => void
  onGhostPreset: (preset: 'off' | 'light' | 'medium' | 'heavy') => void
}

export default function TimelineToolbar(props: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 ...">
      {/* ... existing toolbar items ... */}

      {/* Add ghost control before the mode selector */}
      <TimelineGhostControl
        ghostSettings={props.ghostSettings}
        selectedLayerIds={props.selectedLayerIds}
        onUpdateSettings={props.onGhostUpdate}
        onToggle={props.onGhostToggle}
        onApplyPreset={props.onGhostPreset}
      />

      {/* ... rest of toolbar ... */}
    </div>
  )
}
```

### 3. Wire Up TimelinePanel Props

In `src/components/TimelinePanel.tsx`, pass ghost props to toolbar:

```typescript
<TimelineToolbar
  // ... existing props
  ghostSettings={ghostSettings}
  selectedLayerIds={selectedLayerIds}
  onGhostUpdate={updateGhostSettings}
  onGhostToggle={toggleGhost}
  onGhostPreset={applyPreset}
/>
```

### 4. Render Ghost Frames in Canvas

When rendering the scene, call ghost rendering:

```typescript
import { getMultiLayerGhostFrames } from '@/lib/animation/ghostFrames'
import { renderGhostFrames } from '@/lib/render/renderGhostFrames'

// In your canvas render loop (e.g., CanvasRenderer.ts or page.tsx):
if (ghostSettings.enabled && timeline) {
  const ghostFrames = getMultiLayerGhostFrames(
    scene.layers,
    timeline,
    currentTimeMs,
    ghostSettings.beforeFrames,
    ghostSettings.afterFrames,
    ghostSettings.scope,
    ghostSettings.scope === 'selected' ? selectedLayerIds : undefined,
    ghostSettings.fps ?? 30,
  )

  // Render ghosts for each frame
  for (const ghostFrame of ghostFrames) {
    const ghostLayer = scene.layers.find((l) => l.id === ghostFrame.layerId)
    if (!ghostLayer) continue

    // Create a temporary layer with ghost transform/opacity
    const tempLayer = {
      ...ghostLayer,
      transform: ghostFrame.transform || ghostLayer.transform,
      opacity: ghostFrame.opacity ?? ghostLayer.opacity,
    }

    // Render the ghost layer
    const renderer = rendererRegistry.findOrThrow(tempLayer)
    const ctx = { ...renderContext, layer: tempLayer }
    
    const savedAlpha = canvas.globalAlpha
    canvas.globalAlpha = (ghostFrame.opacity ?? 1) * 0.35 // Ghost opacity
    renderer.render(ctx, tempLayer)
    canvas.globalAlpha = savedAlpha
  }
}
```

## Usage

### Quick Presets

- **Off** — Disable ghost rendering
- **Light** — ±2 frames @ 20% opacity (subtle motion hint)
- **Medium** — ±5 frames @ 30% opacity (balanced visualization)
- **Heavy** — ±10 frames @ 50% opacity (full motion arc)

### Manual Controls

- **Scope** — "All Animated" (all layers with keyframes) or "Selected Only"
- **Before/After** — How many frames before/after playhead to show (0–20)
- **Opacity** — Transparency of ghost frames (5–100%)

## Features

✅ Playhead-relative ghost rendering (not frame-locked)  
✅ Scope toggle (all vs. selected layers)  
✅ Configurable frame range & opacity  
✅ Quick presets for common workflows  
✅ localStorage persistence  
✅ FPS-aware frame calculation (default 30 fps)  
✅ Shows motion paths for position animation  

## Performance Considerations

- Ghost rendering is **optional** (disabled by default)
- Each ghost frame requires one full render pass → scales with `beforeFrames + afterFrames`
- Suggested limits:
  - Desktop: ±10 frames is smooth
  - Mobile: ±5 frames recommended
  - Reduce opacity to improve performance

## Future Enhancements

- [ ] Per-layer ghost settings (stored in Layer metadata)
- [ ] Ghost color customization (per-layer or preset colors)
- [ ] Motion blur ghosting (instead of discrete frames)
- [ ] Ghost frame paths (draw bezier curve through ghost positions)
- [ ] Keyboard shortcut (e.g., `G` to toggle ghost)

## Testing Checklist

- [ ] Ghost dropdown opens/closes
- [ ] Quick presets apply correct settings
- [ ] Before/After sliders work
- [ ] Opacity slider works
- [ ] Scope toggle filters layers correctly
- [ ] Ghost renders on canvas at playhead ±N frames
- [ ] Settings persist across reload (localStorage)
- [ ] No performance regression at ±5 frames
- [ ] Ghost frames update when animation keyframes change
- [ ] Canvas renders normally with ghost disabled

## Debugging

Enable debug visualization by adding to canvas render:

```typescript
import { renderGhostTimelineDebug } from '@/lib/render/renderGhostFrames'

if (ghostSettings.enabled && timeline) {
  // ... render ghosts ...
  
  // Show timeline debug bars
  renderGhostTimelineDebug(ctx, ghostFrames, canvasTop, canvasHeight)
}
```

This draws colored bars showing which frames are being rendered as ghosts.
