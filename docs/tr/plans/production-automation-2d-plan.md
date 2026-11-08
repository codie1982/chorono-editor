# 2D Üretim Otomasyonu — sonraki özellikler

Tarih: 4 Kasım 2026. Durum: plan; uygulama yapılmadı. Kapsam yalnız `2danimation`. Üst plan: [2D üretim yol haritası](../production-2d-roadmap.md). Öncelikli export, bileşen ve çoklu format teslimlerinin ardından uygulanır.

Bu belge dört öneriyi kapsar: veriden animasyon üretimi, sese bağlı hareket, kelime zamanlamalı altyazı ve performans inceleme paneli. Ortak export/compiler, asset, job, component-control ve text layout sistemleri yeniden yazılmaz.

## 1. Veriden animasyon üretimi — öncelik 4

**Hedef:** CSV/JSON satırlarını bileşen kontrollerine bağlayarak aynı tasarımın birden fazla sürümünü üretmek. Örnek: ürün adı/fiyat/görsel içeren 10 satırdan 10 kart veya üç formatta 30 çıktı.

Önkoşullar: [bileşen](component-library-2d-plan.md) C1, [çoklu format](multiformat-production-2d-plan.md) text/preflight ve queue sözleşmesi. Data binding bütün internal property path'lerine serbest yazmaz; ilk giriş exposed component controls'dür.

Önerilen model: `Dataset` (schema, stable row id ve sürüm/hash), `ControlMapping` (column → control id ve açık dönüşüm), `ProductionBatch` (source/component sürümü, seçili satırlar, varyantlar ve output profili).

Akış: yerel dosyayı içe al → kolon türlerini doğrula → control map kur → satır bazında önizle/preflight yap → seçili satırları frozen snapshot'larla kuyruğa ver. Ana sahne her satır için mutation/undo ile değiştirilmez. Dataset ve mapping düzenleme native undo kullanır; render çıktıları job manifest'ine gider.

İlk türler string, number, boolean, color ve mevcut asset reference. Sayı/locale, eksik hücre, boş string, varsayılan değer ve tekrar row id politikaları açıktır. Hatalı satır diğer başarılı satırların yerine yazmaz; skip/fail davranışı batch başlamadan seçilir. Filename, row id ve variant birleşimiyle benzersiz/güvenli oluşturulur.

CSV quoting, BOM, Unicode ve boş satırlar doğru parse edilir. Formül, template expression veya cell içeriği executable JavaScript olarak değerlendirilmez. Görseller ilk sürümde önceden import edilmiş asset id'lerine veya açık toplu import eşlemesine bağlanır; keyfi URL'ler arka planda sınırsız indirilmez.

İlk sürüm yerel snapshot dataset'tir. Canlı Google Sheets/API bağlantısı, auth/refresh, otomatik tekrar render ve uzak dosya paylaşımı sonraki ayrı kapsamdır. Dataset hash'i değişirse job eski sürümü açık gösterir; tamamlanmış çıktıyı kendiliğinden yenilemez.

Kabul aşamaları:

- **D0:** parser, typed mapping ve satır preview. Türkçe/uzun metin, eksik ve hatalı sayı için kontrol bazlı tanı; tanım/source sahne değişmez.
- **D1:** batch → mevcut RenderQueue2D. 10 satır × 3 varyant doğru ad/içerik manifest'iyle üretilir; cancel/retry yalnız ilgili işi etkiler; scene/asset/job bütçeleri korunur.
- **D2:** mapping/dataset portable round-trip, native MCP ve tekrar üretilebilir batch. Sürüm ve asset kaynakları korunur; kullanıcı override'ları kaybolmaz.

## 2. Sesin hareketi sürmesi — öncelik 5

**Hedef:** Ses yüksekliği, seçili frekans bantları ve ritim adaylarıyla scale, opacity, ışık veya particle miktarı gibi sayısal özellikleri sürmek; sonucu istenirse normal keyframe'e bake etmek.

Mevcut temel: decoded audio cache, timeline-owned clip, trim/loop/gain/fade/pan ve offline mix değerlendirme; AudioEngine'de canlı metre için AnalyserNode. Canlı analyser ölçümü final authoring/bake'in tek kaynağı değildir; sonuç render sıklığından bağımsız olmalı.

Önerilen `AudioFeatureClip`: source asset/mix hash'i, timeline ve zaman aralığı, sample rate, analysis window/hop, algorithm version, normalization ve zamanlı envelope/band/marker verisi. İlk kaynak seçili timeline'ın **post-gain/fade/master offline mix**'idir. Tek kaynak pre-fader analizi ayrı bir açık seçenek olarak daha sonra eklenebilir.

Özellikler: RMS/envelope, peak, low/mid/high band enerjisi; sonra beat adayları. Beat adayları kullanıcı tarafından düzeltilebilir marker'lardır; otomatik BPM veya her vuruşun kesin tespiti vaat edilmez. Sessizlik stabil sıfır üretir; clipping veya normalize ayarı görünür tanıdır.

Feature zamanı source sample → trim/loop/clip placement → timeline sözleşmesine göre eşlenir. Decode sample-rate farkı, pencere merkezinden doğan analiz gecikmesi ve son frame politikası kayıtlıdır. Gain/fade/trim/loop/master değişirse mix hash'i ve analiz stale olur. Aynı feature clip aynı zamanda aynı değeri verir.

Bağlantı mevcut controller/binding sistemi üzerinden tanımlanır: feature/band, input range, output range, offset, smoothing ve additive/multiply/replace politikası. Aynı property'nin keyframe/layout/binding sahipliği açık seçilir. İlk hedefler yalnız desteklenen scalar numeric properties'dir; renk/string/vector kanalları yanlışlıkla sayı işlemine sokulmaz.

Smoothing ve normalization konfigürasyonu kaydedilir; export veya scrub'da canlı zaman geçmişine bağlı yeni değer üretilmez. Feature cache portable projede taşınır. Desteklemeyen runtime'a gönderirken bağlanmış track önceden bake edilir veya açık tanı verilir. Sesin kendisinin export politikası ana export planıyla aynıdır.

Kabul aşamaları:

- **A0:** deterministik offline feature cache; sessizlik, tek impulse, sabit ton, iki klip/fade/trim fixture'ı.
- **A1:** non-destructive scalar binding ve preview. Aynı band iki nesneye farklı range ile bağlanır; scrub/seek tutarlı; orijinal track korunur.
- **A2:** feature → keyframe bake, marker düzenleme, portable/MCP ve runtime parity. Ses ile görsel zaman farkı belirlenen tolerans içinde ölçülür.

İlk dilim: 5 saniyelik miks → RMS envelope → bir kartın scale'ini sür → keyframe bake → live analyser olmadan aynı hareketi oynat.

## 3. Kelime zamanlamalı altyazı — öncelik 6

**Hedef:** Konuşmanın zaman kodlarına göre kelime vurgulama, okunabilir satır bölme, stil preset'i ve yeniden kullanılabilir caption bileşeni. Bu, eski backlog'daki genel per-character text animator'ın yerine geçirilmez; zamanlı altyazı akışını tamamlar.

Önkoşul [çoklu format planı](multiformat-production-2d-plan.md) M0 text layout/bounds. Kaynak model `CaptionDocument`: locale, audio/time reference, cue id, start/end, speaker/style ve isteğe bağlı word start/end. Cue-level zaman kodu kelime zamanlaması varmış gibi yorumlanmaz.

İlk giriş SRT/VTT, kelime zamanlı JSON veya elle düzenlenen metindir. Cue-level SRT/VTT için tam kelime vurgusu ancak ek word timing veya kullanıcının açık seçtiği approximate dağıtımla üretilir; yaklaşık hizalama etiketlenir. Bulut transkripsiyonu/otomatik audio upload ilk sürümde yapılmaz; sağlayıcı ve kullanıcı seçimi ayrı entegrasyon işidir.

Caption renderer, sabit satır yerleşimini ve active-word stilini ayırır. Bir kelime vurgulandığında bütün satır tekrar ölçülüp zıplamaz. Gerçek Unicode/grapheme/shaping, punctuation, Türkçe karakterler, font hazır olma ve safe area kuralları aynı TextLayoutResult üzerinden kullanılır.

Satır bölme maksimum satır/kelime uzunluğu, okunabilir font sınırı ve kullanıcının manuel kırımlarıyla belirlenir. Format varyantında yeniden yerleşebilir; zamanlar değişmez. Overlap, sıfır/negatif süre, eksik speaker, uzun cue ve video aralığı dışındaki zamanlar doğrulanır.

Cue ve kelime sınırları integer/rational zaman sözleşmesiyle değerlendirilir. Audio trim/time stretch/duration değişimi otomatik sessizce bütün zamanları kaydırmaz; açık offset/retime işlemi veya stale tanısı gerekir. Export frame'i değişse de aynı gerçek zaman için aynı kelime aktif olur.

İlk stiller: düz caption, active-word renk/vurgu ve arka plan kutusu. Bileşen kontrolleri font, renk, boyut ve safe-area yerleşimini açar. Native caption klibi, raster burn-in ve SRT/VTT text export ayrı çıktılardır; kelime bazlı efekti düz SRT'nin koruyacağı iddia edilmez.

Kabul aşamaları:

- **T0:** import/model ve cue/word zaman düzenleme; hatalı/çakışan zamanların görünür tanısı.
- **T1:** ortak text layout, active-word renderer ve variant safe-area. Türkçe, punctuation, uzun satır ve üç format fixture'ı; vurgu sırasında layout sabit.
- **T2:** portable, component preset, MCP ve burn-in/text export. Editor/player/sequence aynı kelimeyi aynı zamanda gösterir; text export timing'i korunur.

İlk dilim: 15 saniyelik word-timed JSON → iki satırlı caption → active-word vurgu → 9:16 ve 16:9 preview → native ve raster export.

## 4. Performans inceleme ve akıllı önizleme — öncelik 7

**Hedef:** Bütün projelerde CPU/main-thread, GPU/render, bellek/cache, medya/IO, UI/DOM ve worker/export/bake işlerini tek **Kaynak ve Performans** panelinde göstermek; ölçülmüş darboğazı ve güvenli preview/cache eylemlerini anlaşılır kılmak. 6 Kasım 2026 kapsam güncellemesiyle tek sahne veya yalnız bellek incelemesine bağlı değildir.

Canonical genel plan ve metric/panel sözleşmesi: [Genel optimizasyon ve kaynak yönetimi](../production-2d-roadmap.md#8-genel-optimizasyon-ve-kaynak-yönetimi). Temel collector/bütçe altyapısı ve panel OPT1'de erken teslim edilir; bu öncelik aynı veri kaynağına ileri trace/karşılaştırma ekler. Aşağıdaki PF0–PF2 bu ortak altyapının analiz alt dilimleridir; ikinci profiler, ayrı memory penceresi veya farklı bütçe yöneticisi kurulmaz.

Mevcut offscreen cache ve GPU/particle yapıları önce incelenir. Profiler layer sayısını tek başına FPS kapasitesi gibi kullanmaz. Timing ölçümleri device/browser, scene/profile ve sıcak/soğuk cache bilgisiyle kaydedilir. CPU zamanı GPU süresiymiş gibi gösterilmez; GPU query desteklenmiyorsa bu açıkça görünür.

Önerilen `PerformanceTrace`: sınırlı frame örneği ve stage/layer/instance id, CPU duration, cache hit/miss, allocation/estimated bytes, output pixels ve solver/export job ayrı süreleri. Ucuz budget sayaçları normal çalışır; ayrıntılı kayıt isteğe bağlıdır. Canonical varsayılanlar 500 ms UI refresh, 60 saniye özet ve detayda 10 saniye/1.200 frame/8 MiB sınırıdır. Değerler Ölçülen/Tahmini/Ölçülemiyor olarak etiketlenir. Veri yerel bounded buffer'dadır; otomatik dış telemetri yoktur.

UI, toplam frame süresini, p50/p95 ve en pahalı katkıları gösterir. Ölçüm kapsamı ve örnek sayısı görünürdür; tek frame'den performans hükmü verilmez. Native export daha yüksek kalite profili kullanıyorsa preview süresiyle doğrudan aynı sayıymış gibi karşılaştırılmaz.

Akıllı preview için static group/component veya hesaplanmış clip uygun hash ile cache'lenebilir. Anahtar; source/instance kontrolü, zaman, layout variant, font/asset sürümü, render ölçüsü, efekti ve parametreleri kapsar. Bu girdiler değişince cache invalid olur. Stale preview görüntüsü başarılı export kaynağı olamaz.

Kalite düşürme yalnız açık Preview Quality profilidir; source particle sayısı, fizik recipe'si veya final export ayarı değiştirilmez. Low/high farkı görünür olur. Bellek üst sınırı, LRU/eviction ve export asset pin'leme sözleşmesi doğrulanır.

Kabul aşamaları:

- **PF0:** stage trace ve ölçüm doğrulaması. Bilerek ağır bir text/particle/mask sahnesinde pahalı aşama doğru bulunur; disabled overhead ölçülür.
- **PF1:** UI/top contributors ve önizleme cache'i. Static group cache hızlandırma sağlarsa gösterilir; parametre/font/variant değişiminde doğru invalidation gerçekleşir.
- **PF2:** scene/export raporu ve MCP read API. Kullanıcıya gözlenmiş değer sunulur; cihazlar arasında garanti FPS veya kaynak sınırı iddiası verilmez.

İlk dilim: aynı sahnenin 120 frame'lik trace'i → en pahalı üç katkı → static component cache denemesi → cache açık/kapalı görsel eşitlik ve süre karşılaştırması.

## 5. Ortak entegrasyon ve doğrulama

Tüm işler aynı 2D scene/component/variant/compiler ve canonical export hattına bağlanır. Async analiz/render işleri ortak job yaşam döngüsünü kullanabilir; ağır çözüm synchronous QuickJS çağrısında yürütülmez. Exact MCP araçları ve property/controller şemaları uygulama sırasında capabilities/catalog ile kesinleşir. Native komutlar atomic undo ve revision/requestId kurallarını korur.

Class/job lifecycle, analiz/batch tamamlanması ve kullanıcı düzeltmeleri mevcut event/script yapısından erişilebilir olmalı. Sınırsız particle/frame olay akışı yerine kayıt bütçesi uygulanır. Canonical `skills/chorono/` uygulamayla birlikte güncellenir.

Testler ilgili feature'ın gerçek davranışını kapsar: deterministik veri/analysis, input tipleri ve zaman sınırları, alan sahipliği, UTF/font/layout, cache invalidation, stale/cancel, budget, tek undo ve portable/runtime/render parity. Yeni altyapı kullanılmadan aynı yardımcı tekrar yazılmaz.

Bu belge yalnız plan oluşturur. Uygulamada repo kontrolleri `npm test`, `npm run mcp:build`, `npm run build`; build öncesinde Next server durdurma kuralı geçerlidir. Bütün feature'lar yalnız 2D modundadır.
