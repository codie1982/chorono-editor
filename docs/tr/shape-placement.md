# Layer Add — fareyle şekil yerleştirme

9 Kasım 2026. Layer → Add menüsündeki mevcut **14 Basic Shape**, sabit bir
konuma eklenmek yerine sürekli çizim aracını etkinleştirir.
Rectangle, Rounded Rect, Circle, Ellipse, Line, Arrow, Polygon, Star, Ring, Arc,
Capsule, Blob, Spiral ve Wave desteklenir. Yeni bir katman türü veya dosya
formatı eklenmez. Text, medya dosya seçicileri, Path/Pen ve mevcut Spline
oluşturma akışları bu araçla boyutlandırılmaz.

## Kullanım ve geometri sözleşmesi

1. Layer → Add → şekil seçilir. Kaynak/history değişmez; imleç `crosshair` (`+`)
   olur. Alt durum çubuğu yerleştirme yönergesini gösterir.
2. Primary pointer-down yalnız başlangıcı belirler; varsayılan boyutlu nesne
   göstermez. **3 CSS px** üzerindeki sürükleme aynı factory ID'siyle canlı
   önizleme üretir; durum çubuğunda nominal en/boy görünür. Yardımcı
   kesikli geometri sınırı kompozisyon dışında da görülebilir.
3. Pointer-up son koordinatı yeniden örnekler, tek Add komutunu commit eder,
   yeni şekli seçer. Araç aynı türün yeni, benzersiz ID'li template'iyle açık
   kalır; yeniden Add seçmeden tekrar çizilebilir. Her şekil ayrı tek Undo'dur.
4. En fazla **3 CSS px** hareket tıklama kabul edilir: factory boyutu korunur,
   konum tıklanan noktadan alınır; bu geometri yalnız mouse-up'ta eklenir.
   Esc hem bekleyen aracı hem aktif çizimi iptal eder. Tuvalde veya etrafındaki
   çalışma alanında sağ tık çizim aracından çıkar. Layer → Add menüsünde aktif
   şekli tekrar seçmek de aracı kapatır; menü aktif şekli işaretler.
   Açıkça başka araç seçmek o aracı
   korur; iptal callback'i seçimi zorla Select'e döndürmez.

Kapalı şekillerde ters sürükleme pozitif en/boy ve normalize başlangıç üretir;
en küçük kenar 1 kompozisyon pikselidir. Circle ve renderer'ı dairesel geometri
kullanan Polygon/Star/Ring/Arc/Spiral/Blob büyük sürükleme kenarından kare boyut
alır. Bu nedenle dairesel şeklin nominal kutusu her zaman mouse-up noktasında
bitmeyebilir. Ellipse serbest en/boy kullanır. Shift diğer kapalı şekilleri de
kareye kısıtlar; Line/Arrow açısını en yakın 45 dereceye getirir.

Line/Arrow başlangıcı pointer-down'dır; `shapeParams.x2/y2` işaretli farkı
korur. Böylece ters sürüklemede okun yönü değişmez. Star/Ring yarıçapları,
Spiral yarıçapları ve Wave genliği yeni boyuta göre ölçeklenir; stroke,
cornerRadius ve arrowheadLength stil değerleri olarak kalır. Blob gürültüsü
mevcut converter'da nominal boyutun dışına taşabilir.

Koordinatlar kompozisyon pikselidir. `canvasPointerWorld` native canvas'ın
güncel DOM rect/backing-size oranını kullanır; pan/zoom buna dahildir, DPR
ikinci kez uygulanmaz. Başlangıç/bitiş artboard'a clamp edilmez. Final render
mevcut kompozisyon boyutunda kırpılır. Yeni şekil root'tur; mevcut parent/child
bağları ve timeline kayıtları değiştirilmez.

## Sahiplik ve girişler

| Modül | Sorumluluk |
| --- | --- |
| `src/app/page.tsx` | Registry default'unu oluşturma, uygun şekli araca verme, tamamlanınca seçim |
| `src/lib/editor/placement/index.ts` | Public `canPlaceShape`, `placeShapeInGesture`, seçenek tipi |
| `shapePlacement.ts` | React/browser bağımsız immutable boyut/endpoint/parametre hesabı |
| `ShapePlacementSession` | `EditorPointerSession` üzerinden native pointer + Add komutu adapter'ı |
| `useShapePlacement` | Bekleyen araç, draft, belge/araç/unmount temizliği |
| `useShapeCreationTool` | Sürekli çizim, menü kind toggle, her commit'te fresh factory ID, ortak UI kontrolü |
| `ShapePlacementOutline`, `ViewportStatusBar` | Kaynaktan bağımsız çizim sınırı ve yönlendirme UI'si |

Minimal saf kullanım:

```ts
import { newRectLayer } from '@/lib/defaults'
import { placeShapeInGesture } from '@/lib/editor/placement'

const layer = placeShapeInGesture(newRectLayer(),
  { x: 90, y: 70 }, { x: 290, y: 190 })
// layer.transform: x=90,y=70; layer.size: 200×120; unit scale, merkez pivot.
// Kalıcı ekleme için mevcut makeAddLayerCmd(layer) kullanılır.
```

Template ve tekrar oluşturma factory'si yalnız UI belleğinde tutulur. Hareket
başlarken tek editor transaction açılır; eşik aşılmadan kaynak/draft aynı kalır.
Preview normal renderer'a ordinary source layer verir, history'ye yeni
adım eklemez. Commit baseline üzerinde tek Add komutudur. Runtime pointer,
canvas handle, draft UI veya listener project JSON'a eklenmez. Mevcut portable
source, clone, bounds, inspector ve renderer katman sözleşmeleri kullanılır.

Capture hedefi kalıcı canvas'tır; mouse-up/cancel window capture aşamasında
izlenir. Başka bir UI bubble olayını tüketse de release tamamlanır. Escape,
blur, gerçek lost-capture, belge değişimi ve farklı source shared pointer
sahibinin mevcut iptal politikasını kullanır. Ara edit sırasında source
değişmişse üzerine eski baseline yazılmaz; shared owner mevcut kaynağı koruyup
tanı verir. Bu durum başka editin kendi içine aldığı preview'ı otomatik ayıklama
işlemi değildir. Listener/capture her terminal durumda bırakılır.

Yerleştirme sırasında eski seçimin transform/motion/path/off-artboard hit
araçları ve guide düzenleme devre dışıdır; çizimle yarışan gesture başlamaz.
Nesne üstündeki normal seçim imleci de `+` olur. Pan'ın `grab/grabbing` ve
resize/rotate handle'larının kendi imleçleri korunur.

## Doğrulama

Saf domain ve session testleri ters/negatif koordinatlar, click varsayılanları,
Shift, signed line/arrow world endpoint'leri, parametre ölçeği, kimlik/stil
korunması, invalid giriş, pan/zoom dönüşümü, tek undo, foreign pointer,
Esc/stale edit/belge resetini kapsar. Tam suite **298 dosya / 2336 test** geçti.
TypeScript, MCP build ve production build de doğrulandı.

Native QA:

```sh
node scripts/perf/shape-placement.mjs artifacts/performance/shape-placement-20261109/repeat-build
node scripts/perf/serve.mjs artifacts/performance/shape-placement-20261109/repeat-build 4342
```

`/shape-placement.html` → **Run placement checks** gerçek LayerPanel Add,
SceneCanvas, assets, editor/history, ortak `useShapeCreationTool`, geometri ve
portable source ile **19/19**
kontrolü çalıştırdı. Render edilen piksel, son up koordinatı, tek Undo/Redo,
Esc, ters/Shift/Arrow, dış alana bırakma, tüketilen bubble-up, crosshair,
varsayılan boyut flash'ının yokluğu, tekrar çizim/farklı ID/ayrı undo,
aynı Add seçimiyle toggle ve her iki sağ tık alanı kontrol edilir.
**Open editable placement fixture** gerçek
trusted fareyle ayrı kontrol içindir; kullanıcı belgesi değiştirilmez.

Yerel üretilen kanıtlar `artifacts/performance/shape-placement-20261109/` altındadır;
build kaynak/hash manifest'i, `acceptance.json`, trusted release AX kaydı ve
görüntü git'e alınmaz. Tek kullanımlık ilk sürümün `build/` ve sürekli çizim
sürümünün `repeat-build/` kanıtları ayrı tutulur. QA bundle otomatik kontrollerde synthetic PointerEvent
kullanır; fiziksel fare kabulü ayrıca raporlanır.

Güncel production ana editörde trusted fareyle tek Add seçiminden sonra iki
dikdörtgen art arda çizildi: ilk bırakıştan sonra footer `Place Rect 2`,
ikinci bırakıştan sonra kaynakta iki ayrı katman vardı. Sağ tık aracı Select'e
döndürdü. Bir Undo iki katmanı bire, Redo tekrar ikiye getirdi. Add Rectangle
aktifken menü `aria-pressed=true` verdi; aynı düğmeye tekrar basmak çizimi
kapattı. Raw AX kayıtları `repeat-main-*.ax.txt`, final görünüm
`continuous-drawing.png` altındadır. Önceki QA penceresine gelen ek manuel
düzenlemeler ayrı JSON'da korundu; bunlar güncel tekrar çizim kabulüne sayılmaz.
