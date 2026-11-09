# Viewport — pointer bırakma, durum çubuğu ve kompozisyon dışı düzenleme

9 Kasım 2026. V5/ölçü-guide sonrasındaki kullanıcı düzeltmeleri. Aktif çalışma
alanı 2D'dir; bu dilim yeni bir renderer veya export profili eklemez.

## Pointer-up sahipliği

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
