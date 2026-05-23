# Chorono AI Yetenekleri — Detaylı Döküman

**Tarih:** 2026-05-21  
**Versiyon:** 1.0  
**Dil:** Türkçe

---

## 📋 İçindekiler

1. [Giriş](#giriş)
2. [AI Mimarisi](#ai-mimarisi)
3. [Temel Kavramlar](#temel-kavramlar)
4. [Mevcut AI Araçları](#mevcut-ai-araçları)
5. [Örnek Kullanım Senaryoları](#örnek-kullanım-senaryoları)
6. [Teknik Detaylar](#teknik-detaylar)
7. [Gelecek Planı](#gelecek-planı)

---

## Giriş

Chorono, **AI-destekli anim asyonlar yaratmanızı sağlayan** profesyonel bir keyframe animasyon editörüdür. AI sistemi, doğal dil komutlarını yapı taşı araçlara çevirip sahneyi otomatik olarak inşa eder veya modifiye eder.

**Ana Amaç:** Türkçe ve İngilizcede yazdığınız istekleri, animasyon komutlarına dönüştürerek
- Yeni animasyonları sıfırdan oluşturma
- Mevcut sahneyi değiştirme
- Katmanları (layers) yönetme
- Etkileşimli öğeler ekleme
- State machine'ler tasarlama
- Parçacık efektleri oluşturma

---

## AI Mimarisi

### Genel Akış

```
[Kullanıcı Talebi] (Türkçe/İngilizce)
         ↓
[AI Planlayıcısı] ← System Prompt + Scene Context
         ↓
[Tool Çağrıları] (add_layer, add_keyframes, run_script, vb.)
         ↓
[Orchestrasyoncu] (Sıralı/Paralel Batching)
         ↓
[EditorCommand'lar] (Mevcut undo/redo sistemi ile)
         ↓
[Sahne Güncellenmesi] + [UI Yenilenmesi]
```

### Provider Desteği

Chorono, **provider-agnostic** mimariye sahiptir:
- **Anthropic Claude API** (Opus/Sonnet/Haiku)
- **OpenAI GPT** (daha sonra desteklenecek)
- Kendi API seçiminiz (custom provider adapter)

Provider ayarları `src/lib/ai/providers.ts` dosyasında.

---

## Temel Kavramlar

### 1. **Scene (Sahne)**

Animasyonunuzun tüm öğelerinin bulunduğu kapsayıcı:

```json
{
  "layers": [
    {
      "id": "layer_1",
      "name": "Red Box",
      "type": "shape",
      "shapeKind": "rect",
      "transform": { "x": 100, "y": 50, "width": 200, "height": 200 },
      "opacity": 1,
      "style": { "fill": "#EF4444" }
    }
  ],
  "timelines": [...],
  "composition": { "width": 360, "height": 640, "durationMs": 2000 },
  "assets": [...],
  "stateMachines": [...],
  "parameters": [...]
}
```

### 2. **Timeline (İçerik Akışı)**

Zaman-tabanlı animasyon konteyneri. Her timeline:
- Unique ID ile tanımlanır
- Belirli bir süre (ms cinsinden)
- Otomatik oynatma (autoplay) ve döngü (loop) seçenekleri
- Bir veya daha fazla **track** içerir

### 3. **Track (İz)**

Belirli bir özelliğin zamanla değişimini tanımlar:
```
Track "layers.red_box.transform.x":
  0ms    → 100px  (easeOut)
  1000ms → 500px
```

### 4. **Keyframe (Anahtar Çerçeve)**

Belirli bir zaman ve değerde, bir property'nin snapshot'u:
```typescript
{
  timeMs: 500,
  value: 250,
  easing: "easeInOut"
}
```

### 5. **Layer (Katman)**

Animasyonun temel yapı taşı. Türleri:

| Tür | Açıklama |
|---|---|
| **shape** | Dikdörtgen, daire, çokgen, halka vb. |
| **text** | Yazı metni |
| **image** | Yüklenen resim (assetId ile) |
| **video** | Yüklenen video dosyası |
| **audio** | Ses dosyası |
| **group** | Alt katmanları organize etme |
| **repeater** | Bir kaynağın N kopya klonlaması |
| **particleEmitter** | Parçacık efektleri (confetti, yağmur, vb.) |

---

## Mevcut AI Araçları

### 🏗️ Sahnе Araçları

#### `clear_scene()`
Sahnedeki tüm katmanları siler. Yeni bir animasyon başlatırken kullanılır.

```typescript
Tool: clear_scene
Parametreler: (yok)
```

---

### 🎨 Komposisyon Araçları

#### `update_composition()`
Tuval boyutunu ve animasyon süresini ayarlar.

```typescript
Tool: update_composition
Parametreler:
  - width: number (piksel)
  - height: number (piksel)
  - durationMs: number (toplam süre)
  - frameRate: number (fps — opsiyonel)

Örnek:
  update_composition{
    width: 1080,
    height: 1080,
    durationMs: 3000
  }
```

---

### 🎬 Timeline Araçları

#### `create_timeline()`
Yeni bir zaman akışı oluşturur. Her animasyon **en az bir timeline** gerektirir.

```typescript
Tool: create_timeline
Parametreler:
  - id: string (e.g., "main", "slide_in")
  - durationMs: number
  - autoplay: boolean (varsayılan: true)
  - loop: boolean (varsayılan: false)

Örnek:
  create_timeline{
    id: "bounce",
    durationMs: 2000,
    autoplay: true,
    loop: false
  }
```

#### `update_timeline_settings()`
Mevcut timeline ayarlarını değiştirir.

```typescript
Tool: update_timeline_settings
Parametreler:
  - timelineId: string
  - durationMs: number (opsiyonel)
  - autoplay: boolean (opsiyonel)
  - loop: boolean (opsiyonel)
```

---

### 🎭 Katman (Layer) Araçları

#### `add_layer()`
Sahnede yeni bir katman oluşturur.

```typescript
Tool: add_layer
Parametreler:
  // Tanım
  - id: string (unique)
  - name: string
  - type: "shape" | "text" | "image" | "video" | "audio" | "group" | "repeater"

  // Transform
  - x: number (pikselde)
  - y: number (pikselde)
  - width: number (pikselde)
  - height: number (pikselde)
  - rotationDeg: number (derece)
  - scaleX: number (1.0 = normal)
  - scaleY: number (1.0 = normal)
  - opacity: number (0-1)

  // Shape Stili (type="shape" ise)
  - shapeKind: "rect" | "circle" | "ellipse" | "triangle" | "polygon" | "ring" | "wedge"
  - fillColor: string (#RRGGBB)
  - fillOpacity: number
  - strokeColor: string
  - strokeWidth: number
  - cornerRadius: number
  - sides: number (çokgen için)
  - innerRadius: number (halka için)
  
  // Yazı Stili (type="text" ise)
  - text: string
  - fontSize: number
  - fontFamily: string ("Arial", "Georgia", vb.)
  - textColor: string
  - textAlign: "left" | "center" | "right"
  - fontWeight: "normal" | "bold" | "300" | "700"
  - letterSpacing: number

  // Media (type="image"|"video"|"audio" ise)
  - assetId: string (list_assets ile bulunur)
  - objectFit: "cover" | "contain" | "fill"
  - volume: number (0-1, audio için)
  - muted: boolean
  - loop: boolean

  // Repeater (type="repeater" ise)
  - sourceLayerId: string (klonlanacak katman)
  - count: number (kaç kopya)
  - repeaterMode: "linear" | "polar"
  - stepX: number (linear mode)
  - stepY: number (linear mode)
  - stepRotation: number
  - stepScaleX: number
  - stepScaleY: number
  - stepOpacity: number
  - polarRadius: number (polar mode)
  - polarStartAngle: number (derece)
  - polarEndAngle: number (derece)

  // Diğer
  - parentId: string (üst katman)
  - startMs: number (görünüme başlama zamanı)
  - endMs: number (görünümü sonlandırma zamanı)

Örnek:
  add_layer{
    id: "red_box",
    name: "Red Square",
    type: "shape",
    shapeKind: "rect",
    x: 100, y: 200,
    width: 150, height: 150,
    fillColor: "#EF4444"
  }
```

#### `update_layer()`
Mevcut katmanı değiştirir.

```typescript
Tool: update_layer
Parametreler:
  - layerId: string
  - name: string (opsiyonel)
  - [tüm add_layer parametreleri, ancak type hariç]
```

#### `delete_layer()`
Katmanı sahneden siler.

```typescript
Tool: delete_layer
Parametreler:
  - layerId: string
```

---

### ⏱️ Keyframe Araçları

#### `add_keyframes()`
Belirli bir property'ye zaman-tabanlı değişimler ekler.

```typescript
Tool: add_keyframes
Parametreler:
  - timelineId: string
  - target: string (e.g., "layers.red_box.transform.x")
  - keyframes: array
    - timeMs: number
    - value: any (number, string, boolean)
    - easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold"

Örnek:
  add_keyframes{
    timelineId: "slide",
    target: "layers.red_box.transform.x",
    keyframes: [
      { timeMs: 0, value: 0, easing: "easeOut" },
      { timeMs: 1000, value: 500 }
    ]
  }
```

---

### 📝 Script Aracı

#### `run_script()`
JavaScript kodunu sahne API'sı üzerinden çalıştırır. **Prosedürel veya tekrarlayan işler için tercih edilir.**

```typescript
Tool: run_script
Parametreler:
  - code: string (JavaScript)

Sahne API:
  const handle = scene.add(kind)      // kind: 'rect', 'circle', 'text', vb.
  handle.pos = [x, y]                 // top-left origin
  handle.size = [w, h]
  handle.opacity = 0..1
  handle.rotation = degrees
  handle.scale = [sx, sy]
  handle.fill = '#rrggbb'
  handle.key(prop, timeMs, value)     // Keyframe ekle
  
  scene.find(name)                    // Ad ile katman ara
  scene.get(id)                       // ID ile katman al
  scene.layers                        // Tüm katmanlar
  scene.remove(handle)                // Katmanı sil
  scene.log(...)                      // Konsola yazdır

Örnek — 12 dot'u daire şeklinde düzenle:
  run_script{
    code: `
      const cx=180, cy=180, r=100;
      for (let i=0; i<12; i++) {
        const a = i/12 * Math.PI*2;
        const dot = scene.add('circle');
        dot.size = [20, 20];
        dot.pos = [cx + Math.cos(a)*r - 10, cy + Math.sin(a)*r - 10];
        dot.fill = '#6366F1';
        dot.key('opacity', i*80, 0);
        dot.key('opacity', i*80 + 300, 1);
      }
    `
  }
```

---

### 🔍 İçgözlem (Introspection) Araçları — Salt Okunur

Bu araçlar **sabı sorgular**. Hiçbir şeyi değiştirmezler.

#### `list_layers()`
Sahnedeki tüm katmanları listeler.

```typescript
Tool: list_layers
Parametreler: (yok)
Çıkış: Katman ID'leri, türleri, adları
```

#### `list_assets()`
Yüklenmiş medya (resim/video/ses) varlıklarını listeler.

```typescript
Tool: list_assets
Parametreler: (yok)
Çıkış: Varlık ID'leri, türleri, boyutları
Not: AI dosya yükleyemez — kullanıcı yüklemeli
```

#### `describe_layer()`
Belirli bir katmanın detaylı bilgilerini döner.

```typescript
Tool: describe_layer
Parametreler:
  - layerId: string
Çıkış: Transform, opacity, stil, metin, vb.
```

#### `describe_timeline()`
Timeline'ın track'lerini ve keyframe'lerini listeler.

```typescript
Tool: describe_timeline
Parametreler:
  - timelineId: string
Çıkış: Track hedefleri, keyframe zamanları ve değerleri
```

#### `evaluate_at_time()`
Belirli bir zaman noktasında tüm animated değerleri hesaplar.

```typescript
Tool: evaluate_at_time
Parametreler:
  - timeMs: number
  - target: string (opsiyonel — belirli property için)
Çıkış: O zamanda hesaplanan değerler
```

#### `get_scene_json()`
Tüm sahnenin JSON'ını döner. (Nadiren kullanılır — büyük.)

```typescript
Tool: get_scene_json
Parametreler: (yok)
```

---

### 🎪 Parçacık (Particle) Araçları

#### `add_particle_emitter()`
Önceden tanımlı parçacık efektleri ekler.

```typescript
Tool: add_particle_emitter
Parametreler:
  - id: string
  - name: string (opsiyonel)
  - x: number (emitter pozisyonu)
  - y: number
  - preset: string
    "confetti" | "sparkle" | "magic" | "smoke" | "fire" | "snow" | "rain" | "rocket"
  - count: number (eş zamanlı parçacık sayısı)
  - durationMs: number (emitter çalışma süresi)
  - loop: boolean (sürekli döngü)

Örnek:
  add_particle_emitter{
    id: "confetti_1",
    preset: "confetti",
    x: 180,
    y: 0,
    loop: false
  }
```

---

### 🔗 Etkileşimlilik Araçları

#### `add_parameter()`
Runtime'da dinamik değerler (sayı, boolean, renk, metin) tanımlar.

```typescript
Tool: add_parameter
Parametreler:
  - id: string (e.g., "score", "angle", "isOpen")
  - name: string
  - type: "number" | "boolean" | "color" | "string" | "image"
  - defaultValue: any
  - min: number (sayı tipi için)
  - max: number

Örnek:
  add_parameter{
    id: "angle",
    type: "number",
    defaultValue: "0",
    min: 0,
    max: 360
  }
```

#### `set_interactive()`
Bir katmanı tıklanabilir (tappable) veya sürüklenebilir (draggable) yapar.

```typescript
Tool: set_interactive
Parametreler:
  - layerId: string
  - tappable: boolean (tıklama etkinleşti)
  - draggable: boolean (sürükleme etkinleşti)
  - dragAxis: "x" | "y" | "both"
  - dragRange: number (piksel cinsinde sınır)
  - followCursor: boolean
  - setsParameter: string (sürükleme hangi parametreyi etkilerse)
  - scrubsTimeline: string (sürükleme timeline'ı oynatır)

Örnek:
  set_interactive{
    layerId: "knob",
    draggable: true,
    dragAxis: "x",
    setsParameter: "angle"
  }
```

#### `add_trigger()`
Olaylar (click, drag, animasyon bitişi) tetiklenince aksiyonlar çalıştırır.

```typescript
Tool: add_trigger
Parametreler:
  - eventType: "click" | "dragStart" | "dragMove" | "dragEnd" | "animationComplete" | ...
  - eventLayerId: string (hangi katman üzerinde)
  - actionType: "play" | "pause" | "stop" | "seek" | "setParam" | "emitEvent" | ...
  - actionTimelineId: string (hangi timeline'ı oynat)
  - actionParamId: string (hangi parametreyi değiştir)
  - actionParamValue: any (ne değere set et)

Örnek:
  add_trigger{
    eventType: "click",
    eventLayerId: "play_button",
    actionType: "play",
    actionTimelineId: "animation_main"
  }
```

#### `add_binding()`
Bir özelliği doğrusal (linear) olarak diğerine bağlar.

```typescript
Tool: add_binding
Parametreler:
  - sourceType: "parameter" | "layerProperty"
  - sourceParamId: string (parameter ise)
  - sourceLayerId: string (property ise)
  - sourceProperty: string (e.g., "transform.x")
  - targetType: "layerProperty" | "parameter" | "timelineProgress"
  - targetLayerId: string
  - targetProperty: string
  - inputMin: number
  - inputMax: number
  - outputMin: number
  - outputMax: number
  - clamp: boolean
  - reverse: boolean

Örnek:
  // "angle" parametresini "dial" katmanının rotasyonuna bağla
  add_binding{
    sourceType: "parameter",
    sourceParamId: "angle",
    targetType: "layerProperty",
    targetLayerId: "dial",
    targetProperty: "transform.rotationDeg",
    inputMin: 0,
    inputMax: 1,
    outputMin: 0,
    outputMax: 360
  }
```

#### `add_parameter_wire()`
Kaynak → hedef arası matematiksel ifade linklemesi.

```typescript
Tool: add_parameter_wire
Parametreler:
  - sourceProperty: string (parametreyi ifadede 'source' veya 's' olarak kullan)
  - targetProperty: string
  - expression: string
    Desteklenen fonksiyonlar:
      map(source, inMin, inMax, outMin, outMax)
      clamp(source, min, max)
      lerp(source, a, b)
      min/max/abs/round/sin/cos/sqrt/pow/smoothstep

Örnek:
  add_parameter_wire{
    sourceProperty: "angle",
    targetLayerId: "dial",
    targetProperty: "transform.rotationDeg",
    expression: "map(source,0,1,0,360)"
  }
```

---

### 🎯 State Machine Araçları

State machine'ler, farklı durumlara bağlı animasyonları yönetir (örn., idle → walk → run).

#### `create_state_machine()`
Yeni bir state machine tanımı oluşturur.

```typescript
Tool: create_state_machine
Parametreler:
  - id: string (e.g., "player_sm")
  - name: string

Örnek:
  create_state_machine{
    id: "seasons",
    name: "Four Seasons"
  }
```

#### `add_sm_state()`
State machine'e bir durum ekler.

```typescript
Tool: add_sm_state
Parametreler:
  - smId: string (state machine ID'si)
  - id: string (state ID'si, e.g., "idle")
  - name: string (display name)
  - timelineId: string (bu durumda oynatılacak timeline)
  - speed: number (oynatma hızı, default 1.0)

Not: İlk eklenen state otomatik initial state olur.

Örnek:
  add_sm_state{
    smId: "seasons",
    id: "spring",
    name: "Spring",
    timelineId: "tl_spring"
  }
```

#### `add_sm_transition()`
İki durum arasında geçiş tanımlar.

```typescript
Tool: add_sm_transition
Parametreler:
  - smId: string
  - from: string (kaynak state)
  - to: string (hedef state)
  - event: string (tetikleyici olay, e.g., "next")
  - blendMs: number (geçiş süresi, ms)
  - guardParam: string (parametreye göre koşullu geçiş)
  - guardOp: ">" | "<" | "==" | "!="
  - guardValue: number | string | boolean

Örnek:
  add_sm_transition{
    smId: "seasons",
    from: "spring",
    to: "summer",
    event: "next",
    blendMs: 200
  }
```

#### `set_initial_state()`
İlk durum olarak başka bir state'i seçer.

```typescript
Tool: set_initial_state
Parametreler:
  - smId: string
  - stateId: string
```

---

## Örnek Kullanım Senaryoları

### Senaryo 1: Sağdan Süzülen Kırmızı Kare

**Talep:** "1080x1080 tuvalinde 1 saniye içinde kırmızı 200×200 karesini sağdan kaydır."

**AI Çağrıları (Sırası):**

```typescript
1. clear_scene {}

2. update_composition {
     width: 1080,
     height: 1080,
     durationMs: 1000
   }

3. create_timeline {
     id: "slide",
     durationMs: 1000,
     autoplay: true
   }

4. add_layer {
     id: "red_box",
     name: "Red Box",
     type: "shape",
     shapeKind: "rect",
     x: 1080,
     y: 440,
     width: 200,
     height: 200,
     fillColor: "#EF4444"
   }

5. add_keyframes {
     timelineId: "slide",
     target: "layers.red_box.transform.x",
     keyframes: [
       { timeMs: 0, value: 1080, easing: "easeOut" },
       { timeMs: 1000, value: 440 }
     ]
   }
```

---

### Senaryo 2: Dönen Halka (Sonsuz Döngü)

**Talep:** "Indigo (6366F1) halka, 360 derece dönsün, 1 saniyede bitsin, sonsuza kadar dönsün."

**AI Çağrıları:**

```typescript
1. clear_scene {}

2. update_composition {
     width: 360,
     height: 360
   }

3. create_timeline {
     id: "spin",
     durationMs: 1000,
     autoplay: true,
     loop: true
   }

4. add_layer {
     id: "ring",
     name: "Ring",
     type: "shape",
     shapeKind: "ring",
     x: 140,
     y: 140,
     width: 80,
     height: 80,
     innerRadius: 30,
     fillColor: "#6366F1"
   }

5. add_keyframes {
     timelineId: "spin",
     target: "layers.ring.transform.rotationDeg",
     keyframes: [
       { timeMs: 0, value: 0, easing: "linear" },
       { timeMs: 1000, value: 360, easing: "linear" }
     ]
   }
```

---

### Senaryo 3: Dairesel Nokta Ağı (12 Dot Fade-In)

**Talep:** "12 mavi nokta daire şeklinde düzenle, her biri 80ms fark ile fade-in yapsın."

**AI Çağrıları:**

```typescript
1. clear_scene {}

2. update_composition {
     width: 360,
     height: 360,
     durationMs: 1200
   }

3. create_timeline {
     id: "main",
     durationMs: 1200,
     autoplay: true
   }

4. run_script {
     code: `
       const cx = 180, cy = 180, r = 100;
       for (let i = 0; i < 12; i++) {
         const a = i / 12 * Math.PI * 2;
         const dot = scene.add('circle');
         dot.size = [20, 20];
         dot.pos = [cx + Math.cos(a) * r - 10, cy + Math.sin(a) * r - 10];
         dot.fill = '#6366F1';
         dot.key('opacity', i * 80, 0);
         dot.key('opacity', i * 80 + 300, 1);
       }
     `
   }
```

---

### Senaryo 4: Etkileşimli Kadran (Knob → Rotation Binding)

**Talep:** "Bir knob (buton) ekle, sürüklenebilir yap, sürükleme düğmeyi 0-360 derece döndürsün."

**AI Çağrıları:**

```typescript
1. add_parameter {
     id: "angle",
     type: "number",
     defaultValue: "0",
     min: 0,
     max: 360
   }

2. add_layer {
     id: "knob",
     name: "Knob",
     type: "shape",
     shapeKind: "circle",
     x: 150,
     y: 150,
     width: 60,
     height: 60,
     fillColor: "#3B82F6"
   }

3. set_interactive {
     layerId: "knob",
     draggable: true,
     dragAxis: "x",
     dragRange: 100,
     setsParameter: "angle"
   }

4. add_layer {
     id: "dial",
     name: "Dial",
     type: "shape",
     shapeKind: "ring",
     x: 140,
     y: 140,
     width: 80,
     height: 80,
     innerRadius: 30,
     fillColor: "#6366F1"
   }

5. add_parameter_wire {
     sourceProperty: "angle",
     targetLayerId: "dial",
     targetProperty: "transform.rotationDeg",
     expression: "map(source,0,360,0,360)"
   }
```

---

### Senaryo 5: State Machine — 4 Mevsim (Click Cycle)

**Talep:** "4 mevsim state machine. Tıkla → sonraki mevsime git (Spring→Summer→Fall→Winter→Spring)."

**AI Çağrıları (Simplified):**

```typescript
1. // Her mevsim için timeline oluştur
   create_timeline { id: "tl_spring", durationMs: 1000, autoplay: true }
   create_timeline { id: "tl_summer", durationMs: 1000, autoplay: true }
   create_timeline { id: "tl_fall", durationMs: 1000, autoplay: true }
   create_timeline { id: "tl_winter", durationMs: 1000, autoplay: true }

2. // ... her timeline'da katmanlar ve keyframe'ler ekle ...

3. // State machine oluştur
   create_state_machine {
     id: "seasons",
     name: "Four Seasons"
   }

4. // Her mevsimi state olarak ekle
   add_sm_state { smId: "seasons", id: "spring", name: "Spring", timelineId: "tl_spring" }
   add_sm_state { smId: "seasons", id: "summer", name: "Summer", timelineId: "tl_summer" }
   add_sm_state { smId: "seasons", id: "fall", name: "Fall", timelineId: "tl_fall" }
   add_sm_state { smId: "seasons", id: "winter", name: "Winter", timelineId: "tl_winter" }

5. // Geçişler ekle
   add_sm_transition { smId: "seasons", from: "spring", to: "summer", event: "next" }
   add_sm_transition { smId: "seasons", from: "summer", to: "fall", event: "next" }
   add_sm_transition { smId: "seasons", from: "fall", to: "winter", event: "next" }
   add_sm_transition { smId: "seasons", from: "winter", to: "spring", event: "next" }
```

---

## Teknik Detaylar

### Koordinat Sistemi

- **Orijin:** Sol üst köşe (TOP-LEFT)
- **X Ekseni:** Sağa doğru artış (piksel)
- **Y Ekseni:** Aşağı doğru artış (piksel)
- **Varsayılan Tuval:** 360×640px (mobil portrait)

**Merkezle Konumlandırma:**
```
Layer boyutu: W × H
Tuval boyutu: CW × CH

x = (CW - W) / 2
y = (CH - H) / 2
```

---

### Property Animasyon Hedefleri (Track Targets)

Format: `layers.{layerId}.{propertyPath}`

**Yaygın property'ler:**

```
Transform:
  layers.layer1.transform.x
  layers.layer1.transform.y
  layers.layer1.transform.scaleX
  layers.layer1.transform.scaleY
  layers.layer1.transform.rotationDeg

Stil:
  layers.layer1.opacity
  layers.layer1.style.fill
  layers.layer1.style.stroke.color
  layers.layer1.style.stroke.width

Metin:
  layers.layer1.text.value
  layers.layer1.text.fontSize
  layers.layer1.text.color
```

---

### Easing Fonksiyonları

| Easing | Davranış |
|--------|----------|
| **linear** | Sabit hız |
| **easeIn** | Yavaş başlayan, hızlanan |
| **easeOut** | Hızlı başlayan, yavaşlayan (polished) |
| **easeInOut** | Yavaş-hızlı-yavaş |
| **hold** | Anında sıçrama (renk değişimleri için) |

---

### Renk Formatı

Tüm renkler **hex string**'i olmalı:
- `"#FF0000"` → Kırmızı
- `"#00FF00"` → Yeşil
- `"#0000FF"` → Mavi
- `"#6366F1"` → Indigo
- `"#EF4444"` → Açık Kırmızı

**NOT:** CSS adları (`"red"`, `"blue"`) desteklenmiyor!

---

### Renk Animasyonu

⚠️ **Renkler değişmez** — snap yaparlar!

Smooth renk geçişi için:
1. **hold** easing kullanarak net geçişe izin ver
2. Veya opacity ile solma/çıkma yapart

```typescript
// ✓ Doğru — h anında kırmızı → mavi snapı
add_keyframes {
  target: "layers.box.style.fill",
  keyframes: [
    { timeMs: 0, value: "#FF0000", easing: "hold" },
    { timeMs: 1000, value: "#0000FF" }
  ]
}

// ✗ Yanlış — "easeInOut" renkle tanımlanmamış
add_keyframes {
  target: "layers.box.style.fill",
  keyframes: [
    { timeMs: 0, value: "#FF0000", easing: "easeInOut" },
    { timeMs: 1000, value: "#0000FF" }
  ]
}
```

---

### Provider Yapılandırması

`src/lib/ai/providers.ts` dosyasında provider ayarları:

```typescript
interface AIProviderConfig {
  provider: "anthropic" | "openai" | "custom"
  apiKey: string
  model: "claude-opus-4-7" | "claude-sonnet-4-6" | "gpt-4" | ...
  baseUrl?: string (custom provider için)
}
```

---

### System Prompt

AI'a öğretmek için detaylı bir system prompt kullanılır:
- Koordinat sistemi (origin, axes)
- Workflow (clear → composition → timeline → layers → keyframes)
- Layer türleri ve parametre şeması
- Key rules & gotchas
- Few-shot examples

Kaynak: `src/lib/ai/tools.ts` → `buildSystemPrompt()`

---

## Gelecek Planı (Roadmap)

### 🚀 Kısa Vadeli (Q2 2026)

- [ ] **FAZ 4A:** Spline/Path şekilleri için AI aracı
- [ ] **FAZ 4B:** Gelişmiş easing custom kurveleri
- [ ] **FAZ 5:** Real-time agent loop (sorgu → sebep → devam)
- [ ] **BL-78 FAZ 4:** Tamamla (missing tools inventory)

### 📈 Orta Vadeli (Q3–Q4 2026)

- [ ] **OpenAI GPT integrasyonu**
- [ ] **Lokal LLM support** (Ollama, vb.)
- [ ] **Tool search** (Tool sayısı > 30 olunca)
- [ ] **Multi-turn agent reasoning** (kompleks animasyonlar için)
- [ ] **Video/GIF export** AI tarafından

### 🎯 Uzun Vadeli

- [ ] **MCP (Model Context Protocol) server** — Cursor IDE desteği
- [ ] **Custom AI modelleri fine-tune etme**
- [ ] **Türkçe dil modeli optimize*
- [ ] **Scene template library** — AI-generate edilmiş
- [ ] **Collaboration** — multi-user AI sessions

---

## Notlar & Kısıtlamalar

### ✅ Neler Mümkün

✓ Sıfırdan animasyon oluştur  
✓ Mevcut katmanları değişir  
✓ Etkileşimli öğeler ekle (triggers, bindings)  
✓ State machine'ler tasarla  
✓ Parçacık efektleri ekle  
✓ Şirket prosedürleri otomasyonu (loops, grids, staggers)  

### ❌ Neler Mümkün Değil

❌ Dosya yükleme (kullanıcı yüklemelidir — `add_layer` type="image" için)  
❌ Kendi property'lerini oluştur (schema'da tanımlı olanlar sadece)  
❌ Render veya export (henüz — road map'te var)  
❌ Database/API integrasyonu (scope dışında)  

---

## İletişim & Geri Bildirim

Sorularınız, hata raporlarınız veya önerileriniz varsa:

📧 **Email:** granitjeofizik@gmail.com  
🐙 **GitHub:** [Chorono Repository]  
💬 **Issues:** [GitHub Issues](https://github.com/your-org/chorono/issues)

---

**Son Güncelleme:** 2026-05-21  
**Belge Sahibi:** AI Geliştirme Ekibi
