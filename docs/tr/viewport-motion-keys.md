# Viewport üzerinden motion key düzenleme

Tarih: 8 Kasım 2026. E−1.6/V3 uygulama sözleşmesi. Aktif kapsam native 2D
position key'leridir; kaynak path geometrisi ve Follow Path timing ayrı kalır.

## Kullanım

1. Nesneyi ve düzenlenecek Timeline'ı seçin, viewport'ta **Motion Keys** açın.
2. **Edit:** elmasa tıklamak key'leri seçer ve yerel zamana gider. Shift seçim
   ekler/çıkarır. Seçili noktaları sürükleyin veya oklarla 1 composition px,
   Shift+oklarla 10 px taşıyın. Sürüklemede Shift eksen kilididir.
3. Tek nokta için **World X / World Y / Time (ms)** alanları ile kesin değer
   girip **Apply key values** kullanın. Zaman ve konum tek undo adımıdır.
4. **Add Key:** playhead zamanında canvas'a tıklayın. Sonraki key için ilerleme
   adımını frame veya ms olarak belirleyin; sıfır otomatik ilerlemeyi kapatır.
5. **Draw Motion:** rota noktalarına sırayla tıklayın, başlangıç/bitiş ms ve
   equal-time/equal-distance dağılımını seçin. Önizleme kaynak sahneyi değiştirmez.
   **Apply route** tek komut uygular; Cancel/Escape taslağı bırakır.
6. **Duplicate keys** belirtilen ms ofsetiyle yeni kimlikler oluşturur.
   **Delete keys** veya canvas odaktayken Delete yalnız seçili motion key'lerini
   siler. Timeline/Curve Editor ile aynı key ID seçimi kullanılır.

Bir noktada aynı zamana ait x/y key'leri birlikte temsil edilir. Timeline veya
Curve Editor'da bunlardan birinin seçilmesi noktayı vurgular; viewport'tan nokta
seçimi mevcut iki ekseni de seçer. Aynı yerde duran farklı zaman noktaları
**Key time** listesinden ayrı seçilebilir. Viewport seçimi seek yapar; Curve
Editor'ın kendi mevcut tıklama/seek davranışı değiştirilmez.

Varsayılan çizim politikası **append**'dir; çarpışan kayıtları sessizce silmez.
**Replace range** açıkça seçildiğinde yalnız verilen dahilî aralıktaki x/y key'leri
değişir. Aralık dışındaki kayıtlar korunur; aralığı aşan komşu interpolasyon
segmentinin görüntüsü değişebilir. Önizleme diagnostic'i bu sınırı bildirir.
Mevcut animasyona key eklemek/taşımak da doğal olarak komşu hareketi etkiler.

## Sahipler ve veri akışı

| Sahip | Sorumluluk |
| --- | --- |
| `src/lib/timeline/trajectory/index.ts` | Hazırlık, model, dünya/yerel dönüşüm ve örnekleme public yüzeyi |
| `src/lib/timeline/trajectory/commands.ts` | Native set/move/delete/retime/duplicate/draw komut yüzeyi |
| `src/components/MotionPathOverlay.tsx` | Bir nesne ve açık Timeline kapsamındaki çizgi, noktalar ve araç koordinasyonu |
| `src/components/canvas/motion/` | Toolbar, inspector, rota taslağı, keyboard ve pointer adapter'ları |
| `src/components/canvas/interactions/EditorPointerSession.ts` | Nesne ve key gesture'larının ortak transaction/capture/cancel yaşam döngüsü |
| `src/components/SceneCanvas.tsx` | Composition/client dönüşümü, snap adapter'ı ve kesin authoring frame |
| `src/app/page.tsx` | Timeline/Curve/viewport ortak key ID seçimi ve playhead |

Örnek source komutu:

```ts
import { setTrajectoryPoint } from '@/lib/timeline/trajectory/commands'

const edit = setTrajectoryPoint(editor.getScene(), {
  timelineId: 'intro', layerId: 'clock', timeMs: 500,
  worldPoint: { x: 320, y: 180 },
})
if (edit.command) editor.dispatchCommand(edit.command)
```

Public komutlar React, canvas ve DOM'dan bağımsızdır. UI `EditorCommand`'ı
mevcut editör geçmişine verir. Projection modeli sahne kayıtlarını/index'i
immutable snapshot olarak ödünç alır; yeni source JSON türü oluşturmaz.

## Koordinat, zaman ve koruma kuralları

- Konum **render edilen anchor'ın composition/world pikseli**dir. Client delta
  canvas rect'inden çevrilir; pan/zoom/DPR iki kez uygulanmaz. Native affine math,
  `resolveLayerWorldMatrix`, `resolveDisplayTransform` ve evaluator kullanılır.
- Her key kendi zamanındaki parent matrix'iyle projekte edilir. Animated,
  reflected ve nonuniform parent desteklenir. Yazma aynı zamandaki parent inverse
  ile yerel transform.x/y'ye döner; source transform ve pivot değiştirilmez.
- Zaman açık Timeline'ın **yerel milisaniyesi**dir. Loop/ping-pong oynatmada
  başlangıca dönebilen duration noktası, motion authoring sırasında gerçek son
  key frame'i olarak görünür. Diğer Timeline'lar temsilî global=local saatinde
  normal değerlendirilir; playback/export saat bayrakları değiştirilmez.
- x/y tam sayısal zaman eşitliğinde eşlenir. Birbirine ±1 ms yakın ama eşit
  olmayan başka key varsa işlem reddedilir. Fractional ms yuvarlanmaz.
- Mevcut kayıtlar ID ile değiştirilir; easing/tangent ve diğer metadata korunur.
  Eksik eksen kanalı gerekiyorsa canonical `insertCurveKeyframe` curve-preserving
  insertion kullanılır. Bu işlem ilgili segmentin easing/support key kayıtlarını
  bölerek temsil edebilir; tüm ara kayıtların aynı kalacağı iddia edilmez.
- Gesture boyunca aynı baseline ve transient ID allocator kullanılır. Eksik
  eksen/support key'leri her pointer örneğinde yeni ID almaz. Undo yeni track'leri
  kaldırır, eski key dizileri/membership'i geri getirir; redo aynı ID'leri kullanır.
- Source guard hedef/ancestor kaynaklarını, ilgili transform track dizilerini,
  interpolasyon ayarlarını, saatleri ve transform binding'lerini kontrol eder.
  Hazırlıktan sonra ilgili kaynak değişmişse komut yeniden hazırlanmalıdır.
  İlgisiz sahne/track verileri patch edilirken korunur.
- Rota taslağı ilk noktada source/document kimliğini sabitler. Manuel düzenleme,
  yeni doküman veya kapsam değişimi eski taslağın yeni kaynağa uygulanmasını önler.
- Pointer-up son örneği synchronous örnekler. Escape, pointercancel, blur,
  lost capture ve unmount iptal eder. Başka düzenleme gelmişse eski baseline onun
  üstüne yazılmaz. Sparse nokta kimliği değişse bile capture sabit canvas'tadır.
- Bütün değişiklikler yalnız desteklenen x/y source track'leri ve gerekli Timeline
  membership'ine gider. Rotation, diğer kanallar, başka layer/Timeline korunur.
  Undo/scene JSON'a DOM, örneklenmiş çizgi veya yoğun frame buffer girmez.

## Destek ve sınırlar

Follow Path, inline SVG motion, procedural controller/modifier/time-warp,
transform binding, başka Timeline'dan çakışan position sahipliği, locked/frozen
ancestor ve singular parent güvenli diagnostic ile yazmaya kapanır. Follow Path
için **Edit Path Source / Edit Progress Timing** mevcut kaynak editörlerine gider.
Binding/çakışan Timeline gibi authoring evaluator'ının tek başına güvenilir
çizemediği pose için yanıltıcı motion çizgisi gösterilmez. Otomatik bake yoktur.

Bu sürüm click-to-place native position rotasıdır; serbest el raster path, spatial
Bezier tangent editörü veya birden fazla nesnenin aynı anda motion authoring'i
değildir. Scalar x/y easing, doğrudan 2D spatial Bezier handle'ı sayılmaz.
Nokta değerleri ve zamanları düzenlenir; easing'in mevcut Curve Editor sahibi
korunur. Play/preview motion tool'u kapatır; export'a editor overlay girmez.

Çizimde en fazla 128 taslak nokta; modelde varsayılan 512 native node ve 256
örnek, aktif drag'de 64 örnek vardır. Dense source için node limiti yazmayı
kapatır; örnek limiti çizginin yaklaşık olduğunu belirtir. Kaynak key'ler elenmez.
Motion Keys kapalıyken yoğun örnekleme yapılmaz. Snap mevcut SnapEngine'in
point politikasını kullanır; yeni object/vertex snapping yeteneği iddia edilmez.

## Doğrulama ve tekrar

Unit testler gerçek key/metadata koruma, sparse insertion/support ID kararlılığı,
parent inverse, loop endpoint, hold segment, stale source ve atomik undo/redo
invariant'larını sınar. Portable source save/load ve runtime evaluator kontrolleri
vardır. Native fixture gerçek SceneCanvas, TimelinePanel ve CurveEditor'ı aynı
editör/seçim/playhead ile mount eder; canlı kullanıcı belgesine dokunmaz.

```sh
npm run chorono -- stop --json
npm test
npm run mcp:build
npm run build
node scripts/perf/motion-key-interactions.mjs
node scripts/perf/serve.mjs artifacts/performance/motion-key-interactions-20261108/build 4330
```

Chrome'da `http://127.0.0.1:4330/motion-key-interactions.html` açıp
**Run motion key checks** kullanın. Görünen JSON raporu, source manifest ve
bundle hash'ini içerir. Ortak pointer altyapısı değiştiği için önceki
`scripts/perf/viewport-interactions.mjs` native regresyonu da tekrar çalıştırılır.
Bu dilim yeni Four Seasons/512 MiB veya tam V6 kaynak kabulü değildir.

8 Kasım kabulü: **280 dosya / 2239 test**, TypeScript no-emit, MCP build ve Next
production build geçti. Chrome156/DPR1'de yeni üç-panel fixture **12/12**, önceki
nesne/pivot/path pointer regresyonu **13/13** geçti. İki native bundle'ın bütün
402/348 source hash'i ve görünür rapordaki bundle hash'i diskle doğrulandı.
Ayrıca gerçek fareyle sparse 500ms noktası world `(530.62082, 251.96219)`'dan
`(554.62082, 263.96219)`'a taşındı; Undo/Redo inspector ve Timeline eşleşmesi
gözlendi. Programatik native event kabulü ile gerçek fare kontrolü ayrı kanıttır.

Yerel üretilen kanıtlar (git tarafından ignore edilir):

- `artifacts/performance/motion-key-interactions-20261108/verification.json`
- Aynı dizinde `motion-acceptance.json`, `viewport-acceptance.json`, ham
  `acceptance.ax.txt`, `viewport-regression.ax.txt`, `real-mouse.ax.txt`
- Aynı dizinde `acceptance.png` ve `build/` altında source manifest/native bundle

İlk native denemede fixture'ın fill opacity'si yüzde yerine 1 kullanıldığı için
endpoint renk beklentisi düzeltilmiştir. İkinci denemede Escape, sparse ekleme
sonrası DOM'dan ayrılmış eski node'a gönderiliyordu; gerçek bağlı klavye hedefi
kullanılmıştır. Ürün hatası gizlemek için assertion kaldırılmamıştır; son kabul
renk ve cancel/undo invariant'larını korur. Üretim kodu ve harness bu son kabul
sonrasında değiştirilmemiştir.
