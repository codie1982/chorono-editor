# 2D Export Tutarlılığı — öncelik 1

Tarih: 4 Kasım 2026. Güncelleme: 6 Kasım 2026; viewport'tan bağımsız yüksek kaliteli final render ve Render Preview planı §9'a eklendi. Durum: plan; uygulama yapılmadı. Kapsam yalnız `2danimation`. Üst yol haritası: [2D üretim planı](../production-2d-roadmap.md).

## 1. Teslim hedefi

**Editör, JSON penceresi, File menüsü, MCP, standalone player ve desteklenen exporter'lar aynı 2D sahne sözleşmesini kullanacak.** Aynı snapshot, profil, zaman ve girdiler aynı görünüm/davranışı üretmeli. Hedefin desteklemediği özellik açık tanı veya kullanıcının seçtiği bake/fallback ile ele alınmalı.

Aynı profil karşılaştırması ile farklı kalite profillerinin karşılaştırması ayrılır. Viewport ve final aynı geometri/state/zamanı üretir; finalin daha yüksek çözünürlük/örneklemesi farklı kenar pikselleri üretebilir. Farklı backend'lerin bit düzeyinde aynı pikselleri vereceği varsayılmaz. Yeni profil veya renderer seçimi runtime/asset kaybını gizlemek için kullanılmaz.

Önce mevcut export davranışı sağlamlaştırılır. Yeni codec, component, simulation solver veya 3D modu bu aşamanın önkoşulu yapılmaz. Sonraki özellikler ortak capability/asset/clip sözleşmesini genişletir.

## 2. Kodda doğrulanan başlangıç

| Giriş/yol | Mevcut durum | Planlanan işlem |
| --- | --- | --- |
| `RuntimeExporter` → `RuntimeOptimizer` | File menüsü ve MCP kullanıyor; çıktı alanlarında assets/stateMachines/parameterWires/initialState yok | Canonical runtime compiler'a bağla; alan kaybını regression fixture'ıyla yakala. |
| `exportToRuntime` / JSON penceresi | Assets ve stateMachines taşıyor; audio ayrı politikayla çıkarılıyor; parameterWires yok | Ayrı serializer olmaktan çıkar; aynı profil/options ile ortak compiler'ı çağır. |
| HTML yolları | `Exporter2DHTML` placeholder; `export/html/htmlExport.ts` harici runtime script'i yükleyen ayrı yol | Çalışan yol ve capability'leri tek giriş altında birleştir; dependency biçimini açık göster. |
| `Exporter2DGIF`, `Exporter2DWebM` | Arayüz mevcut, export metotları henüz uygulanmamış | Desteklenmiş format olarak gösterme; gerçek encoder teslimi ayrı iş. |
| Raster/sequence | Canvas renderer'ı kullanıyor; örnekleme/export seçenekleri kendi yollarında | Ortak frame request, asset hazırlığı ve capability doğrulamasını kullan. |
| Raster çözünürlük ölçeği | `RasterExportEngine` composition boyutunda render ediyor, sonra `drawImage` ile bitmap'i büyütüyor | Hedef/internal backing çözünürlüğünde yeniden çiz; çıktı ölçeğini supersampling'den ayır. |
| Ses | Native offline WAV ve timeline-owned clip değerlendirme var | Görsel/video/runtime profillerinde sesin dahil/ayrı/desteksiz durumunu açık sözleşmeye bağla. |

Kaynaklar: `src/lib/export/`, `src/lib/types/runtime.ts`, `src/components/JsonModal.tsx`, `src/app/page.tsx`, `src/lib/mcp/editor.ts`, `src/lib/audio/`.

## 3. Canonical model ve profiller

Önerilen tek `RuntimeScene2D` modeli; composition, layer graph, timelines, assets, parameters, triggers, bindings, parameterWires, stateMachines ve initialState verilerini açıkça taşır. Bugün olmayan component/cache alanları eklendiğinde schema version ve required capabilities ile bildirilir. İsimler öneridir; çağrılabilir yeni API değildir.

Portable authoring proje, runtime bundle ve çizilmiş medya aynı ürün değildir:

- **Portable project:** düzenleme verileri, kaynak medya, kütüphane/recipe ve bake bağlantıları korunur.
- **Interactive runtime:** davranış, parametreler, asset'ler ve gerekli decoder/renderer capability'leri korunur.
- **Fixed render:** seçili timeline veya replay edilmiş state/olay akışından kare ve varsa ses üretilir.
- **Açık visual-only profil:** ses veya interaktif davranış çıkarılabilir; seçim ve kayıp raporu zorunludur. Varsayılan interactive profil sessizce visual-only olmaz.

Ses politikası profil ve target capability'sinde `included`, `separate` veya `unsupported` olarak görünür. WAV'ın ayrı teslimi desteklenen bir sonuçtur; runtime JSON'un ses miksajı olduğu iddia edilmez. Görsel export ile aynı aralık/timeline kapsamı ses manifest'inde yer alır.

Mevcut bare RuntimeScene ve RuntimePackage biçimleri sürümlü loader adapter'larıyla tanınır. Eksik verili eski çıktıdan kaybolan davranışın geri getirildiği iddia edilmez. Authoring `formatVersion` ile runtime schema/capability sürümleri birbirine karıştırılmaz.

## 4. Tek derleme ve değerlendirme hattı

Önerilen hat: immutable snapshot → referans/capability doğrulama → asset hazırlama → canonical runtime compile → opsiyonel güvenli bake/optimize → target serialize/render → output manifest.

Eski public fonksiyonlar geçişte uyum wrapper'ı olabilir; farklı alan listeleri tutmaz. RuntimeOptimizer geometri/track optimizasyonu yapar; kendi bağımsız scene serializer'ı olmaz. İşlevler mevcut modüllerden ayrıştırılır, paralel ikinci exporter mimarisi kurulmaz.

Frame request; açık timeline kapsamı, başlangıç/zaman, parametre snapshot'ı, render ölçüsü, background ve gerekiyorsa state/event replay girdisini taşır. Seçili timeline yalnızca UI varsayımı olarak kalmaz. `timeline.layerIds` tek başına playback izolasyonu sayılmaz.

Editor/player/offline render aynı saf değerlendirme yardımcılarını kullanır. State transition/event işleme ile salt poz örneklemesi ayrılır. State-machine export'u için başlangıç durumu ve olay akışı gerekir; tek `timeMs` ile keyfi geçmiş tahmin edilmez. Mevcut clock davranışının korunması önce test edilir; Character Motion'ın yeni state-local saat geliştirmesi ayrı planıyla ilerler.

Örnek zamanları `start + frameIndex / fps` sözleşmesinden gelir. Aralık sonunun dahil/hariciliği açık tanımlanır; son loop karesi yanlışlıkla iki kez yazılmaz. Frame snapping, marker ve korumalı bake olaylarını kaydırmamalı. İlk fixture'lar 24/25/30/60 FPS içerir.

## 5. Asset, görünürlük ve referanslar

Image/video/audio/frameSequence/font ve ilerideki cache asset'leri için tek dependency toplama ve paketleme hattı gerekir. Blob URL kalıcı referans sayılmaz; geçici decoded nesneler JSON'a yazılmaz. Relative/external/embedded asset politikası manifest'te görünür. Export başlamadan kullanılan medya ve fontlar hazır olmalıdır.

Offline/portable HTML seçilirse runtime kodu ve kaynaklar pakete dahil edilir. Harici script/medya kullanan HTML, external-dependency profilidir; offline standalone diye etiketlenmez. Runtime sürümü sabitlenir ve manifest'e girer. Mevcut yerel runtime build hattı önce değerlendirilir.

Validation; parent/mask/instance döngüleri, eksik asset ve font, timeline/state/transition bağlantıları, binding/wire hedefleri ve desteklenmeyen track değerlerini kapsar. UI-only alanları atmak görselde gizli kaynağı yanlışlıkla görünür yapmamalı; frozen/selection overlay gibi editör etkileri export'a taşınmamalı. Görünürlük profil kuralları ayrı test edilir.

HTML içine gömülen metin/JSON ve asset yolları mevcut güvenli encoding kurallarıyla işlenir. Proje veya veri alanları executable script'e çevrilmez.

## 6. Optimizasyon ve hata politikası

Signal bake yalnız desteklenen property türüne uygulanır. Sayı, renk, bool, string ve vektör track'leri yanlış coercion ile tek sayıya çevrilmez. Keyframe azaltma salt eşit değer kontrolüyle değil, gerçek evaluator çıktısının toleransını koruyacak kuralla yapılır. Curve, hold, overshoot, marker ve out-of-range örnekleri gerekir.

Tanılar `code`, `severity`, object/asset/timeline referansı ve önerilen eylemi taşır. Eksik temel kaynak veya hedefin okuyamayacağı zorunlu capability export'u durdurur. Açıkça kabul edilen fallback kaybı rapora girer. Validasyon başarılıysa unsupported verinin silently düşmesi kabul edilmez.

Ön hesap; kare sayısı, ölçü, layer/track/asset ve tahmini byte bütçesini kontrol eder. Mevcut MCP sınırları korunur; büyük iş için ayrı job/chunk tasarımı gerekir. Desteksiz encoder başarılı veya indirilmiş görünümlü boş dosya üretmez.

## 7. Uygulama sırası ve kabul kapıları

| Aşama | İş | Kabul |
| --- | --- | --- |
| E0 | Giriş envanteri, canonical schema, golden fixture ve dependency/capability manifest'i | İki eski runtime yolu aynı sahneyle karşılaştırılır; mevcut alan kayıpları testte görünür. |
| E1 | Canonical compiler + legacy loader; File/JSON/MCP aynı girişe bağlanır | Aynı snapshot/profil aynı normalize runtime payload'ını üretir; state, wire, asset ve initialState korunur. |
| E2 | Player/frame değerlendirme, asset/font ve audio profil tutarlılığı | Gerçek render ve davranış replay'i editör/standalone/MCP'de eşleşir; ses aralığı doğru veya ayrı teslimi açık. |
| E3 | HTML/raster/sequence ve format capability UI'si; güvenli optimizer | Offline profil ağ olmadan açılır; unsupported encoder kapalıdır; desteklenen çıktılar doğru kaynak/süre kullanır. |

**P1 bileşen çalışmasına geçiş kapısı:** E1 + E2'nin mevcut temel 2D fixture'larında geçmesi. Yeni codec'lerin tamamlanması veya henüz uygulanmayan simulation özellikleri bu geçişi bekletmez. E3'teki exporter kontrolleri çoklu format tesliminden önce tamamlanır.

Golden fixture: parent/pivot/mask/instance; text/font/color; spline/particle; iki timeline; state machine + wire; ses fade/trim; hold/overshoot. Kontrol: semantik normalize JSON, piksel/geometry toleransı, olay sırası, PCM aralık/parite ve portable round-trip. Bunların hepsi tek dev sahne yerine ayrık minimal fixture'larla da sınanır.

## 8. Entegrasyon ve sınırlar

Mevcut dosyalar: `export/RuntimeExporter.ts`, `RuntimeOptimizer.ts`, `runtimeExport.ts`, `RuntimeValidator.ts`, `types/runtime.ts`, `player/RuntimeSceneLoader.ts`, `ChronoPlayer.ts`, `JsonModal.tsx`, export dialog'ları ve MCP editor bridge. Değişikliklerin kesin sınırları E0'da belirlenir. Canonical skill ve API şemaları uygulamayla birlikte güncellenir.

Bu belge yalnız plan yazar. Uygulamada repo kontrolleri `npm test`, `npm run mcp:build`, `npm run build`; build öncesi Next sunucusunu durdurma kuralı geçerlidir. Hiçbir 3D işi bu kapsama eklenmez.

## 9. Viewport'tan bağımsız yüksek kaliteli 2D final render

### 9.1. Hedef ve kaynak kod incelemesi

**Hızlı viewport, seçili kareyi final kalitesiyle gösteren Render Preview ve yüksek kaliteli final export aynı sahne değerlendirmesini kullanır; çalışma çözünürlüğü/örnekleme/renk profili ayrı seçilir.** Render süresi çıktı zamanını belirlemez. Bu plan genel 2D/2.5D kompozisyonlar içindir; belirli sahne veya katman id'sine özel değildir.

Yerel checkout'ta doğrulanan başlangıç:

- `export/raster/RasterExportEngine.ts` önce composition width/height ile base canvas yaratıyor; `scale > 1` için ikinci canvas'a büyütüyor. Bu vektör/geometriyi hedef piksel çözünürlüğünde yeniden çizmek değildir.
- `render/CanvasRenderer.ts` temizleme ve arka planda identity transform kullanıyor; mask/effect yüzeyleri composition boyutunda. Dışarıdan yalnız `ctx.scale()` eklemek bütün pass'leri düzeltmez.
- `RenderContext.renderMode` yalnız `editor` / `preview` içeriyor ve editör chrome'unu ayırıyor. Yüksek kalite veya renk profili değildir; bu ayrım korunur.
- `buildGradient.ts` native linear/radial CanvasGradient üretiyor. Eksik olan gradientin varlığı değil, açık interpolation/precision/output politikasıdır.
- GPU particle yolunda destination backing boyutu ve local-to-backing matrisine ilişkin temel var; bu sözleşme final ölçeği ve ROI ile sınanmalı. GPU effect/accumulation yolları ise kompozisyon boyutu ve RGBA/UNSIGNED_BYTE yüzeyleri kullanıyor.
- Mevcut accumulation blur 12–32 subframe örneği kullanıyor; tetikleyicisi katmanın x/y hızı, shutter davranışı trail ayarından türetiliyor. Yeni özellik diye yeniden sayılmaz; dönüş/scale/parent/particle ve ortak renk pipeline'ıyla genişletilir.
- Raster encoder'lar native `toBlob` / `convertToBlob` ile PNG/WebP/JPEG üretiyor. Bugün yüksek bit derinliği/HDR çıktı veya uçtan uca FP16 zinciri bulunmuş sayılmaz.

### 9.2. Ortak frame ve render-target sözleşmesi

Canonical frame isteği immutable scene revision, açık timeline/state replay kapsamı, mutlak zaman, parametre snapshot'ı, output ölçüsü/crop, background, render profili ve hazırlanmış asset/font/cache bağımlılıklarını taşır. Kare içindeki değerlendirme, scene'i değiştirmeden mevcut evaluator/compiler'ı kullanır. `RenderFrameRequest`, `RenderTargetSpec` ve `RenderProfile` bu planın önerilen sözleşme adlarıdır; mevcut MCP API'si değildir.

Scene'in logical composition koordinatları korunur. Çıktı çözünürlüğü ve örnekleme ayrı hesaplanır:

- `outputWidth/Height`: teslim edilecek dosyanın piksel ölçüsü. Eski `scale` seçimi bu ölçülere çevrilen uyum girişidir.
- `spatialSampleScale`: ilk sürümde eksen başına 1 veya 2. Internal backing ölçüsü output ölçüsünün bu sayı ile çarpımıdır.
- Örneğin 1920×1080 çıktı + 2× spatial sample, 3840×2160 çizilip 1920×1080'e küçültülür. 3840×2160 çıktı + 2× sample, 7680×4320 internal çizim gerektirir; bunlar aynı seçenek değildir.

İlk profil seti: **Viewport** mevcut hızlı çalışma; **Final Native** hedef çözünürlükte 1×; **Final High** hedef çözünürlükte 2× spatial sample ve kontrollü downsample. Final High açık seçimdir; eski projelerin varsayılan görünümü ve renderMode semantiği kendiliğinden değişmez. Zamansal örnekleme, özel gradient/renk ve FP16 daha sonraki profil capability'leridir; ilk High profili bunları varmış gibi ilan etmez.

Renderer clear işlemini backing koordinatlarında bütün hedefe uygular; background ve nesneleri logical→backing dönüşümüyle çizer. Crop/ROI origin'i aynı matrisin parçasıdır. Selection bounds/hit-test logical uzayda kalır. Source composition, font size, stroke width ve keyframe değerleri export için kalıcı büyütülmez. Yeni target bilgisi main canvas, plugin context, GPU compositor, mask/effect pass ve bütün temporary surface lease'lerine taşınır.

Output aspect ratio değişimi ilk sürümde [çoklu format compiler'ının](multiformat-production-2d-plan.md) işidir. Final renderer kendi başına nesneleri yeniden yerleştirmez; verilen resolved variant'ı çizer. Raster image/video/sprite kaynakları kendi orijinal çözünürlüğüyle sınırlıdır; vektörlerin yüksek çözünürlükte yeniden çizilmesi bitmap kaynağa yeni detay kazandırdığı anlamına gelmez.

### 9.3. İlk teslim: native hedef çözünürlük, supersampling ve Render Preview

İlk backend mevcut Canvas2D/registry/GPU köprüsüdür. Yeni bir sahne veya timeline motoru kurulmaz. Path/shape/spline ve yazı hedef backing'e yeniden çizilir. Fontlar hazır ve sürümü pin'li olmalı; layout ve kadraj logical uzayda korunur. Yüksek çözünürlükte ölçüm ve glyph çizimi tutarsız hale gelmemeli.

Mask, feather, stroke, shadow offset, blur radius ve glow gibi authored değerler logical piksel anlamını korur; pass onları ilgili backing ölçeğine bir kez çevirir. Particle SDF, efekt shader ve motion-blur sample canvas'ı aynı target sözleşmesini izler. Önceden düşük çözünürlükte cache'lenmiş bir maskeyi/efekti büyütmek Final High sayılmaz. Cache anahtarı source/version/time yanında output/internal ölçü, ROI, backend ve kalite profilini içerir.

2× supersampling için ilk kontrollü küçültme filtresi **2×2 area average**, premultiplied alpha üzerinden ve bounded satır bloklarıyla uygulanır. İlk profil mevcut SDR/legacy renk görünümünü korur; bu filtre fiziksel linear-light renk pipeline'ı diye sunulmaz. Tam boy ikinci/üçüncü JS pixel kopyaları yerine stripe işleme ve ortak resource bütçesi kullanılır. Sonraki renk profilinde resampling de seçilen linear working space'e bağlanır. Yalnız browser `imageSmoothingQuality='high'` ayarından belirli bir kernel veya tarayıcılar arası birebir sonuç varsayılmaz.

Bu ilk antialiasing teslimi native rasterizer + supersampling'dir. Exact analytic pixel coverage renderer'ı yazıldığı veya bütün backend'lerde aynı coverage örneklemesinin kullanıldığı iddia edilmez. Kalite küçük yazı, ince/çapraz stroke, dönmüş path ve alpha kenarı referanslarıyla doğrulanır.

**Render Preview akışı:** mevcut kare/zaman ve profil seç → final job başlat → hazır kareyi editörde ayrı dock/preview alanında göster → 100% piksel görünümü ve viewport/final karşılaştırması sun. Sonuç scene revision, zaman, crop/output ve profilini gösterir. Ekranda fit ile küçük gösterilmesi export ölçüsünü değiştirmez; 100% inceleme farklıdır. Geometri veya profil değişince önceki sonuç eski olarak işaretlenir. Tek aktif preview job vardır; yeni istek öncekinin cancellation/generation'ını değiştirir. Manuel/AI değişiklikler gecikmiş kareyle geri alınmaz.

Preview sonucu ortak bütçede sınırlı bir görüntü lease'idir; açılan her kare süresiz saklanmaz. Tek kare PNG/WebP/JPEG ve sequence aynı final frame hattını kullanır. Asenkron iş status/progress/cancel, kaynak readiness ve preflight sözleşmesiyle yürür; editör render döngüsünün hızına bağımlı değildir.

### 9.4. Renk, gradient ve banding

Renk kararları ayrı kaydedilir: **gradient interpolation space**, **working/compositing space**, **ara buffer hassasiyeti** ve **output encoding/gamut**. OKLab'ı bütün alpha compositing veya ışık toplama işlemlerinin working space'i yapmak varsayılan değildir. Fiziksel ışık karışımı için linear-light, algısal gradient için Oklab farklı kullanım tercihleridir. [W3C Color Interpolation](https://www.w3.org/TR/css-color-4/#interpolation)

Legacy projelerde eksik ayarlar mevcut Canvas görünümüyle açılır. Yeni gradient modu optional/sürümlü bir interpolation seçimiyle açılır: legacy Canvas, sRGB-linear veya Oklab. Hedef API ismi uygulamadaki schema ile kesinleşir. Interpolation W3C conversion/alpha kurallarıyla referans testlere bağlanır; geometry, stop konumları, fill/stroke ve background aynı anlamı korur. Gamut dışı ara değerler interpolation sırasında keyfi kırpılmaz; sRGB output dönüşümündeki clipping/mapping politikası profil manifest'inde belirtilir. İlk managed renk teslimi sRGB SDR output'tur; geniş gamut/HDR export ayrı capability'dir.

Yeni renk seçenekleri yalnız finalde gizlice etkinleşmez: viewport destekliyorsa aynı modeli gösterir; desteklemiyorsa görünür Render Preview/renderer capability tanısı sunulur. Desteklenmeyen renk modunu sıradan native gradientle sessizce değiştirmek kabul edilmez. Hex/image/font/particle renklerinin giriş uzayı ve alpha durumu tanımlıdır. Image ve video decode renk dönüşümünün backend'e göre değişebileceği fixture'larla kontrol edilir.

Banding azaltma, kontrollü renk pipeline'ının **son 8-bit quantization** adımında isteğe bağlı dither'dır. Sabit seed/global output koordinatlarına bağlı noise, frame veya tile başına rastgele yeniden başlamaz; animasyonda titreşim ve tile dikişi üretmez. İlk hedef RGB'de en fazla ±0,5/255 seviyesinde dağıtım; alpha değiştirilmez ve tamamen saydam piksellere görünür renk eklenmez. Profilde açılır/kapatılır, karşılaştırma ve düşük ışıklı gradient referansıyla ölçülür. Kayıplı codec'in dithering'i veya ince detayı koruyacağı garanti edilmez.

FQ4'ün ilk dither uygulaması yeni gradient/shader hesabında, değerler 8-bit'e yazılmadan önce yapılır. Zaten 8-bit'e indirgenmiş bitmap'e sonradan noise eklemek kayıp renk hassasiyetini geri getirmez. Bütün composite/effect zinciri için final quantization kontrolü ancak FQ5'in yüksek hassasiyet yolu tamamlandığında ilan edilir.

### 9.5. CanvasKit/Skia ve FP16 değerlendirmesi

CanvasKit; Skia'nın WebAssembly, WebGL surface, path/text ve custom shader yapı taşları nedeniyle ilk ileri backend adayıdır. Bu bir değerlendirme kararıdır; mevcut renderer'ın hemen tamamen değiştirilmesi veya ilk yüksek çözünürlük tesliminin CanvasKit'e bağlanması değildir. [CanvasKit](https://docs.skia.org/docs/user/modules/canvaskit/), [Skia renk yönetimi](https://docs.skia.org/docs/user/color/)

Teknik deneme aynı evaluated frame'i native Canvas2D ve CanvasKit adapter'ında çizer. İncelenecek kapsam: şekil/path/spline, gerçek fontla Türkçe/metin shaping, image/video, mask/blend/filter, particle GPU output köprüsü, WASM/GPU bellek ownership ve dispose. Lazy load, sabit paket sürümü ve yerel WASM dağıtımı gerekir; CDN bağımlılığı offline profile'a gizlice eklenmez. Ortak frame contract dışında ikinci evaluator geliştirilmez. Her iki backend için pixel/geometry ve süre/bellek karşılaştırması kaydedilir. Eksik primitive/efektleri olan backend tam sahne için desteklenmiş ilan edilmez.

**FP16**, float yüzeyi yaratabilmekten daha geniştir: geometri coverage/color output, effect/filter ara pass, blend/alpha, temporal accumulator, downsample ve output conversion boyunca hassasiyet korunmalıdır. 8-bit Canvas çıktısını sonradan Float16Array'e çevirmek kaybolmuş hassasiyeti geri getirmez. Current RGBA/UNSIGNED_BYTE GPU pass'leri ve Canvas2D interop kopyaları tek tek denetlenir. Herhangi bir arada 8-bit'e düşen yol “uçtan uca FP16” diye etiketlenmez.

Backend'in gerçek renderable/filterable float yüzey, shader ve blending desteği capability testinden geçer. WebGL2 extension veya CanvasKit surface desteği tek başına bütün zincir desteği sayılmaz. Yeni browser ImageData float16 seçeneği de tek başına bütün pipeline'ı garanti etmez. Kaynakların `.delete`/dispose/close yaşam döngüsü genel resource ledger'a bağlanır; WASM heap'i JS heap'in içinde görünüyormuş gibi raporlanmaz. [Float render-target capability](https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float), [ImageData pixel format](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData)

FP16 internal render'ın ilk hedef çıktısı yine SDR sRGB PNG/WebP/JPEG olabilir; internal kalite ile dosyanın bit derinliği ayrı gösterilir. 16-bit PNG, EXR/TIFF veya HDR video ancak ilgili encoder/metadata/renk capability'si ayrı uygulanınca sunulur. Desteksiz cihazda kullanıcı açıkça SDR8 profili seçebilir; FP16 seçili işi sessizce SDR8'e düşürmek yoktur.

### 9.6. Daha yüksek örneklemeli final motion blur

İlk yüksek çözünürlük teslimi mevcut motion-blur görünümünü korur. Sonraki final temporal profili rotasyon, ölçek, parent hareketi, deforme mesh/model ve particle hareketini de mutlak zamanda örnekleyebilir. Kararın temeli yalnız katmanın x/y hız eşiği değildir. İlk temporal kalite seçimi **16 örnek / 180° shutter**, açık seçimle 8 veya 32 örnektir; Final Native/High profilinde yeni temporal mod varsayılan kapalıdır.

Frame zamanı `start + frameIndex * 1000/fps` olur. Shutter genişliği `1000/fps * shutterAngle/360`, örnekler frame zamanının etrafındaki aralığın eşit parçalarının orta noktalarıdır; ağırlık toplamı birdir. Composition aralığı dışına çıkan örnek zamanları geçerli başlangıç/son sınırına clamp edilir. Son geçerli kare ve exclusive range politikası canonical export sözleşmesiyle aynı olur. Kaydın 300 ms sürmesi 30 FPS videonun zamanlarını kaydırmaz.

Her temporal örnek aynı immutable başlangıç/replay sözleşmesiyle saf poz değerlendirmesi yapar. Trigger/state event'leri her subframe'de dışarı tekrar gönderilmez. Simülasyon/cloth/fluid solver'ı her sample'da yeniden çalışmaz; ilgili cache decoder varsa doğru zamanda okunur. Decode/render desteği henüz olmayan feature için kalite profili desteği varmış gibi görünmez. Video frame readiness ve model/sprite yerel saati aynı örnek zamanına hazırlanır.

Yeni temporal modda aynı katmana mevcut canlı accumulation/trail blur bir kez daha uygulanmaz; geçiş profili bu yolu açıkça seçer. Kaynağa raster olarak bake edilmiş blur'un geri alınabildiği iddia edilmez. Accumulation ara yüzeyi ve renk uzayı profilin parçasıdır; bütün örnek canvas'ları aynı anda tutulmaz. Önceki translation blur profili legacy görünüm için korunur.

### 9.7. Genel optimizasyon ve kaynak paneliyle entegrasyon

Her iş [genel resource bütçesi/admission/lease sistemini](../production-2d-roadmap.md#8-genel-optimizasyon-ve-kaynak-yönetimi) kullanır. Ön hesapta output/internal ölçü, spatial örnek oranı, temporal örnek sayısı, canlı pass sayısı, pixel format/byte, halo, readback, encoder/paketleme ve gerekli asset cache'leri birlikte değerlendirilir. Spatial 2× eksen başına olduğu için pixel sayısı 4×; RGBA16F yüzey RGBA8'in iki kat byte'ıdır. Örneğin 7680×4320 tek RGBA8 yüzey yaklaşık 126,56 MiB, RGBA16F 253,13 MiB'dır; zincirin toplamı değildir.

GPU max texture/renderbuffer ve canvas ölçü sınırları, kaynak bütçesi ve iş iptali allocation'dan önce kontrol edilir. Örnekler ve frame'ler sırayla işlenir; export edilen bütün kareler veya subframe'ler RAM'de tutulmaz. ROI/scratch pool sınırlıdır. İlk sürüm desteklenen full-frame ölçülerde çalışır; daha büyük işler için tile desteği ayrı teslimdir. Tile eklendiğinde efekt halo, motion zarfı, mask domain'i, global gradient/noise koordinatı ve downsample kenarı birlikte korunmalıdır; her effect'in tile edilebilir olduğu varsayılmaz.

Bütçe aşımı iş başlamadan görünür olur. Kullanıcı daha düşük sample/output profilini açıkça seçebilir; “High” seçimi arka planda düşürülmez ve çizilemeyen nesne atlanmaz. Kaynak paneli rasterize/effect/temporal/downsample/encode sürelerini, backend/precision ve planned/peak/pinned kaynak maliyetini gösterir. Bu maliyetler aynı scope'ta iki kez toplanmaz. İleride kutulu 3D veya mesh kaynakları eklendiğinde aynı target/capability adapter'ına bağlanır; bu iş ayrı 3D Modeling modunu açmaz.

### 9.8. Uygulama sırası, API ve kabul

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| FQ0 | Canonical frame/target/profile sözleşmesi; çözünürlük ve renk fixture'ları | Viewport bağımlılığı yok; zaman/variant ve output scale/sample ayrımı açık; kaynak readiness/bütçe ön kontrolü var. |
| FQ1 | Hedef çözünürlükte native redraw; bütün pass'lerde logical→backing ve ROI sözleşmesi | Path/text/shape 1×/2×/3×/4× hedefte yeniden çizilir; background/mask/effect/particle tam alan ve doğru boyuttadır. |
| FQ2 | 2× spatial sampling, kontrollü downsample, Render Preview ve sequence entegrasyonu | Aynı profilin preview/export karesi eşleşir; alpha kenarında halo yok; süre/bellek/cancel ve kaynak scene koruması geçer. |
| FQ3 | CanvasKit değerlendirmesi ve managed gradient/renk denemesi | Aynı evaluated frame'de glyph/path/effect parity, WASM/GPU yaşam döngüsü ve kaynak maliyeti raporlanır; eksik backend açıkça sınırlanır. |
| FQ4 | Uygulanmış backend'de açık gradient interpolation ve SDR output/dither | Legacy görünüm değişmez; W3C referans renkleri, alpha, gamut ve sabit dither/tile koordinatı doğrulanır. |
| FQ5 | Capability'ye bağlı uçtan uca FP16 zinciri | Ara pass'lerde 8-bit dar boğaz yoktur; output encoding/bit depth ayrı; desteksiz capability tanısı doğru. |
| FQ6 | Yüksek örneklemeli final temporal blur | Dönüş/scale/parent/particle testleri; doğru sample zamanları; çift blur/tekrarlı event yok; baked cache'lerle tutarlı. |
| FQ7 | Ölçümün gerektirdiği tiled büyük render ve ek formatlar | Full-frame referansla seam/halo/gradient/alpha eşleşir; tile/encoder sınırları ve bounded kaynak politikası kanıtlanır. |

**İlk kullanıcı teslimi FQ0–FQ2'dir:** gerçek yüksek çözünürlük + supersampling + Render Preview. CanvasKit ve FP16 bu teslimi bekletmez. E1/E2 canonical frame/export temeli ve OPT1 kaynak muhasebesi kullanılır; FQ1/FQ2 mevcut E3 raster/sequence işiyle birlikte ilerler. Bileşen/çoklu oran teslimlerinin tamamı ileri renk ve FP16 araştırmasına bağımlı değildir.

Mevcut raster `scale`, background ve codec seçenekleri uyum girişleri olarak korunur; sample/profile yeni açık seçeneklerdir. Sequence ve Render Preview aynı request/profile'ı kullanır. Profile seçimi, backend sürümü, font/asset/cache ve seed bilgisi portable/job manifest'inde korunur. Mevcut sync MCP preview/sequence sınırları yükseltilmez; yüksek çözünürlük için ileride native async render job, durum/iptal ve bounded resource/chunk teslimi eklenir. API/catalog ve `skills/chorono/` gerçek uygulamayla güncellenir; bu öneri yeni bir tool bugün varmış gibi çağrılmaz.

Doğrulama: ince çapraz çizgi/dönen shape; küçük Türkçe yazı ve font; çok stop/alpha gradient; parent/pivot/mask/feather/blend; blur/glow/shadow; particle CPU/GPU ve sourceLayer; düşük çözünürlüklü raster kaynak; farklı output/sample oranları; 1080p/4K; aynı kareyi fit ve 100% görme; viewport pan/zoom bağımsızlığı; eski proje round-trip; renk/alpha sayısal referansı; stale/cancel/context loss; budget fail ve explicit profile seçimi. Temporal testler subframe event/seek, dönme/scale, ilk/son kare ve cache readiness'i içerir. Görsel farklar aynı profil/backend için toleransla; farklı profil/backend için açık kalite/geometry kriterleriyle incelenir.

Performance raporu ilk shader/font hazırlığı ile sıcak frame'i ayırır; raster/effect/sample/downsample/encode süreleri ve peak kaynakları ölçer. Bir kalite etiketiyle sabit FPS, analytic AA, HDR veya FP16 desteği varmış gibi gösterilmez. Bu tur yalnız plan güncellendi; uygulama kodu, bağımlılık veya gerçek final render sonucu oluşturulmadı.
