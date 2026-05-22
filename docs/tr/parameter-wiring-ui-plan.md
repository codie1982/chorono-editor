# Parameter Wiring — UI Plan

Oluşturulma: 2026-05-18
Durum: Planlandı (uygulama bekliyor)
Referans: [`docs/parameter-wiring-plan.md`](./parameter-wiring-plan.md)

---

## Context

Phase 1 (Altyapı) tamamlandı: types, expression evaluator, runtime wire evaluator, commands. Ancak `MotionBindingPanel` içinde inline "Expression" sekmesi olarak hızlı bir UI eklendi — bu **orijinal plana uymuyor**.

Orijinal plan iki temel UX prensibine dayanıyor:

1. **Discoverability** — kullanıcı bir property'yi PropertiesPanel'da görüyor, yanındaki 🔗 ikonuyla bağlanabileceğini hemen anlıyor. Panel araması yok.
2. **Centralization** — tüm wire'lar tek bir `WiringListPanel`'da listeleniyor, MotionBindingPanel ile karışmıyor (zaten bambaşka bir sistem).

Bu dokümanın amacı: orijinal planın UI kısmını (Phase 2 + Phase 3) detaylı bir şekilde tasarlamak. Kod yazılmayacak — sadece component'lerin ne yapacağı, dosya konumları, state akışı, UX detayları.

---

## Mevcut Durum (Refactor edilecek)

| Bileşen | Durum | Aksiyon |
|---|---|---|
| `MotionBindingPanel.tsx` "Expression" tab | Geçici çözüm, iki adet flat dropdown | **Kaldırılacak** — tab tamamen geri çekilir, Linear-only kalır |
| `ExpressionEditor.tsx` (mevcut) | Çalışıyor, syntax check var | **Korunur** — yeni modal'da kullanılacak |
| `commands-interactive.ts` içindeki wire CRUD | Çalışıyor | **Korunur** — `commands-wiring.ts`'e taşınabilir (opsiyonel) |
| `parameterWireEvaluator.ts` | Çalışıyor | **Korunur** |
| `useInteractiveRuntime` wire integration | Çalışıyor | **Korunur** |

**Mevcut wire'lar:** Type şeması değişebilir (plan `ParameterRef` istiyor, biz `string` kullandık). Migration helper gerekli (Phase 1 düzeltmesi).

---

## UI Component Mimarisi

```
┌─────────────────────────────────────────────────────┐
│              PropertiesPanel (mevcut)               │
│  her property row: [input] [keyframe ◆] [wire 🔗]   │
│                                          ↓ click    │
└─────────────────────────────────────────────────────┘
                                          ↓
┌─────────────────────────────────────────────────────┐
│         WireParameterModal (YENİ)                   │
│  ┌─────────────────────────────────────────────┐    │
│  │  Target: Circle 1 · rotation (pre-filled)   │    │
│  │  Source: [SourceParameterPicker ▼]          │    │
│  │  Preset: [MappingPresets ▼]                 │    │
│  │  Expression: [ExpressionEditor (mevcut)]    │    │
│  │  Preview: source 0.5 → result 180           │    │
│  │  Options: ☐ Enabled  ☐ Clamp [min][max]     │    │
│  │  [Cancel]                       [Apply]     │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│         WiringListPanel (YENİ — ayrı dock panel)    │
│  Tüm wire'lar list. Edit / Toggle / Delete.         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│         TimelinePanel (mevcut, ekleme)              │
│  Track header'da 🔗 indikatörü (wire varsa)         │
│  Property right-click menüsü: "Wire This..."        │
└─────────────────────────────────────────────────────┘
```

---

## Component Detayları

### 1. PropertiesPanel — 🔗 Icon Integration

**Dosya:** `src/components/PropertiesPanel.tsx` (mevcut, değişiklik)

#### Her animatable property row'una eklenecek

```
┌─ Position X ─────────────────────────────┐
│ [120]                          ◆ Key  🔗 │   ← bağlı değil
└──────────────────────────────────────────┘

┌─ Rotation ───────────────────────────────┐
│ Driven by slider1               ●  🔗   │   ← bağlı
│ (input disabled, label tıklanır)         │
└──────────────────────────────────────────┘
```

#### State akışı

```ts
// PropertyRow component için pseudo-code
function PropertyRow({ layerId, propertyPath, value }) {
  const wire = scene.parameterWires.find(
    w => w.target.layerId === layerId
      && w.target.propertyPath === propertyPath
      && w.enabled
  )

  if (wire) {
    return (
      <Row>
        <DrivenLabel onClick={openWireModal(wire)}>
          Driven by {sourceLabel(wire.source)}
        </DrivenLabel>
        <Indicator filled />
        <WireIcon active onClick={openWireModal(wire)} />
      </Row>
    )
  }

  return (
    <Row>
      <Input value={value} />
      <KeyframeButton />
      <WireIcon onClick={openWireModal(null, { target: { layerId, propertyPath } })} />
    </Row>
  )
}
```

#### Modal trigger

Wire icon tıklandığında modal açılır:
- Mevcut wire varsa → edit modunda (tüm alanlar dolu)
- Yoksa → new mode, target pre-filled, source/expression boş

**Görevler:**
- [ ] `PropertyRow` component'inde `wire` lookup ekle
- [ ] `WireIcon` küçük component (active/inactive görünüm)
- [ ] `DrivenLabel` — input yerine geçer, click handler ile modal açar
- [ ] `<input disabled>` durumu ve görsel stillendirme

---

### 2. WireParameterModal

**Dosya:** `src/components/wiring/WireParameterModal.tsx` (YENİ)

#### Layout

```
┌────────────────────────────────────────────────┐
│ Wire Parameter                              ✕  │
├────────────────────────────────────────────────┤
│                                                │
│ TARGET                                         │
│ ─────────────────────────────────────────────  │
│ Circle 1 · rotation                            │
│ (read-only display)                            │
│                                                │
│ SOURCE                                         │
│ ─────────────────────────────────────────────  │
│ [SourceParameterPicker]                        │
│                                                │
│ MAPPING                                        │
│ ─────────────────────────────────────────────  │
│ Preset: [Custom              ▼]                │
│ Expression:                                    │
│ ┌────────────────────────────────────────┐     │
│ │ map(source, 0, 1, 0, 360)             │     │
│ └────────────────────────────────────────┘     │
│ ✓ valid                                        │
│                                                │
│ PREVIEW                                        │
│ ─────────────────────────────────────────────  │
│ source: 0.5000  →  result: 180.00              │
│                                                │
│ OPTIONS                                        │
│ ─────────────────────────────────────────────  │
│ ☑ Enabled                                      │
│ ☐ Clamp output     [   ] min  [   ] max        │
│                                                │
├────────────────────────────────────────────────┤
│ [Delete Wire]              [Cancel]  [Apply]   │
└────────────────────────────────────────────────┘
```

#### Props

```ts
interface WireParameterModalProps {
  isOpen: boolean
  onClose: () => void
  // Mevcut wire'ı düzenleme:
  existingWireId?: string
  // Yeni wire için pre-fill:
  preFilledTarget?: ParameterRef
  preFilledSource?: ParameterRef
}
```

#### State davranışı

- **Edit modu** (existingWireId verilirse): tüm alanlar wire'dan yüklenir, "Delete Wire" butonu görünür
- **New modu**: hedef varsa display'de, kaynak boş, expression default `source`
- **Apply** disabled if: source seçilmedi OR expression invalid
- **Apply** click: edit modu → `makeUpdateWireCmd`, new modu → `makeAddWireCmd`
- **Cancel** click: değişiklikler iptal, modal kapanır
- **Delete Wire** click: confirm dialog → `makeDeleteWireCmd`

#### Live preview hesaplama

Preview satırı her keystroke'da güncellenir (debounce yok, expression küçük):
1. Mevcut runtime'dan source value oku (eğer source set'liyse)
2. `safeEvaluate(expression, { source: currentValue })` çalıştır
3. Sonucu göster, NaN/Infinity → "—"
4. Source set değilse "select a source to preview" göster

**Görevler:**
- [ ] `src/components/wiring/` klasörü oluştur
- [ ] `WireParameterModal.tsx` — modal wrapper + state
- [ ] Modal'ı `page.tsx` global modal listesine ekle
- [ ] Modal context (open/close + props passing) — `useWireModal()` hook

---

### 3. SourceParameterPicker

**Dosya:** `src/components/wiring/SourceParameterPicker.tsx` (YENİ)

#### Layout — Hiyerarşik tree + arama

```
┌────────────────────────────────────────┐
│ 🔍 [Search parameters...      ]        │
├────────────────────────────────────────┤
│ ▼ Scene Parameters                     │
│    • slider1 (number, 0.5)             │
│    • toggleBg (boolean)                │
│    • playerName (string)               │
│                                        │
│ ▼ Layers                               │
│   ▼ Circle 1                           │
│      • opacity (0.8)                   │
│      • rotation (45°)                  │
│      • position.x (120)                │
│      • position.y (80)                 │
│      • scale.x (1.0)                   │
│      • scale.y (1.0)                   │
│   ▶ Rectangle 1 (5 props)              │
│   ▶ Triangle 1 (5 props)               │
│                                        │
│ ▶ Timeline Progress                    │
│    • timeline-main (0–60s)             │
└────────────────────────────────────────┘
```

#### Davranış

- **Click** bir property → seçilir, picker collapse, seçili değer üstte gösterilir
  ```
  ┌──────────────────────────────────┐
  │ ✓ Circle 1 · opacity      [↓]    │
  └──────────────────────────────────┘
  ```
- **Search** input → tüm tree'yi filtrele, eşleşmeleri vurgula, parent'ları otomatik expand et
- **Disabled** items: target ile aynı property olamaz (kendi kendine wire engelle), valueType uyuşmuyorsa (vec2 → number direkt değil)
- **Tooltip** her item'da: current value + type bilgisi

#### Props

```ts
interface SourceParameterPickerProps {
  scene: ChronoScene
  value: ParameterRef | null
  onChange: (ref: ParameterRef) => void
  /** Picker'da disable edilecek property — target ile self-wire önler */
  excludeRef?: ParameterRef
  /** Hedefin tipi — uyumlu source'lar dışındakileri grey-out yap */
  expectedType?: 'number' | 'boolean' | 'string' | 'color' | 'vec2'
}
```

#### Performans notları

- Her render'da tüm layer'ları enumerate etmemek için `useMemo` — scene.layers değişince yeniden hesapla
- 100+ layer için virtualization gerekmez (collapse'ed tree); 500+ layer için react-virtual değerlendirilir

**Görevler:**
- [ ] `SourceParameterPicker.tsx` — tree + search
- [ ] `parameterPaths.ts` helper — bir layer'dan ParameterRef listesi üret
- [ ] Animatable properties listesi (`ANIMATABLE_PROPERTIES` mevcut, kullanılır)
- [ ] Type uyumsuzluk kontrol fonksiyonu

---

### 4. MappingPresets

**Dosya:** `src/components/wiring/MappingPresets.tsx` (YENİ)

#### Dropdown layout

```
[Preset: Custom                  ▼]
   │
   └─→ ┌──────────────────────────────┐
       │ Identity                     │
       │   source                     │
       ├──────────────────────────────┤
       │ Remapping                    │
       │   Normalized to degrees      │
       │   map(source, 0, 1, 0, 360)  │
       │                              │
       │   Percent to normalized      │
       │   map(source, 0, 100, 0, 1)  │
       │                              │
       │   Custom range...            │
       ├──────────────────────────────┤
       │ Boolean                      │
       │   Boolean to scale           │
       │   source ? 1.2 : 1           │
       │                              │
       │   Boolean to angle           │
       │   source ? 360 : 0           │
       ├──────────────────────────────┤
       │ Easing                       │
       │   Smoothstep                 │
       │   smoothstep(0, 1, source)   │
       │                              │
       │   Quadratic in               │
       │   source * source            │
       ├──────────────────────────────┤
       │ Trigonometric                │
       │   Oscillate 0-1              │
       │   sin(source * 6.28) * 0.5   │
       │     + 0.5                    │
       ├──────────────────────────────┤
       │ Utility                      │
       │   Clamp 0-1                  │
       │   clamp(source, 0, 1)        │
       │                              │
       │   Invert (1 - source)        │
       │   1 - source                 │
       └──────────────────────────────┘
```

#### Davranış

- Preset seçilince → expression input doldurulur
- Expression manuel düzenlenince → preset "Custom"a düşer
- Preset seçenekleri **static** (kod içi sabit), runtime'da değiştirilemez

#### Props

```ts
interface MappingPresetsProps {
  expression: string
  onChange: (expression: string) => void
}

interface MappingPreset {
  category: 'Identity' | 'Remapping' | 'Boolean' | 'Easing' | 'Trigonometric' | 'Utility'
  label: string
  expression: string
  description?: string
}
```

**Görevler:**
- [ ] `MappingPresets.tsx` — dropdown + categorized list
- [ ] `presets.ts` — sabit preset listesi
- [ ] Reverse lookup: expression → preset (manuel düzenlenmemişse hangi preset?)

---

### 5. WiringListPanel

**Dosya:** `src/components/panels/WiringListPanel.tsx` (YENİ)

#### Layout

```
┌─ Wires ────────────────────────────[+ New Wire]─┐
│                                                  │
│ ☑  slider1                                       │
│    Source → Circle 1 · rotation                  │
│    map(source, 0, 1, 0, 360)         [✏] [🗑]  │
│                                                  │
│ ☑  timeline-main · progress                      │
│    Source → Rectangle 1 · scale.x                │
│    smoothstep(0, 1, source)          [✏] [🗑]  │
│                                                  │
│ ☐  audio-volume                                  │
│    Source → Glow Effect · intensity              │
│    source * 20                       [✏] [🗑]  │
│                                                  │
│ ⚠ broken_source                                  │
│    Source → Triangle 1 · opacity (deleted)       │
│    source                            [✏] [🗑]  │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Wire kartı bileşenleri

```
┌────────────────────────────────────────┐
│ ☑   [Source label]                     │
│     → [Target label]                   │
│     [Expression]                       │
│     [Edit ✏]  [Delete 🗑]             │
└────────────────────────────────────────┘
```

#### Davranış

- **Checkbox** → enable/disable toggle (instant, undoable via `makeToggleWireCmd`)
- **Source/Target labels** → tıklanır, ilgili layer'ı seç + PropertiesPanel'ı o property'ye scroll et
- **Edit (✏)** → WireParameterModal'ı edit modunda aç
- **Delete (🗑)** → confirm dialog → `makeDeleteWireCmd`
- **+ New Wire** → WireParameterModal'ı boş new modunda aç
- **Broken wire (⚠)** → kırmızı border, "source not found" tooltip
  - Edit'e tıklayınca modal'da source picker boş açılır, kullanıcı yeniden seçebilir

#### Sort ve filtreleme (MVP sonrası, hazırlık)

- Default: created order
- Sort by: source name, target name, enabled state
- Filter: only broken, only enabled, by layer

#### Panel registration

`src/app/page.tsx`:
```ts
const panelRegistry = [
  // ... mevcut
  {
    id: 'wiring',
    title: 'Wires',
    render: () => <WiringListPanel scene={scene} editor={editor} />,
  }
]
```

Default layout'ta: `properties-leaf` tabs içine eklenir (Bindings'in yanında):
```ts
panels: ['properties', 'assets', 'parameters', 'events', 'motionBinding', 'wiring', 'runtimePreview', 'snap'],
```

**Görevler:**
- [ ] `WiringListPanel.tsx`
- [ ] `WireCard.tsx` sub-component
- [ ] Panel registry'e ekle, default layout güncelle
- [ ] Broken wire detection logic (Phase 3.3 burada da kullanılır)

---

### 6. Timeline Integration (Phase 3)

#### 6.1 Track header 🔗 indikatörü

**Dosya:** `src/components/timeline/LayerTimelineSection.tsx` (mevcut, değişiklik)

Her property track'inin header'ında, label'ın yanında 🔗 ikonu:

```
┌─ Circle 1 ────────────────────────────────┐
│  rotation  🔗  ◆        ◆          ◆     │   ← wire'lı
│  opacity       ◆        ◆                 │   ← wire yok
│  scale.x  🔗                              │   ← wire'lı, kf yok
└───────────────────────────────────────────┘
```

#### Davranış

- 🔗 görünür: o property için aktif wire varsa
- Hover: tooltip "Driven by slider1"
- Click: WireParameterModal edit modunda aç

#### 6.2 Context menu

**Dosya:** `src/components/timeline/keyframeMenuItems.ts` (mevcut, değişiklik)

Property/track row sağ-tık menüsünde:

```
Add Keyframe
Delete All Keyframes
Easing ▸
──────────────────
Wire This Parameter...        ← yoksa
Edit Wiring...                ← varsa
Disable Wiring                ← varsa, enabled ise
Remove Wiring                 ← varsa
```

PropertiesPanel'da da aynı menü maddeleri (property row sağ-tıkta).

**Görevler:**
- [ ] Track header'a 🔗 ikon eklemek için track-wire lookup
- [ ] `keyframeMenuItems.ts`'e wire menü maddeleri ekle
- [ ] PropertiesPanel context menu entegrasyonu

#### 6.3 Broken wire detection (Phase 3.3)

**Dosya:** `src/lib/runtime/parameterWireEvaluator.ts` (mevcut, eklemeler)

`evaluateParameterWires` return değerini genişlet:

```ts
interface WireEvaluationResult {
  overrides: OverrideMap
  brokenWireIds: Set<string>   // YENİ
}
```

UI'da kullanım:
- `WiringListPanel` broken wire'ı ⚠ ile gösterir
- `PropertiesPanel` 🔗 ikonunu kırmızı yapar
- Timeline track header 🔗 ikonu kırmızı

**Görevler:**
- [ ] `parameterWireEvaluator` return type değişikliği
- [ ] Hook tarafında brokenWireIds'i state olarak expose et
- [ ] UI bileşenlerinde tüketici tarafları güncelle

---

## State Akışı

### Wire modal açma akışı

```
User clicks 🔗 (PropertiesPanel veya WiringListPanel)
    ↓
useWireModal hook
    ↓
{ isOpen: true, mode: 'edit' | 'new', wireId?, preFilledTarget? }
    ↓
<WireParameterModal /> render
    ↓
User edits
    ↓
[Apply] → editor.dispatchCommand(makeAddWireCmd | makeUpdateWireCmd)
    ↓
scene.parameterWires güncellenir
    ↓
useInteractiveRuntime yeniden eval eder → override map güncel
    ↓
PropertiesPanel "Driven by..." gösterir
WiringListPanel listede gözükür
Timeline track header 🔗 gösterir
```

### Single source of truth

- **scene.parameterWires[]** — tek doğruluk kaynağı
- Modal local state'i sadece düzenleme sürecinde, Apply'da commit
- Cancel → local state çöpe atılır
- Tüm UI bu array'i okur (lookup helpers ile)

---

## Helper Functions (Yardımcılar)

**Dosya:** `src/lib/wiring/helpers.ts` (YENİ)

```ts
// Lookup: bir property için aktif wire var mı?
export function findWireForProperty(
  wires: ParameterWire[],
  layerId: string,
  propertyPath: string,
): ParameterWire | null

// ParameterRef → human-readable string ("Circle 1 · rotation")
export function formatParameterRef(
  ref: ParameterRef,
  scene: ChronoScene,
): string

// ParameterRef → DOM ID benzeri unique key (lookup için)
export function paramRefKey(ref: ParameterRef): string

// Bir layer'dan tüm animatable property ref'leri çıkar
export function listLayerParameterRefs(layer: Layer): ParameterRef[]

// Type uyumluluk kontrolü
export function areTypesCompatible(
  source: ParameterRef['valueType'],
  target: ParameterRef['valueType'],
): boolean

// Broken wire detection
export function isWireBroken(
  wire: ParameterWire,
  scene: ChronoScene,
): boolean
```

---

## Dosya Yapısı (Hedef)

```
src/components/wiring/          [YENİ klasör]
 ├── WireParameterModal.tsx
 ├── SourceParameterPicker.tsx
 ├── MappingPresets.tsx
 ├── ExpressionEditor.tsx       [mevcut, taşınır]
 └── presets.ts                 [preset sabitleri]

src/components/panels/
 ├── WiringListPanel.tsx        [YENİ]
 └── MotionBindingPanel.tsx     [Expression tab kaldırılır]

src/components/PropertiesPanel.tsx       [değişiklik: 🔗 icon]
src/components/timeline/LayerTimelineSection.tsx  [değişiklik: 🔗 indicator]
src/components/timeline/keyframeMenuItems.ts      [değişiklik: wire menü maddeleri]

src/lib/wiring/                 [YENİ klasör]
 └── helpers.ts                 [lookup + format yardımcıları]

src/lib/editor/
 └── commands-wiring.ts         [opsiyonel: commands-interactive'ten ayır]

src/app/hooks/
 └── useWireModal.ts            [YENİ: modal açma/kapama state]
```

---

## Implementation Order (Önerilen Sıra)

Sırayla yapılmalı, her adım önceki tamamlanmadan başlanmamalı:

### Sprint 1 — Foundation Hizalama (~2 saat)

1. **Types refactor** — `ParameterRef` interface, `ParameterWire` enriched fields
2. **Migration helper** — mevcut string-based wire'ları `ParameterRef` formatına çevir
3. **Helpers** — `src/lib/wiring/helpers.ts` (lookup + format)
4. **MotionBindingPanel cleanup** — Expression tab'ı kaldır, Linear-only kalsın

### Sprint 2 — Modal + Picker (~3 saat)

5. **`SourceParameterPicker`** — hiyerarşik tree + search
6. **`MappingPresets`** — categorized dropdown
7. **`WireParameterModal`** — modal wrapper, picker + expression editor + preview entegrasyonu
8. **`useWireModal`** — global modal state hook
9. **page.tsx** — modal render entegrasyonu

### Sprint 3 — Inspector Integration (~2 saat)

10. **PropertiesPanel 🔗 icon** — her property row'da
11. **"Driven by..." display** — wire varsa input replace
12. **Click handler** — modal'ı target pre-filled açar

### Sprint 4 — WiringListPanel (~2 saat)

13. **`WiringListPanel`** — wire list + cards
14. **`WireCard`** — toggle/edit/delete actions
15. **Panel registry + dock layout** ekleme

### Sprint 5 — Timeline Integration (~2 saat)

16. **Track header 🔗 indicator** — `LayerTimelineSection`
17. **Context menu maddeleri** — `keyframeMenuItems.ts` + `PropertiesPanel` right-click

### Sprint 6 — Broken Wire Detection (~1 saat)

18. **`parameterWireEvaluator`** return değişikliği — `brokenWireIds`
19. **UI broken state** — Properties/Timeline/WiringList'te kırmızı uyarı

**Toplam tahmini efor:** ~12 saat (1.5 gün konsantre çalışma)

---

## Migration Path (Mevcut "Expression Tab"dan Geçiş)

1. **Backwards compat helper** yaz: eski `{ sourceParamId: string, targetParamId: string }` formatından yeni `{ source: ParameterRef, target: ParameterRef }` formatına çeviren fonksiyon
2. **Scene load sırasında** otomatik migration (transparent)
3. **MotionBindingPanel Expression tab** kaldırılır — kullanıcı uyarısı: "Wire ler artık ayrı panelde, Wires sekmesini açın"
4. **WiringListPanel açıkça gösterilir** — onboarding tooltip ile

Hiçbir mevcut wire kaybolmaz, sadece UI yeri değişir.

---

## UX İlkeleri

### Discoverability
- Her wire'lanabilir property görünür 🔗 ikona sahip
- Wire varsa input disabled + label → "burası kontrol dışı" mesajı net
- Kullanıcı panel aramak zorunda kalmaz

### Direct manipulation
- Property'ye tıkla → modal o property için açılır
- Modal'da source/expression seç → Apply → bitti
- 3 click ile yeni wire (target tıkla → source seç → preset/expression → apply)

### Reversibility
- Tüm aksiyonlar undo/redo'ya gider (commands kullanıldığı için)
- Modal'da "Cancel" hiçbir şey yazmaz
- Wire delete → instant, ama undo ile geri gelir

### Visibility
- WiringListPanel: tüm wire'ları tek görünümde sıralı
- Properties: hangi property bağlı, hangi değil
- Timeline: hangi track wire'lı (🔗 ikon)
- Broken wire'lar her yerde kırmızı

### Forgiveness
- Self-wire engelleme (target ile source aynı property olamaz)
- Type uyumsuzluğunda picker'da grey-out
- Invalid expression → kırmızı border + hata mesajı, Apply disabled
- Broken wire silinmek yerine kırmızı uyarı (kullanıcı düzeltebilir)

---

## Test Plan

### Unit testler

- `helpers.test.ts` — formatParameterRef, listLayerParameterRefs, isWireBroken
- `presets.test.ts` — preset listesi tutarlılığı
- Expression evaluator zaten test edilmiş ✓

### Component testler

- `WireParameterModal` — open/close, apply/cancel, edit/new mode
- `SourceParameterPicker` — search filtering, type compatibility, click selection
- `WiringListPanel` — toggle, delete, broken indication

### Manuel test akışları

- [ ] Properties → 🔗 click → modal açılır, target dolu
- [ ] Source picker'dan slider1 seç → modal'da görünür
- [ ] Preset "Normalized to degrees" seç → expression doldurulur
- [ ] Preview anlık güncellenir
- [ ] Apply → PropertiesPanel'da "Driven by slider1" gözükür
- [ ] WiringListPanel'da wire listede
- [ ] Timeline rotation track'inde 🔗 ikonu
- [ ] WiringListPanel'da toggle disable → PropertiesPanel'da input geri gelir
- [ ] WiringListPanel'dan delete → tüm yerlerde wire kaybolur
- [ ] Source parameter silinince → broken state her yerde gözükür
- [ ] Undo → silinen wire geri gelir
- [ ] Self-wire denemesi → picker'da target grey-out

---

## Açık Sorular (Karar Bekleyenler)

1. **Modal mı, Sidebar mı?** Plan modal diyor, ama dock-based UI'da inline sidebar daha "Chorono-vari" olabilir. → MVP modal, kullanıcı feedback'iyle değerlendirilir.

2. **Vec2 wire desteği?** Plan'da "Multiple wires per target" Phase 4. Vec2 source → number target type conversion UI (x/y/length/angle seçimi) MVP'de yok.

3. **Preset listesi nereden gelir?** Static (kod içi) MVP için yeterli. İleri: user-defined preset kayıt sistemi (Phase 4+).

4. **Wire isimlendirme?** Plan `name?: string` ihtiyari. WiringListPanel'da default `source → target` gösterilir, opsiyonel custom name eklenebilir mi? → MVP'de skip, sadece auto-label.

5. **Animation altında wire?** Bir property hem wire'lı hem keyframe'li olabilir mi? Plan'da `finalValue = wiringValue ?? keyframeValue` — wire öncelikli. Bu UX olarak yanıltıcı olabilir. → MVP: wire varsa keyframe input/edit disabled. İleri: blend modes.

---

## Bitişikteki Sistemlere Etki

| Sistem | Etki | Aksiyon |
|---|---|---|
| MotionBindingPanel (Linear) | Expression tab kaldırılır | Sadece Linear tab kalır, "Wires" panel ayrı |
| PropertiesPanel | Her row'a 🔗 ikon | Layout breaking değil, sağa eklenir |
| TimelinePanel | Track header'a 🔗 | Layout etkilenmez, ikon küçük |
| useInteractiveRuntime | Hayır | Wire eval zaten entegre |
| Scene JSON | `parameterWires[]` format değişir | Migration helper transparent |
| AI Panel | Wire ekleme tool'u eklenebilir | Phase 4+ — `make_parameter_wire` action |

---

## Tamamlama Kriterleri

✅ Bu UI plan tamamlandığında:

1. Kullanıcı PropertiesPanel'da bir property'nin 🔗 ikonuna tıklayarak wire kurabilir
2. Source picker hiyerarşik tree'de tüm scene parametrelerini ve layer property'lerini gösterir
3. Mapping presets ile yaygın formüller tek tıkla seçilebilir
4. WiringListPanel tüm wire'ları tek görünümde listeler
5. Timeline'da wire'lı property'ler 🔗 ile işaretli
6. Broken wire'lar kırmızı uyarı ile gösterilir
7. Tüm aksiyonlar undo/redo'ya entegre
8. Mevcut "Expression tab" UI'ı kaldırıldı, yerine plana uygun ayrı componentler geldi

---

## İlişkili Dokümanlar

- [`docs/parameter-wiring-plan.md`](./parameter-wiring-plan.md) — orijinal sistem planı (Phase 1-4)
- [`BACKLOG.md`](../BACKLOG.md) — BL-05 Parameter Wiring backlog girdisi
- [`~/.claude/plans/backlog-md-dosyas-nda-yazan-ncelik-unified-eich.md`](file:///Users/nilayerol/.claude/plans/backlog-md-dosyas-nda-yazan-ncelik-unified-eich.md) — BL-45/07/11/05/03 unified plan
