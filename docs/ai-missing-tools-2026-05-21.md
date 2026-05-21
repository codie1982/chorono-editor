# Chorono AI & Script — Eksik Tool / API Envanteri

**Tarih:** 2026-05-21
**Bağlam:** QA testi sonrası kapsam denetimi. AI Planner tool seti + Script SceneAPI'nin
uygulama yeteneklerine karşı eksikleri.
**İlişkili:** `ai-qa-report-2026-05-21.md`, backlog BL-78

---

## 0. ÖNCE: "Key atılmamış" gözleminin kök nedeni (BUG B4)

JSON ile doğrulandı — keyframe'ler **veriye yazılıyor** ama layer timeline'ın
`layerIds` listesine **eklenmiyor**:

```
Script: rect ekle + opacity/x key'le → 6 komut
Scene JSON:
  layers.rect_1.opacity      → 2 key   ✓ (veride VAR)
  layers.rect_1.transform.x  → 2 key   ✓ (veride VAR)
  timeline.layerIds = ["card","label"]   ← rect_1 YOK ✗
```

**Sonuç:** Timeline / Dope Sheet paneli `layerIds`'e göre satır gösterdiği için
script/AI ile eklenen layer'ların key'leri **panelde görünmüyor**. (Canvas'ta
evaluator `layerIds`'i yok saydığı için animasyon oynar, ama editörde "key yok" görünür.)

**Etkilenen:** `handle.key()` (script) + `add_keyframes` (AI) — ikisi de layerIds yönetmiyor.
**Çözüm:** key/keyframe eklerken hedef layer'ı timeline.layerIds'e ekle (idempotent).

---

## 1. Layer Oluşturma — `add_layer` (KISMİ)

**Mevcut kabul edilen tipler:** `shape`, `text`, `group` (LAYER_TYPE_ENUM).

| Eksik layer tipi | Uygulama destekliyor mu | Tool |
|---|---|---|
| `image` | ✅ | ❌ add_layer enum'da yok |
| `video` | ✅ | ❌ |
| `audio` | ✅ | ❌ |
| `spline` | ✅ (BL-73) | ❌ |
| `path` / `bezierPath` | ✅ | ❌ |
| `motionPath` | ✅ | ❌ |
| `pathStroke` | ✅ | ❌ |
| `particleEmitter` | ✅ (BL-13) | ❌ |
| `repeater` | ✅ (BL-59) | ❌ |

---

## 2. Layer Özellikleri — `update_layer` / `LayerHandle` (KISMİ)

**Mevcut handle setter'ları:** `pos, opacity, rotation, scale, size, fill`

| Eksik özellik | Açıklama |
|---|---|
| `text.*` | content, fontFamily, fontWeight, fontStyle, fontSize, color, letterSpacing, uppercase, underline — handle'da `.text` setter yok |
| `stroke.*` | color, width, lineCap, lineJoin |
| `style.cornerRadius` | yuvarlatılmış köşe |
| `shapeParams.*` | sides, innerRadius/outerRadius, startAngle/endAngle, turns, amplitude, frequency, phase, irregularity (polygon/star/ring/arc/spiral/wave/blob) |
| `blendMode` | multiply/screen/overlay vb. |
| `parentId` | hiyerarşi (script'te) |
| `anchorX/anchorY` | pivot |
| `effects.*` | blur, brightness, contrast, saturate |
| `motionBlur` | trail efekti |
| `effectsChain` | glow / shadow / blur plugin'leri |
| `masks` | mask tanımları |
| görünürlük | hidden, locked, solo, frozen, colorLabel |

---

## 3. Keyframe / Animasyon (KISMİ)

**Mevcut:** `add_keyframes` (easing enum: linear/hold/easeIn/easeOut/easeInOut),
`handle.key(prop, ms, value)`.

| Eksik | Açıklama |
|---|---|
| **layerIds yönetimi** | B4 — key panelde görünmüyor |
| `handle.key` easing param | script'te her zaman linear; easing seçilemiyor |
| tangent mode / bezier handle | per-keyframe eğri kontrolü (broken/aligned/auto) |
| **Curve modifiers** (BL-46) | sine, pulse, quantize, noise, fractal, clamp, scale |
| **Out-of-range** (BL-45) | loop, pingPong, cycle, relativeRepeat |
| **TimeWarp / EaseCurve** (BL-48) | track-seviyesi zaman yeniden eşleme |
| **Procedural controllers** (BL-50) | waveform / noise ile keyframe'siz sürüş |
| **Bake** (BL-51) | yoğun keyframe üretimi / simplify |
| **Color interpolation** (B2) | renk track'leri snap ediyor, lerp yok |

---

## 4. Timeline (KISMİ)

**Mevcut:** `create_timeline` (id, durationMs, autoplay, loop, loopCount, pingPong).

| Eksik tool | Açıklama |
|---|---|
| `update_timeline` | oluşturma sonrası ayar değiştirme (loop/duration) |
| `add_layer_to_timeline` | **layerIds yönetimi (B4)** |
| `add_marker` / `move_marker` | timeline marker'ları |
| `add_segment` | adlandırılmış bölümler |
| `add_timeline_event` (BL-36) | zamanda tetiklenen event (playSound/emit) |
| work area | in/out aralığı |

---

## 5. State Machine — TAMAMEN EKSİK ❌

> Uygulama tam destekliyor (BL-09: FSM çekirdeği + editor + runtime). `commands-statemachine.ts` mevcut. AI/script kapsamı **sıfır**.

| Eksik tool / API |
|---|
| `create_state_machine` |
| `add_sm_state` (name + timelineId) |
| `add_sm_transition` (from, to, event/trigger, guard) |
| `set_initial_state` |
| `set_blend` (cross-fade ms) |
| `add_sm_parameter` (guard için) |
| SceneAPI: `scene.addStateMachine()`, `sm.addState()`, `sm.addTransition()` |

---

## 6. Particle — TAMAMEN EKSİK ❌

> Uygulama tam destekliyor (BL-13: emitter + 8 preset). AI/script kapsamı **sıfır**.
> Canlı test: `scene.add('particleEmitter')` + property set → `Cannot set properties of undefined`.

| Eksik tool / API |
|---|
| `add_particle_emitter` (emit shape, rate/burst, max, duration) |
| particle config (shape, size min/max, lifetime, velocity, gravity) |
| preset seçimi (confetti, fire, dust, rain, snow, sparkle, smoke, rocket) |
| SceneAPI: `scene.addEmitter(shape, preset)`, `handle.asParticleEmitter(config)` |

---

## 7. Parametre & Etkileşim — TAMAMEN EKSİK ❌

| Eksik tool / API | Açıklama |
|---|---|
| `add_parameter` | scene parameter (number/bool/color/string) |
| `add_trigger` | event → action (click/drag/animationComplete...) |
| `add_binding` | linear remap (source → target) |
| `add_parameter_wire` (BL-05) | expression-based (`map(s,0,1,0,360)`) |
| `set_interactive` | layer.tappable / draggable + dragConfig |
| SceneAPI: `scene.addParam()`, `scene.wire()`, `scene.addTrigger()` |

---

## 8. Path & Motion — TAMAMEN EKSİK ❌

| Eksik tool / API |
|---|
| `add_bezier_path` + anchor noktaları |
| `set_path_role` (visual / motion) |
| `assign_motion_path` (followPath + progress 0→1 animasyonu, BL-67) |
| `trim_path` (start/end/offset) |
| SceneAPI: `scene.addPath(points)`, `handle.followPath(pathId)` |

---

## 9. Spline — TAMAMEN EKSİK ❌

> BL-73 tam spline sistemi var. AI/script kapsamı yok.

| Eksik tool / API |
|---|
| spline primitive (circle/rect/ellipse/arc/donut/ngon/star/line) |
| spline nokta düzenleme (ekle/sil/taşı/tip) |
| text → spline glyph |

---

## 10. Clone & Array — TAMAMEN EKSİK ❌

> BL-59 tam sistem var.

| Eksik tool / API |
|---|
| `clone_layer` (copy / live instance) |
| `array` (linear / grid / radial / path) |
| `repeater` modifier (count + transform step) |
| SceneAPI: `scene.clone(handle, n)`, `scene.array(handle, opts)` |

---

## 11. Layer Organizasyonu (KISMİ)

| Eksik tool | Açıklama |
|---|---|
| `group_layers` / `ungroup` | gruplama |
| `reorder_layer` | z-order |
| `set_mask` | mask atama |
| `set_blend_mode` | composite |

---

## 12. Media (KISMİ)

| Eksik | Açıklama |
|---|---|
| image/video/audio layer | add_layer enum'da yok (§1) |
| asset yönetimi | dosya yükleme AI ile yapılmaz (güvenlik — kullanıcı yükler) |
| video/audio props | volume, muted, loop, objectFit |

---

## 13. Script API — READ Boşlukları

> SceneAPI şu an sadece layer okuyor. Animasyon/sahne durumunu okuyamıyor.

| Eksik read |
|---|
| `scene.timelines` — **timeline/keyframe okunamıyor** (script kendi animasyonunu doğrulayamaz) |
| `scene.composition` — canvas boyutu/fps |
| `scene.selected` — seçili layer'lar |
| `scene.parameters` — scene parametreleri |
| `handle.text`, `handle.stroke` vb. getter'lar |

---

## 14. Script API — WRITE Boşlukları (SceneAPI/LayerHandle)

| Eksik write |
|---|
| `scene.batch(fn)` — açık transaction grubu |
| `scene.createTimeline(opts)` / `scene.setComposition(opts)` |
| `scene.addToTimeline(handle, timelineId)` — **layerIds (B4)** |
| `handle.text = ...`, `handle.stroke = ...`, `handle.cornerRadius = ...` |
| `handle.shapeParam(name, value)` |
| `handle.blendMode`, `handle.parent`, `handle.effect(name, value)` |
| `handle.key(prop, ms, value, easing)` — easing parametresi |

---

## Öncelik Önerisi

| # | Kalem | Şiddet | Efor | Neden |
|---|---|---|---|---|
| 1 | **B4: keyframe → layerIds** | 🔴 Kritik | S | "Key görünmüyor" — mevcut animasyonu bozuyor |
| 2 | **add_layer tüm tipler** | 🟠 Yüksek | S | image/spline/path/particle... temel eksik |
| 3 | **handle text/stroke/cornerRadius/shapeParams** | 🟠 Yüksek | M | metin/şekil düzenleme |
| 4 | **State Machine tool+API** | 🟠 Yüksek | L | interaktif/durum senaryoları |
| 5 | **Particle tool+API** | 🟡 Orta | M | efektler |
| 6 | **Parameter wiring + trigger** | 🟡 Orta | M | etkileşim |
| 7 | **Script read (timelines/composition)** | 🟡 Orta | S | self-doğrulama |
| 8 | **Path/motion, Clone/Array, Spline** | 🟢 Düşük | L | ileri özellikler |
| 9 | **Color interpolation (B2)** | 🟢 Düşük | S | renk geçişleri |

**Konvansiyon:** `arch_scripting_event_system` — her yeni sistem hem SceneAPI'ye hem
AI tool setine eklenmeli. Bu envanter o boşluğun tam listesi.

---

*İlgili: BL-78 (özet plan), ai-qa-report-2026-05-21.md (test sonuçları)*
