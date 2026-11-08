# 2D Çoklu Format Üretimi — öncelik 3

Tarih: 4 Kasım 2026. Durum: plan; uygulama yapılmadı. Kapsam yalnız `2danimation`. Önkoşullar: [export](export-consistency-2d-plan.md) E1/E2, [bileşen](component-library-2d-plan.md) C1. Üst plan: [2D üretim yol haritası](../production-2d-roadmap.md).

## 1. Teslim hedefi

**Bir kaynak tasarımdan 9:16, 16:9 ve 1:1 gibi farklı 2D çıktılar üretmek.** Kullanıcı format başına bütün katmanları yeniden konumlandırmaz. Metin/kart/logo yerleşimi kurallarla çözülür; kaynak sahne korunur. Bu özellik yalnız canvas'ı yeniden ölçeklemek değildir.

İlk dikey dilim: başlık, görsel kartı ve köşeye sabit logo içeren 5 saniyelik bileşen → üç format varyantı → yan yana önizleme → desteklenen PNG sequence/raster çıktıları için üç export işi. Codec seçeneği ancak gerçek exporter capability'si varsa sunulur.

## 2. Mevcut temel ve ek ihtiyaç

Composition ölçüsü, group/parent, align/distribute, text ölçümü ve SDK ölçekleme temeli var. Genel responsive layout/variant compiler ve çoklu export kuyruğu bu teslimde eklenir. Manuel align işlemi bir defalık mutasyondur; kalıcı layout constraint'inin yerine geçmez.

`TextStyle` ve `measureText` var; metin ölçümü, çizimi, multiline/wrap ve bounds davranışı M0'da doğrulanmalıdır. Kartın metne göre büyümesi, güvenilir aynı text layout sonucu olmadan tamamlanmış sayılmaz.

## 3. Varyant modeli ve kaynak koruması

Önerilen `CompositionVariant`: stable id/ad, output width/height, safe-area değerleri, layout ve component-control override'ları, asset fit politikası. Base sahne tek kaynaktır; varyant source transform'larını kalıcı değiştirmez.

`VariantCompiler`, frozen source + component definition sürümleri + varyanttan türetilmiş sahne/evaluation context üretir. Preview, bounds, render ve export aynı derlenmiş sonucu kullanır. Variant seçimi UI state'idir; kaynak kompozisyonu değiştirip geri alma döngüsü değildir.

İlk sürümde süre, FPS, klip ve ses zamanlaması varyantlar arasında aynıdır. Süre değiştirme, giriş/çıkış koruma ve dil varyantları sonraki genişletmedir; metin değişikliği ses klibini kendiliğinden time-stretch etmez. Görsel en-boy oranları sabit matematiksel profillerdir; platformların değişebilen yükleme kurallarına uygunluk iddiası taşımaz.

## 4. Yerleşim kuralları

İlk kurallar: parent/container kenarına pin, center, margin/padding/gap, min/max size, fill/contain/cover, row/column stack ve content'e göre hug. Aspect-ratio lock ve yatay/dikey variant override'ı bulunur. Safe area kullanıcı tarafından düzenlenir; belirli platform arayüzünün değişmez sabitleri varsayılmaz.

Bir nesne aynı eksende çözümsüz left/right/width veya content/parent döngüsü taşımamalı. Constraint graph cycle ve over/under-constrained durumları açık tanı verir. İlk sıra topolojik ve deterministiktir; sonsuz layout iterasyonu yapılmaz.

Text önce gerçek font ve geçerli wrap genişliğiyle ölçülür; auto-size parent sonra hesaplanır. Birden çok geçiş gerekirse sınırlı, belgeli yakınsama kuralı kullanılır. Dairesel content-fit bağımlılığı editörde gösterilir.

Layout bir base transform/size üretir; animasyon onun üstünde ilan edilmiş offset veya absolute değerle çalışır. Eski absolute x/y keyframe'leri otomatik offset'e dönüştürülmez. Layout, timeline ve binding aynı property'yi farklı anlamda sahipleniyorsa açık policy/validation gerekir. Örneğin pinned kartın giriş hareketi layout base'ine göre offset olabilir.

## 5. Metin ve taşma

Önerilen tek `TextLayoutResult`; satırlar, line/glyph/grapheme konumları, layout/ink bounds ve font çözüm bilgisini sağlar. Canvas çizim, hit-test, responsive kart ve ilerideki altyazı bu sonucu paylaşır. Metni karakter karakter ayırmak Unicode birleşimlerini veya shaping'i bozmamalı.

İlk güvenilir dil profili Türkçe/İngilizce, multiline ve uzun kelime fixture'larıdır. Karmaşık script/RTL desteği doğrulanmadan desteklenmiş sayılmaz. Font yükleme bitmeden final layout/export yapılmaz; eksik font için fallback politikası ve çıktı tanısı görünür olur.

Overflow politikaları: wrap, belirli satır sınırı, min/max içinde fit veya açık hata. Kullanıcı istemeden metni kırpmak, gizlemek veya okunamayacak boyuta indirmek varsayılan değildir. Uzun başlık ve asset replacement her varyantta preflight'tan geçer.

## 6. Animasyon ve bake ilişkisi

Klip saatleri component/scene evaluation sözleşmesini kullanır. Format değişimi event/marker, keyframe zamanı ve audio trim/fade'i değiştirmez. Motion-path koordinat uzayı local/container/world olarak açık değerlendirilir; path ile layout'ın çift transform uygulaması engellenir.

Baked physics/cloth/fluid sonucu yalnız root konumu veya uniform scale ile yerleştiriliyorsa recorded visual clip olarak taşınabilir. Ancak rest geometri, pin, collider, domain veya fizik ölçeğini değiştiren varyant ilgili simülasyon cache'ini stale yapar. Kullanıcıya yeniden simülasyon gereği gösterilir; responsive reflow fiziği yeniden hesaplamış gibi davranmaz.

## 7. Export kuyruğu

Önerilen `RenderQueue2D`: source revision/hash + variant id + output profile + timeline/time kapsamı + asset/font dependency snapshot'ından ayrı işler üretir. İlk yürütme seri ve sınırlıdır. Başka sekmedeki manuel çalışmayı veya source scene'i değiştirmez.

Job durumları queued/running/completed/failed/cancelled; progress ve retry bulunur. Renderer ana thread gerektiriyorsa kontrollü bloklar halinde UI'ye zaman bırakır. Worker/GPU desteği gerçek capability'ye göre seçilir; tarayıcı arka plan sekmesinde sınırsız video hesabı vaat edilmez.

Export başladıktan sonra kaynak düzenlenirse iş kendi frozen snapshot'ını kullanır ve bu sürüm manifest'te görünür. Asset/decoded/cache referansları iş bitene kadar pin'lenir; undo veya kütüphane silme devam eden export'u bozmamalı. Her job sonunda kaynaklar serbest bırakılır.

Dosya adları variant ve iş kimliğiyle benzersiz/güvenli üretilir. Manifest; ölçü, süre, FPS, profil, source/component/asset sürümleri, uyarılar ve output hash içerir. Başarısız tek iş diğer sonucu bozuk başarılı paket gibi göstermemeli. Bundle/ZIP veya ayrı indirme seçimi kapasiteye göre yapılır.

Mevcut sequence MCP sınırı çağrı başına 300 kare ve 4 MP'dir. Önerilen 5 saniye/30 FPS profili her varyantta 150 kare üretir. Toplam queue bütçesi ayrıca kontrol edilir; üç job'u tek çağrıyla sınırsız export'a dönüştürmek sınırları kaldırmaz.

## 8. UI ve MCP

Mevcut 2D editörde Variants görünümü: base ve format kartları, ölçü/safe-area, override/overflow göstergesi, aynı zamanda yan yana kare önizlemesi. Bileşen seçildiğinde Layout kontrolleri açılır. Varyant veya kısıt düzenleme tek native undo adımıdır; yalnız preview seçimi history'yi doldurmaz.

Export seçimi kullanıcıya yalnız uygulanmış formatları gösterir. MVP PNG sequence ve mevcut raster yeteneklerini kullanabilir; MP4/GIF/WebM için tamamlanmış encoder ve ses/container capability'si gerekir. Yeni format eklemek bu planın temel layout teslimini bekletmez.

MCP varyant listeleme/okuma, native ekleme/düzenleme, resolved preview/preflight ve render job durumlarını açar. İş adları ve exact şemalar uygulamada capabilities/catalog ile kesinleşir. Uzun queue synchronous QuickJS script'i içinde bekletilmez. Yeni class/job olayları mevcut host/script sözleşmesine açılır.

## 9. Uygulama sırası ve kabul

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| M0 | Text layout/bounds doğrulaması, variant ve temel pin/stack modeli | Uzun/kısa başlık ölçümü çizimle eşleşir; source scene değişmez; constraint cycle tanısı çalışır. |
| M1 | Variant compiler ve component/layout/animation birleşimi | Aynı tasarım üç oranda doğru pin/wrap/gap ile çizilir; eski absolute animasyon davranışı korunur. |
| M2 | Preview/preflight ve desteklenen format queue'su | Üç sonuç doğru boyut/FPS/ses kapsamıyla üretilebilir; cancel/retry, manifest ve kaynak koruması geçer. |
| M3 | Instance override, portable/MCP ve final regression teslimi | Reload/undo ve standalone/render aynı resolved variant'ı gösterir; font/overflow/stale cache doğru raporlanır. |

Testler: layout/property sahipliği, font-ready ölçüm, Türkçe/Unicode, min/max/overflow, safe area, parent/pivot, clip saati/ses/marker, cache invalidation, snapshot izolasyonu, queue bütçesi, dosya adları ve runtime/raster/sequence parity. Görsel kabul aynı başlık/kart/logo'nun üç oran ve iki metin uzunluğunda karşılaştırılmasıdır.

Entegrasyon: composition/types, text layout/measure/render, component resolver, geometry/hit-test, timeline evaluator, export compiler/job ve 2D dock/MCP. Uygulama repo test/build ve canonical skill kurallarını izler. 3D mod veya renderer geliştirilmez.
