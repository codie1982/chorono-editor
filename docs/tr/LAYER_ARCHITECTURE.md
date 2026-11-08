# Katman Mimarisi Dokümantasyonu

Kodlama ve devir standardı: [AGENTS.md — Software engineering standards](../../AGENTS.md#software-engineering-standards). SOLID, modül sahipliği, ortak kodu yeniden kullanma, 300 satırlık sınıf hedefi ve ayrıntılı sınıf/fonksiyon açıklamaları bütün yeni katmanlara uygulanır.

## İçindekiler
1. [Giriş](#giriş)
2. [Temel Konseptler](#temel-konseptler)
3. [Veri Modeli](#veri-modeli)
4. [Mimari Bileşenler](#mimari-bileşenler)
5. [UI Bileşenleri](#ui-bileşenleri)
6. [Timeline Özellikleri](#timeline-özellikleri)
7. [Genişletilebilirlik](#genişletilebilirlik)
8. [Akış Örnekleri](#akış-örnekleri)
9. [API Referans](#api-referans)
10. [Klasör Yapısı](#klasör-yapısı)

---

## Giriş

### Katman Nedir?

Chorono'da **katman (Layer)**, bir canvas üzerindeki tüm görsel ve animasyon verilerini kapsayan temel birimdir. Her katman:
- **Geometri:** şekil, konum, ölçü, dönüş
- **Görünüm:** renk, opaklık, blend mode, desen
- **Animasyon:** zaman aralığı (startMs, endMs), keyframe'ler
- **Hiyerarşi:** parent-child ilişkisi (scene graph)
- **Editör Metadata:** lock durumu, gizlenmiş durumu, solo, pin, renk etiketi

### Neden Merkezi Sistem?

Katman mimarisi **genişletilebilir ve plugin tabanlıdır**:

- **LayerRegistry:** Yeni katman türlerini dinamik olarak kaydeder
- **LayerDefinition:** Her türün özelliklerini, factory fonksiyonunu ve renderer'ını tanımlar
- **PropertySchema:** Her özelliği tip-güvenli şekilde tanımlar (animatablilk, min/max, vb.)
- **LayerRendererRegistry:** Render işlemini dispatch eder (ilk eşleşen plugin kazanır)

Registry, yeni bir katmanın factory/property schema ve çizim davranışı için genişletme noktası sağlar. Tam bir katman teslimi ayrıca veri tipi/şema, native komutlar, clone/instance, seçim/bounds, kayıt/yükleme ve runtime/export desteğini kapsar. Yalnız `LayerDefinition` ve `LayerRendererPlugin` eklemek bütün bu yolların hazır olduğunu göstermez.

### Temel Özellikler (BL-38)

Yakın zamanda eklenen zaman çizelgesi özellikleri:

| Özellik | Alan | Açıklama |
|---------|------|----------|
| **Color Labels** | `colorLabel?: string` | Görsel etiket (hex renk) |
| **Hidden** | `hidden?: boolean` | Katman işlenmez/gizlidir |
| **Solo** | `solo?: boolean` | Herhangi biri true ise, yalnızca solo olanlar görünür |
| **Pinned** | `pinned?: boolean` | position:sticky ile yapışkan başlık |
| **Locked** | `locked?: boolean` | Düzenleme engellenir |

Tüm editör metadata alanları runtime export'ta çıkarılır.

---

## Temel Konseptler

### Layer (Katman)

Bir katman, tüm geometri + animasyon + hiyerarşi verilerini içeren tek bir nesne. Örnek:

```typescript
{
  id: "uuid-1",
  name: "Kırmızı Daire",
  type: "shape",
  shapeKind: "circle",
  
  // Transform
  transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotationDeg: 0, ... },
  
  // Görünüm
  opacity: 0.8,
  blendMode: "normal",
  style: { fill: "#FF0000", stroke: null },
  
  // Timeline
  startMs: 0,
  endMs: 5000,
  
  // Scene Graph
  parentId: null, // Köküdür
  
  // Editör Metadata
  locked: false,
  hidden: false,
  solo: false,
  pinned: false,
  colorLabel: "#FF0000"
}
```

### LayerType (Katman Türü)

Katmanı sınıflandırır:
- `'shape'` — şekil (rect, circle, ellipse, polygon, vb.)
- `'text'` — metin
- `'image'` — görüntü
- `'video'` — video
- `'audio'` — ses
- `'path'` — bezier path (kalem aracı)
- `'pathStroke'` — path stroke (kontur)
- `'group'` — grup (hiyerarşi kapsayıcı)
- `'repeater'` — repeater (tekrarlama)

### ShapeKind (Şekil Türü)

Daha ayrıntılı şekil tanımı:
- Temel: `'rect'`, `'circle'`, `'ellipse'`, `'line'`, `'arrow'`
- Gelişmiş: `'polygon'`, `'star'`, `'ring'`, `'arc'`, `'capsule'`

### Scene Graph (Sahne Grafiği)

Katmanlar parent-child ilişkisine sahip ağaç yapısı oluşturur:

```
Scene (root)
├── Group A
│   ├── Shape 1
│   └── Shape 2
├── Text B
└── Image C
```

`parentId` alanı hiyerarşiyi tanımlar. Null = root seviyesi.

### Timeline Range (Zaman Aralığı)

Her katmanın `startMs` ve `endMs` alanları vardır:
- `startMs = 1000` → katman 1 saniyede görünür
- `endMs = 5000` → katman 5 saniyede kaybolur
- İkisi de isteğe bağlı; varsayılan = çizelgenin tamamı

### Editor Flags (Editör Bayrakları)

**Runtime dışında tutulan** metadata (export'ta çıkarılır):
- `locked?: boolean` — düzenleme önlenir
- `hidden?: boolean` — UI'da gizli
- `solo?: boolean` — solo mode trigger'ı
- `pinned?: boolean` — sticky header
- `colorLabel?: string` — görsel etiket

### LayerDefinition ve Registry

Yeni bir katman **türü** tanımlamak için:
- `LayerRegistry`: Tüm `LayerDefinition`'ları saklar, keşfedilebilir hale getirir
- `LayerDefinition`: Türün metadata'sı, factory, property şemaları, renderer
- `PropertySchema`: Editörde her editlenebilir alanı tanımlar

Örneğin, Rectangle katmanın LayerDefinition'ı:
- Türü: `kind = 'rect'`
- Etiket: `label = 'Rectangle'`
- Factory: `createDefault()` → yeni rect oluşturur
- Özellikler: `getPropertyGroups()` → Transform, Appearance, Size, Fill, Stroke
- İşleme: `LayerRendererPlugin` → canvas'a çizer

---

## Veri Modeli

### Layer Tipi Tam Tanımı

**Kaynak:** `src/lib/types/core.ts` (satırlar 174-262)

```typescript
interface Layer {
  // Kimlik
  id: string;                    // UUID
  name: string;                  // Ekran adı
  type: LayerType;               // 'shape' | 'text' | 'image' | ...
  
  // Transform
  transform: Transform;          // x, y, scaleX, scaleY, rotationDeg, anchorX, anchorY
  
  // Görünüm
  opacity: number;               // 0-1
  blendMode: string;             // 'normal', 'multiply', vb.
  style?: LayerStyle;            // { fill, stroke }
  
  // Timeline
  startMs?: number;              // Başlama zamanı (ms)
  endMs?: number;                // Bitiş zamanı (ms)
  
  // Scene Graph
  parentId?: string;             // Ebeveyn katman ID'si (null = root)
  
  // Editör Metadata (runtime'dan hariç)
  locked?: boolean;              // Düzenleme engellenir
  hidden?: boolean;              // UI'da gizli
  solo?: boolean;                // Solo mode
  pinned?: boolean;              // Yapışkan başlık
  colorLabel?: string;           // Hex renk etiketi
  
  // Şekil Verisi (tip = 'shape')
  shape?: ShapeType;             // Legacy: 'rect' | 'circle'
  shapeKind?: ShapeKind;         // Yeni: 11 şekil türü
  shapeParams?: ShapeParams;     // Şekle özel parametreler
  size?: { width: number; height: number };
  
  // Metin Verisi (tip = 'text')
  text?: TextStyle;              // { value, fontSize, color, fontFamily, ... }
  
  // Medya Verisi
  image?: ImageData;             // { url, width, height }
  video?: VideoData;             // { url, duration, ... }
  audio?: AudioData;             // { url, duration, ... }
  
  // Path Verisi
  path?: BezierPath;             // { points, segments }
  pathStroke?: PathStrokeData;   // { width, color, ... }
  
  // Efektler
  effects?: LayerEffects;        // Efekt listesi
  effectsChain?: PluginEffect[]; // Plugin efektleri
  
  // Repeater Verisi
  repeater?: RepeaterLayerData;  // { count, offset, ... }
}
```

### Transform Yapısı

```typescript
interface Transform {
  x: number;                     // X konumu
  y: number;                     // Y konumu
  scaleX: number;                // X ölçeği (1 = orijinal)
  scaleY: number;                // Y ölçeği (1 = orijinal)
  rotationDeg: number;           // Dönüş (derece)
  anchorX: number;               // X pivot noktası (0-1)
  anchorY: number;               // Y pivot noktası (0-1)
}
```

### ShapeKind Genişlemesi

11 şekil türü:

| Tür | Parametreler | Açıklama |
|-----|---------------|----------|
| `'rect'` | — | Dikdörtgen |
| `'circle'` | — | Daire |
| `'ellipse'` | — | Elips |
| `'line'` | `x2, y2` | Doğru (A'dan B'ye) |
| `'arrow'` | `x2, y2, arrowHeadSize` | Ok |
| `'polygon'` | `sides` | Çokgen (3-10 kenar) |
| `'star'` | `sides, innerRadius, outerRadius` | Yıldız |
| `'ring'` | `innerRadius, outerRadius` | Halka |
| `'arc'` | `startAngle, endAngle, radius` | Yay |
| `'capsule'` | — | Kapsül (rounded line) |
| `'custom'` | — | Özel şekil |

### Type-Specific Veriler

**TextStyle:**
```typescript
{
  value: string;                 // Metin içeriği
  fontSize: number;              // Puan cinsinden boyut
  color: string;                 // Hex renk
  fontFamily: string;            // Font adı
  fontWeight: number;            // 400, 700, vb.
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;         // Harf aralığı (px)
}
```

**ImageData:**
```typescript
{
  url: string;                   // Görüntü kaynağı
  width: number;                 // Genişlik (px)
  height: number;                // Yükseklik (px)
}
```

**VideoData / AudioData:**
```typescript
{
  url: string;                   // Medya kaynağı
  duration: number;              // Süre (ms)
  muted?: boolean;
}
```

---

## Mimari Bileşenler

### LayerRegistry (Merkezi Kayıt)

**Dosya:** `src/lib/registry/LayerRegistry.ts`

```typescript
class LayerRegistry {
  // Türü kaydedip keşfedilebilir hale yapar
  register(definition: LayerDefinition): void;
  
  // Tür bilgisini ID'ye göre alır
  get(kind: string): LayerDefinition | undefined;
  getOrThrow(kind: string): LayerDefinition;
  
  // Tüm tür bilgilerini listeler
  getAll(): LayerDefinition[];
  
  // Kategoriye göre filtreler
  getByCategory(category: LayerCategory): LayerDefinition[];
  
  // Bir katmana ait tür bilgisini bulur
  findForLayer(layer: Layer): LayerDefinition | undefined;
}
```

**Kullanım:**
```typescript
import { layerRegistry } from '@/lib/registry/singletons';

// Tüm shape türlerini al
const shapeDefinitions = layerRegistry.getByCategory('Basic Shapes');

// Yeni katman oluştur (factory)
const rectDef = layerRegistry.get('rect');
const newRect = rectDef?.createDefault();
```

### LayerDefinition (Tür Tanımı)

**Dosya:** `src/lib/registry/LayerDefinition.ts`

```typescript
interface LayerDefinition {
  // Sabit tanımlayıcı
  kind: string;                      // 'rect', 'text', 'group', vb.
  
  // UI bilgisi
  label: string;                     // "Rectangle", "Text", vb.
  iconKey: string;                   // Icon sprite adı
  category: LayerCategory;           // Menü kategorisi
  
  // Factory: Yeni katman oluştur
  createDefault(overrides?: Partial<Layer>): Layer;
  
  // Property schema'larını döndür (UI editörü için)
  getPropertyGroups(layer: Layer): PropertyGroup[];
  
  // Path'e dönüştür (trim, motion path, export)
  toPath?(layer: Layer): PathDefinition | null;
}
```

**Örnek - Rectangle Tanımı:**

Dosya: `src/lib/registry/definitions/shapes/RectDefinition.ts`

```typescript
export const rectDefinition: LayerDefinition = {
  kind: 'rect',
  label: 'Rectangle',
  iconKey: 'rect',
  category: 'Basic Shapes',
  
  createDefault: (overrides) => ({
    id: generateId(),
    name: 'Rectangle',
    type: 'shape',
    shapeKind: 'rect',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    size: { width: 100, height: 100 },
    style: { fill: '#000000', stroke: null },
    ...overrides,
  }),
  
  getPropertyGroups: (layer) => [
    transformGroup(),
    sizeGroup(),
    appearanceGroup(),
    fillGroup(),
    strokeGroup(),
  ],
};
```

### PropertySchema (Özellik Tanımı)

**Dosya:** `src/lib/registry/PropertySchema.ts`

```typescript
interface PropertySchema {
  id: string;                        // Benzersiz ID
  path: string;                      // Nesne yolu: 'transform.x', 'style.fill'
  label: string;                     // "Position X", "Fill Color"
  group: string;                     // Bölüm adı: 'Transform', 'Appearance'
  valueType: PropValueType;          // 'number' | 'color' | 'boolean' | 'select' | ...
  
  // Animasyon
  animatable: boolean;               // true = keyframe eklenebilir
  
  // Sayı kısıtlamaları
  min?: number;
  max?: number;
  step?: number;
  
  // Select/dropdown
  options?: Array<{ value: any; label: string }>;
  
  // Varsayılan
  defaultValue: any;
  
  // Koşullu gösterme
  showWhen?(layer: Layer): boolean;
}
```

**Örnek - PropertySchema'lar:**

```typescript
const positionXSchema: PropertySchema = {
  id: 'transform.x',
  path: 'transform.x',
  label: 'Position X',
  group: 'Transform',
  valueType: 'number',
  animatable: true,
  min: -10000,
  max: 10000,
  step: 1,
  defaultValue: 0,
};

const fillColorSchema: PropertySchema = {
  id: 'style.fill',
  path: 'style.fill',
  label: 'Fill Color',
  group: 'Fill',
  valueType: 'color',
  animatable: true,
  defaultValue: '#000000',
  showWhen: (layer) => layer.type === 'shape', // Yalnızca şekiller
};
```

### PropertyGroup (Özellik Grubu)

Şemalar mantıksal bölümlere gruplandırılır:

```typescript
interface PropertyGroup {
  id: string;                        // 'transform', 'fill', vb.
  label: string;                     // 'Transform', 'Fill Color'
  schemas: PropertySchema[];         // Bu gruptaki özellikler
  collapsed?: boolean;               // Başlangıçta kapalı
}
```

**Paylaşılan Gruplar:**

```typescript
// Transform grubunun tamamı (x, y, scale, rotate, anchor)
const transformGroup = (): PropertyGroup => ({
  id: 'transform',
  label: 'Transform',
  schemas: [
    { id: 'x', path: 'transform.x', label: 'Position X', ... },
    { id: 'y', path: 'transform.y', label: 'Position Y', ... },
    // ... scale, rotate, anchor
  ],
});

// Görünüm grubu (opacity, blend mode)
const appearanceGroup = (): PropertyGroup => ({
  id: 'appearance',
  label: 'Appearance',
  schemas: [
    { id: 'opacity', path: 'opacity', label: 'Opacity', ... },
    { id: 'blendMode', path: 'blendMode', label: 'Blend Mode', ... },
  ],
});
```

### LayerRendererRegistry (İşleme Kayıt)

**Dosya:** `src/lib/registry/LayerRendererRegistry.ts`

```typescript
interface LayerRendererPlugin {
  id: string;
  supports(layer: Layer): boolean;   // Bu katmanı işleyebilir mi?
  render(ctx: RenderContext, layer: Layer, overrides?: LayerOverrides): void;
}

class LayerRendererRegistry {
  register(plugin: LayerRendererPlugin): void;
  find(layer: Layer): LayerRendererPlugin | undefined;
  findOrThrow(layer: Layer): LayerRendererPlugin;
}
```

**İşleyiş:** İlk eşleşen plugin kazanır.

```typescript
// Render zamanı
const plugin = rendererRegistry.findOrThrow(layer);
plugin.render(ctx, layer);
```

### Bootstrap (Başlatma ve Kayıt)

**Dosya:** `src/lib/registry/bootstrap.ts`

Uygulama başlamada çağrılır. Tüm türleri ve renderer'ları kaydeder:

```typescript
export function bootstrap() {
  // Temel şekiller
  layerRegistry.register(rectDefinition);
  layerRegistry.register(circleDefinition);
  // ... 9 daha

  // Metin
  layerRegistry.register(textDefinition);
  
  // Medya
  layerRegistry.register(imageDefinition);
  layerRegistry.register(videoDefinition);
  layerRegistry.register(audioDefinition);
  
  // Gruplar
  layerRegistry.register(groupDefinition);
  layerRegistry.register(repeaterDefinition);
  
  // Renderer'lar
  rendererRegistry.register(shapeRendererPlugin);
  rendererRegistry.register(textRendererPlugin);
  // ... vs.
}
```

### Commands (Komutlar - Undo/Redo)

**Dosya:** `src/lib/editor/commands-layer.ts`

Tüm katman düzenleme işlemleri komut olarak uygulanır:

```typescript
// Katman ekle
const cmd = makeAddLayerCmd(newLayer);
executeCommand(cmd); // İleri
undoCommand();       // Geri

// Katman güncelle
const updateCmd = makeUpdateLayerCmd(layerId, { name: 'Yeni Ad' }, prevLayer);
executeCommand(updateCmd);

// Solo toggle
const soloCmd = makeToggleLayerCmd(layerId, 'solo');
executeCommand(soloCmd);

// Diğerler
makeMoveLayerCmd();    // Sırası değiştir
makeDeleteLayerCmd();  // Sil
makeDuplicateLayerCmd(); // Klon
makeTrimLayerCmd();    // Başını/sonunu kes
makeShiftLayerCmd();   // Zaman kaydır
```

---

## UI Bileşenleri

### LayerPanel

**Dosya:** `src/components/LayerPanel.tsx`

Katman ağacını ve düzenleme seçeneklerini gösterir:

- **Katman Listesi:** Tüm katmanları görüntüler, drag/drop ile yeniden sırala
- **Ekle Butonu:** LayerRegistry'den tür seçer, `createDefault()` çağırır
- **Sağ Tıklama Menüsü:**
  - Çoğalt
  - Sil
  - Adını değiştir
  - Renk Etiketi
  - Lock / Hide / Solo / Pin

### TimelinePanel

**Dosya:** `src/components/timeline/TimelinePanel.tsx`

Zaman çizelgesini gösterir, katman time range'ini kontrol eder:

```typescript
// Solo filtreleme
const soloLayerIds = scene.layers
  .filter(l => l.solo)
  .map(l => l.id)

const visibleLayers = scene.layers
  .filter(l => !l.hidden && (soloLayerIds.length === 0 || soloLayerIds.has(l.id)))
  .sort((a, b) => {
    // Pinned katmanları üste al
    const aPinned = a.pinned ? 1 : 0
    const bPinned = b.pinned ? 1 : 0
    return bPinned - aPinned
  })
```

### LayerTimelineSection

**Dosya:** `src/components/timeline/LayerTimelineSection.tsx`

Her katmana ait zaman çizelgesi bölümü:

```typescript
interface Props {
  layer: Layer;
  pinIndex?: number;             // Pinned katmanları sırala (position:sticky için)
  onToggleFlag?(id: string, field: 'locked' | 'hidden' | 'solo'): void;
  onUpdateTimeRange?(id: string, startMs: number, endMs: number): void;
}
```

**Sticky Positioning:**
```css
.layer-timeline-section {
  position: sticky;
  top: ${pinIndex * ROW_HEIGHT}px;  /* Dinamik pin sırası */
}
```

### TimelineLayerBar

**Dosya:** `src/components/timeline/TimelineLayerBar.tsx`

Katmanın time range'inin görsel gösterimi:

```typescript
<div
  style={{
    backgroundColor: layer.colorLabel || '#808080',
    opacity: layer.hidden ? 0.3 : 1,
    left: `${startMs}px`,
    width: `${endMs - startMs}px`,
  }}
>
  {layer.name}
</div>
```

### PropertiesPanel

**Dosya:** `src/components/PropertiesPanel.tsx`

Seçili katmanın özelliklerini düzenler. `LayerDefinition.getPropertyGroups()` aracılığıyla schema'ları alır:

```typescript
const selected = scene.layers.find(l => l.id === selectedId);
if (selected) {
  const definition = layerRegistry.findForLayer(selected);
  const groups = definition?.getPropertyGroups(selected);
  
  return groups?.map(group => (
    <PropertyGroup key={group.id} group={group} layer={selected} />
  ));
}
```

---

## Timeline Özellikleri

### Solo Mode

Herhangi bir katmanın `solo = true` olduğunda, **tüm diğer katmanlar gizlenir**:

```typescript
// TimelinePanel.tsx
const anySolo = scene.layers.some(l => l.solo);
const visibleLayers = scene.layers.filter(l =>
  !l.hidden && (!anySolo || l.solo)
);
```

**Görsel Gösterge:** ★ ikon

### Pin (Yapışkan Başlık)

Pinned katmanlar zaman çizelgesinin üstüne yapışır:

```css
.layer-section {
  position: sticky;
  top: calc(${pinIndex} * 40px);
}
```

Sırası: pinned katmanlar önce, pinned olmayan olanlar sonra.

**Görsel Gösterge:** 📌 ikon

### Color Labels (Renk Etiketleri)

Her katmana bir hex renk atanabilir:

```typescript
layer.colorLabel = '#FF5733';
```

TimelineLayerBar bu rengi background olarak kullanır. Sağ tıklama menüsü:
- 12 preset renk
- Özel renk picker

### Hidden (Gizlenmiş)

`hidden = true` katmanlar:
- Canvas'ta işlenmez
- TimelinePanel'de soluk görünür
- Opacity 0.3

### Locked (Kilitli)

`locked = true` katmanlar:
- PropertiesPanel'de düzenleme devre dışı
- Sürükle-bırak devre dışı
- Silinemiyor

---

## Genişletilebilirlik

### Yeni Katman Türü Ekleme

Diyelim ki "Gradient" (degrade) katman türü eklemek istiyorsunuz. 3 adım:

#### Adım 1: LayerDefinition Oluştur

Dosya: `src/lib/registry/definitions/shapes/GradientDefinition.ts`

```typescript
import { LayerDefinition, PropertyGroup } from '@/lib/registry/LayerDefinition';
import { transformGroup, appearanceGroup, sizeGroup } from '@/lib/registry/PropertySchema';

export const gradientDefinition: LayerDefinition = {
  kind: 'gradient',
  label: 'Gradient',
  iconKey: 'gradient',
  category: 'Basic Shapes',
  
  createDefault: (overrides) => ({
    id: generateId(),
    name: 'Gradient',
    type: 'shape',
    shapeKind: 'gradient',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    size: { width: 200, height: 200 },
    style: { 
      fill: 'linear-gradient(90deg, #FF0000, #0000FF)',
      stroke: null 
    },
    ...overrides,
  }),
  
  getPropertyGroups: (layer) => [
    transformGroup(),
    sizeGroup(),
    appearanceGroup(),
    {
      id: 'gradient',
      label: 'Gradient',
      schemas: [
        {
          id: 'gradient-angle',
          path: 'gradientAngle',
          label: 'Angle',
          valueType: 'angle',
          animatable: true,
          min: 0,
          max: 360,
          step: 1,
          defaultValue: 90,
        },
        // ... color1, color2, scale, offset
      ],
    },
  ],
};
```

#### Adım 2: LayerRendererPlugin Oluştur

Dosya: `src/lib/render/renderers/GradientRenderer.ts`

```typescript
import { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry';
import { Layer, RenderContext } from '@/lib/types';

export const gradientRendererPlugin: LayerRendererPlugin = {
  id: 'gradient',
  
  supports: (layer: Layer) => {
    return layer.type === 'shape' && (layer as any).shapeKind === 'gradient';
  },
  
  render: (ctx: RenderContext, layer: Layer) => {
    const canvas = ctx.canvas;
    const gradLayer = layer as any;
    
    // Canvas'a degrade çiz
    const gradient = canvas.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, gradLayer.style.color1 || '#FF0000');
    gradient.addColorStop(1, gradLayer.style.color2 || '#0000FF');
    
    canvas.fillStyle = gradient;
    canvas.fillRect(
      gradLayer.transform.x,
      gradLayer.transform.y,
      gradLayer.size.width,
      gradLayer.size.height
    );
  },
};
```

#### Adım 3: Bootstrap'e Kaydet

Dosya: `src/lib/registry/bootstrap.ts`

```typescript
import { gradientDefinition } from './definitions/shapes/GradientDefinition';
import { gradientRendererPlugin } from '@/lib/render/renderers/GradientRenderer';

export function bootstrap() {
  // ... var olan kayıtlar
  
  // Gradient ekle
  layerRegistry.register(gradientDefinition);
  rendererRegistry.register(gradientRendererPlugin);
}
```

**Hepsi bu!** Gradient katmanı artık:
- Add Layer menüsünde görünür
- Varsayılan 200x200 degrade ile oluşturulur
- Angle, Color1, Color2 özelliklerinde düzenlenebilir
- Render edilir

---

## Akış Örnekleri

### Örnek 1: Yeni Katman Eklemek

```typescript
// 1. Registry'den tür bilgisi al
const rectDefinition = layerRegistry.get('rect');

// 2. Varsayılan oluştur
const newRect = rectDefinition.createDefault({ name: 'My Rectangle' });

// 3. Sahneye ekle (undo/redo ile)
const cmd = makeAddLayerCmd(newRect);
executeCommand(cmd);

// Sonuç: Scene'de yeni dikdörtgen görünür, Timeline'da da var
```

### Örnek 2: Katmanı Düzenlemek

```typescript
// 1. Seçili katmanı al
const layer = scene.layers.find(l => l.id === selectedId);

// 2. Özelliğini değiştir
const updated = { ...layer, name: 'Renamed' };

// 3. Undo/redo ile kaydet
const cmd = makeUpdateLayerCmd(layerId, { name: 'Renamed' }, layer);
executeCommand(cmd);
```

### Örnek 3: Solo Toggle

```typescript
// 1. Komutu oluştur
const cmd = makeToggleLayerCmd(layerId, 'solo');

// 2. Uygula
executeCommand(cmd);

// Timeline otomatik olarak güncellenir:
// - Solo = true ise diğer tüm katmanlar gizlenir
// - Solo = false ise önceki görünürlük durumuna döner
```

### Örnek 4: Pin Toggle

```typescript
const cmd = makeToggleLayerCmd(layerId, 'pinned');
executeCommand(cmd);

// Pinned katmanlar sticky header ile zaman çizelgesinin üstüne yapışır
```

### Örnek 5: Runtime Export

```typescript
// Editor katmanları (editor flags ile)
const editorScene = {
  layers: [
    {
      id: 'layer-1',
      name: 'Circle',
      type: 'shape',
      locked: true,        // Editor
      hidden: false,       // Editor
      solo: true,          // Editor
      pinned: false,       // Editor
      colorLabel: '#FF0000', // Editor
      // ... geom data
    }
  ]
};

// Runtime JSON (editor fields çıkarıldı)
const runtimeScene = stripEditorFields(editorScene);
// {
//   layers: [
//     {
//       id: 'layer-1',
//       name: 'Circle',
//       type: 'shape',
//       // locked, hidden, solo, pinned, colorLabel HARİÇ
//       // ... geom data
//     }
//   ]
// }
```

---

## API Referans

### LayerRegistry API

```typescript
class LayerRegistry {
  // Yeni türü kaydet
  register(definition: LayerDefinition): void;
  
  // Tür bilgisini al
  get(kind: string): LayerDefinition | undefined;
  
  // Tür bilgisini al (throw if not found)
  getOrThrow(kind: string): LayerDefinition;
  
  // Tüm türleri listele
  getAll(): LayerDefinition[];
  
  // Kategoriye göre filtrele
  getByCategory(category: LayerCategory): LayerDefinition[];
  
  // Katman için tür bilgisini bul
  findForLayer(layer: Layer): LayerDefinition | undefined;
}
```

### LayerDefinition API

```typescript
interface LayerDefinition {
  kind: string;
  label: string;
  iconKey: string;
  category: LayerCategory;
  
  createDefault(overrides?: Partial<Layer>): Layer;
  getPropertyGroups(layer: Layer): PropertyGroup[];
  toPath?(layer: Layer): PathDefinition | null;
}
```

### PropertySchema API

```typescript
interface PropertySchema {
  id: string;
  path: string;
  label: string;
  group: string;
  valueType: PropValueType;
  animatable: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: any; label: string }>;
  defaultValue: any;
  showWhen?(layer: Layer): boolean;
}

type PropValueType = 
  | 'number'
  | 'color'
  | 'boolean'
  | 'select'
  | 'string'
  | 'angle'
  | 'percent';
```

### Layer Commands API

```typescript
function makeAddLayerCmd(layer: Layer): Command;
function makeDeleteLayerCmd(layerId: string): Command;
function makeUpdateLayerCmd(layerId: string, patch: Partial<Layer>, prevLayer?: Layer): Command;
function makeMoveLayerCmd(layerId: string, fromIndex: number, toIndex: number): Command;
function makeMoveLayerToCmdWithSnapshot(scene: Scene, layerId: string, newParentId?: string, toIndex: number): Command;
function makeSplitLayerCmd(layerId: string, splitMs: number, ...): Command;
function makeTrimLayerCmd(layerId: string, ...): Command;
function makeShiftLayerCmd(layerId: string, shiftMs: number): Command;
function makeDuplicateLayerCmd(original: Layer, newLayer: Layer): Command;
function makeToggleLayerCmd(layerId: string, field: 'locked' | 'hidden' | 'solo' | 'pinned'): Command;
```

### LayerRendererRegistry API

```typescript
class LayerRendererRegistry {
  // Plugin kaydet
  register(plugin: LayerRendererPlugin): void;
  
  // İlk eşleşen plugin'i bul
  find(layer: Layer): LayerRendererPlugin | undefined;
  
  // Plugin'i bul (throw if not found)
  findOrThrow(layer: Layer): LayerRendererPlugin;
}

interface LayerRendererPlugin {
  id: string;
  supports(layer: Layer): boolean;
  render(ctx: RenderContext, layer: Layer, overrides?: LayerOverrides): void;
}
```

---

## Klasör Yapısı

### Dizin Haritası

```
src/
├── lib/
│   ├── types/
│   │   └── core.ts
│   │       ├── Layer (ana veri modeli)
│   │       ├── LayerType
│   │       ├── ShapeKind
│   │       └── ... (tüm tip tanımları)
│   │
│   ├── registry/
│   │   ├── LayerRegistry.ts ..................... Merkezi kayıt
│   │   ├── LayerDefinition.ts .................. Tür arayüzü
│   │   ├── PropertySchema.ts ................... Özellik tanımı
│   │   ├── LayerRendererRegistry.ts ............ Renderer dispatch
│   │   ├── bootstrap.ts ........................ Başlatma
│   │   ├── singletons.ts ....................... Singleton örnekler
│   │   │
│   │   └── definitions/
│   │       ├── shapes/
│   │       │   ├── RectDefinition.ts
│   │       │   ├── CircleDefinition.ts
│   │       │   ├── EllipseDefinition.ts
│   │       │   ├── LineDefinition.ts
│   │       │   ├── ArrowDefinition.ts
│   │       │   ├── PolygonDefinition.ts
│   │       │   ├── StarDefinition.ts
│   │       │   ├── RingDefinition.ts
│   │       │   ├── ArcDefinition.ts
│   │       │   ├── CapsuleDefinition.ts
│   │       │   └── ... (11 şekil tanımı)
│   │       ├── text/
│   │       │   └── TextDefinition.ts
│   │       ├── path/
│   │       │   ├── BezierPathDefinition.ts
│   │       │   └── PathStrokeDefinition.ts
│   │       ├── media/
│   │       │   ├── ImageDefinition.ts
│   │       │   ├── VideoDefinition.ts
│   │       │   └── AudioDefinition.ts
│   │       ├── scene/
│   │       │   ├── GroupDefinition.ts
│   │       │   └── RepeaterDefinition.ts
│   │       └── sharedSchemas.ts ................ Paylaşılan PropertyGroup'lar
│   │
│   ├── editor/
│   │   ├── commands-layer.ts ................... Layer CRUD komutları
│   │   └── layerTransforms.ts ................. Transformation utilities
│   │
│   ├── render/
│   │   ├── renderers/
│   │   │   ├── index.ts ........................ Tüm renderer plugin'leri
│   │   │   ├── ShapeRenderer.ts
│   │   │   ├── TextRenderer.ts
│   │   │   ├── ImageRenderer.ts
│   │   │   ├── VideoRenderer.ts
│   │   │   ├── AudioRenderer.ts
│   │   │   ├── GroupRenderer.ts
│   │   │   └── RepeaterRenderer.ts
│   │   └── RenderContext.ts ................... Render bağlamı
│   │
│   ├── export/
│   │   ├── runtimeExport.ts ................... Editor fields çıkarması
│   │   └── RuntimeOptimizer.ts ................ Optimize
│   │
│   └── ai/actions/
│       └── layer.ts ........................... AI katman işlemleri
│
├── components/
│   ├── LayerPanel.tsx ......................... Katman ağacı UI
│   ├── timeline/
│   │   ├── TimelinePanel.tsx .................. Zaman çizelgesi
│   │   ├── LayerTimelineSection.tsx .......... Tek katman bölümü
│   │   └── TimelineLayerBar.tsx .............. Etkinlik çubuğu
│   ├── PropertiesPanel.tsx ................... Özellik editörü
│   └── Canvas.tsx ............................ Canvas bileşeni
│
└── app/
    └── page.tsx .............................. Ana sayfa + state yönetimi
```

### Dosya Amaçları Tablosu

| Dosya | Amaç |
|-------|------|
| `core.ts` | Layer tipi ve diğer veri modellerinin tanımı |
| `LayerRegistry.ts` | LayerDefinition'ları kaydet/keşfet |
| `LayerDefinition.ts` | Yeni katman türlerinin arayüzü |
| `PropertySchema.ts` | Editlenebilir özelliklerin tanımı |
| `LayerRendererRegistry.ts` | Renderer plugin'lerini kaydet/dispatch |
| `bootstrap.ts` | Uygulama başında tüm türleri kaydet |
| `commands-layer.ts` | Undo/redo komutları |
| `LayerPanel.tsx` | Katman ağacı UI |
| `TimelinePanel.tsx` | Zaman çizelgesi ve filtreleme |
| `PropertiesPanel.tsx` | Seçili katmanın özellik editörü |
| `runtimeExport.ts` | Editor fields çıkarması |

---

## Özet

Chorono'nun katman mimarisi:

1. **Merkezi:** `LayerRegistry`, `LayerDefinition`, `PropertySchema`
2. **Genişletilebilir:** Yeni katman türü = 3 dosya (Definition, Renderer, Bootstrap kaydı)
3. **Editör Dostu:** LayerPanel, TimelinePanel, PropertiesPanel
4. **Timeline Özellikleri:** Solo, Pin, Hidden, Locked, Color Labels
5. **Undo/Redo:** Tüm işlemler `makeXyzCmd()` komutları
6. **Runtime Clean:** Editor metadata runtime export'tan çıkarılır

Yeni geliştirici için başlangıç noktası: `bootstrap.ts` ve herhangi bir `ShapeDefinition.ts` dosyasını okuyun.
