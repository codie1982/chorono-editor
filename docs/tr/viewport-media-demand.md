# Kare talebi, medya pin'leri ve klip kimliği

OPT16 ana editörü eager image/video yüklemesinden renderer frame demand yoluna
taşır. Bu mevcut 2D kaynak yönetimidir; Export E0/parity veya yeni format işi
başlatılmaz. Font/GPU owner'ları ve genel ağır iş/uzun editör kabulü açık kalır.

## Girişler ve veri akışı

- `render/prepareRenderFrame.ts`: drawing ve media aynı canonical evaluator,
  instance çözümlemesi, typed property clamp ve LayerIndex snapshot'ını kullanır.
- `render/visibility/LayerDrawVisibility.ts`: root solo/mask/guide ve authored
  inclusive ms görünürlük kapısı. Nested çağrılar root solo'yu tekrar uygulamaz.
- `render/visibility/paintOutsideArea.ts`: actual paint ile demand için tek
  konservatif affine AABB hesabı. Singular/nonfinite/belirsiz sınır korunur.
- `render/media/VisualDemandResolver.ts`: evaluated frame dependency closure,
  media descriptors ve warm adaylar; DOM/decoder lifecycle'ı başlatmaz.
- `render/media/VisualMediaSession.ts`: bir viewport/player/final job'ın consumer
  pin'leri, demand diff, bounded submission ve stale identity kontrolü.
- `asset/visual/AssetElementMap.ts`: legacy Map sözleşmesi + optional managed
  frame bridge ve clip-specific lookup. Eski renderer.ts type import'u korunur.
- `useAssetCache(assets, {managed:true})`: ana editörün owner/React adapter'ı.
  Kaynak hazır olunca mevcut viewport scheduler'ı yeniden çizim planlar.
- `render/media/withMediaFrame.ts`: bağımsız full-composition final/preview
  pin'leri ve native video seek readiness. Viewport Map'i async işin sahibi olmaz.

Akış: CanvasRenderer canonical frame → session demand closure/diff → shared
VisualAssetService acquire → native completion → host invalidate → newest-frame
draw. RenderSingleLayer/ghost temporal roots mevcut frame demand'ine eklenir.
Layer metadata/state/animation/audio değerlendirmesi kaynak eviction ile durmaz;
scene veya undo'ya visibility/cache mutation yazılmaz.

## Görünürlük, dependency ve prefetch

Canvas viewport alanı backing pixels cinsindedir. `drawViewportFrame`, gerçek
CSS canvas/clip rectangle'larından pan/zoom'u okur; **128 CSS px** prefetch payını
aynı backing uzaya çevirir. Bu pay yalnız preparation'ı büyütür; actual paint
clipping veya çıktı crop'unu değiştirmez. Selection ve bound belirsizliği korunur.

Known direct paint, renderer plugin'in kendi local bounds ve aynı world matrix
hesabıyla elenir. Mask/effect/motion blur ve repeater kaynakları belirsiz bounds
nedeniyle konservatif kalır. Mask kaynağının standalone hidden/time gate'i,
actual surface pipeline gibi bypass edilir. Repeater kaynağı kopya uzayında
kullanılabileceği için kendi standalone kutusuna göre atılmaz. Group child,
instance ve sprite-sheet aynı evaluated layer kimliklerinden bulunur.

`LayerRendererPlugin.mediaDependencies` opt-in complete direct asset/layer
referans sözleşmesidir. Empty list media erişimi olmadığını kanıtlar; bilinmeyen
custom plugin bütün visual metadata'yı korur. Bu fallback sınırlı bellekte açık
admission hatası üretebilir; eksik kaynağı görünmez sayarak başarı sunmaz.
Custom plugin yeni media/source erişimi eklerse bu sözleşmeyi güncellemelidir.

**500 composition ms** lookahead imminently active ve potansiyel hareketli
adayları warm tutar. Hareketli adayın future spatial enclosure'ı konservatif
unknown'dır; her statik ekran dışı kaynak sırf aktif diye yüklenmez. Bu çözümleyici
SM/runtime'ı ikinci kez ilerletmez veya keyframe değerlendirmesini daraltmaz.
Future runtime state/asset binding'in tam öngörüsü garanti edilmez; actual frame
yeniden değerlendirilir. Görsel preview'da cold kaynak hazır olana kadar bekleme
olabilir. Final exact time için required kaynaklar await edilir.

Sesli video spatial kutudan bağımsız resident kalır. Sessiz/muted ekran dışı video
talebi bittiğinde pause/release edilir. AudioEngine kendi audible-window owner'ını
kullanmaya devam eder; video ve görsel culling audio PCM'i durdurmaz.

## Native sahiplik ve Map uyumluluğu

Session aynı source/clip key'ini tekrar acquire etmez. Hafif queued demand scene
boyutuyla sınırlıdır; session aynı anda en fazla iki consumer request gönderir.
Gerçek native queue 2/128 ve byte admission hâlâ ortak VisualAssetService'tedir.
Bu yüzden görünür yüzlerce küçük kaynak sırf 128 queue kapasitesi yüzünden topluca
reject edilmez; metadata kuyruğundan sırayla işlenir. Budget/native error sabit
frame'de retry render loop'u yaratmaz; working set değişimi veya explicit retry
yeni deneme yapabilir. Aktif çalışma kümesi bütçeye sığmıyorsa hata paneldedir.

Warm prefetch tamamlanınca consumer pin'i bırakılır. Cache en fazla 2s grace ile
reclaimable kalır; pressure grace beklemeden çıkarabilir. Warm descriptor aynı
frame'de tekrar decode istemez. Actual frame promotion yeni pin acquire eder;
pressure kaynağı çıkardıysa yeniden yükler. Böylece warm adaylar aktif görünür
çalışma kümesiyle aynı şekilde süresiz protected tutulmaz.

MediaElementSnapshot Map'i **borrowed view**'dır. Bir eski RAF snapshot'ı source
replacement/drop sonrasında native element'i get/videoForLayer ile alamaz.
Eski Map'i saklamak async pin değildir; element iteration diagnostic compatibility
içindir. Başka consumer/export/player ayrı session veya lease alır.

Image/sheet asset ID alias'ları aynı URL allocation'ını paylaşır. Video lookup
asset ID yerine layer/clip ID kullanır; scope process-local session kimliğiyle
ayrılır. Aynı kaynaklı iki klip farklı native saatlerde oynayabilir. Legacy plain
Map ve default `useAssetCache(assets)` explicit all-assets mode korunur; bu mode
frame bridge yayınlamaz. Eski hazır element alan host'un caller-owned lifetime'ı
managed residency garantisi diye sunulmaz.

`syncVideoFrame` composition ms → native seconds, offset/native duration/loop ve
animated mute/volume uygular. Paused aynı kare tekrar seek edilmez; seeked event
owner'ı bir kez invalidate eder. Playback eski 50ms drift eşiğini korur. Kaynak
bırakılmadan önce consumer'ın videosu pause edilir; idle element ses üretmez.

## Player ve final işler

CanvasRenderAdapter kendi media session'ına sahiptir; viewport cache güncellemesi
ChoronoView player clock/SM'ini reset etmez. Resource completion yalnız son render
snapshot'ını tekrar çizer, event/evaluator tick'i üretmez. Adapter destroy/replace
pin/redraw cleanup yapar. RenderAdapter dispose opsiyonu eski backend structural
caller'larını bozmaz. SDK canvas video preview evaluated kareye seek eder; native
video/audio transport kabulü bütün runtime/player kapsamıyla henüz tamamlanmadı.

MCP render_preview ve raster tam composition demand'ini bekler, her klip için
native seeked hazır olmadan encode etmez. Sequence tek job session'ı yeniden
kullanır; her kare için yeni decoder scope'u açmaz. Callback/encode settlement'e
kadar pin'ler korunur. Missing referenced metadata, decode veya required admission
failure başarılı boş görüntü yerine hata verir. Viewport pan/zoom'u final'a geçmez.
Bu adapter'lar resource lifetime içindir; output kalite/FP16/scale/blur parity,
encoded ZIP peak ve bütün job iptali bu teslimde çözülmez.

```ts
import { withMediaFrame } from '@/lib/render/media/withMediaFrame'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'

await withMediaFrame(scene, timeMs, context, { overrides }, async (assets, values) => {
  canvasRenderer.render(context, scene, timeMs, null, assets, {
    renderMode: 'preview', overrides: values,
  })
  await encodeOutput(context.canvas) // pin'ler encode bitene kadar yaşar
})
```

scene/time/context/overrides ve encodeOutput caller girdileridir. Örnek gerçek
public module yollarını gösterir; yeni authoring/MCP metodu tanımlamaz.

Font registration useAssetCache içinde eski lifetime yolundadır; decoded font
budget ve viewport kapanırken font ölçüm/final job pin'leri ayrı açık iştir.
Browser internal decoder kopyaları, source-file byte'ları, GPU driver texture'ları
ve fiziksel RSS final RGBA charge'ıyla aynı şey değildir.

## Panel, kabul ve devir

Managed media inventory ready/loading/error/not-resident ayrımını gösterir.
Visual hazırlık queue, local charge/limit, protected/reclaimable, pending ve failed
cleanup sayıları eklenmiştir. Global managed Map'te known estimate warm/retired
image/video owner byte'larını bir kez içerir; legacy foreign Map eski partial
element estimate'ini korur. Media list current project viewport view, visual
owner total editor-session kapsamıdır; birbiriyle toplanmaz.

[OPT16 ham kanıtı](../../artifacts/performance/opt16-viewport-media-20261107/README.md):
gerçek managed hooks/CSS pan/native PNG-WebM ile **14/14** kontrol. 3.001 geçerli
kaynakta ilk görünüm iki image + iki clip decode (**16 KiB frame estimate**), pan
iki yeni image; pan sonrası inventory 1 ready / 3.000 cold. İlk 16 KiB'ın 12 KiB'ı
protected, 4 KiB'ı warm/reclaimable'dır. Viewport ve bağımsız gerçek raster
çıktısında iki native video karesi exact pixel eşliğiyle doğrulandı. Viewport
kapanırken held final pin'leri yaşadı; son consumer/encode sonrası visual charge 0.

200 dosya / **1.763 test**, TypeScript/MCP/Next build geçti. Four Seasons aynı
512 MiB known guard / 768 MiB heap guard ve arşiv OPT11 referansı ile raporlanır;
bu renderer-only sparse test whole-editor/OS RAM kabulünün yerine geçmez.
GPU/font ownership, compressed/output preflight, kalan worker/IO backpressure ve
cancel, uzun bütün editör play/seek/pan/zoom/undo/project-switch/panel maliyeti
açıktır. 37 GB root cause ve Export E0 tamamlandı sayılmaz.
