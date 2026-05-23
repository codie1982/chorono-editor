# GPU Rendering in Chorono Animator

Chorono uses **WebGL2-accelerated GPU rendering** for its most demanding visual work. This is not a toggle or an export setting — it runs automatically whenever your browser supports it, giving you a dramatically faster experience without any configuration.

---

## Why GPU Rendering Matters

Traditional animation tools render everything through the browser's Canvas 2D API (CPU-based). This is fine for shapes, text, and images, but it breaks down fast when you add thousands of particles or heavy post-processing effects.

Chorono moves the expensive work to the GPU. The difference is not incremental — it is an order-of-magnitude improvement:

| Particle Count | CPU (Canvas 2D) | GPU (WebGL2) | Speedup |
|----------------|-----------------|--------------|---------|
| 1,000          | 1.9 ms          | 0.01 ms      | ~140x   |
| 10,000         | 4.9 ms          | 0.12 ms      | ~42x    |
| 50,000         | 49.5 ms         | 0.6 ms       | ~84x    |

*Measured on Apple M2. Your results may vary by hardware.*

At 50,000 particles, the CPU renderer drops well below 60 FPS — the GPU renderer barely registers the load. This is what makes fire, rain, confetti, and complex particle systems practical in a web-based tool.

---

## What Runs on the GPU

### Particle Rendering
Every particle emitter uses **WebGL2 instanced quads** — a technique that sends all particles in a single draw call, regardless of how many there are. Whether you have 100 or 100,000 particles in an emitter, the GPU receives one instruction and handles the rest in parallel.

This is fundamentally different from the CPU approach, which must process and draw each particle one by one.

### Post-Processing Effects
Three post-effects run entirely on the GPU via a **separable GPU filter** pipeline:

- **Gaussian Blur** — mathematically precise, hardware-accelerated blur applied in two passes (horizontal then vertical). No matter how large the blur radius, the cost stays low.
- **Glow** — builds on Gaussian blur to create the luminous halo effect seen in professional compositing tools.
- **Drop Shadow** — applies a blurred, offset copy of the layer beneath the original, composited correctly in a single GPU pass.

### Motion Blur
Chorono uses the **accumulation method** for motion blur — the same approach used by After Effects and high-end compositors. Multiple sub-frame samples are blended together to produce a smooth, physically-accurate smear. The effect runs on the GPU, so adding motion blur to a particle system does not meaningfully impact performance.

---

## What Runs on the CPU (and Why)

Two categories of work intentionally stay on the CPU:

### Particle Simulation
Spawning particles, evaluating their lifetimes, applying forces (gravity, turbulence), and tracking their positions — all of this runs on the CPU. This is a deliberate choice: GPU compute is fast but non-deterministic, meaning the same animation could produce slightly different results on different machines. CPU simulation guarantees frame-identical playback every time, which is essential for animation authoring and export.

### Scene Rendering (Canvas 2D)
Shapes, text layers, images, and the general scene composition continue to use the browser's Canvas 2D pipeline. This is the right tool for that work — it integrates correctly with the browser's layout, accessibility, and font rendering systems.

---

## SDF Particle Shapes

GPU-rendered particles use **Signed Distance Fields (SDF)** to define their shape in the shader. This means each particle shape is computed mathematically at the pixel level, producing perfectly anti-aliased edges regardless of size or rotation — no pixelation, no blurring from texture scaling.

There are 9 available SDF shapes:

| Shape | Character |
|-------|-----------|
| Circle | Hard-edged disc |
| Soft Circle | Disc with a soft, feathered edge |
| Rectangle | Sharp-cornered quad |
| Rounded Rectangle | Quad with adjustable corner radius |
| Line | Thin segment, useful for sparks and rain |
| Triangle | Three-pointed polygon |
| Star | Five-pointed star |
| Smoke Puff | Organic, wispy blob for smoke and clouds |
| Flame Blob | Asymmetric teardrop for fire particles |

These shapes are selected per emitter in the Particle dock. Each one works with all blend modes and renders at the same GPU cost.

---

## GPU Compositor and Blend Modes

The GPU layer composites correctly with the Canvas 2D scene beneath it. Chorono supports four blend modes between particles and the scene:

- **Normal** — standard alpha compositing
- **Screen** — brightening blend; ideal for additive glow, fire, and light effects
- **Multiply** — darkening blend; useful for smoke and shadows
- **Overlay** — contrast-enhancing blend for stylized effects

Blend mode is set per emitter, not per-scene, so different particle systems in the same scene can use different blending simultaneously.

---

## Automatic CPU Fallback

If WebGL2 is not available in the user's browser, Chorono automatically falls back to Canvas 2D rendering for all GPU-accelerated work. No error message, no blank screen, no action required. The fallback is seamless — particle counts above a few hundred may impact performance, but the scene will render correctly.

---

## Browser Requirements for GPU Rendering

WebGL2 support is required to use GPU acceleration. The following browser versions support WebGL2:

| Browser | Minimum Version |
|---------|-----------------|
| Chrome  | 70+             |
| Firefox | 65+             |
| Safari  | 15+             |
| Edge    | 79+             |

To check whether GPU rendering is active in your session, open the browser's WebGL debug page or check the browser console — Chorono logs a confirmation message on startup when WebGL2 is successfully initialized.

---

## Tips for Best GPU Performance

- **Prefer fewer, larger emitters over many small ones.** Each emitter uses one draw call on the GPU. Ten emitters at 1,000 particles each is more efficient than 1,000 emitters at 10 particles each.
- **Use Screen blend for additive effects.** Screen blending is the correct choice for fire, sparks, neon glows, and light trails. It is also the most GPU-efficient option for bright-on-dark compositing.
- **Keep post-effects targeted.** Applying a Gaussian blur or Glow to a single particle layer is cheap. Stacking multiple large-radius blurs across many layers will eventually accumulate cost. Use blur radius values that serve the creative intent, not the largest possible value.
- **Motion blur adds sub-frame samples.** More sub-frame samples produce smoother motion blur but multiply the rendering work proportionally. For most animations, the default setting produces excellent results.
