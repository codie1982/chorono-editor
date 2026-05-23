# Particle Effects in Chorono Animator

Chorono's particle system lets you create fire, smoke, rain, confetti, sparks, and any other effect built from many small elements moving together. Particles are GPU-accelerated, so you can work with tens of thousands of them in real time without frame drops.

---

## Adding a Particle Emitter

Open the **Layer Panel** and click the **+** button. Select **Particles** from the layer type menu. A new particle emitter layer appears in your scene and timeline.

Each particle emitter has its own dedicated **Particle dock tab** — a separate panel from the standard Properties Panel. Click the Particle tab to access all emission and visual controls. This keeps particle-specific settings organized and away from the general layer properties.

---

## Emission Shapes

The emission shape defines where new particles originate. There are six options:

### Point
All particles spawn from a single origin point. Use this for focused effects like candle flames, fountain sprays, or small sparks. The emitter position can be animated with keyframes to move the source through the scene.

### Line
Particles spawn along a straight line segment. Useful for rain falling across the top of the frame, a sparkling streak, or a beam that emits outward along its length. You control the line's length and orientation.

### Circle
Particles spawn from the perimeter or area of a circle. **Perimeter mode** creates ring-shaped emission — good for explosion rings or circular bursts. **Area mode** fills the circle, creating a volume-based source like a glowing orb or area fog.

### Rectangle
Particles spawn from within a rectangular region. Use this for large-area effects like falling snow over a scene, or a field of fireflies distributed across a wide area.

### Path
Particles emit along a drawn path. Draw any curve you like — the emitter places particles along its length. This is ideal for trailing effects that follow a specific shape, like sparks along a zigzag wire or bubbles rising along a curved pipe.

### Source Layer
This is the most powerful emission mode. **Source Layer** links the emitter to any other layer in your scene — a shape, image, or text layer — and emits particles from that layer's geometry. Critically, the emission follows the layer's animation live.

**Example:** Place a car shape layer in your scene and animate it driving across the frame. Add a particle emitter set to Source Layer, target the car layer, and particles will spawn from the car's position as it moves — no manual keyframing of the emitter needed. The sparks, smoke, or dust trail follow the car automatically through every frame.

---

## Particle Shapes

Each particle is rendered as an SDF (Signed Distance Field) shape computed directly in the GPU shader. This means crisp, anti-aliased edges at any size or rotation. There are nine shapes available:

| Shape | Best Used For |
|-------|---------------|
| **Circle** | General-purpose particles, bubbles, droplets |
| **Soft Circle** | Smoke, fog, soft glows |
| **Rectangle** | Paper confetti, falling leaves, debris |
| **Rounded Rectangle** | Stylized confetti, soft debris |
| **Line** | Rain, sparks, streaks, motion trails |
| **Triangle** | Stylized embers, geometric effects |
| **Star** | Magic sparkles, light flares |
| **Smoke Puff** | Realistic smoke, clouds, exhaust |
| **Flame Blob** | Fire particles, candle flames |

Select the particle shape in the Particle dock. All shapes work with all blend modes.

---

## Core Controls

These parameters control how particles are born and how they move:

- **Emission Rate** — How many particles are spawned per second. Higher values create denser effects. Set to 0 to stop emission while keeping existing particles alive.
- **Particle Lifetime** — How long each particle lives, in seconds. Short lifetimes create tight, fast effects; long lifetimes create lingering trails.
- **Initial Speed** — How fast particles move when they first spawn. Combined with direction and spread, this shapes the overall energy of the effect.
- **Direction** — The base angle particles travel when spawned, in degrees. 0 is rightward, 90 is upward.
- **Spread Angle** — How wide the emission cone is, in degrees. A spread of 0 fires all particles in exactly the same direction. A spread of 360 fires particles in all directions equally — useful for explosions and radial bursts.

---

## Visual Controls

These parameters control how particles look over their lifetime:

- **Size (min/max)** — Particles are born at a random size within this range, creating natural variation. Animate the size range over time to make particles grow or shrink.
- **Opacity over Lifetime** — A curve that controls how a particle's transparency changes from birth to death. The default fade-out curve (full opacity at birth, zero at death) is correct for most effects. Adjust the curve for effects where particles should fade in, peak, then fade out.
- **Color over Lifetime** — Set a gradient that maps across each particle's lifetime. A fire effect typically goes from bright yellow-white at birth to deep orange-red near death. A magic trail might shift from white through teal to purple.
- **Rotation** — Set an initial rotation range and a rotation speed. Rotation speed can be positive or negative to spin particles clockwise or counterclockwise. Adding random rotation to Rectangle or Rounded Rectangle particles makes confetti look natural.

---

## Blend Modes

Blend mode controls how particles composite with the layers beneath them:

- **Normal** — Standard alpha compositing. Use for opaque or semi-transparent particles that should simply sit on top of the scene.
- **Screen** — Additive brightening. Particles add light to whatever is below them — dark areas in the particle become transparent. Use Screen for fire, sparks, glows, lens flares, and neon effects. This is the most common choice for bright particle effects.
- **Multiply** — Darkening blend. Light areas in the particle become transparent; dark areas darken the scene beneath. Use for smoke, shadows, and ink splatters.
- **Overlay** — Combines Multiply and Screen based on the underlying layer's brightness. Creates a contrast-boosting, stylized look.

---

## Burst Mode

Enable **Burst Mode** to emit all particles at once at t=0 (the emitter's start time on the timeline) instead of continuously over time. Burst Mode is designed for:

- **Fireworks** — a single large burst that expands and fades
- **Explosions** — high-count burst with short lifetime and outward spread
- **Impact effects** — a quick scatter of debris or sparks at the moment of a hit

In Burst Mode, the Emission Rate parameter controls the total number of particles spawned in the burst. After the burst fires, no new particles are emitted — only the existing particles live out their lifetimes.

---

## Animating Particle Properties

Every parameter in the Particle dock supports **keyframes**. Click the keyframe diamond next to any parameter to start animating it over time.

Common animated workflows:

- **Ramping emission rate** — Start at 0 and ramp up over half a second for a fire that builds gradually.
- **Color shift** — Animate the color-over-lifetime gradient from cool to warm as an explosion transitions from initial flash to sustained burn.
- **Speed over time** — Slow a particle system down as it winds up, then push speed high at the moment of release.
- **Emitter position** — Keyframe the emitter layer's position to move the source through the scene while keeping all other parameters constant.

---

## Performance

Particle rendering in Chorono is **GPU-accelerated via WebGL2 instanced rendering**. Each emitter uses a single draw call regardless of particle count — the GPU processes all particles in parallel.

In practice, you can run **10,000+ particles at 60 FPS** on modern hardware without impacting the rest of your scene. For reference, 50,000 particles measured at approximately 0.6 ms render time on Apple M2.

A few practical tips:

- If you need a dense, large-area effect, use one emitter with a high count rather than many emitters with low counts. Fewer emitters means fewer draw calls.
- Screen blend is the most GPU-friendly option for bright-on-dark additive effects.
- Particle simulation (position updates, lifetime tracking) runs on the CPU for determinism, so extremely high particle counts (hundreds of thousands) will eventually affect simulation cost — but rendering will remain fast well beyond that threshold.
