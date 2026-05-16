# Chorono Animator — UI / UX Tasarım Planı

Bu doküman, mevcut wireframe setinin (`/Users/nilayerol/Downloads/chorono-wireframe/`) detaylandırma planıdır. **Özellikle Timeline editör kısmı yeniden tasarlanacak** — şu anki tek-satırlı keyframe view profesyonel bir animasyon aracı için yetersiz.

Plan, mevcut JSX wireframe sistemine (Inter + JetBrains Mono, gri tonlar, low-detail) sadık kalır; üzerine eksik ekranları, durumları ve etkileşimleri ekler.

---

## 0 · Hedefler

| # | Hedef |
|---|---|
| H1 | Mevcut 25 ekrana **35+ ekran** ekleyerek tüm kullanıcı akışını kapsamak |
| H2 | Timeline editörü After Effects + Figma + Lottie tarzı pro-grade yapmak |
| H3 | Her etkileşim için **durum varyantı** çizmek (hover, active, drag, selection, error, empty, loading) |
| H4 | İkon dilini standartlaştırmak — 60+ ikon kataloğu |
| H5 | Mobile (375px) için kritik akışları wireframe'lemek |
| H6 | Erişilebilirlik (klavye nav, kontrast, ARIA) için annotation katmanı eklemek |

---

## 1 · Tasarım Sistemi Güncellemesi

### 1.1 Renk Paleti (mevcut sisteme uyumlu)

Wireframe paleti **gri-only** kalmaya devam edecek (low-detail prensibi). Ürün UI'da kullanılacak gerçek paleti **ayrı bir ekrana** ekleyeceğiz:

```
PRIMARY        oklch(0.62 0.20 250)   # Indigo-blue — CTA, selection
ACCENT-WARM    oklch(0.78 0.18 60)    # Amber — keyframes, attention
ACCENT-COOL    oklch(0.70 0.15 200)   # Teal — info, success secondary
SUCCESS        oklch(0.72 0.18 145)   # Green
WARNING        oklch(0.78 0.16 75)    # Orange
DANGER         oklch(0.65 0.22 25)    # Red

NEUTRAL-0      #ffffff
NEUTRAL-50    →#0a0a0a               # 11 step gri ölçek (zaten var)

DARK-BG        oklch(0.18 0.01 250)   # Editor karanlık tema
LIGHT-BG       oklch(0.98 0 0)        # Marketing / app açık tema
```

**Yeni ekran:** `1.0 · Design Tokens` — paletteti, type scale, spacing, shadow kataloğunu gösteren bir referans artboard.

### 1.2 Tipografi Ölçeği

| Token | Değer | Kullanım |
|---|---|---|
| `text-display` | 56 / 64 / -2% | Landing hero |
| `text-h1` | 32 / 40 / -1% | Sayfa başlığı |
| `text-h2` | 22 / 28 | Section başlığı |
| `text-h3` | 16 / 22 / 600 | Card başlığı |
| `text-body` | 13 / 20 | Varsayılan |
| `text-sm` | 12 / 18 | Form, tablo |
| `text-xs` | 11 / 16 | Label, badge |
| `text-mono-sm` | 10 / 14 mono | Zaman, sayı, kod |
| `text-mono-xs` | 9 / 12 mono | Tick label, ID |

### 1.3 İkon Sistemi (60+ ikon)

Her ikon **16×16 stroke, 1.5px** (varyant: 20, 24). Set'in tamamı için yeni ekran: `1.1 · Icon Library`.

**Kategoriler:**

| Kategori | İkonlar |
|---|---|
| Layer types | shape-rect, shape-circle, shape-polygon, text, image, video, audio, group |
| Tools | select, rect-tool, circle-tool, text-tool, pen-tool, hand-tool, motion-path |
| Playback | play, pause, stop, prev-frame, next-frame, start, end, loop, pingpong |
| Timeline | keyframe-diamond, keyframe-ring, keyframe-hold, marker-flag, snap-magnet, work-area |
| Easing | linear, ease-in, ease-out, ease-in-out, bounce, hold, custom |
| File / asset | upload, download, folder, file, link, copy, paste, duplicate |
| Editing | undo, redo, cut, copy, paste, delete, group, ungroup |
| View | zoom-in, zoom-out, fit, fullscreen, grid, ruler, safe-area |
| State | lock-open, lock-closed, eye-open, eye-closed, solo, color-label |
| System | settings, help, search, filter, sort, more-horizontal, more-vertical, chevron, plus, minus |
| Workflow | share, export, import, sync, cloud, status-dot |

### 1.4 Spacing / Grid

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` — 8px grid sistemi. Editor panellerinde 4px / 8px kompakt; marketing'de 24px / 48px nefes.

### 1.5 Shadow / Elevation

```
e1 → 0 1 2 rgba(0,0,0,0.04)    # Card, input
e2 → 0 4 12 rgba(0,0,0,0.06)   # Dropdown
e3 → 0 8 24 rgba(0,0,0,0.10)   # Modal
e4 → 0 16 48 rgba(0,0,0,0.18)  # Overlay command palette
```

---

## 2 · Bilgi Mimarisi (Sayfa Haritası)

```
Public
├── 1.0  Design Tokens                 [YENİ]
├── 1.1  Icon Library                  [YENİ]
├── 1.2  Landing                       (var)
├── 1.3  Pricing                       [YENİ]
├── 1.4  Use cases                     [YENİ]
├── 1.5  Docs / runtime API            [YENİ]
├── 1.6  Login                         (var)
├── 1.7  Register (3 step)             (var, step 1+3 eklenecek)
├── 1.8  Forgot password               [YENİ]
└── 1.9  Email verify                  [YENİ]

App
├── 2.1  Dashboard                     (var, empty state + populated)
├── 2.2  All Projects (grid+list)      (var, list view eklenecek)
├── 2.3  Create Composition wizard     (var, 3-step detaylanacak)
├── 2.4  Editor (ana — bu doc)         (yeniden tasarlanacak)
├── 2.10 Asset Library                 (var, multi-select + folders)
├── 2.11 Trash                         [YENİ]
├── 2.12 Templates                     [YENİ]
└── 2.13 Settings (account, billing)   [YENİ]

Editor (en detaylı kısım — Bölüm 4)
├── 3.1  Editor — Default state
├── 3.2  Editor — Multi-layer select
├── 3.3  Editor — During keyframe drag (snap line visible)
├── 3.4  Editor — Graph editor mode
├── 3.5  Editor — Motion path editor active
├── 3.6  Editor — Audio waveform visible
├── 3.7  Editor — Multi-timeline tabs
├── 3.8  Editor — Work area + markers
├── 3.9  Editor — Right-click context menu
├── 3.10 Editor — Inspector with bezier expanded
├── 3.11 Editor — Empty state (no layers)
├── 3.12 Editor — Loading project
└── 3.13 Editor — Error / asset missing

Properties Panel varyantları
├── 4.1  Shape — Solid fill
├── 4.2  Shape — Gradient fill
├── 4.3  Shape — Stroke-only / dashed
├── 4.4  Text — Basic
├── 4.5  Text — Outline + shadow
├── 4.6  Image
├── 4.7  Video
├── 4.8  Audio
├── 4.9  Effects (blur/brightness/saturate)
├── 4.10 Motion path
└── 4.11 Multi-layer select (common props only)

Export & Preview
├── 5.1  Export center (var, validation + multi-target)
├── 5.2  Preview player (var)
├── 5.3  Export progress / done
└── 5.4  Share modal (link + permissions)         [YENİ]

Overlays
├── 6.1  New project modal                        (var)
├── 6.2  JSON modal (editor + runtime toggle)    (var, toggle eklenecek)
├── 6.3  Shortcuts modal                          (var)
├── 6.4  Composition preset modal                 [YENİ]
├── 6.5  Toast stack                              (var)
├── 6.6  Layer context menu                       (var)
├── 6.7  Keyframe context menu                    [YENİ]
├── 6.8  Color picker overlay                     [YENİ]
├── 6.9  Asset picker overlay                     [YENİ]
├── 6.10 Command palette (Cmd+K)                  [YENİ]
└── 6.11 Confirm destructive (modal)              [YENİ]

Mobile (375 / 768)
├── 7.1  Landing                                  (var)
├── 7.2  Dashboard                                (var)
├── 7.3  Editor — read-only preview block         (var)
├── 7.4  Editor — touch-friendly properties       [YENİ]
└── 7.5  Mobile nav drawer                        [YENİ]

System / Edge cases
├── 8.1  404 + 500
├── 8.2  Empty state taksonomisi (4-6 varyant)
├── 8.3  Loading skeletons
└── 8.4  Form error states
```

**Toplam:** ~70 artboard hedefi (mevcut 25 + 45 yeni veya varyant).

---

## 3 · Sayfa-bazlı İçerik Detayı

### 3.1 Landing (1.2 — mevcut, hafif zenginleştirme)

- **Hero**: tek satır başlık + alt başlık + iki CTA (`Try free` / `Watch demo`)
- **Live demo embed**: editör snapshot animasyonu (canvas alanı, keyframe'lerin geçtiği görsel)
- **Cross-platform stripe**: Web / Android / iOS / WASM logoları
- **Feature grid 3×2**: Timeline, Easing, Motion path, Media, Runtime export, Plugins
- **Customer logos** (placeholder bar)
- **Pricing teaser** → Pricing'e link
- **Footer**: docs / blog / changelog / GitHub / Twitter

### 3.2 Pricing (1.3 — YENİ)

3 column: Free / Pro ($12/mo) / Team ($24/seat). Feature table altta — "JSON export", "Runtime SDK access", "Cloud sync", "Team libraries" gibi 12-15 satır. FAQ bölümü.

### 3.3 Docs (1.5 — YENİ)

Sol nav (3-level), orta content (Markdown render), sağ ToC. İçerik kategorileri: Quick start / Concepts / Editor / Runtime API / Plugin SDK.

### 3.4 Login / Register

**Login (var):** email + şifre + OAuth (Google, GitHub, Apple). Inline error örneği eklenmesi.

**Register step 1 ekle:** email + şifre + ToS.
**Step 2 (var):** profile (display name, avatar).
**Step 3 ekle:** workspace choice (personal vs invite team).

### 3.5 Dashboard

**Var olan:** projects grid + recent + activity.

**Ekleyecekler:**
- **Empty state**: hiç proje yokken büyük "Create your first composition" CTA + 3 template kartı
- **Skeleton loading**: 6 placeholder kart
- **Quick actions sidebar**: New from preset / Import JSON / From template
- **Activity feed** sağda: "You modified splash.chorono 12s ago"

### 3.6 All Projects (2.2)

- **Grid + list view toggle** (var olan grid'e ek olarak liste)
- **Filtreler**: status (draft / published), kind (mobile / web), tag chips
- **Bulk actions**: multi-select → "Duplicate / Move / Delete / Export"
- **Right-click context** her project üzerinde

### 3.7 Create Wizard (2.3)

3-step zaten var, detaylandıralım:
1. **Preset choose**: kart grid (Square 1080², Story 1080×1920, YouTube, HD, Mobile banner, Web hero, App splash, Custom). Her kartta aspect-ratio görsel preview.
2. **Composition settings**: width / height / fps / duration / bg color (modal'a paralel form)
3. **Starting content**: Blank / Template / Import .chorono.json

### 3.8 Asset Library (2.10)

- **Sol nav**: All / Images / Videos / Audio / Fonts / Trashed
- **Üst**: search + sort + filter (size, type, used-in count)
- **Grid**: 6×N, hover'da "Use in current composition" mini CTA
- **Sağ panel (kart seçilince)**: preview, metadata (resolution, duration, file size), "Used in 3 compositions" liste

### 3.9 Settings (2.13 — YENİ)

Sol nav: Account / Workspace / Billing / Team / Integrations / API keys. Her sekme için bir artboard.

---

## 4 · Editor — Detaylı Tasarım (Ana Bölüm)

Mevcut wireframe'deki `EditorScreen` iyi bir başlangıç ama **timeline alanı yetersiz**. Aşağıdaki yapıya göre yeniden tasarlanacak.

### 4.1 Editor Layout (genel)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [<-] [LogoMark] splash · composition ▾    Saved ⟲⟳ [Share] [Export] │  ← Top bar (48h)
├─────────────────────────────────────────────────────────────────────┤
│ [V][R][○][T][✎][✋]   |   Grid Safe   |   −  100%  +                 │  ← Toolbar (40h)
├──────────┬──────────────────────────────────────────────┬───────────┤
│ Layers   │                                              │ Properties│
│ Panel    │              Canvas                          │  Panel    │
│ (220w)   │           (flex, gray bg)                    │ (280w)    │
│          │                                              │           │
│ (kompakt │                                              │ + Inspector
│ list +   │                                              │   appears
│ search)  │                                              │   below   │
│          │                                              │   when kf │
│          │                                              │   selected│
├──────────┴──────────────────────────────────────────────┴───────────┤
│ Timeline Panel (resizable, default 280h, range 120-560)             │
│   ├─ Top bar: timelines, playback, zoom, settings                   │
│   ├─ Ruler: ticks + work area shading + markers                     │
│   └─ Track area: layer bars + property tracks + keyframes           │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Top Bar (Header) — 48px

Mevcut iyi, **eklenecekler:**

- **Composition switcher**: composition adı tıklanınca proje içindeki diğer composition'lara açılır dropdown (mini cards with thumbnails)
- **Save indicator**: 3 durum — `Saving…` (spinner), `Saved · 12s ago`, `Offline — changes pending` (warning sarısı)
- **Collaborator avatars** (rezerv): max 4 avatar + "+N" (multiplayer rezerv slotu)
- **Export ▾ dropdown**: "JSON (editor)", "JSON (runtime)", "MP4", "GIF", "Sprite sheet"
- **⋮ kebab menu**: Project settings / Duplicate / Move to trash / Version history

### 4.3 Toolbar — 40px

Mevcut iyi, **eklenecekler:**

- **Tool palette sol grup:** V (select), R (rect), C (circle), P (polygon), T (text), pen (motion path), hand (pan)
- **Snap toggle:** mıknatıs ikonu, aktif/pasif iki state
- **Auto-key toggle:** ◆ + tag — kırmızı dot aktifken (kayıt modu)
- **Live preview toggle:** "PREVIEW" badge
- **Grid / Safe area** chip'leri (var)
- **Zoom controls** sağda (var)

### 4.4 Layer Panel — 220-260px (Sol)

Mevcut iyi taban, **detaylandırılacaklar:**

| Bölge | İçerik |
|---|---|
| Header | "Layers" başlık + `+` (add menu: rect/circle/text/image/video/audio/group) + filter ikon |
| Search | search input (var) |
| Add bar | "+ Layer ▾" tek satır dropdown (kompakt) |
| Layer row | **Sol → sağ:** color label dot · expand arrow (group ise) · type icon · name (truncate) · solo/lock/hide icons (hover'da görünür) · color label override · ⋮ context |
| Layer row durumları | default · hover · selected (primary) · multi-selected (soft blue) · being-dragged (ghost) · hidden (50% opacity) · locked (lock ikon kalıcı görünür) · solo (S yıldız sarı) |
| Group | expand/collapse triangle, alt katmanlar indent 14px |
| Status bar (alt) | `splash · 1080×1920 · 3.2s · 7 layers` |

**Yeni durum varyantları:**
- Drop indicator (drag-reorder esnasında satırlar arasında mavi çizgi)
- Color label picker mini popup (6 renk swatch)
- Inline rename (double-click ile)

### 4.5 Canvas Area — flex (Orta)

Mevcut iyi, **eklenecekler:**

- **Rulers** (opsiyonel): üst ve sol kenarda px ölçek
- **Safe area overlay**: aspect-ratio kırpma rehberi
- **Selection box** state'leri:
  - Single selection: 8 handle + rotate handle (üstte 16px yukarıda dairesel ikon)
  - Multi selection: ortak bounding box (mavi)
  - Locked: 4 köşe handle yok, sadece kırmızı dashed çerçeve
- **Anchor point pivot**: ⊕ artı (var), drag edilebilir (yeni varyant)
- **Motion path overlay**: layer'da motion path varsa SVG path siyah-beyaz dashed olarak çizilir, kontrol noktaları daire şeklinde
- **Snap guides**: başka layer'lara align ederken kırmızı dikey/yatay çizgiler
- **Smart guides**: equal spacing göstergeleri
- **Zoom pill** (var) + scroll position dot
- **Empty state**: "No layers yet — drag an image, paste text, or press R/C/T"

### 4.6 Properties Panel — 260-300px (Sağ)

Mevcut iyi baş, **her layer tipi için ayrı ekran:**

#### 4.6.1 Common header (her layer için)
- Layer ikonu · adı (inline rename) · type badge · ● (visible) / 🔒 (lock) / S (solo) / 🗑 (delete) inline butonları
- Color label seçici

#### 4.6.2 Transform section (her layer)
- Position (X, Y) — link icon ile oranlı drag
- Scale (X, Y) — link icon
- Rotation (deg)
- **Anchor X, Y** (static — keyframe'lenemez işareti)
- Inline easter egg: "Reset transform" mini buton

#### 4.6.3 Appearance section
- Opacity slider (0-100)
- **Blend mode dropdown** (16 mode, label + preview swatch)
- **Layer time range**: startMs / endMs input + visual mini bar

#### 4.6.4 Shape — Fill (varyant)
- Toggle: No Fill / Solid / Gradient (3 chip)
- **Solid**: color swatch + hex input + opacity %
- **Gradient**:
  - Type: Linear / Radial (chip)
  - Angle slider + numeric (linear için)
  - Stop list (her stop: position % + color swatch + ✕) — `+ Add stop`
  - Gradient preview bar
- "Pick from canvas" eyedropper buton

#### 4.6.5 Shape — Stroke (varyant)
- Enable toggle
- Color + width + opacity
- Alignment: Inside / Center / Outside (icon group)
- Dash preset: solid / dashed / dotted / dash-dot (4 chip) + custom `dashArray` input
- Line cap: butt / round / square
- Line join: miter / round / bevel

#### 4.6.6 Shape — Effects
- Blur slider (0-50)
- Brightness slider (0-200%)
- Contrast slider (0-200%)
- Saturate slider (0-200%)
- Each with reset arrow

#### 4.6.7 Text — Style
- Content textarea
- Font family combobox (with preview)
- Size, weight, style, align (icon group L/C/R)
- Letter spacing, line height
- Color
- Vertical alignment

#### 4.6.8 Text — Decoration
- Outline toggle + color + width
- Shadow toggle + offset x/y/blur + color
- Uppercase / Underline chip toggles

#### 4.6.9 Image — Media
- Asset thumbnail + name + replace button
- Object fit: contain / cover / fill / none (icon group)
- Tint (color overlay)
- Effects (blur, brightness, etc.)

#### 4.6.10 Video — Media
- Asset thumbnail + duration
- Object fit
- Volume slider (0-1)
- Trim start (ms)
- Loop toggle / Muted toggle

#### 4.6.11 Audio
- Waveform preview (mini, ~60px tall)
- Volume / Loop / Muted / Trim start
- "Show in timeline" toggle (waveform'u timeline track'inde göster)

#### 4.6.12 Motion Path
- "Draw on canvas" button (canvas overlay mode'a geçer)
- Path string (textarea)
- Auto-rotate toggle
- "Show on canvas" toggle
- Path length readout (mm)

#### 4.6.13 Animation summary (her layer)
- Bu layer üzerinde mevcut track'leri listele (örn. "opacity · 2 keyframes [Jump →]")
- "+ Add keyframe at current time" buton

### 4.7 Keyframe Inspector — Properties Panel'in altında

**YENİ — şu anki tasarımda yok.** Bir veya birden fazla keyframe seçildiğinde Properties Panel'in altında belirir.

**Single selection:**
- Header: track target (mono, truncate) + "Delete" link
- Time input (ms) + frame input (#)
- Value input (sayısal / boolean / string / color)
- Easing dropdown: linear / easeIn / easeOut / easeInOut / hold / **customBezier**
- `customBezier` seçilince **Bezier mini editor** açılır (140×140 SVG, P1/P2 sürüklenebilir, 6 preset row, cubic-bezier(...) readout)

**Multi selection:**
- "12 keyframes selected" header
- Common easing dropdown (mixed ise placeholder)
- Bulk edit: "Shift time by..." input
- "Delete all" link

### 4.8 Timeline Panel — **YENİDEN TASARIM** (kritik kısım)

Mevcut wireframe'de timeline aşırı basit. Aşağıdaki yapıyla baştan tasarlanacak.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (40h)                                                            │
│ ▶/⏸  00:01.280 / 00:03.200  1× ▾  | [intro][hover][exit] +Timeline      │
│ Snap ◉ Frame ◉ Key ◉ Marker ◉ Grid ◯ ⬦ AutoKey  ▦ Graph                  │
│ ←  −  1.0×  +  Fit                              dur: 3200ms ✓loop ↔ ×0   │
├──────────────────────────────────────────────────────────────────────────┤
│ RULER (24h) — adaptive ticks + work area shading + markers + playhead    │
│ |0    250   500   750  1000  1250  1500  …                                │
│ ▒▒▒▒▒▒▒▒[████work area████]▒▒▒▒▒▒    🚩"intro" 🚩"climax"  ▼playhead   │
├────────────────┬─────────────────────────────────────────────────────────┤
│ LEFT COL       │ TRACK AREA (scrollable horizontal + vertical)            │
│ (240w)         │                                                          │
│                │                                                          │
│ + Add anim ▾   │  Mode A: Dope sheet                                      │
│ ✨ Preset  ▾   │   Layer bar  ────────[bar 0-2400ms]──────                │
│                │     ◆──────◆────────────◆ (kf row)                       │
│ [Logo Group ▾] │   Layer bar2 ──────────[bar 800-3200ms]──                │
│   ◆ opacity    │     ──◆──────◆─── (kf row)                               │
│   ◆ pos.x      │                                                          │
│   ◆ pos.y      │  Mode B: Graph editor (toggle yukarıda)                  │
│ [Bg]           │   tall row 72h:                                          │
│   ◆ opacity    │     value graph polyline + keyframes Y-positioned        │
│                │                                                          │
│ [Audio track]  │   Audio row: waveform background (240×52)                │
│   ◆ volume     │                                                          │
└────────────────┴─────────────────────────────────────────────────────────┘
```

#### 4.8.1 Top Bar (40h) — Yeni elementler

| Element | Davranış / Görsel |
|---|---|
| **Play/pause** | tek buton (Space) |
| **Time readout** | mono `00:01.280 / 00:03.200` (mm:ss.fff) — tıklanınca time-input modu |
| **Frame counter** | toggle ile `frame 76 / 192` görünümü |
| **Speed selector** | 0.25× / 0.5× / 1× / 1.5× / 2× chip dropdown |
| **Timeline tabs** | "intro", "hover", "exit" gibi multiple timelines arası geçiş; aktif olan koyu, ⋮ ile rename/delete; `+ Timeline` yeni timeline ekler |
| **Snap settings popover** | snap ikonuna tıklayınca 4 checkbox: Frame / Key / Marker / Grid |
| **Auto-key** | ⬦ ikonu + kırmızı dot aktifken; capture indicator |
| **Graph mode** | ▦ ikonu — track'leri value graph mode'a çevirir |
| **Zoom** | `−  1.5×  +  Fit` mono group |
| **Timeline settings** | Seçili timeline için duration / loop / pingpong / loopCount — top-right grup |

#### 4.8.2 Ruler (24h) — Yeni elementler

- **Adaptif tick interval**: zoom seviyesine göre 10/25/50/100/250/500/1000 ms; her tick'te mono label
- **Major / minor tick**: her 5. tick daha uzun + label
- **Work area shading**: in/out marker arası %4 koyu band; iki sürüklenebilir tutamaç (üstte yukarı-bakan üçgenler)
- **Markers**: ruler üzerinde flag (mini bayrak ikonu + label hover ile); 5 marker tipi renk-kodlu (note/beat/scene/export/warning)
- **Playhead**: ince siyah dikey çizgi + üstte elmas tutamaç; **scrubbing state**: tutamaç koyulaşır, çizgi maviye döner
- **Hover preview**: ruler hover'da o zaman noktasının frame # değeri tooltip
- **Cursor**: `ew-resize` (sürekli scrub)

#### 4.8.3 Left Column (240w)

| Bölge | İçerik |
|---|---|
| Header | "Tracks" başlık + ⋮ kebab (collapse all / expand all / filter) |
| Pickers | `+ Add animation ▾` (animatable property dropdown) ve `✨ Apply preset ▾` (entrance/exit/emphasis grupları ile preset listesi) — her ikisi de seçili layer için |
| Layer header row | layer icon + name + ● eye + 🔒 lock + S solo + ⋮; right edge'de mini bar gösterir start-end |
| Property track row | ◆ "add kf at playhead" buton + property name (truncate) + sağ kenarda "remove track" ⊗ (hover) |
| Drag handle | satır arasında resize tutamaçları (track yüksekliği değişebilsin — Graph mode'da farklı tracklerin farklı yükseklikte olması için) |

#### 4.8.4 Track Area — Mode A: Dope Sheet (varsayılan)

Her **layer**'ın iki satırı vardır:

1. **Layer Header Bar (32h)** — sadece layer'ın aktif aralığını gösteren bar
   - Soldan-sağa: layer.colorLabel rengindeki yarı saydam blok
   - Bar uzunluğu = `(endMs - startMs)` width
   - **Sol/sağ trim handle** — drag → startMs / endMs değişir (transaction)
   - **Center drag** → hem startMs hem endMs aynı delta ile kayar
   - Üstte mini layer adı

2. **Property Tracks (her track 28h)** — sadece o layer'ın eklenen property'leri için
   - Arka planda **value graph polyline** (sayısal track'ler için, %40 opacity)
   - Keyframes elmas; renk durumlarına göre değişir:
     - **Default**: amber #FBBF24
     - **Hover**: lighter amber, scale 1.25
     - **Selected**: orange #FB923C, border orange-500
     - **Drag preview**: yellow-200, scale 1.25
     - **Hold easing**: rectangle (kare) yerine elmas
     - **CustomBezier**: çift halka

**Scroll davranışı:** sadece TRACK AREA scroll eder; ruler ve LEFT COL fixed. Ruler ile track'ler `transform: translateX(-scrollLeftPx)` ile senkronize.

#### 4.8.5 Track Area — Mode B: Graph Editor

- Aktif olunca her **property track 72h yüksekliğe** çıkar
- Arka planda value polyline kalın çizilir (#60A5FA, %90 opacity)
- Keyframes **X=time, Y=value** olarak konumlanır (her track kendi value range'ine normalize)
- Y-axis labels left column'da min/max gösterir
- **Bezier handles** (rezerv): her kf'in iki yanına çıkan kontrol noktaları (in / out tangent)
- Sayısal olmayan track'ler (boolean, string) graph mode'da step çubuğu olarak görünür

#### 4.8.6 Audio Track (yeni)

Audio layer için Property Track yerine **waveform track** çizilir:
- Yükseklik 52h
- Arka planda peak'ler (`Float32Array` sample'ı SVG polyline)
- Volume keyframe'leri waveform üstüne süperimpoze
- Sol panel'de waveform mini preview de gösterilir
- Mute durumunda gri/dim

#### 4.8.7 Snap Indicator

Drag esnasında:
- Snap olduğunda **dikey sarı çizgi** track area'da görünür
- Snap target tipi (frame / kf / marker) küçük badge ile gösterilir ("snapped to frame 76")
- `Cmd/Ctrl` basılıyken snap bypass — badge yerine "no snap" göstergesi

#### 4.8.8 Lasso Selection (yeni)

Track area'da boş alanda mouse-down → dikdörtgen sürükle:
- Dashed mavi border + 10% mavi fill
- İçindeki tüm keyframe'ler seçilir
- Shift basılı ise mevcut seçime eklenir

#### 4.8.9 Multi-Drag Visualization

Birden fazla kf seçili iken bir tanesini drag etmek:
- Hepsi aynı delta ile hareket eder
- Leader kf orange, diğerleri lighter orange
- Snap leader'ın pozisyonuna göre, hepsi senkron kayar
- Edge clamp: grup sınırı [0, duration] dışına çıkamaz

#### 4.8.10 Timeline Markers (yeni)

- Sağ click ruler → "Add marker here"
- Marker üzerinde double-click → inline label edit
- Marker context menu: rename / set type (note/beat/scene/export/warning) / set color / delete
- Marker drag → time değişir (snap aktif ise snap)

#### 4.8.11 Resize Handle (yeni)

Timeline panel'in üst kenarında 4h yükseklik drag handle:
- Hover'da mavi
- Drag → panel yüksekliği değişir (120-560 sınırı)
- localStorage'a yazılır

### 4.9 Right-Click Context Menus (yeni — şu anda sadece "Layer context menu" var)

**Layer context** (var, varyantları ekle):
- Rename, Duplicate, Delete
- Group selection, Ungroup
- Move to top / bottom
- Set color label →
- Convert to (text→shape vs.)
- Copy properties / Paste properties
- Animation presets →
- Export this layer

**Keyframe context** (yeni):
- Move to playhead
- Snap to frame
- Copy / Cut / Delete
- Set easing → (linear / easeIn / easeOut / customBezier…)
- Convert to hold

**Track context** (yeni):
- Remove track (deletes all kfs)
- Bake to value (collapse animation)
- Convert easing all → linear / easeOut / etc.
- Reverse keyframes

**Ruler context** (yeni):
- Add marker here
- Set work area in
- Set work area out
- Clear work area

### 4.10 Empty / Loading / Error States (Editor)

| State | İçerik |
|---|---|
| Empty editor | Canvas'ta "Drag an image here or press R, C, T to start. Tap ⌘/ for shortcuts." |
| Loading project | Full-panel skeleton: gri placeholder shapes |
| No timeline | Track area'da "No timeline yet — `+ Timeline` to add one" |
| No tracks | "Select a layer and pick a property to animate, or apply a preset." |
| Asset missing | Layer rengi gri-kırmızı, "Asset not found — Replace" pill |
| Network error (save) | Top bar'da "Offline · X unsaved changes" + Retry buton |
| Encode/render error | Toast: "Export failed: codec not supported" + retry |

### 4.11 Drag / Interaction Cursor Set

| Element | Cursor |
|---|---|
| Canvas (default) | `default` |
| Canvas (hover layer) | `move` |
| Layer drag | `grabbing` |
| Ruler scrub | `ew-resize` |
| Trim handle | `ew-resize` |
| Keyframe diamond | `grab` / `grabbing` |
| Panel resize | `row-resize` / `col-resize` |
| Anchor point | `crosshair` |
| Hand tool | `grab` / `grabbing` |

---

## 5 · Overlays / Modals (Detaylı)

### 5.1 Command Palette (Cmd+K — YENİ)

- Üst arama input + sonuç listesi
- Bölümler: Actions / Layers / Compositions / Help
- Klavye nav: ↑↓ Enter
- Fuzzy search, son kullanılanlar üstte
- Action örnekleri: "Add image", "Export as MP4", "Toggle graph mode", "Apply Fade In"

### 5.2 Composition Preset Modal (var ama eksik)

Mevcut wireframe'de "New project modal" var. Ek olarak:
- 7 preset kartı + custom satırı (var)
- **Visual aspect ratio preview** her kartta
- "Recently used" ayrı bölümü

### 5.3 JSON Modal (var, toggle eklenecek)

- **Editor / Runtime toggle** üst kısımda
- Satır sayısı + KB readout
- Copy / Download butonları
- Diff view: değişiklikleri vurgula (rezerv)

### 5.4 Shortcuts Modal (var, kategorize edilecek)

5 kategori (Playback / History / Selection / Viewport / Help) — her satırda key chip + açıklama. Search input üstte.

### 5.5 Asset Picker Overlay (yeni)

İmage / video / audio layer eklerken açılan inline overlay:
- Recent assets (yatay scroll)
- Library link
- "Upload file" droparea
- Asset thumbnail + kullan-bu CTA

### 5.6 Color Picker Overlay (yeni)

- Saturation/value square
- Hue slider
- Alpha slider
- Hex input + RGB/HSL toggle
- Recent swatches (8 son)
- Library swatches (workspace renkleri)
- Eyedropper button

### 5.7 Confirm Destructive Modal (yeni)

- "Delete 3 layers? This can't be undone." (mavi "Cancel" / kırmızı "Delete")
- Trash'e taşıma: "Move to trash" (yeşil — geri alınabilir)

---

## 6 · Mobile (375 / 768)

Mevcut 3 ekran var (landing, dashboard, editor block). Eklenecekler:

### 6.1 Mobile Editor — Touch-friendly Properties (yeni)

- Bottom sheet pattern: Properties panel alt yarıdan kayarak gelir
- Tabs: Transform / Style / Animation
- Slider'lar daha kalın (44px touch target)
- Color picker overlay tam-ekran

### 6.2 Mobile Nav Drawer (yeni)

Hamburger → sol kayan drawer:
- Profile / Dashboard / Projects / Library / Settings / Help / Logout

### 6.3 Mobile Read-only Preview

Editor mobile'da yazılabilir değil (composition kurma masaüstü deneyimi). Mobile'da sadece **preview player + share** akışı var.

---

## 7 · Etkileşim Durum Kataloğu

Her interactive element için 4-6 state çizimi. Annotation katmanı ile:

```
Button         default · hover · active · disabled · loading
Input          default · focus · error · disabled · with-prefix
Slider         default · hover · dragging · disabled
Checkbox       off · on · indeterminate · disabled
Toggle         off · on · loading
Tab            inactive · active · with-badge
Card           default · hover · selected · loading
Modal          opening (fade) · open · closing
Toast          enter · stable · leaving · error · success · warn · info
```

Bu state'ler ayrı bir "8 · States Reference" ekranında toplanır.

---

## 8 · Erişilebilirlik (Accessibility)

Annotation katmanı: her ekranda gri çıkartmalar ile

| Annotation | İçerik |
|---|---|
| Klavye nav | Tab order ok'ları (1, 2, 3…) |
| ARIA labels | İkon-only butonların aria-label metni |
| Kontrast | Renk pair'lerinin WCAG AA/AAA durumu |
| Focus ring | 2px primary + 2px offset standardı |
| Reduced motion | `prefers-reduced-motion` etkin senaryolar |

---

## 9 · Implementasyon Sıralaması (Wireframe Update Roadmap)

Mevcut wireframe dosyalarını şu sırada güncelle:

| Sıra | Dosya | Eklemek / Düzenlemek |
|---|---|---|
| **1** | `screens-editor.jsx` | **Timeline yeniden tasarımı** (Bölüm 4.8) — TopBar genişletme, ruler genişletme (markers + work area trim), track area iki mod (dope+graph), layer header bar + property tracks, snap line, audio waveform, multi-select lasso, drag preview |
| **2** | `screens-editor.jsx` | Properties panel her layer tipi için ayrı varyant (4.6.4 – 4.6.12) ve Inspector (4.7) |
| **3** | `screens-overlays.jsx` | Yeni overlay'ler: command palette, color picker, asset picker, confirm destructive, keyframe context, track context, ruler context |
| **4** | `screens-app.jsx` | Empty/loading state'ler, list view, asset library detay, settings sekmesi |
| **5** | `screens-marketing.jsx` | Pricing, docs, use cases sayfaları |
| **6** | `screens-mobile.jsx` | Bottom-sheet properties, nav drawer |
| **7** | `wireframe-primitives.jsx` | Yeni primitif: `Tabs`, `Toggle`, `Slider`, `Toast`, `ContextMenu`, `Dropdown`, `Popover`, `WaveformBar`, `GraphLine`, `Marker`, `Tooltip` |
| **8** | `Chorono Wireframes.html` | Yeni section'lar (Design Tokens, Icons, States Reference, Mobile detay) |
| **9** | Yeni dosya `screens-system.jsx` | Design tokens, icon library, states reference, 404/500, skeleton |

---

## 10 · Önerilen Sonraki Adımlar

1. **Bu planı oku, eksik olanları ekle / önceliklendir**
2. Adım 1 (Timeline yeniden tasarımı) için sketch / Figma'da hızlı bir crit pass yap
3. `screens-editor.jsx` içinde **yeni Timeline'ı** mevcut TimelineFooter'ı silmeden ekle (kademeli geçiş)
4. Yeni primitif'leri (`Marker`, `WaveformBar`, `GraphLine`) `wireframe-primitives.jsx`'e ekle
5. Her etkileşim state'i için varyant artboard'ları üret (en azından kritik 4-5 element için)
6. Mobile bottom-sheet ve nav drawer'ı `screens-mobile.jsx`'e ekle
7. Design Tokens + Icon Library ekranını oluştur (referans olarak — production'da kullanılmasa bile dökümantasyon değeri yüksek)

---

## Ek · Mevcut Timeline'ın Eksiklerinin Tam Listesi

User'ın "yetersiz" dediği noktanın haklılığını destekleyen, **şu an wireframe'de eksik / yetersiz** olan timeline öğeleri:

- ❌ **Per-layer header bar** (sadece bazı satırlarda var, trim handle yok)
- ❌ **Sol / sağ trim handle** (start/end değiştirme görseli)
- ❌ **Multi-timeline tab bar** ("+ Timeline" var ama tab navigation yok)
- ❌ **Timeline markers** (ruler'da bayrak yok)
- ❌ **Work area drag handles** (shading var ama tutamaç görseli yok)
- ❌ **Snap indicator** (drag esnasında sarı dikey çizgi)
- ❌ **Multi-select visual feedback** (orange renk + scale)
- ❌ **Lasso selection** (dikdörtgen drag görseli)
- ❌ **Audio waveform track** (audio layer için özel görsel yok)
- ❌ **Layer activity bar in track area** (sadece sol panelde gösteriliyor değil, track area'da da olmalı)
- ❌ **Solo / Lock / Hide ayrı butonlar** (sadece eye-dot var)
- ❌ **Color label per-layer** (renk etiketi yok)
- ❌ **Keyframe Inspector** (sağ panel'in altında ayrı bölüm yok)
- ❌ **Easing per-keyframe görsel** (kf renkler easing tipine göre değişmiyor)
- ❌ **Hold easing keyframe** (square shape yok)
- ❌ **Custom bezier keyframe** (çift halka yok)
- ❌ **Value graph in dope sheet mode** (track arka planında değil)
- ❌ **Graph editor mode'da Y-positioned kf'ler** (var ama tek track ile sınırlı, multi-track demo yok)
- ❌ **Drag preview / ghost effect** (kf sürüklerken renk değişimi)
- ❌ **Frame counter readout** (sadece zaman var)
- ❌ **Resize handle** (panel yüksekliği)
- ❌ **Search / filter tracks** (uzun listelerde gerekli)
- ❌ **Inline rename** (double-click)
- ❌ **Smart guides / snap guides** (canvas'ta hizalama çizgileri)
- ❌ **Empty state'ler** (no tracks, no timeline, asset missing)
- ❌ **Right-click context menus** (genelde eksik)
- ❌ **Marker label + color** (5 tip yok)
- ❌ **Loop count / pingpong toggle** (timeline-specific settings yok)
- ❌ **Snap settings popover** (4 checkbox)
- ❌ **Playback speed selector** (yok)
- ❌ **Auto-key indicator** (kırmızı dot, recording state)

Bu listenin **her satırı** Bölüm 4.8'de detaylı olarak tasarlanmıştır. Wireframe güncellenirken bu listeyi checklist olarak kullan.
