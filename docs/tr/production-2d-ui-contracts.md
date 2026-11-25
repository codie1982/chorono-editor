# Chorono 2D — UI sözleşmeleri ve görünüm planı

Tarih: 17 Kasım 2026. Durum: ürün/UI planı; uygulama veya görsel kabul değildir.
Bu belge [2D üretim yol haritasındaki](production-2d-roadmap.md) her yeni
özelliğin nasıl görüneceğini, mevcut editöre nasıl yerleşeceğini ve hangi
etkileşim sözleşmelerini tamamlamadan teslim sayılmayacağını tanımlar.

## 1. Görsel yön ve mevcut kabuk

Chorono masaüstü odaklı, koyu temalı ve yoğun bir üretim aracıdır. Yeni 2D
özellikler mevcut dock ağacını, Scene Explorer/Layers, canvas, Properties,
Timeline/Dope Sheet/Curve Editor ve üst araç çubuğunu genişletir. Her özellik
için bağımsız pencere, farklı görsel dil veya ikinci bir editör kabuğu açılmaz.

Görsel yön: **minimal, profesyonel, grid tabanlı ve yoğun ama okunabilir**.
Mevcut koyu yüzey ailesi korunur; renkler component içinde rastgele hex/Tailwind
tonu seçmek yerine semantik token'lara bağlanır. Mavi seçim/ana eylem; nötr gri
yüzey; sarı uyarı/stale; kırmızı hata/yıkıcı işlem; yeşil tamamlanma anlamına
gelir. Durum hiçbir zaman yalnız renkle anlatılmaz; ikon, metin veya desen de
bulunur. Yeni yapısal ikonlar aynı Lucide/SVG ailesinden gelir. Emoji navigasyon
ve araç ikonu olarak eklenmez; ilgili eski alanlar değiştirildiğinde kademeli
olarak aynı ikon sistemine taşınır.

Tipografi ve yoğunluk:

- Panel gövdesi ve alan değerleri 12–13 px; bölüm başlığı 13–14 px semibold;
  yardımcı etiket 11–12 px ve yeterli kontrast kullanır. Kritik bilgi 10 px'e
  sıkıştırılmaz.
- Sayı, frame, süre, koordinat ve hash kısa gösterimlerinde mevcut monospace
  yazı kullanılır; uzun açıklamalarda normal sans-serif korunur.
- 4 px temel, 8 px ana boşluk ritmi kullanılır. Masaüstü compact control
  yüksekliği en az 28 px, birincil eylemler 32–36 px'tir. Coarse-pointer/touch
  ortamında hit area en az 44 px'e genişler.
- Hover 120–180 ms; panel/overlay girişleri yaklaşık 160–220 ms'dir. Sürekli
  üretim hareketi eklenmez; `prefers-reduced-motion` bütün yönlendirici olmayan
  animasyonları kaldırır.

## 2. Ana yerleşim sözleşmesi

Geniş masaüstü varsayılanı:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ File · Tools · Selection     Composition/Zoom      Job status · Preview    │
├───────────────┬──────────────────────────────────────┬─────────────────────┤
│ Scene Explorer│                                      │ Context Inspector   │
│ Layers/Assets │              2D Canvas               │ Properties/Detail   │
│               │     overlay + handles + guides       │ validation/bake     │
├───────────────┴──────────────────────────────────────┴─────────────────────┤
│ Timeline · Dope Sheet · Curve Editor · selected clip/channel filters       │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Üst çubuk:** dosya/proje, araç modu, undo/redo, kompozisyon, preview/export
  ve kısa global durum. Uzun job ayrıntısı buraya yığılmaz; durum düğmesi ilgili
  paneli açar.
- **Sol dock:** sahne hiyerarşisi, layer/character/component seçimi ve varlıklar.
  Aynı nesne iki ayrı ağaçta farklı kimlikle gösterilmez.
- **Orta canvas:** üretim sonucunun kendisi ve seçili aracın geçici overlay'i.
  Tutamaç, kemik, pin, collider, field ve contour kontrolleri final render'a
  girmez.
- **Sağ dock:** seçimin bağlamına göre Properties, Char Detail, Mesh Detail,
  Physics/Fabric/Fluid Detail veya Render Detail. Başlık her zaman düzenlenen
  nesne ve kapsamı gösterir.
- **Alt dock:** zaman, klip, keyframe ve eğriler. Aktif character/clip/cache
  seçimi timeline filtresiyle görünürdür; yanlış klibe gizli yazım yapılmaz.

Dock tabları taşınabilir, kapanabilir, yeniden açılabilir ve yerleşim kullanıcı
tercihi olarak saklanır. Yeni paneller registry üzerinden eklenir. Paneli
sürüklemek tek erişim yolu değildir: **Window/Panels** menüsüyle açma, dock
konumu menüsü, paneli taşıma ve yerleşimi sıfırlama eylemleri klavye ile de
erişilebilir olur. Splitter klavye ile adımlı büyütme/küçültme ve varsayılan
boyuta dönme sağlar.

## 3. Ortak panel ve alan sözleşmeleri

### 3.1. Panel anatomisi

Her feature paneli aynı sırayı kullanır:

1. Panel tabı ve bağlam başlığı.
2. Seçim özeti: nesne adı, tip, aktif klip/timeline ve düzenleme kapsamı.
3. Gerekirse mod seçimi: örneğin Setup / Animate / Test.
4. Katlanabilir özellik bölümleri.
5. Alanın yanında unit, key durumu, binding/wire ve reset/override durumu.
6. İlgili kayda bağlı inline validation/diagnostic.
7. Uzun işlem varsa sabit olmayan job/bake action strip'i.

Panel daraldığında iki sütunlu alanlar tek sütuna iner; alan etiketi kaybolmaz.
Yardım metni tooltip'e tamamen gömülmez. Sık kullanılan alanlar üstte, ileri
ayarlar `Advanced` bölümünde tutulur. Bölüm açık/kapalı tercihleri panel türüne
göre saklanabilir; seçili nesnenin kaynak verisine yazılmaz.

### 3.2. Alan durumları

Her input/button/toggle şu durumları destekler: default, hover, focus-visible,
active, disabled, read-only, mixed, keyed, driven/bound, warning, error ve
unsupported. `disabled` alanın yanında nedenini veya çözüm eylemini gösterir;
yalnız soluk bir kontrol bırakılmaz. Çoklu seçimde farklı değerler `Mixed`
olarak görünür; kullanıcı değer girince yalnız hedeflenen alanlara tek komut
uygulanır.

- Kalıcı label zorunludur; placeholder label yerine geçmez.
- Sayısal alan unit gösterir ve scrub + yazı + ok tuşu düzenlemesini aynı
  normalize/validation yoluna bağlar.
- Geçerli aralık ve clamp davranışı açıklanır; sessiz değer değişimi yapılmaz.
- Alan hatası blur sırasında veya Apply'da ilgili alanın altında görünür.
  Birden fazla hata varsa panel üstünde odaklanabilir özet ve alan bağlantıları
  bulunur; toast tek hata sunumu değildir.
- Icon-only düğmede accessible name ve tooltip; toggle'da `aria-pressed` veya
  eşdeğer seçili durum bulunur. Dekoratif ikon erişilebilirlik ağacına girmez.

### 3.3. İşlem, preview ve undo

- Canvas sürükleme/scrub işlemi canlı preview üretir; pointer-up/Enter tek
  commit ve tek undo'dur. Escape kaynak değere döner.
- Çok alanlı üretim ayarı geçici draft üzerinde çalışır. **Preview**, **Apply**
  ve **Cancel** ayrıdır. Selection/document değişiminde draft sessizce başka
  nesneye uygulanmaz; iptal edilir veya kaydedilmemiş değişiklik uyarısı verir.
- Geri alınabilir normal edit için confirmation dialog gösterilmez. Kaynak
  silme, bake'i kaynakla birlikte kaldırma veya geri dönüşsüz dış dosya üzerine
  yazma gibi yıkıcı işlemler hedef adı ve etkisiyle onay ister.
- Başarı, kısa ve rahatsız etmeyen geri bildirim verir. Hata; hedef, neden ve
  mümkün eylemi içerir. Toast, kalıcı inline tanının yerine geçmez.

## 4. Job, simülasyon ve bake görünümü

Uzun iş editörü bloke eden modal spinner olarak çalışmaz. Üst çubuktaki job
durumu ve açılabilir `Jobs & Bake` paneli aynı servisi gösterir:

```text
┌ Jobs & Bake ───────────────────────────────────────────────────────────────┐
│ Fabric preview · 42%        [Pause destekleniyorsa] [Cancel]              │
│ Source: Flag / Walk-01      Range: 0–240f      Quality: Preview           │
│ ███████████████░░░░░░░░░░  Elapsed 00:08 · current step: constraints     │
└────────────────────────────────────────────────────────────────────────────┘
```

Durumlar: queued, preparing, running, cancelling, failed, completed ve stale.
Determinate ilerleme gerçekten ölçülemiyorsa sahte yüzde gösterilmez; aşama adı
ve indeterminate gösterge kullanılır. Job tamamlanınca **Preview Result**,
**Apply/Replace**, **Keep Both** ve **Discard** yalnız desteklendikleri bağlamda
gösterilir. Source değişirse sonuç sarı `Stale` banner'ıyla korunur; neden,
değişen revision/topology ve **Re-bake** eylemi görünür. Eski sonuç sessizce
aktif sonuç yapılmaz.

## 5. Özellik görünümleri

### 5.1. Mesh2D / spline-to-mesh

Sağ panel adı `Mesh Detail` olur. Bölümler: **Source**, **Generation**,
**Topology**, **UV & Texture**, **Deform/Pin**, **Diagnostics**. Canvas araç
modları `Source`, `Mesh Preview`, `UV/Texture` ve desteklendiğinde `Pin` olarak
açık görünür. Source modunda spline noktaları; Mesh Preview'da vertex/edge
overlay; UV modunda texture fit/gizmo görünür. Bu görünüm genel vertex/edge/face
modelleme aracı sunmaz.

Üretim ayarı değişirken düşük maliyetli preview ayrı, Apply ile yeni topology
ayrıdır. Vertex/triangle sayısı, degenerate/non-manifold tanısı ve topology
hash kısa özet olarak gösterilir. Topology değişiminin hangi pin/cache/bake'i
stale yapacağı Apply öncesi listelenir.

### 5.2. Character Motion ve Char Detail

```text
┌ Character Motion ─────────┬──────────────────────────┬ Char Detail ───────┐
│ Setup | Animate | Test    │                          │ Character / Rig     │
│ Character [Sprite/Rig]   │ canvas + sprite/rig      │ Slot / Bone         │
│  ▾ Visual Slots           │ joints / IK targets     │ Attachment / IK    │
│    Primary / Face         │                          │ Sprite / Clip-State│
│  ▾ Bones                  │                          │ Bake / validation  │
│ Clips: Default·Idle·Walk  │                          │                     │
├───────────────────────────┴──────────────────────────┴─────────────────────┤
│ Frames/Timeline: thumbnails · hold exposure · Bone/Target/Sprite filters   │
└────────────────────────────────────────────────────────────────────────────┘
```

MVP'de `Setup` rest pose, parent, attachment ve constraint kurar; `Animate`
aktif klibe poz/target key'i yazar. MVP sonrası `Test` parametre, event ve state
geçişlerini çalıştırır; kaynak rig'i yanlışlıkla değiştirmez. Aktif mod, character, clip ve
timeline aynı anda başlıkta görünür. Kemik/IK seçimi Scene Explorer, canvas,
Character Motion ağacı ve Char Detail arasında stable ID ile senkron olur.

Kemik ve IK target sürüklemesine sayısal x/y, açı, ağırlık ve dirsek yönü
alternatifi bulunur. Döngü, eksik attachment, sıfır kemik, singular scale ve
ulaşılamayan hedef hem canvas işareti hem ilgili ağaç/panel satırında görünür.
Char Detail sekmeleri bağlama göre filtrelenir; ilgisiz bütün sekmeler aynı anda
doldurulmaz.

Sprite Character için ana giriş `Add → Character → Sprite Character` olur.
Kurulum akışı Asset/Grid → Pivot/Size → ilk frame aralığı → Preview → Apply
adımlarını gösterir. Aynı import ekranında `Create as Character` açık bir
seçenektir; normal sprite importunun davranışı değişmez. Seçili mevcut
frame-sequence üzerinde `Wrap as Character…` eylemi görünümü koruyan önizleme
ve tek undo ile Character root oluşturur.

Sprite görünümünde `Setup`; asset, grid, Primary/hybrid visual slot, pivot ve
fit ayarlarını gösterir. `Animate`; aktif clip, thumbnail strip, current frame,
hold/exposure, FPS başlangıç aralığı, loop, previous/next, play/pause ve frame
ekle/çoğalt/sil kontrollerini açar. `Test`; state, parametre, olay ve aktif clip
sonucunu gösterir. Aktif mod ve clip hem panel başlığında hem timeline'da
görünür; clip seçilmeden frame yazılamaz.

Sprite frame strip görünümü:

```text
┌ Clip: Walk ────────────────────────────────────────────────────────────────┐
│ [|<] [<] [Play] [>] [>|]  Loop ✓  Base FPS 12     Frame 04 / 08          │
│ [01][02][03][04][05][06][07][08]        [+ Frame] [Duplicate] [Remove]   │
│ exposure: 2f  2f  2f  3f  2f  2f  2f  3f   · hold/discrete timeline     │
└────────────────────────────────────────────────────────────────────────────┘
```

Thumbnail seçimi playhead'i ilgili frame başlangıcına götürür; playhead scrub
da thumbnail seçimini günceller. Frame reorder sürüklemeye ek olarak Move Left /
Move Right düğme ve klavye komutlarına sahiptir. Pivot değişikliği bütün klibi
etkiliyorsa kapsam ve sonuç önizlemesi Apply öncesinde görünür. Hybrid modda
`Show Rig + Sprite Channels` iki kanal grubunu aynı timeline'da açar; sprite
karesi ile kemik key'i farklı saat motorlarında ilerlemez.

### 5.3. Physics, fracture ve particle

`Physics` dock'u **Rigid**, **Fracture** ve **Particle** sekmelerine ayrılır;
sağ inspector seçili body/collider/emitter ayrıntısını gösterir. Canvas'ta
collider sınırı, velocity oku, gravity/field ve fracture seed noktaları ayrı
overlay katmanlarıdır. Overlay görünürlüğü araç çubuğundan açılıp kapanır.

Üstte `Edit Source / Preview Simulation / Inspect Bake` bağlamı görünür.
Simülasyon oynatımı ana timeline saatine bağlıdır. `Reset Preview`, `Bake…` ve
`Clear Bake` farklı eylemlerdir. Kırılma önizlemesi parça sayısı ve geçersiz
hücre tanısını Apply öncesinde gösterir.

### 5.4. Fabric/kumaş

`Fabric Detail` bölümleri: **Mesh Source**, **Pins**, **Forces**, **Collision**,
**Solver Quality**, **Bake**. Canvas'ta pin'ler dolu/boş ikon ve label ile;
wind/gravity yönü oklarla; collider'lar ayrı çizgi stiliyle gösterilir. Renk tek
anlam taşımaz. `Paint Pins` varsa fırça boyutu/weight görünür ve **Clear/Invert**
gibi düğmeli alternatifler sunulur.

Preview/final kalite profilleri yan yana karşılaştırılmazmış gibi davranmaz:
aktif profil, çözünürlük, step ve tahmini cache bütçesi görünür. Backend adı
normal akışın ana kontrolü değildir; yalnız Diagnostics/Advanced bölümünde
capability veya hata için gösterilir.

### 5.5. Blob Surface, sıvı ve akış

`Fluid & Surface` paneli **Source**, **Surface**, **Simulation**, **Fields** ve
**Bake** sekmelerini kullanır. Canvas'ta emitter/drain, domain, obstacle ve
field ayrı ikon/desenlerle görünür. Blob edit modunda etki noktası radius ve
weight halkası; surface preview'da contour ve delikler; simulation preview'da
particle gösterimi isteğe bağlıdır.

Source ve Simulation sekmelerinde sahne nesnesi ilişkileri tek bir genel
`Target` alanına sıkıştırılmaz:

```text
┌ Source ────────────────────────────────────────────────────────────┐
│ Emit From       [ Select layer… ]                                  │
│ WATER / Text    [Glyph top edges ▼]              [Reveal] [Remove] │
│ Rate 120/s      Seed 42      Normal offset 2 px                    │
├ Collision ─────────────────────────────────────────────────────────┤
│ Collide With    [+ Add layer]                                      │
│ WATER / Text    Glyph outline · Ready            [Reveal] [Remove] │
├ Surface ───────────────────────────────────────────────────────────┤
│ Follow Surface  [ Optional layer… ]                                │
│ Mode [Tangent flow ▼]  Offset 1 px  Adhesion 0.6  Detach 24 px/s  │
└────────────────────────────────────────────────────────────────────┘
```

- **Emit From**, partikül/gövde doğum yerini ve point/path/perimeter/fill,
  glyph kenarı, vertex/edge/triangle-area örnekleme modunu seçer.
- **Collide With**, engel/temas geometrisini, kalınlık ve solver'a uygun
  friction/restitution/slip gibi malzemeyi seçer.
- **Follow Surface**, projection/tangent flow, offset, adhesion, yön ve
  detach threshold ayarlarını taşır; collision'ın yerine geçmez.
- Aynı layer birden fazla rolde seçilebilir ama her rol görünür bir satırdır;
  layer görünürlüğü otomatik fizik ilişkisi oluşturmaz.

Layer picker Scene Explorer içinde aranabilir ve klavye ile kullanılabilir.
Uyumlu türler öne çıkar; uyumsuz türler disabled durum ve kısa gerekçeyle
gösterilir. Her seçili satır nesne adı/türü, geometri modu, capability durumu,
**Reveal/Select** ve **Remove** eylemlerini taşır. Silinmiş layer, eksik font,
stale geometri veya desteklenmeyen solver adapter'ı satır içinde hata üretir;
hata için ayrılan alan panelin görünürken zıplamasını önler. Birden çok hata
varsa odaklanabilir özet ilgili satıra taşır. Kritik eylemler yalnız hover ile
görünmez.

Text kaynağında glyph fill/outline/yöne bakan kenar; spline'da path ve eşit
arc-length; shape'te perimeter/fill; `Mesh2D` üzerinde vertex/edge/triangle
area seçenekleri capability'ye göre görünür. “Yukarı bakan glyph kenarı”
ekran koordinatına sabitlenmez; seçilen gravity, buoyancy veya emission yönüne
göre tanımlanır. Glyph outline desteklenmiyorsa text bounds sessiz fallback
olmaz; exact outline veya kullanıcı onaylı çözünürlüklü alpha/SDF seçilir.

Canvas overlay'leri yalnız renkle ayrılmaz: emitter örnek noktası/normal oku,
collider sınırı/kalınlık deseni ve surface tangent/detach bandı farklı çizgi,
ikon ve metin etiketi taşır. Canvas'tan layer seçme geçici picker modudur ve
seçim bitince önceki araca döner. Bu overlay'ler final render/export'a girmez.

Particle görünümü, surface görünümü ve final shading aynı toggle değildir.
Seçili kareyi Mesh2D snapshot'a dönüştürme açık bir `Convert Snapshot…`
eylemidir; canlı fluid kaynağını sessizce değiştirmez.

Rigid body için aynı ilişki dili kullanılır: gövde tipi ile **Emit From** ayrı,
text/shape/spline/`Mesh2D` collider'ları **Collide With** altında seçilir. `A8`
gibi glyph deliklerini dolduran tek convex hull kabul edilmez. Görsel partikül,
rigid top emitter'ı, liquid ve grid smoke/fire aynı panel kabuğunu paylaşabilir;
seçilen solver yalnız kendi desteklediği parametreleri gösterir. Ayrıntılı
teknik sözleşme [Emitter / Collider / Surface Target planındadır](plans/emitter-collider-surface-interaction-plan.md).

### 5.6. Component, varyant ve çoklu format

`Component` inspector'ı source/instance ayrımını başlıkta gösterir. Alanlar
`Definition`, `Instance Overrides`, `Variant Overrides` ve `Data Mapping`
olarak gruplanır. Override bulunan alan badge taşır; **Reset Value** ile
**Remove Override** farklı anlamlarıyla ayrı görünür.

Format görünümünde 16:9, 1:1 ve 9:16 canvas'ları sekme veya kontrollü compare
modunda gösterilir. Aynı anda çok küçük üç canvas gösterip düzenlemeyi zorlamak
yerine tek aktif varyant büyük tutulur; compare ikincil kontroldür. Safe area,
overflow ve font eksikliği doğrudan ilgili varyantta işaretlenir.

### 5.7. Render Preview ve final çıktı

```text
┌ Render Preview ────────────────────────────────────────────────────────────┐
│ Profile [Final ▼]  Size [1080×1920]  Range [Work area]  Frame [0120]      │
│ [Viewport] [Final] [A/B]     Zoom 100%     Background checker             │
├───────────────────────────────────────────────┬────────────────────────────┤
│                                               │ Capability & warnings      │
│              rendered frame                   │ ✓ fonts/assets             │
│                                               │ ! stale fabric bake        │
│                                               │ ! SVG: raster fallback     │
├───────────────────────────────────────────────┴────────────────────────────┤
│ Estimate/cache info                  [Render frame] [Add to export queue]  │
└────────────────────────────────────────────────────────────────────────────┘
```

Viewport ve Final aynı frame isteğinin farklı profilini açıkça gösterir.
Checkerboard alpha, zoom, pixel inspection ve A/B karşılaştırma bulunur.
Uyarılar hedefe bağlıdır; unsupported feature sessizce atılmaz. Render job'ı
progress/cancel ile Jobs & Bake paneline gider. Export seçenekleri yalnız
gerçek capability'leri gösterir; fallback seçimi kullanıcıya açıktır.

## 6. Responsive, klavye ve erişilebilirlik

- `≥1280 px`: sol + canvas + sağ + alt timeline tam görünüm.
- `900–1279 px`: tek yan dock açık; diğer paneller tab/collapse ile erişilir.
  Canvas ve timeline kritik alanı korunur.
- `<900 px`: canvas-first compact düzen; bir yan panel aynı anda açılır. Tam
  üretim ergonomisi garanti edilmese de hiçbir kritik eylem yalnız hover veya
  drag ile erişilmez.
- Tab sırası görsel sırayı izler. Canvas, Scene Explorer, inspector ve timeline
  arasında tanımlı focus komutları bulunur. Modal/popover focus trap ve Escape
  dönüşü doğru çalışır; kapanınca focus açan kontrole döner.
- Drag ile reorder, dock, resize, pin paint ve point taşıma işlemleri için
  menü/düğme/sayısal ya da klavye alternatifi vardır.
- Focus göstergesi bütün temalarda görünür ve sticky toolbar/job banner
  tarafından tamamen örtülmez. Metin kontrastı en az 4.5:1; kontrol sınırı ve
  anlamlı ikon en az 3:1 hedefler.
- Büyük scene/layer/bone/job listeleri ölçümden sonra virtualization kullanır;
  seçim/focus stable ID ile korunur. Async içerik yerleşim alanını önceden
  ayırır; panel zıplaması ve yanıp sönen spinner oluşturmaz.

## 7. Dikey teslim kabulü

Her yeni 2D feature aşağıdaki UI kanıtları olmadan tamamlanmış sayılmaz:

1. Add/import giriş noktası, Scene Explorer kaydı ve anlamlı boş durum.
2. Canvas seçimi, bounds/hit-test ve gerektiğinde overlay/tutamaç.
3. Bağlama duyarlı inspector; default, mixed, keyed/driven, invalid ve
   unsupported durumları.
4. Pointer ve klavye/sayısal alternatif; Escape cancel ve tek undo.
5. Save/open sonrası panel bağlamı değil, kaynak davranışının korunması.
6. Job varsa progress/cancel/failure/stale/re-bake ve atomik Apply.
7. Timeline/clip kapsamının görünür olması; yanlış hedefe gizli key yazılmaması.
8. Preview ve desteklenen final render'da aynı kaynak sonucu; edit overlay'inin
   çıktıya girmemesi.
9. Dar panel, 900–1279 px düzen, dark-theme kontrastı, reduced-motion ve yalnız
   klavyeyle temel akış kontrolü.
10. UI/MCP'nin aynı native komutu kullanması; UI-only veri düzeltme yolu
    oluşturmaması.

Gerçek görsel kabul, temsilî sahnelerde normal, empty, loading, invalid, stale,
failed ve completed durumlarının ekran görüntüsüyle yapılır. Yalnız property
değer testi veya registry kaydı UI teslimi değildir.
