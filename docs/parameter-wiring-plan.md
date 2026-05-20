# Chorono Animator — Parameter Wiring Uygulama Planı

Oluşturulma: 2026-05-18  
Durum: Planlandı

---

## Genel Bakış

Parameter Wiring, bir layer/property parametresinin başka bir parametreyi expression tabanlı olarak sürmesi sistemidir. Mevcut `Binding` sisteminin (linear remap) expression-tabanlı, güçlü bir evrimi olarak uygulanacak.

```
Şu an (Binding):       source → [linear remap]  → target
Parameter Wiring:      source → [expression]    → target
                                map(s, 0, 1, 0, 360)
                                s ? 1.08 : 1
                                clamp(s * 360, 0, 360)
```

**Temel karar:** `parameterWires[]` ayrı alan olarak `ChronoScene`'e eklenecek. Mevcut `bindings[]` dokunulmayacak — geriye uyumluluk korunuyor.

**Değer önceliği (her frame):**
```
finalValue = wiringValue ?? keyframeValue ?? baseValue
```

---

## Mevcut Altyapı (Değişmeyecek)

| Bileşen | Dosya | Kullanım |
|---|---|---|
| `Binding` interface | `src/lib/types/core.ts:502` | Temel source→target modeli referans |
| `remap()` evaluator | `src/lib/runtime/bindingEvaluator.ts:17` | `map()` expression fonksiyonu olarak expose edilecek |
| `OverrideMap` sistemi | `src/lib/evaluator.ts:94` | Wire output buraya yazılacak |
| `SceneParameter[]` | `src/lib/types/core.ts:522` | Source olarak kullanılacak |
| Command pattern | `src/lib/editor/` | Undo/redo için kullanılacak |
| `MotionBindingPanel` | `src/components/panels/MotionBindingPanel.tsx` | WiringListPanel referans alacak |

---

## Phase 1 — Temel Altyapı

### 1.1 Tip Tanımları

**Dosya:** `src/lib/types/core.ts`

```ts
export interface ParameterRef {
  layerId?: string
  modifierId?: string
  propertyPath: string        // "transform.rotation", "opacity"
  valueType: 'number' | 'boolean' | 'string' | 'color' | 'vec2'
}

export interface ParameterWire {
  id: string
  name?: string
  enabled: boolean
  source: ParameterRef
  target: ParameterRef
  expression: string          // "map(source, 0, 1, 0, 360)"
  blendMode: 'override' | 'add'   // MVP: sadece 'override'
  clamp?: {
    enabled: boolean
    min?: number
    max?: number
  }
  createdAt: number
  updatedAt: number
}
```

`ChronoScene`'e alan eklenir:
```ts
interface ChronoScene {
  // ... mevcut alanlar ...
  parameterWires: ParameterWire[]   // YENİ
}
```

**Görevler:**
- [ ] `ParameterRef` interface ekle
- [ ] `ParameterWire` interface ekle
- [ ] `ChronoScene.parameterWires` alanı ekle
- [ ] `src/lib/types/index.ts` barrel export güncelle

---

### 1.2 Expression Evaluator

**Dosya:** `src/lib/expression/ExpressionEvaluator.ts`

`eval()` kesinlikle kullanılmayacak. Whitelist tabanlı güvenli parser:

```ts
interface ExpressionContext {
  source: number
  timeMs: number
  frame: number
  globals: {
    width: number
    height: number
  }
}

// Whitelist fonksiyonlar
const SAFE_FUNCTIONS = {
  map:        (v, i0, i1, o0, o1) => remap(v, i0, i1, o0, o1, false, false),
  clamp:      (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  lerp:       (a, b, t) => a + (b - a) * t,
  abs:        Math.abs,
  min:        Math.min,
  max:        Math.max,
  sin:        Math.sin,
  cos:        Math.cos,
  round:      Math.round,
  floor:      Math.floor,
  ceil:       Math.ceil,
  smoothstep: (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x-e0)/(e1-e0))); return t*t*(3-2*t) },
}

export function evaluateExpression(expr: string, ctx: ExpressionContext): number | null
export function validateExpression(expr: string): { valid: boolean; error?: string }
```

**Görevler:**
- [ ] `src/lib/expression/` klasörü oluştur
- [ ] `ExpressionEvaluator.ts` — temel parser + evaluator
- [ ] `ExpressionFunctions.ts` — whitelist fonksiyon listesi
- [ ] `ExpressionValidator.ts` — expression doğrulama (modal preview için)
- [ ] Birim testleri (`src/lib/expression/__tests__/`)

---

### 1.3 Wiring Evaluator

**Dosya:** `src/lib/runtime/wiringEvaluator.ts`

Mevcut `evaluateBindings()` pipeline'ına son aşama olarak eklenecek:

```ts
export function evaluateWires(
  wires: ParameterWire[],
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  scene: Pick<ChronoScene, 'layers' | 'parameters'>,
  timeMs: number,
): OverrideMap
```

**Görevler:**
- [ ] `wiringEvaluator.ts` oluştur
- [ ] Source value okuma (layerProperty veya parameter)
- [ ] Expression değerlendirme
- [ ] Clamp uygulama
- [ ] Override map'e yazma
- [ ] `SceneCanvas.tsx` veya render hook'una `evaluateWires()` entegrasyonu

---

### 1.4 Commands (Undo/Redo)

**Dosya:** `src/lib/editor/commands-wiring.ts`

Mevcut command pattern'ini takip eder:

```ts
export function makeAddWireCmd(wire: ParameterWire): EditorCommand
export function makeDeleteWireCmd(wireId: string): EditorCommand
export function makeUpdateWireCmd(wireId: string, prev: ParameterWire, next: ParameterWire): EditorCommand
export function makeToggleWireCmd(wireId: string, enabled: boolean): EditorCommand
```

**Görevler:**
- [ ] `commands-wiring.ts` oluştur
- [ ] `src/lib/defaults.ts`'e `newWire()` factory ekle

---

## Phase 2 — Inspector UI

### 2.1 Inspector'da 🔗 İkonlar

**Dosya:** `src/components/PropertiesPanel.tsx`

Her animatable property satırına wire ikonu eklenir.

Bağlı değil:
```
Position X    [120]    ◆  🔗
```

Bağlı:
```
Position X    [Driven by Slider.value]   🔗●
```

**Görevler:**
- [ ] Property row component'ine `wireIcon` prop ekle
- [ ] `scene.parameterWires` üzerinden ilgili wire'ı bul
- [ ] Wire aktifse input disabled + "Driven by X" label göster
- [ ] 🔗 tıklandığında `WireParameterModal` açılsın

---

### 2.2 Wire Parameter Modal

**Dosya:** `src/components/wiring/WireParameterModal.tsx`

```
┌──────────────────────────────────────────┐
│ Wire Parameter                           │
├──────────────────────────────────────────┤
│ Target                                   │
│ Circle.rotation                          │
│                                          │
│ Source                                   │
│ [Select Source Parameter ▼]              │
│                                          │
│ Expression                               │
│ [ map(source, 0, 1, 0, 360)          ]   │
│                                          │
│ Preview                                  │
│ source: 0.5  →  result: 180              │
│                                          │
│ [Cancel]  [Apply]                        │
└──────────────────────────────────────────┘
```

**Alt bileşenler:**
- `SourceParameterPicker.tsx` — arama + hiyerarşik liste
- `ExpressionEditor.tsx` — expression input + preview satırı + hata mesajı
- `MappingPresets.tsx` — hazır expression şablonları

**Görevler:**
- [ ] `src/components/wiring/` klasörü oluştur
- [ ] `WireParameterModal.tsx` — modal wrapper
- [ ] `SourceParameterPicker.tsx` — scene layer/property/parametre listesi
- [ ] `ExpressionEditor.tsx` — input + live preview
- [ ] `MappingPresets.tsx` — preset dropdown
- [ ] Modal'ı PropertiesPanel'a bağla

---

### 2.3 Wiring List Panel

**Dosya:** `src/components/panels/WiringListPanel.tsx`

MotionBindingPanel'ın yanına sekme olarak eklenir:

```
Wiring List
──────────────────────────────────────────────
✓   Slider.value    source * 360      Circle.rotation   [✏] [🗑]
✓   Button.hover    source ? 1.1 : 1  Button.scale      [✏] [🗑]
✕   Audio.volume    source * 20       Glow.intensity    [✏] [🗑]
```

**Görevler:**
- [ ] `WiringListPanel.tsx` oluştur
- [ ] Enable/disable toggle
- [ ] Edit (modal açar) + Delete butonları
- [ ] Broken wire uyarısı (source bulunamazsa kırmızı)
- [ ] Panel'i dock sisteme ekle (`src/app/page.tsx` panel registry)

---

## Phase 3 — Timeline Entegrasyonu

### 3.1 Dope Sheet Wire İndikatörü

**Dosya:** `src/components/timeline/LayerTimelineSection.tsx`

Wire olan property track'lerinde 🔗 ikonu:
```
Rotation    🔗    ◆     ◆
```

**Görevler:**
- [ ] Track satırında wire kontrolü (`scene.parameterWires` lookup)
- [ ] 🔗 ikonu gösterimi
- [ ] İkon tıklandığında WireParameterModal aç

---

### 3.2 Context Menu Entegrasyonu

**Dosya:** `src/components/timeline/keyframeMenuItems.ts`

Property sağ tık menüsüne eklenecek:
```
Wire This Parameter...
Edit Wiring...          (bağlıysa)
Disable Wiring          (bağlıysa)
Remove Wiring           (bağlıysa)
```

**Görevler:**
- [ ] `keyframeMenuItems.ts`'e wire maddeleri ekle
- [ ] `PropertiesPanel` property sağ tık menüsüne ekle

---

### 3.3 Broken Wire Detection

**Görevler:**
- [ ] `wiringEvaluator.ts`'de source bulunamazsa `brokenWires: Set<string>` döndür
- [ ] UI'da kırmızı badge/uyarı göster
- [ ] WiringListPanel'da broken wire satırını vurgula

---

## Phase 4 — İleri Aşama (MVP Sonrası)

Bunlar MVP'ye dahil değil, mimari uyumlu tasarlanacak:

- [ ] **Bake Wiring to Keyframes** — expression output'unu keyframe dizisine dönüştür
- [ ] **Drag & drop wiring** — inspector'da 🔗 ikonunu sürükle, hedef parametreye bırak
- [ ] **Blend modes** — `add`, `multiply` (şu an sadece `override`)
- [ ] **Curve Editor entegrasyonu** — wired property curve görselleştirme
- [ ] **Type conversion UI** — vec2 → number (x/y/length/angle seçimi)
- [ ] **Wiring Graph görünümü** — node-based görsel editor
- [ ] **Multiple wires per target** — blend weight ile

---

## Dosya Yapısı (Hedef)

```
src/lib/expression/
 ├── ExpressionEvaluator.ts
 ├── ExpressionFunctions.ts
 ├── ExpressionValidator.ts
 └── __tests__/
     └── ExpressionEvaluator.test.ts

src/lib/runtime/
 ├── bindingEvaluator.ts     (mevcut — dokunulmaz)
 ├── wiringEvaluator.ts      (YENİ)
 └── ...

src/lib/editor/
 ├── commands-wiring.ts      (YENİ)
 └── ...

src/lib/types/
 ├── core.ts                 (ParameterRef + ParameterWire + ChronoScene.parameterWires eklenir)
 └── ...

src/components/wiring/
 ├── WireParameterModal.tsx
 ├── SourceParameterPicker.tsx
 ├── ExpressionEditor.tsx
 └── MappingPresets.tsx

src/components/panels/
 ├── WiringListPanel.tsx     (YENİ)
 └── MotionBindingPanel.tsx  (dokunulmaz)
```

---

## Uygulama Sırası Özeti

```
Phase 1 — Altyapı (önce bunlar, UI olmadan test edilebilir)
  1.1  Tip tanımları (core.ts)
  1.2  Expression evaluator
  1.3  Wiring evaluator + pipeline entegrasyonu
  1.4  Commands (undo/redo)

Phase 2 — Inspector UI
  2.1  PropertiesPanel 🔗 ikonlar
  2.2  WireParameterModal
  2.3  WiringListPanel

Phase 3 — Timeline entegrasyonu
  3.1  Dope sheet wire indikatörü
  3.2  Context menu maddeleri
  3.3  Broken wire detection

Phase 4 — İleri aşama (MVP sonrası)
  Bake, drag&drop, blend modes, graph view
```
