# Chorono Animator 🎬

A next-generation web-based animation and design tool built with **Next.js** and **Canvas**, featuring AI-powered animation creation, advanced timeline editing, and a **GPU-accelerated rendering subsystem** for particles, post-effects, and motion blur.

## ⚡ Headline Feature: GPU-Accelerated Rendering

**WebGL2-accelerated rendering** (`feature/gpu-particle-renderer-v1`):

- **Particles via WebGL instanced quads** — every particle in an emitter draws in a single GPU draw call
- **9 SDF particle shapes** — Circle, Soft Circle, Rectangle, Rounded Rectangle, Line, Triangle, Star, Smoke Puff, Flame Blob — all anti-aliased in-shader (fwidth)
- **GPU post-effects** — separable Gaussian blur shared by blur, glow, and shadow
- **After Effects-quality motion blur** — accumulation of many equal-weight sub-frame samples (smooth smear, not discrete ghosts)
- **Automatic CPU fallback** — graceful degradation to Canvas 2D when WebGL is unavailable
- **Smart GPU compositor** — correct source-over / additive / screen / multiply blending against the scene below
- **Hardened** — event system on every class, error handling, SSR-safe GPU capability probing, WebGL context-loss recovery

### Performance (particle render, Apple M2, real measurement)
GPU offloads the **render**; particle simulation (spawn/evaluate) stays on CPU.
```
Particles   CPU render   GPU render   speedup
   1,000      1.9 ms       0.01 ms      ~140×
  10,000      4.9 ms       0.12 ms       ~42×
  50,000     49.5 ms       0.6 ms        ~84×
```
At ~50k particles the CPU draw alone (49.5 ms) blows the 16.6 ms/60 FPS budget; the GPU draw stays sub-millisecond.

---

## ✨ Complete Feature Set

### 🤖 AI-Powered Animation
- **Natural language animation creation** — Describe your animation: _"Mavi daire ekle, soldan sağa kay, fade in yap"_ → instant keyframes
- **Multi-turn agent loop** — Intelligent reasoning with mutation and verification
- **Flexible AI backends** — Anthropic, OpenAI, or custom (Ollama/Groq/Together/Azure)

### 🎨 Advanced Editing Tools
- **Spline object system** — 3ds Max-style editable paths (Circle, Rectangle, Line, Ellipse, Arc, Donut, N-gon, Star)
- **Smart selection engine** — Select Similar, Select by Transform, canvas selection (Box/Lasso/Circle/Paint)
- **Clone & Array system** — Linear, Grid, Radial, Path, and Repeater patterns with live instancing
- **Transform gizmos** — Move, rotate, scale with snap guides and smart alignment
- **Context-aware menus** — Right-click actions for faster workflows

### ⏱️ Professional Timeline
- **Out-of-range modes** — Constant, Cycle, Loop, Ping-pong, Linear interpolation beyond keyframes
- **Advanced keyframe tools** — Slide by frame, range select, stagger, keyframe spreadsheet
- **Work area & markers** — Playback regions with navigation markers
- **Parameter wiring** — Drive properties with 17+ preset formulas and expressions

### ✨ Animation Effects
- **Signal modifiers** — Sine, Pulse, Quantize, Offset, Scale, Clamp
- **Procedural animation** — Fractal, Jitter, and noise-driven effects
- **Physics simulation** — Spring, Decay, Elastic, Bounce, Overshoot
- **GPU post-effects** — separable Gaussian blur shared by blur, glow, and shadow (CSS-filter fallback)
- **GPU motion blur** — After Effects-style accumulation (smooth smear, CPU trail fallback)

### 🎭 Particle Effects (GPU-Powered)
- **Polymorphic emitters** — 6 emission shapes (Point, Line, Circle, Rectangle, Path, Source Layer)
- **9 particle types** — Circle, Soft Circle, Rectangle, Rounded Rectangle, Line, Triangle, Star, Smoke Puff, Flame Blob
- **Scene-layer emission** — Emit particles from any layer's geometry
- **Real-time preview** — Particle density, speed, lifetime, rotation controls
- **Blend modes** — Normal, Screen, Additive, Multiply

### 📁 Asset Management
- **Universal import** — Images, video, audio, SVG, Lottie, dotLottie
- **Asset registry** — Organize and manage imported resources
- **Security** — SVG sanitization and HTTPS-only validation

### 🔄 Composition Tools
- **Align & distribute** — 6 operations with multiple reference modes
- **Smart guides** — Live center, edge, and spacing overlays
- **Pack & tidy** — Automatic arrangement with configurable gaps

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Modern browser with WebGL2 support (Chrome, Firefox, Safari 15+, Edge)

### Installation

```bash
git clone git@github.com:your-username/chorono-nextjs.git
cd chorono-nextjs
npm install
npm run dev
```

Open [http://localhost:2000](http://localhost:2000) (the dev server runs on port 2000)

### Environment Setup (Optional — AI Features)

```env
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

## 📖 Architecture

### Core Data Model
```
ChronoScene → Layer → Timeline → Track → Keyframe
```

### GPU Subsystem
```
src/lib/render/gpu/
├── GPUCapabilities.ts                  # WebGL2/WebGL1 + extension detection (SSR-safe)
├── GPUCompositor.ts                    # Identity-transform blend & blit to 2D canvas
├── GPUEvents.ts                        # Shared typed event emitter base
├── particles/
│   ├── ParticleGPUBackend.ts           # Abstract backend
│   ├── WebGLInstancedQuadBackend.ts    # Instanced-quad particle renderer
│   ├── WebGLParticleShader.ts          # 9-shape SDF shaders (WebGL2/1)
│   └── ParticleBufferPacker.ts         # Per-frame instance staging buffer
└── effects/
    ├── GPUEffectShaders.ts             # Blur + motion-blur GLSL
    ├── GPUImageEffects.ts              # Separable Gaussian blur engine
    └── GPUMotionBlur.ts                # Accumulation motion-blur engine

src/lib/render/renderMotionBlurAccumulated.ts   # Motion-blur orchestration
```

### Key Modules
- **`src/lib/core/`** — Data model (Layer, Timeline, ChronoScene)
- **`src/lib/editor/`** — Commands and state management
- **`src/lib/ai/`** — AI integration (ActionRegistry, AgentLoop)
- **`src/lib/render/`** — Canvas + GPU rendering pipeline
- **`src/components/`** — UI panels and canvas

## 🧪 Testing

```bash
npm test                    # Run all tests
npm test -- --watch       # Watch mode
npm test -- --coverage    # Coverage report
```

**1,000+ tests** (1,086) covering core features, GPU buffer/transform logic, particle physics, and animation.

## 🛠️ Development

### Build
```bash
npm run build
npm start
```

⚠️ **Critical:** Never run `next build` while dev server is running — it corrupts `.next/`.

### Code Style
- OOP with abstract base classes
- Private properties + getter/setters
- Event emission for all new classes
- Self-documenting code (minimal comments)

---

## 📚 Documentation

Detailed documentation coming soon. For now, see inline code comments and type definitions.

## 🎯 Current Branches

| Branch | Feature | Status |
|--------|---------|--------|
| `feature/gpu-particle-renderer-v1` | GPU particles + post-effects (blur/glow/shadow) + accumulation motion blur | 🔄 In progress |
| `feature/particle-effect-engine-bl13` | Particle system v2 enhancement | 🔄 In progress |
| `feat/text-element-typography` | Per-character animation | 🔄 In progress |

## 🤝 Contributing

1. Follow OOP style guide (CLAUDE.md)
2. Write tests for new features
3. Emit events for scripting support
4. Update BACKLOG.md with progress
5. Create PR with detailed description

## 📄 License

MIT License

---

**Made with ❤️ by the Chorono team**  
**Empowering animators with AI and GPU acceleration**
