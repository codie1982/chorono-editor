# 3D öncesi ortak kare ve çıktı sözleşmesi

12 Kasım 2026. Çalışan 2D altyapının dar entegrasyon kapısıdır. Yeni 3D katmanı,
tam Export E0, yüksek çözünürlükte yeniden vektör çizimi veya FP16 motoru içermez.

## Giriş noktaları ve veri akışı

| Sorumluluk | Gerçek sahip / sözleşme |
| --- | --- |
| Source ve referans kimliği | Scene JSON'da stable layer/asset/key ID; `AssetSourcePool` URL lease'i. Asset ID belge kimliği, URL decoder kaynak kimliğidir; birbirinin yerine kullanılmaz. |
| Ortak değerlendirme | `runtime/evaluateSceneFrame.ts`; composition ms, explicit timeline-local clock, parameter snapshot, bindings/Wire/typed drivers. Kare map'i source değildir. |
| Hazır kare | `render/prepareRenderFrame.ts`; aynı source + time + overrides + parameter map ile materialize edilir. Hazır runtime overrides verilirse ikinci değerlendirme/tick yapılmaz. |
| Kaynak kapanışı | `render/media/VisualDemandResolver.ts`; **aynı materialized kare** üzerinden font, image, bağımsız video clip ve mask/repeater referansları. Bilinmeyen dependency capability muhafazakâr hazırlık kullanır. |
| Hazırlık ve ömür | `VisualMediaSession` ve `withMediaFrame`; ready beklenir, eksik/başarısız kaynak hata üretir. Her clip ayrı consumer/clock; sahnenin native handle'ı JSON/Undo'ya girmez. |
| Raster / preview desteği | `export/raster/assertRasterLayerSupport.ts`; gerçek renderer registry sorgulanır. Nonvisual audio açık istisna; renderer'ı olmayan kaynak başarıyla boş çıktı üretemez. |
| Çıktı sahipliği | `OutputResources` → `OutputScope` → canvas/encoder/result lease. Cancel sırasında gerçek native completion beklenir; callback bittiğinde media pin'leri bırakılır. |

`withMediaFrame(scene, timeMs, context, {paramValues}, work)` caller parametreleriyle
bir kez değerlendirir. `work(assets, overrides)` aynı map'i final çizime iletir.
Önceden hazırlanmış runtime kare için `{overrides, paramValues}` verilir; ilk map
tam değerlendirilmiş olmalıdır. Callback async encode bitene kadar kaynaklar
pin'li kalır; çağıran sonucu kullanmayı bitirince output lease'ini bırakır.

Bu kabulde raster'ın parametreleri yalnız draw seçeneklerine geçirip media
hazırlığında varsayılanları değerlendirmesi düzeltildi. Aksi durumda driver'ın
font/geometri seçimi ile final çizimi farklı kareleri temsil edebiliyordu.
Unit test gerçek font demand resolver'ını; native test gerçek PNG piksellerini
kontrol eder. Source/defaults ve caller map'i değiştirilmez.

## Zaman, koordinat, hedef ve renk

- Source transform/geometry composition px; 2D affine matris sözleşmesi korunur.
  Kamera/3D projeksiyon veya legacy transform'a örtük z eklenmez.
- Scene/evaluator zamanı ms; waveform frequency Hz, phase radian, rotation degree.
  Video source zamanı `videoFrameTime` adapter'ında saniyeye çevrilir. Aynı asset'i
  kullanan farklı video clip'leri decoder saatini paylaşmaz.
- Sequence zamanı biriken dt ile değil `i / fps * 1000` ile örneklenir. Mevcut
  rounded frame count, minimum 1 FPS ve 4096-frame sınırı korunur. Timeline local
  endpoint/loop politikası ortak evaluator'a aittir; duvar saati render girdisi değildir.
- Raster kompozisyon çözünürlüğünde çizilir; mevcut `scale > 1` davranışı bitmap
  upscale'dir. Hedef boyutlar `round(composition × scale)`; piksel/bütçe sınırı
  native backing oluşturulmadan denetlenir. Gerçek yüksek çözünürlüklü vektör
  çizimi sonraki Export E0 işidir.
- Canvas2D mevcut RGBA8/default sRGB yoludur. PNG/WebP alpha destekler; JPEG'de
  transparent istek beyaza compositing ve açık warning üretir. FP16, geniş gamut,
  profil dönüşümü veya bütün backend'lerde renk eşliği vaat edilmez.
- Viewport pan/zoom, culling/LOD proxy'leri ve editör overlay'leri final raster
  seçeneklerine aktarılmaz. Çıktı tam composition ve source katmanları kullanır.

## Capability ve fallback

Yeni bir renderer registry kaydı bir katmanın teslimi değildir. Source/defaults,
selection/bounds, property UI, clone/reference remap, Undo/portable ve raster
kabulü gerekir. Renderer olmayan visual source raster/MCP preview'da açık hata
verir; otomatik dönüşüm yapılmış sayılmaz.

Temel SVG adapter'ı shape/path/text/group ile sınırlıdır. Diğer türleri atladığını
warning ile bildirir. Bu kabulde serialize edilen türlerin **mask, etkin efekt ve
blend mode** kaybı da warning'e bağlandı. Bu çıktılar için composed görünüm raster
ile alınır; otomatik SVG raster bake yoktur. Animated SVG live property driver'ını
çalıştıramaz; native key bake veya raster gerekir. Current Web runtime live
driver'ları destekler; basic/native player'a aynı destek varsayılmaz.

Portable JSON source tariflerini ve bounded authoring bilgisini korur; runtime
çıktısı editör köken kayıtlarını kaldırır. Hangi target'ın desteklediği source
verisi ayrı adapter'ının sorumluluğundadır. Yeni tür sessizce düşürülemez.

## Doğrulama

Native fixture: `node scripts/perf/frame-contract.mjs <output>`; duran bir kaynak
kopyasında hazırlayın, `node scripts/perf/serve.mjs <output> 2029` ile sunun ve
**Run frame contract checks** kullanın. Gerçek PNG 1×/2× pikseli, alpha, parametre
snapshot'ı, JPEG fallback ve pin cleanup test edilir. Kanıt:
`artifacts/validation/pre3d-integration-20261112/`.

Diğer invariants mevcut source pool/media session, independent video clocks,
asset replacement/cancel, scene frame/player, clone remap, portable ve output
settlement testlerindedir. Bu dar kapı bütün exporter'larda tam görüntü eşliği
matrisi değildir; o iş onaylı sonraki Export E0 sırasını korur.
