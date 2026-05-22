# SDKs

Chorono animations are not limited to the Chorono editor. The Web SDK and Android SDK let you play back `.json` scene files inside your own products — websites, apps, or anywhere else your users are.

---

## Web SDK

The Web SDK plays Chorono scenes in any modern browser. Drop it into a webpage, point it at an exported scene file, and you have a fully animated, interactive component with no external dependencies.

### Installation

**Via CDN** — fastest way to get started:

```html
<script src="https://cdn.chorono.io/web-sdk/latest.js"></script>
```

**Via npm** — recommended for bundler-based projects (Webpack, Vite, Rollup, etc.):

```bash
npm install @chorono/web-sdk
```

```javascript
import { ChronoPlayer } from '@chorono/web-sdk'
```

### Basic Usage

```html
<div id="my-animation" style="width: 800px; height: 450px;"></div>

<script>
const player = new ChronoPlayer({
  container: '#my-animation',
  sceneUrl: './animation.json',
  autoplay: true,
  loop: true
})
</script>
```

`container` accepts a CSS selector string or a direct DOM element reference. The player fills the container and scales the scene to fit.

### Full API

**Playback control:**

```javascript
player.play()
player.pause()
player.stop()
player.seek(2000)            // seek to 2000 ms (2 seconds)
player.setPlaybackRate(1.5)  // 1.5x speed; supports any positive number
player.setLoop(true)         // toggle looping on or off
```

**State Machine control:**

```javascript
player.setParam('speed', 10)  // set a State Machine parameter by name
player.dispatch('jump')        // trigger a named State Machine transition
```

**Layer control:**

```javascript
player.setLayerVisible('bg', false)  // show or hide a layer by name
```

**Events:**

```javascript
player.on('play',        () => { /* playback started */ })
player.on('pause',       () => { /* playback paused  */ })
player.on('complete',    () => { /* reached the end  */ })
player.on('seek',        (timeMs)       => { /* seeked to timeMs */ })
player.on('stateChange', (from, to)     => { /* SM transition    */ })
```

**Cleanup:**

```javascript
player.destroy()  // removes the canvas, unbinds all events, frees memory
```

### Responsive Scaling

The player automatically re-scales when the container resizes. No extra code required. For fluid layouts, you can set the container to a percentage width and use an aspect-ratio CSS rule:

```css
#my-animation {
  width: 100%;
  aspect-ratio: 16 / 9;
}
```

### GPU Acceleration

Scenes that use WebGL2 particle systems in the Chorono editor render with GPU acceleration in the Web SDK too. No configuration is required — the SDK detects WebGL2 availability and falls back gracefully to Canvas 2D if the browser or device does not support it.

### Size and Browser Support

| Property | Value |
|---|---|
| Bundle size | ~45 KB gzipped |
| Chrome | 70+ |
| Firefox | 65+ |
| Safari | 15+ |
| Edge | 79+ |
| Mobile browsers | iOS Safari 15+, Chrome for Android 70+ |

---

## Android SDK

The Android SDK provides native playback of Chorono scenes inside Android applications. It integrates with the standard Android View system and respects the Activity and Fragment lifecycle automatically.

### Installation

Add the dependency to your module-level `build.gradle`:

```kotlin
dependencies {
    implementation 'io.chorono:chorono-android:1.0.0'
}
```

Sync your project after adding the dependency.

### Basic Usage

```kotlin
// In your Activity or Fragment
val player = ChronoPlayer(context)
player.loadScene(uri)         // load from a Uri (assets, file system, or URL)
player.play()
```

Add `player.getView()` to your layout, or declare `ChronoPlayerView` directly in XML:

```xml
<io.chorono.ChronoPlayerView
    android:id="@+id/chronoPlayer"
    android:layout_width="match_parent"
    android:layout_height="wrap_content" />
```

```kotlin
// Attach the player to the view
val playerView = findViewById<ChronoPlayerView>(R.id.chronoPlayer)
val player = playerView.getPlayer()
player.loadScene(uri)
player.play()
```

### Full API

**Playback control:**

```kotlin
player.play()
player.pause()
player.stop()
player.seek(2000)               // seek to 2000 ms
player.setPlaybackRate(1.5f)    // 1.5x speed
```

**State Machine control:**

```kotlin
player.setParam("speed", 10.0)  // set a State Machine parameter by name
player.dispatch("jump")          // trigger a named State Machine transition
```

**Layer control:**

```kotlin
player.setLayerVisible("bg", false)  // show or hide a layer by name
```

**Events:**

The event API is coroutine-friendly and works naturally with `lifecycleScope`:

```kotlin
lifecycleScope.launch {
    player.onEvent { event ->
        when (event) {
            is PlayEvent     -> { /* playback started             */ }
            is PauseEvent    -> { /* playback paused              */ }
            is CompleteEvent -> { /* reached the end              */ }
            is SeekEvent     -> { /* seeked to event.timeMs       */ }
            is StateChangeEvent -> {
                val from = event.from  // previous SM state name
                val to   = event.to    // new SM state name
            }
        }
    }
}
```

### Loading Scenes

The player can load a scene from multiple sources:

```kotlin
// From the assets folder
player.loadScene(context.assets.open("animation.json"))

// From a file Uri
player.loadScene(Uri.fromFile(File(context.filesDir, "animation.json")))

// From an InputStream (e.g., downloaded from a server)
player.loadScene(inputStream)

// From a URL (loads asynchronously)
player.loadSceneFromUrl("https://example.com/animations/intro.json")
```

### Rendering

| Mode | When it is used |
|---|---|
| Android Canvas (CPU) | Default for all scenes |
| OpenGL ES 3.0 (GPU) | Automatically used for scenes with GPU particle layers, when the device supports OpenGL ES 3.0 |

To force CPU rendering (useful for testing or embedding in a `SurfaceView`):

```kotlin
val player = ChronoPlayer(context, renderMode = RenderMode.CPU)
```

### Lifecycle Awareness

`ChronoPlayer` is lifecycle-aware. Bind it to your Activity or Fragment lifecycle so it pauses when the app goes to the background and resumes when it returns:

```kotlin
lifecycle.addObserver(player)
```

With this single line, the player automatically pauses on `ON_PAUSE` and resumes on `ON_RESUME`. On `ON_DESTROY`, it releases all resources.

### Adaptive Quality

On low-end devices, the SDK engages frame-skipping automatically to maintain a smooth perceived playback without overloading the CPU or GPU. You can configure the quality threshold:

```kotlin
val player = ChronoPlayer(
    context,
    qualityMode = QualityMode.ADAPTIVE  // default
    // or QualityMode.HIGH for always-full-quality
    // or QualityMode.LOW for battery-saving environments
)
```

---

## Exporting Scenes for SDKs

Before you can play a scene in the Web or Android SDK, export it from the Chorono editor:

1. Go to **File → Export → Scene JSON (.json)**.
2. Choose whether assets (images, fonts) should be **embedded** (base64-encoded inside the `.json`) or **referenced by URL** (assets stay separate, `.json` stays small).
3. Click **Export**.

The exported file is runtime-optimized: editor-only metadata such as layer lock state, color labels, hidden layers, and draft notes are stripped automatically, keeping the file as compact as possible.

**What the file includes:**

- All layers and their property values
- Timeline keyframes and easing data
- State Machine definitions, states, transitions, and parameters
- Animation Modifier settings (sine, spring, bounce, etc.)
- Asset references or embedded asset data

**Typical file sizes:**

| Scene complexity | Embedded assets | Referenced assets |
|---|---|---|
| Simple (< 20 layers) | 10–80 KB | < 5 KB |
| Medium (20–100 layers) | 80 KB–2 MB | 5–30 KB |
| Complex (100+ layers, particles) | 2–10 MB | 30–100 KB |

For production deployments, referenced assets with a CDN is the recommended approach: smaller initial download, browser/network caching for assets, and easier asset updates without re-exporting the scene.
