# OPT0 başlangıç ölçümü

Güncel kapanış (8 Kasım2026): genel optimizasyonun büyük editör/uzun oynatma,
panel,undo-redo ve kaynak cleanup kabulü
[OPT32 raporunda](../../artifacts/performance/opt32-whole-editor-20261108/README.md)
tamamlandı. Sıradaki aşama Export E0'dır. Aşağıdaki OPT0 notları ilk renderer
ölçümünün tarihsel kapsamıdır;37GB ilk gözlemin kök nedeni iddia edilmez.

Bu araç genel optimizasyon öncesinde **renderer için tekrarlanabilir referans** alır. Üretim evaluator/renderer, asset ve ses hook'ları ile kaynak monitor'ını yeniden kullanır. Kaynak tüketimini azaltan bir optimizasyon uygulamaz. Tam editör/DOM profili, uzun oynatma soak testi ve 37 GB gözleminin süreç/sütun doğrulaması ayrı kabul işleri olarak açık kalır.

## Protokol ve anlamı

- Her fixture temiz bir tarayıcı sayfasında, tek başına çalıştırılır. Browser/GPU, viewport/DPR, kaynak ve bundle hash'leri rapora yazılır. `git HEAD` yanında kirli çalışma ağacının gerçekten kullanılan kaynaklarının hash'i bulunur.
- **60 saniye aktif/görünür ısınma**. Gizli sekmede geçen süre ısınmaya sayılmaz; kendi RAF zamanlayıcısı görünür kare bekler.
- Sonra sahne süresinin 0, 1/8, 1/4, 1/2, 3/4 ve son karesine yakın noktası **10 kez** örneklenir: 48 saniyelik sahnede 0/6/12/24/36/47.999 saniye. Toplam 60 zamanlanmış render örneği.
- Bu seyrek örnekleme, on adet kesintisiz 48 saniyelik oynatma döngüsü veya sunulan FPS diye raporlanmaz.
- `evaluateTimelines` ve `CanvasRenderer.render(..., renderMode:'preview')` senkron süreleri ayrı ölçülür. p50/p95 ortak `performance/sampleStatistics.ts` nearest-rank hesabını kullanır. SM/wire/binding, React commit, editor DOM ve video transport/seek bu renderer diliminin dışında kalır. Video fixture'ı sabit renkli, ses fixture'ı sessizdir; gerçek decode hazırlığı ölçümden önce beklenir.
- Tam çözünürlüklü RGBA SHA-256 referansları **bütün süre ölçümleri bittikten sonra** altı noktada alınır. Readback/hash maliyeti ve readback'in tetikleyebileceği backend değişimi zamanlanmış örneklere girmez.
- Bitişte ve 2.250 ms idle sonrasında kaynak snapshot'ı alınır. Bilinen kaynak belleği ile legacy Chromium heap değerleri ayrı kalır; bunlar süreç RAM'i diye toplanmaz.
- Bilinen kaynak tahmini **512 MiB** veya heap **768 MiB** aşarsa test kareler arasında durur, `incomplete` ve nedenini kaydeder. Bu guard bir native allocation'ı önceden engelleyen admission sistemi değildir. İptal de kısmi veriyi korur; başarısız veri sıfır tüketim sayılmaz.

## Modüller ve sahiplik

| Giriş | Sorumluluk |
| --- | --- |
| `src/lib/resources/benchmark/fixtures.json` | Sabit MCP-authored portable fixture kimlikleri; production kodunda özel sahne dalı yoktur. |
| `types.ts`, `BaselineRecorder.ts` | Protokol doğrulama, en fazla 1.200 numerik örnek ve sürümlü rapor. Scene, DOM/GPU handle veya piksel dizisi tutmaz. |
| `BaselineRunner.ts`, `VisibleTimeClock.ts` | Sıralı ısınma/örnekleme/referans aşamaları; visibility, guard, iptal ve incomplete davranışı. Platform adapter'ı enjekte edilir. |
| `__tests__/BaselineAssetsBridge.tsx` | Yeni loader yazmadan üretim `useAssetCache` ve `useAudioEngine` hazırlığını kullanır. Decode hatası/zaman aşımı test başarısı sayılmaz. |
| `__tests__/BrowserBaselineHost.ts` | Üretim evaluator, CanvasRenderer ve ProjectResourceMonitor bağlantısı. Kendi observation lease/listener/canvas'ını bırakır; bir fixture'ın singleton'ları yeni sayfada yeniden kurulur. |
| `__tests__/browser-baseline.tsx` | Yalnız test paketindeki başlat/iptal, durum, yerel JSON raporu ve son kare thumbnail'i. Production rotası veya yeni MCP aracı eklemez. |
| `scripts/perf/prepare.mjs`, `serve.mjs` | Var olan portable JSON'ları kopyalar, sayıları/hash'leri doğrular, test bundle'ı üretir ve loopback'te salt okunur sunar. Node üzerinden animasyon authoring çalıştırmaz. |

`CanvasRenderer.getLastLayerVisitCount()` root/child/repeater/mask/temporal girişlerini sayan mevcut counter'ı salt okunur açar. Bu değer görünen nesne veya draw-call sayısı değildir. `CanvasMemoryTracker.getRegistrationCount()` tekil canvas kaydı sayısıdır; fiziksel driver allocation sayısı değildir. Her ikisi de yeni render işi başlatmaz.

## Çalıştırma

Next sunucusu build/bundle üretmeden önce durdurulur. Mevcut sahne dosyaları üzerinde değişiklik yapılmaz.

```sh
npm run --silent chorono -- stop --json
npm test -- --maxWorkers=2
npm run mcp:build
npm run build
npm run perf:prepare
npm run perf:serve -- artifacts/performance/opt0-20261107/build 4319
```

`http://127.0.0.1:4319` açılır, fixture seçilir ve **Ölçümü başlat** tıklanır. Diğer CPU/GPU-ağır işler aynı anda çalıştırılmaz. Her tamamlanan/kısmi rapor ayrı JSON olarak saklanır. Her sonraki fixture için önceki sayfa kapatılıp temiz bir sayfa açılır; sayfa belleğinin Chromium realm paylaşımı nedeniyle süreç izolasyonu garanti edilmez. Çalışma sonunda geçici static server durdurulur, gerekiyorsa `chorono start --background --json` ile üretim editörü yeniden açılır.

`perf:prepare [output-directory]` başka bir klasöre aynı paketi hazırlayabilir. Paket kendi portable fixture kopyalarını içerir; orijinal JSON byte'ları ve kayıtlı kaynak hash'i uyuşmadan çalışmaz. Fixture bulunamazsa hazırlık hata verir; sessizce daha küçük/başka sahneye geçmez. Fixture'lar bu turda native MCP batch/QuickJS dry-run + plan commit ile oluşturulmuş ve `save_project` ile kaydedilmiştir; ilk ölçüm kanıtları çıktı klasöründe tutulur.

Bir warmup guard'ı görsel checkpoint'lerden önce durdurursa rapor `incomplete` kalır. Ayrı `?case=four-seasons&profile=visual-only` profili aynı byte sınırlarıyla ısınmasız 6 zaman × 1 tekrar ve ardından 6 hash üretir. Raporda `purpose:visual-checkpoints-only` bulunur; bu kısa çalışmanın CPU değerleri zamanlı baseline ile karşılaştırılmaz, başarısı eksik warmup'ı tamamlandı yapmaz. Varsayılan profil 60 saniye / 60 örnek olarak korunur; ayrı build/report dizinleri kullanılır.

## Matris ve açık kalan kapsam

3.000 görünür rectangle; aynı modelin 2.700'ü ekran dışında; 100 parent altında 3.000 child (90 parent sıfır alpha); 200 multiline text; tek PNG paylaşan 3.000 image; image/audio/video/particle/mask karışımı; değiştirilmemiş Four Seasons referansı. Sentetik dosyalar 1080p ve 48 saniyedir; mixed fixture 1080p/4 saniye, gerçek referans 1080p/48 saniye kalır.

Fixture görsel kontrolünde native MCP `add_layer` dolgu opaklığının 1, renderer'ın ise yüzde 0–100 kullanması nedeniyle rectangle'lar %1 opak görünüyordu. Sentetik vektör fixture'larında **gerçek model alanı `style.fill.opacity:100`** MCP patch'iyle ayarlanıp v3 olarak yeniden kaydedildi. Production davranışı bu aşamada değiştirilmedi. Bu API/model birim uyuşmazlığı export/schema tutarlılığı bulgusu olarak korunur. Yüksek katmanlı fixture'larda validator'ın `EXCESSIVE_LAYERS` tavsiye uyarısı beklenir; `valid:true` yapısal sonucu ayrıdır.

Uzun kesintisiz oynatma/GC/RSS ölçümü, editör panel açık/kapalı overhead'i, timeline/dope-sheet mounted DOM, dev/prod editör karşılaştırması, interaktif state/binding workload, pan/zoom, hızlı seek, 50 undo/redo, context loss ve export/iptal peak'i bu ilk renderer dilimiyle tamamlanmış sayılmaz. Kaynak raporu [render kaynak yönetimi](render-resource-management.md), genel sıra [OPT0–OPT4](../../plan/PRODUCTION_2D_ROADMAP.md#811-genel-teslim-sırası-ve-uygulama-genelinde-kabul) içindedir.

## Alınan ilk referans — 7 Kasım 2026

Gerçek Chrome'da yedi sahnenin tamamı `complete`: **420 süre örneği ve 42 kare hash'i**. [Sonuç, koşullar ve sonraki işler](../../artifacts/performance/opt0-20261107/README.md), [sayısal özet](../../artifacts/performance/opt0-20261107/summary.json) ve `reports/` altındaki ham JSON'lar birlikte korunur. Kaynak/bundle/fixture hash'leri ve zaman sıraları doğrulandı; benchmark sırasında kullanılan kaynak girdileri değişmedi.

8 GiB / Apple M2 / Chrome 156.0.8078.80, Enerji Tasarrufu açık koşulunda çizim p50/p95: görünür vektör **111,8/185,2 ms**, ekran dışı **102,5/146,6 ms**, saydam gruplar **411,7/534,4 ms**, metin **5,8/8,7 ms**, shared image **64,5/101,2 ms**, mixed **0,5/0,8 ms**, özgün Four Seasons **819,5/964,5 ms**. Bu ölçümler FPS veya optimizasyon kazancı değildir; ayrı iş yükleri ve birer tarayıcı denemesidir. Gözlem UI'sı açılmış ilk ekran dışı deneme ayrıca saklandı ve temiz tekrar ana tabloya alındı.

Ekran dışındaki 2.700 rectangle hâlâ 3.000 ziyaret; 90 saydam parent bulunan sahne 3.100 ziyaret üretiyor. Sade vektörlerde izlenen canvas belleği 7,91 MiB'da sabitken mixed/Four Seasons geçici canvas kayıtları artıyor. Shared PNG tek decoded kaynak olarak paylaşılıyor. Önce frame bağıntıları/index ve güvenli paint görünürlüğü; ardından dış mask/effect tampon sahipliği/ROI üzerinde çalışılacak. Toplam CPU maliyetinin bu alt aşamalara dağılımı henüz ölçülmedi; sızıntı veya 37 GB kök nedeni kanıtlanmış değildir.

**165 dosya / 1.538 test**, MCP build ve Next production build geçti; Next build öncesinde sunucu kapatıldı. Bu teslim başlangıç ölçüm altyapısıdır; kaynakları azaltan optimizasyon ve tam OPT0/OPT1 kabulü olarak işaretlenmez. Ham GPU draw sayaçları ve canvas kayıtları kümülatiftir; per-frame draw/physical allocation sayısı diye yorumlanmaz.

## OPT3 görünürlük karşılaştırması

Benchmark örnekleri artık `processedLayers` / `culledLayers` benzersiz ana-kare
sayaçlarını da taşır. Eski `layerVisits` tanımı korunur; örneğin 3.000 root ziyaret
edilip 2.700 çizim elenebilir. Tarihî raporların bu yeni alanları içermesi gerekmez.
`perf:prepare` ayrıca yalnız testte kullanılan `/paint-check.html` paketini üretir;
control-hull, mask/repeater/temporal geri dönüş ve panel sayacı yaşam döngüsü native
Canvas'ta optimizasyon kapalı referansa karşı kontrol edilir. Hazırlık manifest'i
bu paketin hash'ini ve iki bundle'ın bütün kaynak girdilerini de kaydeder.

[Görünürlük sözleşmesi](paint-visibility.md), [OPT3 ölçüm raporu](../../artifacts/performance/opt3-paint-20261107/README.md).
