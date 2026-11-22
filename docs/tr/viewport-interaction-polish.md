# Viewport — pointer bırakma, durum çubuğu ve kompozisyon dışı düzenleme

## Kompozisyon ayarları ve kompakt kontroller — 15 Kasım 2026

Üst çubuktaki çözünürlük düğmesi mevcut `CompositionPresetModal` penceresini açar.
Boyut preset'i artık taslağı değiştirir; hemen uygulayıp pencereyi kapatmaz.
Genişlik/yükseklik (px), isteğe bağlı oran kilidi, boyut değiştirme, süre (saniye),
kesirli FPS ve hazır kare hızları, tahmini kare sayısı/ms-per-frame ile arka plan
rengi aynı pencerededir. Apply tek mevcut `Update Composition` history komutunu
kullanır; Cancel/Escape kaynağa yazmaz. Süre JSON'da ms olarak kalır. Mevcut
key/klip zamanları yeniden zamanlanmaz. Süre değişince seçili ana Timeline süresi
aynı komutta güncellenir; diğer Timeline süreleri korunur. İlgisiz kompozisyon
metadata'sı, gradient ve ses ayarları korunur. `compositionSettingsValid` UI ile
MCP preflight'in mevcut portable limitlerini ortaklaştırır (1–8192 px,
1–120 FPS, 0–3600 s); yeni serialized alan eklenmez.

Inside/Touching iki metin düğmesi yerine tek ikon switch'tir; tooltip, klavye ve
`aria-checked` davranışı mevcut bölge seçim sorgusuna bağlanır. Bağımsız Move,
Rotate, Scale snap ayarları ve açı etiketinin viewport koordinatları için
[viewport-snapping.md](viewport-snapping.md) belgesine bakın.

## Ortak seçim bölgesi stili — 15 Kasım 2026

Kutu/lasso/daire/paint, artık Select/Move/Rotate/Scale/Anchor'dan bağımsız bir
seçim tercihi. İlk açılışta **Box** seçilidir; B/L/O/W yalnız bölge stilini değiştirir,
etkin dönüşüm aracını değiştirmez. Pan veya çizim sırasında bu araçların
önceliği korunur. Eski `ToolMode = selection-*` çağrıları uyumluluk amacıyla
tanınır; uygulama `useToolMode.selectionStyle` ile ayrı UI state kullanır.
Bu tercih proje JSON'una veya Undo geçmişine yazılmaz.

Normal viewport pointer yönlendirmesi önce kontrol/gizmo/çizim/kamera/motion
sahiplerini, sonra nesne hit-test'ini değerlendirir. Mouse-down'da bir nesne varsa
normal seçim/taşıma başlar; fare sonradan boşluğa çıksa bile bölge seçimine
dönüşmez. Başlangıç boşsa seçili stile göre bölge oluşur; sonradan nesne üstüne
gelmek hareket sahibini değiştirmez. Aynı akış kompozisyon dışındaki boş çalışma
alanında da geçerlidir. 3 CSS px eşik click ile drag'i ayırır; boş click bırakılınca
seçim temizlenir. Shift/Ctrl/Cmd bölgeye ekler, Alt çıkarır; Inside/Touching
bütün normal araçlarda aynı sorguya bağlanır. Paint daima Touching kullanır.

`selectionGesture.ts` stil/modifier yönlendirmesinin saf sözleşmesi;
`layersInSelectionRegion` mevcut rectangle/circle/polygon/brush sorgularını
birleştiren adaptördür. `SelectionRegionSession` aynı `PointerGestureSession`
sahibini kullanır: capture, yabancı pointer, kayıp mouse-up, blur ve Escape için
ikinci bir native olay döngüsü kurulmaz. `useSelectionTools` yalnız React/viewport
adaptörüdür. Geçici seçim source transaction açmaz, Undo yazmaz; aynı kaynak,
gösterilen frame ve ayarlar pinlenir. Kaynak/frame/mod değişirse eski sorgu
uygulanmaz. Mouse-up son koordinatını tüm stillerde yeniden örnekler. Lasso
noktaları 3 CSS px aralıkla ve en çok 4.096 nokta ile sınırlıdır; sınırdan sonra
yalnız son nokta güncellenir. Bounds tabanlı seçim mevcut geometrik yaklaşımı
korur; painted-pixel/alpha contour seçimi eklenmemiştir.

`CanvasSelectionEligibility` gövde hit-test'i ile bütün bölge sorgularının ortak
frame filtresidir. Mevcut LayerIndex, solo alt ağaç ve inclusive authored-ms
aktivite kuralını kullanır. Gizli/kilitli/frozen/sıfır opacity veya zaman dışında
parent'ların çocukları da hedef olmaz. Bozuk parent zincirleri ve cycle'lar
güvenli biçimde elenir. Gizli yardımcı nesneler bölge başlangıcını engellemez;
Layer listesinden inceleme/seçim yine mümkündür. Sahne dışı proxy'ye tıklama da
aynı uygunluk kontrolünü kullanır. Kaynak/overrides değişmez; sorgu ömrüyle sınırlı
memoization eski sahneleri global cache'de tutmaz.

Doğrulama girişleri: `scripts/perf/viewport-interactions.mjs` dört stil, nesne
üstünden drag, dönüşüm modları, Pan, Inside/Touching ve Shift/Alt'ı gerçek
SceneCanvas/ToolGroup üzerinde dener. `scripts/perf/layer-selection.mjs` gerçek
EditorPage'de önceki seçim/Undo kabulünü ve 1280/1440/1920 px araç çubuğu
sığmasını denetler. İki araç da kullanıcının açık dosyası yerine ayrı QA
origin'i/sahnesi üzerinde çalışır.

Doğrulama: 400 dosya / 3.188 test, TypeScript, MCP ve production build geçti.
Native viewport kabulü 17 kontrol, gerçek EditorPage liste/Undo/responsive kabulü
7 kontrol geçti. Şekil seçimi source/history üretmez; nesne drag'leri tek Undo
ile geri alınır. Önceki parent/child, animasyon, pivot ve Escape kontrolleri aynı
viewport koşusunda korunur.

## Boş alan ve Escape ile seçim iptali — 15 Kasım 2026

Normal seçim/dönüştürme araçlarında boş kompozisyon pikseline veya tuvalin
çevresindeki boş çalışma alanına sol tıklama bütün katman/key seçimini kaldırır.
Pan, şekil çizme, motion editing, path pick, preview ve etkin transaction kendi
hareketlerini yönetir. Zoom/Snap/View/cetvel/guide kontrolleri ve sahne dışı nesne
çizgilerine tıklama yanlışlıkla deselect üretmez.

`canvas.select.clear` merkezî shortcut registry'de **Esc** olarak tanımlıdır.
Canvas/liste bağlamında seçimi kaldırır; form, menü, modal veya Timeline key
işleyicilerinin Escape sahipliğini geçersiz kılmaz. Etkin pointer session veya
marquee window capture aşamasında Escape'i tüketir: önce önizleme iptal olur ve
önceki seçim korunur. İkinci, boşta Escape normal seçimi kaldırır. Çizim aracı
ve motion route da önce kendi iptalini yapar; boşta motion seçim modunda Escape
motion düzenleyicisinden çıkar. Bunlar kaynak veya Undo yazan seçim işlemleri
değildir; iptal edilen drag mevcut transaction mekanizmasıyla geri alınır.

`scripts/perf/viewport-interactions.mjs` boş iç/dış alan, kontrol tıklaması,
Esc ve aktif drag/marquee iptalini gerçek SceneCanvas üzerinde test eder.
`scripts/perf/motion-key-interactions.mjs` motion drag iptali ve boşta çıkışın
key ID/zaman/değerlerini koruduğunu doğrular. Liste ve toplu işlem sözleşmesi
`docs/tr/layer-focus.md` içindedir.

## Responsive editör ve minimum ekran — 15 Kasım 2026

Editör için minimum kullanılabilir pencere **1280×720 CSS px** ve
`(any-pointer: fine)` gerekir. Karar cihaz adı/UA veya fiziksel ekran çözünürlüğü
ile verilmez. Büyük tablet haricî fare/trackpad ile bu koşulları sağlarsa açılabilir;
telefon, küçük tablet ve touch-only cihazlarda destek ekranı gösterilir. Bu
sınır yalnız editör içindir; web player, export veya kompozisyon boyutu değişmez.

`src/components/editorDisplay/displayPolicy.ts` tek eşik sahibidir.
`useEditorDisplay` SSR sırasında unknown döner; mount'ta viewport ve pointer
media query okunur. Resize tek rAF'a birleştirilir, pointer değişikliği aynı
sorguyu kullanır; cleanup listener ve bekleyen rAF'ı bırakır. Polling/kalıcı cihaz
tercihi veya kullanıcı tarafından kapatılamayan zoom kısıtlaması eklenmez.

`EditorDisplayBoundary` recovery/scene/renderer sahiplerini ilk uygun ekran
görülmeden mount etmez. Sonradan pencere küçülünce aynı subtree, oturum, key'ler,
Undo/Redo ve dock düzeni tutulur; son geçerli boyut dondurulur, DOM inert/hidden
olur. Native modal destek ekranı mevcut modal diyalogların üstüne çıkar ve
klavye/fare girişini engeller. Pencere büyüdüğünde sayfa yenilenmeden devam eder;
oynatma kendiliğinden yeniden başlamaz. Arka plan transport `usePlayback.enabled`
ile durur; main/detail source transaction'ları iptal edilir. SceneCanvas ortak
gesture ve guide sahiplerini normal hidden/disabled cleanup yolundan kapatır.
Devam eden geçici pointer önizlemesi source/history adımına dönüştürülmez.

Mevcut inert helper `components/ui/useInactiveSurface` içine çıkarılmıştır;
`useInactiveDetailSurface` eski import'ları compatible re-export ile sürer.
Destek ekranı scene JSON, recovery veya kayıtlı dock tercihini yazmaz.
Dar desktop'ta gereksiz sahne sayaçları gizlenir, araçlar tek satır kalır;
dock sekmeleri daraldığında yatay kaydırılır, isimler satıra bölünmez.

Native kabul: `node scripts/perf/editor-display.mjs <output>`; ardından mevcut
`scripts/perf/serve.mjs` ile `editor-display.html` açılır. Gerçek `EditorPage`
ayrı QA origin'inde iframe olarak çalışır. Telefon/tablet/desktop boyutları
iframe'ın gerçek CSS viewport'unu değiştirir; browser API veya source sahibi
mock'lanmaz. Test elle X değişikliği, kayıtlı JSON, oynatma duraklatma,
inert/keyboard engeli ve resize sonrası aynı source/Undo/Redo'yu denetler.

Doğrulama: 394 test dosyası / 3.168 test, display policy/SSR kontrolleri,
TypeScript, MCP derlemesi ve production build geçti. Gerçek editörde 11 native
kabul kontrolü geçti: 390×844, 320×568, 768×1024, 1024×768 ve 1280×600 engellenir;
1280×720, 1440×900 ve 1920×1080'de sayfa/üst araç çubuğu yatay taşmaz. Resize
sonrası JSON aynı kalır, tek adım Undo/Redo ve oturum geçmişi korunur, oynatma
durur. Gerçek touch-only donanım testi yapılmadı; fine-pointer yokluğu saf policy
testinde doğrulanır. 1280×720 bir minimumdur; geniş dock düzenleri daha büyük
bir çalışma alanından yararlanır.

## Viewport grid ayarları — 15 Kasım 2026

**View → Grid settings…** tek bir **Viewport settings** paneli açar. Görünürlük
ve **Grid on top of layers** yalnız bu paneldeki checkbox'lardan yönetilir;
View menüsünde yinelenen grid checkbox'ı veya ayrı dişli bulunmaz.
Görünürlük **Snap → Snap to Grid** davranışından bağımsızdır. **Grid spacing** alanı
1–10.000 kompozisyon pikseli kabul eder (kesirli piksel desteklenir). Aynı
aralık ana viewport Snap menüsünde kullanılır. Dock Snap paneli kaldırılmıştır. Geçersiz/boş giriş son geçerli
aralığı değiştirmez; odak ayrıldığında geçerli değer geri gelir.

Önceden `gridInFront` yalnız `SceneCanvas` yerel state'inde kalıyordu ve renderer'a
ulaşmıyordu. Artık `CanvasRendererOptions.gridVisible/gridInFront`, viewport
adapter'ından `CanvasRenderOptions.grid.inFront` seçeneğine iletilir. Arka
ızgara kompozisyon arka planından sonra, katmanlardan önce çizilir; opak katman
ızgarayı örter. Ön ızgara katmanlardan sonra çizilir. Mevcut doğrudan renderer
çağrılarında `inFront` verilmezse önceki önde çizim davranışı korunur.

Sahne geometrisi, seri hale getirilen proje ve Undo geçmişi değişmez. Görünürlük,
aralık ve üstte çizim tercihi origin'e özel `chorono.viewport-grid.v1` localStorage
kaydına yazılır, sayfa yenilendiğinde geri yüklenir. React hydration tamamlanmadan
varsayılanlar depoya yazılmaz. Bozuk/sürümü bilinmeyen alanlar doğrulanır; erişimi
engellenen depoda mevcut oturum bellek içindeki ayarlarla çalışır.
Preview/playback ve export `preview` render
moduyla ızgarayı bastırır. Raster export viewport seçeneklerini taşımaz.
Paylaşılan aralık doğrulaması `src/lib/snap/gridSettings.ts`, ayar UI'sı
`src/components/canvas/controls/ViewportGridSettings.tsx` içindedir. Ayarlar
Escape/dış tıkla kapanır; Escape ayar satırına odağı geri verir. Yeni render döngüsü,
ızgara katmanı, texture veya framebuffer önbelleği oluşturulmaz.

Kabul senaryosu gerçek `SceneCanvas` üzerinde snapping kapalıyken görünürlük,
opak katmanın önünde/arkasında piksel farkı, 40 px aralık, geçersiz giriş,
klavye odağı, ortak Snap aralığı ve grid açıkken temiz preview/PNG çıktısını
denetler. Kullanıcının açık sahnesi yerine izole fixture kullanılır.

Çoklu Snap hedefleri, mouse yakalama ve kaynak/hiyerarşi sözleşmesi
[viewport snapping](viewport-snapping.md) belgesinde açıklanır.

9 Kasım 2026. V5/ölçü-guide sonrasındaki kullanıcı düzeltmeleri. Aktif çalışma
alanı 2D'dir; bu dilim yeni bir renderer veya export profili eklemez.

## Pointer-up sahipliği

Pan sonrası ilk source bırakışındaki geri sıçrama için sonraki ayrıntılı
düzeltme ve before/after kanıtı [ortak pointer yaşam döngüsünde](pointer-gesture-lifecycle.md)
belgelenmiştir. Native capture/listener sahipliği artık oradaki
`PointerGestureSession`'a devredilir; bu belgedeki eski bubble-up karşılaştırması
önceki kabulün tarihsel kaydıdır.

Nesne, guide ve viewport motion key araçlarının ortak sahibi
`src/components/canvas/interactions/EditorPointerSession.ts`'tir. Eski dinleyici
`window` üzerinde bubble aşamasında pointer-up bekliyordu. Alt bir UI öğesi
olayı durdurursa oturum release'i göremiyor; ardından implicit
`lostpointercapture`, önizlemeyi iptal edip kaynağa geri döndürebiliyordu.

Pointer-up ve pointer-cancel artık capture aşamasında izlenir; teardown aynı
capture seçeneğiyle dinleyicileri kaldırır. Son pointer örneği aynı immutable
baseline üzerinden hesaplanır, komut bir kez uygulanır ve capture bırakılır.
Sonraki lost-capture/late-up kapalı oturumu tekrar commit veya rollback yapmaz.
Escape, blur, gerçek iptal ve stale source/document korumaları değişmez.

Body, dış alan proxy'si ve guide, kalıcı native canvas'ı capture eder. Seçim
çerçevesi veya guide hit öğesi yeniden oluşsa veya nesne kompozisyon içine
dönerken proxy kalksa bile hareketin capture sahibi kaybolmaz.

Tanı için hazırlanan dört daireli 360×240 sahne, global 1200 ms / 600 ms timeline
ve gerçek PropertiesPanel kullanır. Kontrol deneyi, yalnız dört terminal-event
dinleyicisini eski bubble davranışına çeviren bundle ile aynı sahneyi çalıştırır.
Target/viewport üstünde tek pointer-up tüketildiğinde eski kodda nesne
55/40'a geri dönüp undo üretmez; yeni kodda gerçek trusted fare hareketi
95/65'e commit olur. Aynı kontrollü koşulda eski guide oluşturma geri alınır,
yeni kod x=180 guide'ı korur. Kullanıcının canlı sekmesindeki belirli tüketici
handler'ı incelenmiş sayılmaz; kanıt bu olay sırasının aynı belirtiyi üretip
ortak düzeltmeyle giderildiğidir.

## Durum çubuğu, imleç ve canvas görünümü

`ViewportStatusBar` artık artboard'un içine bindirilmez. `SceneCanvas` normal
akışında interaktif viewport ile kardeş, **32 CSS px** ayrılmış footer'dır.
Seçim adı/sayısı, araç ve çoklu seçim Pivot kontrolünü taşır. Boş seçim,
playback ve preview sırasında yüksekliği sabit kalır; ilk seçim artboard'u
yerinden oynatmaz. Kontrol olayları katman seçimine veya global kısayollara
taşmaz; native select klavye davranışı korunur.

Cetvel imleç çizgilerinin kesişimine **12×12 CSS px** halka/nokta eklendi.
`CanvasGuideWorkspace` aynı committed DOM rect eşlemesini kullanır. Pan/zoom
boyutunu değiştirmez; point/çizgiler pointer-transparent ve dekoratiftir.
Pointer leave veya kapalı cetvel/playback/preview modunda kaldırılır. Sadece
pointer/resize invalidation'ı vardır; idle polling veya ikinci render loop yoktur.

Artboard çerçevesinin CSS gölgesi hafifletildi. Gölge, nokta ve footer yalnız
editör DOM chrome'udur; canvas renderer, ordinary scene JSON, undo veya raster
export'a eklenmez.

Sonraki yerleştirme diliminde nesne üstündeki seçim imleci `crosshair` (`+`)
oldu. Pan ve resize/rotate handle politikaları korunur. Layer → Add temel
şekilleri artık mouse-down/drag/up ile oluşturur; kapsam ve kaynak sahipliği
[fareyle yerleştirme sözleşmesinde](shape-placement.md) açıklanır.

## Kompozisyon dışındaki nesneler

Nesneler beyaz kompozisyonun dört kenarından dışarı taşınabilir; body drag'deki
zorunlu `clampDelta` kaldırıldı. Aynı prepared root transform, parent inverse,
snap, key-command ve tek undo yolu kullanılır. Negatif konumlar zaten kaynak
formatının parçasıdır; yeni serialized layer veya z alanı eklenmez. Group/child
ve animasyon kayıtları korunur.

`OffArtboardOverlay`, dışarıdaki nesneleri **kesikli AABB sınır proxy'si** ile
gösterir ve dış alandan seçip geri taşımayı sağlar. Bu görünüm gerçek polygon
konturu veya sahne nesnesinin dışarıda dolu boyaması değildir. SVG even-odd clip
kompozisyon içini hem çizimden hem proxy hit-test'inden çıkarır; normal canvas
görüntüsü içeride aynı kalır. Pan ve clone modifier politikaları korunur.
Seçim sınırı kısmen/tamamen dışarıdaysa tüm selection border'ı da kesikli olur;
resize/rotate handles etkileşimli kalır.

Hazırlık `src/lib/canvas/math/offArtboardOutlines.ts` içindedir. Mevcut geometry
bounds resolver, LayerIndex ve Bounds tekrar kullanılır. Önce seçili ID'ler,
sonra üstten alta bağımsız root'lar incelenir; group içindeki her child ikinci
bir hit proxy oluşturmaz. Explicit seçilmiş child önceliğini korur.
`isOffArtboardBounds` dört kenardaki aynı finite geometri kuralını paylaşır.
Tam kenar teması içeridedir. Stroke/efekt taşması geometri sınırı değildir.

Bir immutable edit frame'inde en fazla **512 bounds sorgusu / 256 proxy**
hazırlanır; görünen work-area dışında proxy tutulmaz. Limit görünür bir tanıdır;
Layers'dan seçmek ilgili nesnenin önceliğini yükseltir. Bu sınır mevcut group
bounds sorgusunun recursive child maliyetini ayrıca sınırlamaz. DOM/GPU handle
veya uzun ömürlü frame cache'i scene/undo'ya girmez. Playback/preview sırasında
bu editor proxy hazırlığı kapalıdır.

Final görüntü yüzeyi hâlâ composition boyutundadır. Tam dışarıdaki nesne çıktı
üretmez; kenarı aşan nesnenin yalnız içerideki kısmı görünür. Export motoruna
viewport/point/proxy/shadow/footer seçenekleri geçirilmez. Portable/editable
JSON negatif koordinatları korur.

## Girişler ve doğrulama

| Sahip | Sorumluluk |
| --- | --- |
| `EditorPointerSession` | Tek pointer, transaction ve terminal-event/cancel sahipliği |
| `useCanvasGuideEditing` | Guide kaynak komutları ve kalıcı canvas capture adapter'ı |
| `ViewportStatusBar` | Normal akışta sabit footer ve Pivot kontrolü |
| `CanvasGuideWorkspace` | Cetvel çizgileri ve dekoratif point |
| `offArtboardOutlines` | Bounded dış sınır hazırlığı / ortak sınıflandırma |
| `OffArtboardOverlay` | Dış alan clip, kesikli proxy ve native selection/drag adapter'ı |
| `previewTransformDrag` | Clamp olmadan aynı world/parent translation ve snap |

Test girişi `scripts/perf/layout-interactions.mjs`; ayrı QA sayfasındaki
**Open first-drag fixture**, **Open main-style fixture** ve
**Consume next pointer-up bubble** tanı kontrolleridir. Bunlar ürün UI'sine
ve MCP API'sine eklenmez. Raw pointer/source/document/transaction kayıtları
yalnız fixture'da tutulur. Synthetic native event kontrolleri ile gerçek
trusted fare kontrollerinin kapsamı ayrı kaydedilir.

Derleme öncesi Next durdurulur. `npm test`, `npm run mcp:build`, `npm run build`
ve gerçek rendered/pointer kabulü gerekir. Bu dilim tam V6, E−1 ortak düzenleme
kabulü veya yeni Four Seasons kaynak benchmark'ı değildir.

9 Kasım kabulü: **296 dosya / 2311 test**, whole-project TypeScript, MCP ve
production build geçti. Chrome 156/DPR 1'de son kaynaklarla viewport polish
**18/18**, Array **15/15**, clone **14/14**, motion/viewport **13/13** geçti.
Dört source/bundle/CSS manifest'i diskle karşılaştırıldı. 18. kontrol gerçek
PNG encode/decode yaparak 360×240 kompozisyon kırpmasını, içerideki renkleri,
dışarıdaki nesnenin ve editor chrome'un çıktıdan yokluğunu kontrol eder;
portable JSON negatif transform ve guide verisini korur.

Trusted fareyle kontrollü consumed-up karşılaştırmasına ek olarak nesne
x=95→−80 taşındı; dış SVG proxy'sinden ilk sürüklemede x=55'e geri alındı.
Son görsel kanıt, tekrar seçim olmadan ilk harekette x=55→−80 taşımasını,
kesikli sınırı, point, hafif gölge ve artboard dışındaki footer'ı gösterir.
Source/history/selection ve açık transaction olmaması ayrı doğrulandı.

Yerel kanıtlar `artifacts/performance/viewport-polish-20261109/` altında
`verification.json`, dört `*-acceptance.json`, raw AX/trusted pointer kayıtları,
`regressions/`, `build/` ve `acceptance.png`'dir. Eski bubble davranışının
beklenen başarısızlığı `artifacts/performance/pointer-release-before-20261109/`
altında before-source snapshot, bundle/manifest, raw native ve fiziksel fare
raporlarıyla tutulur. Bunlar üretilen yerel QA dosyalarıdır ve git'e alınmaz.

## Kompozisyon ve dönüşüm kontrol kabulü — 15 Kasım 2026

Bu ek dilimde 402 dosyada 3.204 test, TypeScript, MCP build ve Next production
build geçti. Native viewport 18, çizim/grid 43, tam EditorPage 8 kontrolü geçti.
Kompozisyon preset'i Cancel ile kaynağı değiştirmez; Apply süre/FPS/boyutları
bir Undo/Redo ile değiştirir ve mevcut layers/timelines verisini korur.
Dönüşüm testi Move kapalıyken 45° rotasyonu ve %10 scale adımını gerçek ring/gizmo
üzerinden doğrular; açı HUD'u viewport içinde ve halkaya yakın kalır. Görünmez
grid hedefi açık editörde disabled görünür; engine testi görünürlüğün geri
gelmesiyle saklanan grid hedefinin tekrar kullanılmasını doğrular.

Tekrar çalıştırma: `npm test`, `npx tsc --noEmit`, `npm run mcp:build`,
`npm run build`; Next kapalıyken `scripts/perf/viewport-interactions.mjs`,
`scripts/perf/shape-placement.mjs`, `scripts/perf/layer-selection.mjs` fixture'larını
hazırlayıp her birinin Run düğmesini ayrı yerel QA origin'inde çalıştırın.


## Kompozisyon → aktif Timeline süresi / FPS — 15 Kasım 2026

`makeUpdateCompositionCmd` (`src/lib/editor/commands-composition.ts`) ortak
ayar komutudur. Ana editörün modalı ve Properties kompozisyon süresi alanı aktif
Timeline ID'sini açıkça iletir. Kompozisyon süresi değiştiğinde yalnız bu
Timeline'ın `durationMs` değeri yeni süre olur. FPS/renk/boyut değişikliği tek
başına daha önce özelleştirilmiş Timeline süresini ezmez. Diğer Timeline'lar,
özel model klipleri, key/track/marker/event/segment/work-area verisi korunur.
Kısaltılan aralığın dışındaki key'ler silinmez veya aralığa taşınmaz; süreyi
uzatınca erişilir. Work Area ve First-to-last-key oynatma tercihleri ayrıca
kendi aralıklarını kullanmaya devam eder. Undo/Redo bütün ayarı tek adımda geri
alır; normal snapshot/authoring/recovery hattı kullanılır. Timeline yoksa
kendiliğinden bir Timeline yaratılmaz; sonraki yeni Timeline bu süreyi kullanır.

Timeline ayrı bir FPS alanı taşımaz; kompozisyon FPS'i navigasyon, frame snap,
ghost aralığı, frame numarası ve varsayılan sequence export örneklemesine gider.
Araç çubuğundaki FPS yazısı bu ortak kaynağı gösterir. Key'ler ms cinsindedir:
0 ms X=0 → 1000 ms X=1000 lineer hareketinde 500 ms X=500 kalır. 30 FPS'te
kare adımı 33,333… ms; 60 FPS'te 16,666… ms olur. Eğrinin hızı veya toplam
süresi değişmez. Canlı rAF önizlemesi ekranın yenileme hızında çizilebilir;
kompozisyon FPS'ine zorla kuantize edilmez. Export gerçek kareleri i×1000/FPS
zamanlarında örnekler, eksik key ekleme veya anahtar zamanını frame'e yuvarlama
yapılmaz. Easing, expression/controller ve simülasyonların kendi zaman
sözleşmeleri bu ayarla değiştirilmez.

AI/MCP `update_composition` eski metadata-only sözleşmesini korur: aktif UI
Timeline seçimi taşımayan çağrı diğer animasyonları değiştirmez. Bir Timeline'ı
ayrıca düzenlemek için var olan `update_timeline` kullanılır. Şema/JSON göçü yok.

Doğrulama: 403 dosyada 3.213 test, TypeScript, MCP ve production build geçti.
Tam EditorPage native kabulünde 10 kontrol geçti: aktif süre senkronizasyonu,
29,97 → 60 FPS frame adımı, yeni Timeline varsayılanı, aynı source key verisi ve
tek Undo/Redo. QA tekrarlanırken kaydedilmiş dock tercihi gerçek panel gesture'ı
ile Layers'a alınır; test setup'ı önceki çalışmanın aktif sekmesine bağımlı
kalmaz. Kullanıcının açık oturumundaki dört katman ve 50 Undo adımı yenileme
sonrasında korundu; test sahne değişiklikleri ayrı QA origin'inde yapıldı.
