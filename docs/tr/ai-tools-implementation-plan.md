# Chorono AI & Script — İmplementasyon-Hazır Plan

**Tarih:** 2026-05-21
**Önceki belgeler:** `ai-qa-report-2026-05-21.md` (test sonuçları), `ai-missing-tools-2026-05-21.md` (envanter)
**Bu belge:** Envanteri kodlanabilir plana dönüştürür — her iş için **touch-point + adımlar +
acceptance criteria (test) + bağımlılık + revize efor**.
**Kod doğrulaması:** Tüm dosya/satır referansları okunarak doğrulandı (2026-05-21).

---

## Önemli Bulgu: Çekirdek Komutlar Zaten Var

İki "büyük subsystem" sanılan iş aslında **ince AI/script sarmalı**:

- **State Machine:** `commands-statemachine.ts`'te 9 komut + `defaults.ts`'te factory'ler hazır.
  AI tool'u sadece bunları sarar. **Efor L → M.**
- **Particle:** `particleEmitter` registry'de kayıtlı (`bootstrap.ts:52`),
  `newParticleEmitterLayer()` default üretiyor. `handle.set({particleEmitter})` ham patch
  zaten çalışır. **Efor M → S-M.**

---

## Bağımlılık Grafiği

```
ATOMIC (bağımsız, hemen yapılabilir):
  B4 (layerIds sync)
  add_layer: group, repeater
  handle setters: text, stroke, cornerRadius, shapeParams, blendMode
  SM tools (komutlar hazır)
  handle.key easing param
  color interpolation

ZİNCİRLİ (önce X gerekli):
  add_layer particleEmitter  ──gerekli──> Particle config tool
  add_layer spline/path      ──gerekli──> Spline/Path geometri tool
  add_layer image/video/audio──gerekli──> asset referans akışı (upload kullanıcıda kalır)
  Parameter wiring tool      ──ilişkili──> add_parameter (önce param olmalı)
```

---

## FAZ 1 — Kritik Fix + Atomic Quick Wins

### İŞ 1.1 — B4: keyframe → timeline.layerIds sync  🔴 XS (~30dk)

**Sorun:** key'ler veriye yazılıyor ama layer `timeline.layerIds`'e eklenmiyor →
timeline/dope-sheet panelinde görünmüyor.

**Touch-points:**
- `src/lib/script/api/LayerHandle.ts` → `key()` metodu
- `src/lib/ai/actions/keyframe.ts` → `add_keyframes` action (`ensureTrack` yanına)

**Mevcut altyapı:** `makeAddLayerToTimelineCmd(timelineId, layerId)` — `commands-timeline.ts:30`,
idempotent (`ids.includes` kontrolü var).

**Adımlar:**
1. `LayerHandle.key()` command'ının `execute`'una: track ensure'dan sonra,
   `layerId` timeline.layerIds'te değilse ekle (inline, mevcut command'la aynı immutable pattern).
2. `keyframe.ts` `add_keyframes` `toCommand`: aynı layerIds-ensure mantığını ekle.
3. **Caveat:** `layerIds === undefined` (legacy "show all") ise DOKUNMA — undefined bırak
   (explicit listeye çevirmek görünürlüğü daraltır). Sadece `Array.isArray(layerIds)` ise ekle.

**Acceptance (test):**
```ts
// ScriptRunner.test.ts
runScript("const c=scene.add('rect'); c.key('opacity',0,0)", host)
const tl = scene.timelines.find(t => t.tracks.some(tr => tr.target.includes('rect')))
expect(tl.layerIds).toContain(c.id)   // ← layer artık panelde görünür
```
- Manuel: script ile rect+key → Timeline panelinde rect'in track satırı görünür.

**Bağımlılık:** Yok.

---

### İŞ 1.2 — add_layer: eksik atomic tipler (group, repeater)  🟠 S

**Touch-points:** `src/lib/ai/actions/layer.ts:242` (`LAYER_TYPE_ENUM`), `buildLayerFromParams`

**Adımlar:**
1. `LAYER_TYPE_ENUM`'a `repeater` ekle (group zaten var). `image/video/audio/spline/path/
   particleEmitter` BURADA EKLEME — zincirli (bkz. Faz 2/3).
2. `buildLayerFromParams`: repeater için `repeater.sourceLayerId/count/mode` paramları.

**Acceptance:**
```ts
def.toCommand({type:'repeater', sourceLayerId:'x', count:5}, scene)
// → layer.type==='repeater', repeater.count===5
```

**Bağımlılık:** Yok (group/repeater). image/video → Faz 3.

---

### İŞ 1.3 — LayerHandle eksik setter'lar  🟠 M

**Touch-points:** `src/lib/script/api/LayerHandle.ts`

**Adımlar (her biri ayrı getter/setter, immutable patch):**
1. `text` → `set({text:{...}})` sarmalı: `handle.text = 'Merhaba'` + `handle.font(opts)`
2. `stroke` → `set({style:{stroke:{color,width}}})`
3. `cornerRadius` → `set({style:{cornerRadius}})`
4. `shapeParam(name, value)` → `set({shapeParams:{...}})` (sides/innerRadius/angle/turns/...)
5. `blendMode`, `parent(handleOrId)`
6. `key()` 4. param `easing` (linear/hold/easeIn/easeOut/easeInOut)

**Acceptance:** her setter için unit test (`handle.text='X'` → `layer.text.value==='X'`).

**Bağımlılık:** Yok.

---

## FAZ 2 — State Machine (komutlar hazır)  🟠 M

### Roadmap (4 adım)

**Adım 1 — AI tool katmanı** `src/lib/ai/actions/statemachine.ts` (YENİ)
Mevcut komutları sar:
| AI tool | Sarılan komut |
|---|---|
| `create_state_machine` | `makeCreateSMCmd(name)` |
| `add_sm_state` (name, timelineId) | `makeAddSMStateCmd(smId, newSMState(...))` |
| `add_sm_transition` (from, to, event, guard) | `makeAddSMTransitionCmd(smId, newSMTransition(...))` |
| `set_initial_state` (smId, stateId) | `makeSetInitialStateCmd(smId, stateId)` |
`ActionRegistry.bootstrapAIActions`'a `registerStateMachineActions` ekle.

**Adım 2 — SceneAPI** `src/lib/script/api/SceneAPI.ts` + yeni `StateMachineHandle`
`scene.addStateMachine(name)` → handle; `sm.addState(name, timelineId)`, `sm.addTransition(from,to,event)`, `sm.setInitial(state)`.

**Adım 3 — System prompt** `tools.ts`: "durum tabanlı / interaktif / N-durumlu" istekler →
SM kullan. Few-shot: 4-mevsim (4 state, her biri kendi timeline'ı, döngüsel transition).

**Adım 4 — Checker farkındalığı** (opsiyonel): erişilemez state, eksik initial, dangling transition.

**Bağımlılık:** SM state'leri timeline'a referans verir (`timelineId`) → her state için önce
`create_timeline` gerekir. AI akışı: timeline'lar → SM → state'ler → transition'lar.

**Acceptance:**
```ts
// AI "4 durumlu SM" → scene.stateMachines[0]
expect(sm.states.length).toBe(4)
expect(sm.transitions.length).toBeGreaterThanOrEqual(3)
expect(sm.initialStateId).toBeTruthy()
// runtime parite: StateMachineRuntime(sm).dispatch(event) state değiştirir
```
**Milestone'lar:** (a) AI SM+state+transition üretir → JSON doğru, (b) editör SM panelinde
graph görünür, (c) runtime'da event ile state geçişi oynar.

**Efor:** M (komutlar/factory hazır; iş = tool sarma + SceneAPI + prompt + test).

---

## FAZ 3 — Particle + Layer Media + Wiring

### İŞ 3.1 — Particle config  🟡 S-M

**Kök neden (doğrulandı):** emitter layer oluşuyor ama LayerHandle'da `.emitter` accessor yok →
AI `handle.emitter.x` yazınca `Cannot set properties of undefined`.

**Touch-points:** `src/lib/script/api/LayerHandle.ts`, YENİ `src/lib/ai/actions/particle.ts`,
mevcut `src/lib/particles/` (preset'ler + types)

**Adımlar:**
1. `LayerHandle.configureParticles(config)` → `set({particleEmitter:{...}})` (ham patch zaten çalışıyor, ergonomik sarmal)
2. `add_particle_emitter` AI tool: emit shape/rate/burst + particle shape/size/lifetime + **preset** (confetti/fire/rain/snow...) — preset'ler `src/lib/particles/presets`'ten
3. SceneAPI `scene.addEmitter(preset, opts)`
4. System prompt: "konfeti/ateş/duman/yağmur" → add_particle_emitter

**Acceptance:** `add_particle_emitter({preset:'confetti'})` → `layer.type==='particleEmitter'`,
`layer.particleEmitter.emitter` dolu; render crash yok.

**Bağımlılık:** Yok (particle altyapısı hazır).

### İŞ 3.2 — add_layer media (image/video/audio)  🟡 M
**Bağımlılık:** asset akışı. AI dosya YÜKLEYEMEZ (güvenlik). Sadece **var olan asset'e**
referans: `add_layer{type:'image', assetId}`. Touch: `layer.ts` enum + `buildLayerFromParams` + asset lookup.
**Acceptance:** mevcut asset id ile image layer oluşur; olmayan id → AI ERROR.

### İŞ 3.3 — Parameter + Trigger + Wiring  🟡 M
**Touch-points:** YENİ `actions/parameter.ts` (`add_parameter`, `add_trigger`, `add_binding`,
`add_parameter_wire`); SceneAPI `scene.addParam/wire/addTrigger`.
**Bağımlılık:** wire/trigger önce parametre/layer gerektirir (sıralı).
**Acceptance:** `add_parameter` → `scene.parameters` dolu; `add_parameter_wire` → `scene.parameterWires` + runtime'da evaluate edilir.

---

## FAZ 4 — İleri (gerçekten Large)

| İş | Efor | Not |
|---|---|---|
| Path & Motion (bezier, followPath, trim) | L | Geometri + anchor editing |
| Spline (primitive + nokta düzenleme) | L | BL-73 editing API'si gerek |
| Clone & Array | M-L | BL-59 komutları var, sarılabilir |
| Color interpolation (B2) | S | `interpolateColor(hexA,hexB,t)` evaluator+renderer ~40 satır |

---

## Uygulama Sırası (Özet)

```
FAZ 1 (atomic, ~1-2 gün)
  1.1 B4 layerIds sync          XS  🔴  ← HEMEN
  1.2 add_layer group/repeater  S
  1.3 LayerHandle setters       M

FAZ 2 (~2-3 gün)
  2.x State Machine tools       M   (komutlar hazır)

FAZ 3 (~3-4 gün)
  3.1 Particle config           S-M
  3.2 add_layer media           M
  3.3 Parameter/Trigger/Wiring  M

FAZ 4 (ayrı sprint)
  Path/Spline/Clone/Color       L
```

**Her iş için ortak DoD:** unit test yeşil + `tsc` temiz + (UI etkisi varsa) tarayıcı doğrulaması
+ konvansiyon: yeni sistem hem SceneAPI'ye hem AI tool'una eklendi (`arch_scripting_event_system`).

---

## Açık Riskler

1. **B4 layerIds undefined semantiği:** legacy timeline'larda undefined = "show all". Explicit
   listeye çevirmek görünürlüğü daraltabilir → sadece `Array.isArray` ise ekle.
2. **AI tool sayısı şişmesi:** çok tool LLM seçimini zorlaştırır. SM/particle/wiring eklenince
   tool seti ~25+ olur → gerekirse tool gruplama / kategori prompt'u.
3. **Particle preset config derinliği:** AI'ın tüm nested param'ları doğru kurması zor →
   preset-öncelikli tasarım (AI preset seçer + birkaç override).

---

*İlgili: BL-78 (backlog özeti). Bu belge BL-78'in implementasyon-hazır detayıdır.*
