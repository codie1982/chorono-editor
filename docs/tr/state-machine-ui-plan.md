# State Machine — UI Tasarımı & Ekran Konumlanması

**11 Kasım 2026:** Üstteki Animation/SM seçicisi kaldırıldı; Canvas / State
Machine dock sekmeleri ve `Cmd+Shift+M` kullanılır. Aşağıdaki toolbar çizimleri
ilk tasarımı gösterir; güncel [araç çubuğu sözleşmesi](toolbar-and-spline-editing.md)
bunların yerini alır.

> Tarih: 2026-05-19 (güncellendi: 2026-05-19)
> Bağlı: BL-09 (Sprint 3 — Editör UI)
> Durum: Tasarım Kesinleşti

---

## Karar Geçmişi

| Tarih | Karar |
|---|---|
| 2026-05-19 | SM, `properties-leaf` sağ panel sekmesi olarak tasarlandı |
| 2026-05-19 | **GÜNCELLENDİ:** SM, `canvas-leaf`'e ekleniyor — canvas ile aynı dock alanında iki sekme |
| 2026-05-19 | SM ayrı üst-seviye mod DEĞİL — toolbar sub-mod toggle'ı |
| 2026-05-19 | Node graph: SVG tabanlı (Canvas 2D veya DOM değil) |
| 2026-05-19 | Tip mimarisi: `BaseSMState` + `ChronoSMState` extension (game engine uyumluluğu) |
| 2026-05-19 | Parametre tabanlı geçişler: guard-only (trigger event yok, her frame kontrol) |
| 2026-05-19 | SM + Parameter Wiring hybrid: SM aktif state seçer, PW smooth blend sağlar |

---

## 1. Mevcut Ekran Yapısı (SM Olmadan)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                                     │
│ File | ◻ ✐ ✋ | Chorono 🎬 | 640×480 | ↶ ↷ | Group | …layers·timelines…  │
│                                                    | ▶ Preview | 🤖 AI | {} │
├────────────┬──────────────────────────────────────┬────────────────────────┤
│ LAYERS     │                                      │ PROPERTIES        [tab]│
│ ─────────  │          CANVAS / VIEWPORT           │ Particles         [tab]│
│ 🔲 card    │      [canvas sekmesi aktif]          │ Assets            [tab]│
│  ┣ label   │                                      │ Parameters        [tab]│
│  ┗ icon    │                                      │ Events            [tab]│
│ 🔲 bg      │                                      │ Bindings          [tab]│
│            │                                      │ Wires             [tab]│
│ Scene      │                                      │ Select            [tab]│
│ Explorer   │                                      │ Preview           [tab]│
│ [tab]      │                                      │ Snap              [tab]│
├────────────┴──────────────────────────────────────┴────────────────────────┤
│ TIMELINE  [tab] │  CURVE EDITOR  [tab]                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Layout oranları (defaultLayout):
  Dikey  → üst %65 / alt (timeline) %35
  Yatay  → layers %18 / (canvas + sağ panel) %82
  Sağ    → canvas %72 / sağ panel %28
```

---

## 2. SM Modu — Ekran Yapısı (Kesinleşmiş Karar)

### Temel Mekanizma: canvas-leaf Tab Geçişi

SM paneli **`canvas-leaf`'e ikinci sekme olarak eklenir.**
Toolbar toggle sadece `dispatchTab('canvas-leaf', ...)` çağrısı yapar.
Özel "mod" kodu yazmaya gerek yoktur — mevcut dock sistemi halleder.

```javascript
// layoutOps.ts — defaultLayout() tek satır değişiklik
{ kind: 'leaf', id: 'canvas-leaf',
  panels: ['canvas', 'stateMachine'],   // ← sadece bu ekleniyor
  activeIndex: 0
}

// Toolbar toggle:
dock.dispatchTab('canvas-leaf', isSmMode ? 'stateMachine' : 'canvas')
```

### Animation Modu → SM Modu Layout Değişimi

```
[● Animation]  [○ SM]              [○ Animation]  [● SM]
──────────────────────────         ──────────────────────────────────
┌──────┬──────────────┬──────┐    ┌──────┬──────────────────┬───────┐
│Layer │              │Prop  │    │STATE │                  │STATE  │
│      │   CANVAS     │Panel │    │LIST  │  SM NODE GRAPH   │DETAIL │
│      │  [aktif tab] │      │    │      │  [aktif tab]     │       │
│      │              │      │    │●idle │  ╔idle╗──▶╔hover╗│ Seçili│
│      │              │      │    │○hover│  ╚════╝   ╚═════╝│ state │
│      │              │      │    │○press│      ▼           │ detay │
│      │              │      │    │      │  ╔pressed╗       │       │
├──────┴──────────────┴──────┤    ├──────┴──────────────────┴───────┤
│  TIMELINE (tüm layer'lar)  │    │  TIMELINE (seçili state'in TL'ı)│
└────────────────────────────┘    └─────────────────────────────────┘
```

**SM modu aktifken 3 panel birden değişir:**

| Panel | Animation Modda | SM Modda |
|---|---|---|
| Sol (`layers-leaf`) | Layer listesi | State listesi |
| Orta (`canvas-leaf`) | Viewport (canvas) | SM node graph (SVG) |
| Sağ (`properties-leaf`) | Properties / Particles / … | Seçili state / geçiş detayı |
| Alt (`timeline-leaf`) | Tüm layer'ların keyframe'leri | Seçili state'in timeline'ı |

Sağ panel içeriği değişir ama **panel kendisi değişmez** — `properties-leaf` sekmelerinden
`state-detail` sekmesi aktif olur. Kullanıcı isterse Properties'e de geçebilir.

---

## 3. Toolbar Sub-Mod Toggle

### Neden Üst-Seviye Mod Değil

Üst sekmelerdeki "Game Engine", "Video Editor" tamamen farklı araç setleri.
SM ise 2D Animasyon'un bir parçası — timeline ile birlikte çalışır.
Ayrı mod olursa SM ↔ Timeline arası sürekli mod değiştirme gerekir.

### Toggle Tasarımı

```
Toolbar orta kısmı:

[● Animation]  [○ SM]     ← iki buton, sadece biri aktif
                             Cmd+Shift+M ile toggle

SM yokken: sadece [● Animation] görünür, SM butonu gizli
SM varken: iki buton da görünür
```

### Toolbar Tam Görünümü (SM Varken)

```
File | Araçlar | Chorono | 640×480 | ↶ ↷ | Group |
[● Animation] [○ SM] | ⬡ Button SM ▼ | ▶ Preview ▼ | 🤖 AI | {} | ⤓
                         ↑
                   Aktif SM seçici dropdown
                   (birden fazla SM varsa seçim)
```

---

## 4. SM Node Graph — Teknik Yapı

### Neden SVG

```
Canvas 2D  → hit-testing manuel, text rendering zor, rich popover yok
DOM divler → bezier ok çizmek için CSS yetmez
SVG        → bezier path + rich UI (form, text, ikon) + native hit-testing ✓
```

### SVG Bileşen Yapısı

```tsx
<svg className="sm-graph" onMouseDown={handlePanStart}>
  {/* Pan/zoom transform */}
  <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

    {/* Geçiş okları (arkada — node'ların altında) */}
    {sm.transitions.map(t => (
      <TransitionArrow
        key={t.id}
        from={nodePositions[t.from]}
        to={nodePositions[t.to]}
        label={t.trigger || '— guard —'}
        dashed={t.from === '*'}
        selected={selectedTransitionId === t.id}
        onClick={() => setSelectedTransition(t.id)}
      />
    ))}

    {/* State node'ları */}
    {sm.states.map(s => (
      <StateNode
        key={s.id}
        state={s}
        position={nodePositions[s.id]}
        isInitial={s.id === sm.initialStateId}
        isActive={activeStateId === s.id}   // test modunda
        selected={selectedStateId === s.id}
        onDrag={(pos) => updateNodePosition(s.id, pos)}
        onClick={() => setSelectedState(s.id)}
      />
    ))}
  </g>
</svg>
```

---

## 5. Sol Panel — State Listesi (SM Modda)

SM modu aktifken sol panel içeriği layer listesinden state listesine geçer:

```
┌──────────────────────────────┐
│ STATES              [+ Ekle] │
├──────────────────────────────┤
│ ╔══════════════════════════╗ │  ← initial state
│ ║ ● idle           2.4s   ║ │     (çift kenarlık)
│ ╚══════════════════════════╝ │
│                              │
│   ○ hover           1.0s    │  ← tıklayınca:
│   ○ pressed         0.6s    │    1. node graph'ta odakla
│   ○ loading          ∞      │    2. timeline panel güncelle
│   ○ success         1.2s    │
└──────────────────────────────┘
```

State'in yanındaki süre, bağlı timeline'ın `durationMs` değeri.
`∞` = loop: true.

---

## 6. SM Node Graph Detaylı UI

### 6.1 State Node

```
Seçilmemiş:
┌─────────────────┐
│  ○ hover        │   tl: pulse  loop:∞  1×
└─────────────────┘

Seçilmiş:
╔═════════════════╗
║  ● hover        ║   ← kalın mavi kenarlık
║  tl: pulse   ⟶ ║   ← timeline'a git
║  loop: ∞  1×   ║
╚═════════════════╝

Initial state:
╔═════════════════╗
║ ╔═════════════╗ ║   ← iç içe çift kenarlık
║ ║  ● idle     ║ ║
║ ╚═════════════╝ ║
╚═════════════════╝

Test modunda aktif:
┌─────────────────┐
│  ● hover        │  ← yeşil sol çizgi
│  tl: pulse      │     "OYNIYOR" badge
│  ▶ 1.2s / 2.0s  │     canlı ilerleme
└─────────────────┘

Guard-only (event yok, parametre eşiği):
┌─────────────────┐
│  ○ yaz          │
│  tl: yaz-anim   │
│  guard: prog<.25│  ← guard ikonu
└─────────────────┘
```

### 6.2 Geçiş Oku

```
Event tabanlı (trigger var):
  idle ────── on:hover → 150ms ──────▶  hover

Guard tabanlı (trigger yok, param eşiği):
  idle ╌╌╌╌╌╌ progress>0.25 ╌╌╌╌╌╌▶  ilkbahar   ← kesik çizgi

Wildcard (* → herhangi):
  * ─ ─ ─ ─  on:click ─ ─ ─▶  pressed            ← uzun kesik

Seçilmiş ok — detay popover:
  ╔══════════════════════════════╗
  ║ Tetikleyici  [hover     ▼]  ║  (boş = guard-only)
  ║ Blend        [150    ] ms   ║
  ║ Guard        [+ Ekle  ]     ║
  ║  progress [>▼] [0.25     ]  ║
  ║ Priority     [0       ]     ║
  ║              [Sil] [Kapat]  ║
  ╚══════════════════════════════╝
```

### 6.3 Sağ Tık Menüleri

```
State node:                    Graph arka planı:
┌──────────────────────┐       ┌──────────────────────┐
│ Initial State Yap    │       │ Yeni State Ekle      │
│ ─────────────────    │       │ ────────────────────  │
│ Timeline'ı Aç        │       │ Tümünü Sığdır (F)    │
│ Timeline'ı Değiştir  │       │ ────────────────────  │
│ ─────────────────    │       │ SM Ayarları…         │
│ Giriş Aksiyonu Ekle  │       │ SM Sil               │
│ Çıkış Aksiyonu Ekle  │       └──────────────────────┘
│ ─────────────────    │
│ Çoğalt               │
│ Sil                  │
└──────────────────────┘
```

---

## 7. Sağ Panel — State / Geçiş Detayı (SM Modda)

SM modda sağ panelde seçime göre içerik değişir:

### State Seçilince
```
┌─────────────────────────────────┐
│  SEÇİLİ: hover                  │
├─────────────────────────────────┤
│  Timeline    [pulse        ▼]   │  ← dropdown ile değiştir
│              [Aç →]             │  ← timeline panelde aç
│                                 │
│  Loop        [∞ / N kez  ▼]    │
│  Speed       [1×          ]     │
│                                 │
│  Giriş aksiyonu  [+ Ekle]      │
│  Çıkış aksiyonu  [+ Ekle]      │
│                                 │
│  OUTGOING (2)                   │
│  → idle   ON:LEAVE   150ms  … │
│  → idle   ON:ANIMEND   0ms  … │
│  [+ Geçiş ekle]                 │
└─────────────────────────────────┘
```

### Geçiş Seçilince
```
┌─────────────────────────────────┐
│  GEÇİŞ: hover → idle           │
├─────────────────────────────────┤
│  Tetikleyici  [leave       ▼]   │
│  Blend        [150     ] ms     │
│  Priority     [0        ]       │
│                                 │
│  Guard                          │
│  [+ Guard Ekle]                 │
│                                 │
│  Kaynak: hover (sabit)          │
│  [Sil]              [Kapat]     │
└─────────────────────────────────┘
```

---

## 8. Timeline Panel Entegrasyonu

### SM Aktifken Timeline Üst Barı

```
SM yokken:
┌─────────────────────────────────────────────────────┐
│ TIMELINE   [Curve Editor]                            │
│ [+ TL]  [▶]  00:00 ──────────────────────── 02:00  │

SM + state seçiliyken:
┌─────────────────────────────────────────────────────┐
│ TIMELINE   [Curve Editor]                            │
│ ⬡ Button SM  ›  ● idle  [◀ ▶]    ← state gezinimi  │
│ [▶]  00:00 ──────●─────────────── 02:00             │
│ (idle timeline track'leri)                           │
```

### Test Modunda Alt Bar

```
[⬡ SM TEST]  ● idle ──blend──▶ hover   ████░░ %60   1.2s
```

---

## 9. Olay Tetikleme — 3 Yol

SM geçişleri 3 farklı şekilde tetiklenebilir:

### Yol A — SDK Otomatik (Standart UI Olayları)
```
Editörde trigger: "hover" → Web SDK: mouseover → fireEvent("hover")
                           → Android SDK: ACTION_HOVER_ENTER → fireEvent("hover")
Kod yazmak gerekmez.
```

### Yol B — Manuel Dispatch (İş Mantığı)
```
Editörde trigger: "purchaseComplete"
→ Android: chronoPlayer.dispatch("purchaseComplete")  // 1 satır
→ Web:     player.dispatch('purchaseComplete')
```

### Yol C — Guard-Only (Parametre Eşiği, Event Yok)
```
Editörde: trigger: —  guard: progress > 0.25
→ SM runtime her frame guard'ı kontrol eder
→ progress 0.24 → 0.26 geçince otomatik transition
→ hiç event ateşlemek gerekmez
```

Geçiş detay panelinde Tetikleyici alanı **boş bırakılabilir** → guard-only transition.

---

## 10. Parametre Tabanlı SM — 4 Mevsim Örneği

SM tek başına yetmediğinde **Parameter Wiring ile hybrid** kullanım:

```
progress (Android slider 0-1)
    │
    ├─▶ SM Guard: hangi state aktif?
    │     yaz:       progress < 0.25
    │     ilkbahar:  0.25 ≤ progress < 0.50
    │     sonbahar:  0.50 ≤ progress < 0.75
    │     kış:       progress ≥ 0.75
    │     → aktif state'in loop animasyonu oynar
    │
    └─▶ Parameter Wiring: layer opacity smooth blend
          güneş opacity   = 1 - clamp(progress×4, 0, 1)
          bulutlar opacity = bell(progress, 0.25)
          → anlık, gecikme yok, geri-ileri scrub çalışır

Android:
  slider.onChange { chronoPlayer.setParamOverride("progress", it) }
  // Bu tek satır hem SM guard'larını hem PW formüllerini besler
```

---

## 11. Tip Mimarisi — Game Engine Uyumluluğu

SM tipleri ilerisi için iki katmana ayrılır:

```typescript
// src/lib/types/statemachine-base.ts
// Game engine dahil herkes kullanır
export interface BaseSMState {
  id: string
  name: string
  entryActions?: SMAction[]
  exitActions?: SMAction[]
}
export interface BaseSMTransition {
  id: string
  from: string           // '*' wildcard
  to: string
  trigger?: string       // boş = guard-only
  guard?: SMGuard
  blendMs?: number
  priority?: number
}

// src/lib/types/statemachine-chorono.ts
// Sadece Chorono 2D animasyon editörü
export interface ChronoSMState extends BaseSMState {
  timelineId: string     // ChronoScene.timelines[].id
  speed?: number
}

// Gelecek: src/lib/types/statemachine-game.ts
// export interface GameSMState extends BaseSMState {
//   clipId?: string
//   blendTree?: BlendTree1D | BlendTree2D
//   layerMask?: string
//   rootMotion?: boolean
// }
```

**StateTransitionResolver ve StateGuardEvaluator** base tipleri kullanır — Chorono veya game engine için değişmez.

---

## 12. Klavye Kısayolları

| Kısayol | Eylem |
|---|---|
| `Cmd+Shift+M` | Animation ↔ SM mod toggle |
| `Cmd+Alt+S` | Yeni state ekle (SM modda) |
| `T` | Test modu toggle |
| `F` | Tüm node'ları ekrana sığdır |
| `◀ ▶` | Timeline panel'de önceki/sonraki state |
| `Escape` | Test modu kapat |
| `Delete` | Seçili state veya geçişi sil |

---

## 13. Edge Case'ler

### SM Olmayan Sahne
- Toolbar'da SM butonu gizli
- Toggle gösterilmez, Animation modu tek seçenek

### Silinen Timeline (SM'de hâlâ referans)
```
State node kırmızı:
┌─────────────────┐
│  ⚠ hover        │  ← kırmızı kenarlık
│  tl: (silinmiş) │
│  [Timeline Ata →]│
└─────────────────┘
```

### Birden Fazla SM
```
⬡ Button SM  ▼
  ● Button SM
  ○ Card Loader SM
  ─────────────────
  + Yeni State Machine
```

### Dar Panel (Sol liste dar kalırsa)
```
● idle   2.4s
○ hover  1.0s     ← kompakt liste, graph ayrı scroll
○ press  0.6s
```

---

## 14. Ekran Konumlanması — Kesinleşmiş Özet

| Bileşen | Konum | Uygulama |
|---|---|---|
| **SM node graph** | `canvas-leaf` — canvas ile aynı dock alanı, ikinci sekme | `panels: ['canvas', 'stateMachine']` |
| **Toolbar toggle** | `[● Animation] [○ SM]` — sub-mod, üst sekme değil | `dispatchTab('canvas-leaf', ...)` |
| **Aktif SM seçici** | Toolbar dropdown (SM varken görünür) | `⬡ Button SM ▼` |
| **State listesi** | Sol panel (`layers-leaf`) — SM modda layer listesinin yerini alır | `smMode ? <StateList> : <LayerList>` |
| **State detayı** | Sağ panel (`properties-leaf`) — SM modda aktif sekme | `smMode → state-detail sekmesi` |
| **Timeline** | Alt panel — SM modda seçili state'in TL'ını gösterir | `focusedTimelineId = activeState.timelineId` |
| **Test modu badge** | Canvas overlay (sağ üst köşe) | `SM TEST  Mevcut: ● hover` |

**Konumlanma prensibi:**
> SM, canvas'ın yerini alır — aynı alanda yaşar, iki sekme.
> Toolbar toggle bir `dispatchTab` çağrısıdır, özel mod kodu yazmak gerekmez.
> Timeline panel bağlı kalır — seçili state'in animasyonunu gösterir.
