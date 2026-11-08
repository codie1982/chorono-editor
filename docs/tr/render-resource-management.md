# Render ve proje kaynak yönetimi

Güncel durum (8 Kasım2026): input/native admission,font/PCM/visual/GPU/source,
çıktı/kayıt sahipliği ve büyük editör kabulü tamamlandı.
[OPT32 kapanış raporu](../../artifacts/performance/opt32-whole-editor-20261108/README.md)
10 tam oynatma,undo-redo,proje geçişi,panel maliyeti,heap/PID-RSS ve temizliği
kaydeder. Sıradaki aşama Export E0'dır. Aşağıdaki eski teslim notları kendi tarihsel
kapsamını korur;37GB ilk gözlemin kök nedeni veya toplam native RAM cap'i iddia edilmez.

Paused `ProjectResourceMonitor` artık scene değişiminde eski `countedScene`
referansını ve count cache'ini hemen bırakır. Sonraki snapshot'a kadar eski
projenin graph'ını tutmaz; aynı immutable scene'de sayımlar lazy/cache kalır.
`node scripts/perf/monitor-retention.mjs <artifact-directory>` ayrı Node explicit-GC
regresyonunu çalıştırır (Chrome kabul koşusunu etkilemez). Public API/scene JSON'u
değişmez; numeric panel snapshot'ı paused durumda bilinçli olarak eski kalabilir.

Bu belge, geçici katman/efekt/maske canvas'ları için ortak kaynak sahipliği ve proje genelindeki Kaynak ve Performans panelinin ölçüm sözleşmesini açıklar. Panel, viewport paint culling, bounded statik LOD ve [ara tampon ROI](mask-effect-roi.md) uygulanmıştır. [UI satır/track/thumbnail sanallaştırması](ui-virtualization.md) DOM çalışma kümesini ayrıca sınırlar. [Ortak admission bütçesi](shared-resource-budget.md) scratch/LOD owner'larına bağlanmıştır; medya residency ve bütün kaynakların entegrasyonu henüz tamamlanmış değildir.

Güncel ses entegrasyonu: [PCM sahipliği ve zaman penceresi talebi](audio-residency.md)
playback/waveform/offline input consumer'larını lease'e ve aynı bütçeye bağlar.
[Source/undo URL sahipliği](asset-source-lifetime.md) ve
[frame-driven image/video talebi](viewport-media-demand.md) de uygulanmıştır.
[GPU workspace sahipliği](gpu-resource-ownership.md) blur/motion/particle depolarını
da ortak bütçeye bağlar. Font sahipliği, geçici native/encoded tepe tahminleri ve
bütün editör kabulü halen açıktır. Aşağıdaki tarihli teslim notları kendi
aşamalarının kapsamını korur.

Genel optimizasyonun ilk renderer referansı [OPT0 başlangıç ölçümü](performance-baseline.md) ile alınmıştır: yedi iş yükü, 420 süre örneği ve 42 kare hash'i. [Gerçek sonuç raporu](../../artifacts/performance/opt0-20261107/README.md) canvas/medya/heap ve süreç belleğini ayrı yorumlar. Tam editör, uzun oynatma ve 37 GB kök neden doğrulaması açık kalır; bu ölçüm panelin kapsamını veya havuz bütçesini bütün uygulamaya genişletmez.

Sonraki [katman indeksleme dilimi](layer-indexing.md) grup çizim süresini azaltırken, Four Seasons iki kez ısınmada 512 MiB bilinen kaynak guard'ına takıldı. Bu uygulama RAM'i değil izlenen kaynak tahminidir; hızlı döngüde eski geçici yüzeylerin GC'den önce birikmesi araştırılacak. [Karşılaştırma raporu](../../artifacts/performance/opt1-index-20261107/README.md) 6/7 zamanlı tamamlanmayı ve ayrı profille 42/42 kare eşleşmesini birlikte kaydeder. Dış mask/effect yüzey sahipliği bütçe kabulünü kapatmak için öncelik kazanmıştır.

## Modül ve veri akışı

- `src/lib/render/resources/CanvasSurfacePool.ts`: geçici Canvas2D yüzeylerini ve RGBA8 byte rezervasyonunu yönetir.
- `CanvasSurfaceProvider`: render consumer'ının yalnız `acquire(width, height)` bağımlılığıdır.
- `CanvasSurfaceLease`: canvas/context ve idempotent `release()` sunar; kullanım `try/finally` içindedir.
- `src/lib/mask/MaskRenderer.ts`: ortak havuzdan content ve sırayla silhouette yüzeylerini alır, mevcut maske işlemlerini uygular ve yüzeyleri iade eder.
- `CanvasSurfaceScope.ts`: bir senkron çizim işleminin lease'lerini tutar; başka scope'un girdisini bırakmaz. `finally` içinde dispose edilir; scene/frame saklamaz.
- `LayerSurfacePipeline.ts`: dış content/final, native efekt zinciri ve maskelerin ortak provider ile sıralı ömrünü yönetir. Matris/selection işlemleri CanvasRenderer'da kalır.
- `src/lib/effects/withEffectSurfaces.ts`: yedi native efekt için ortak sahiplik adapter'ı; yalnız sonuç aktarılır, yerel ara yüzeyler hemen bırakılır.
- `renderSurfacePool`: bu consumer'ların ortak singleton'ıdır. Her katmana ayrı havuz/bütçe açılmaz. CanvasRenderer'a izole `CanvasSurfaceProvider` enjekte edilebilir.

Mevcut `createOffscreen` oluşturucusu kullanılır. `OffscreenCanvasCache`, key/version ile kalıcı içerik reuse'u için ayrı kalır; geçici yüzey lease'iyle aynı sahiplik modeli değildir. MaskRenderer'daki kullanılmayan cache constructor bağımlılığı küçük surface-provider sözleşmesiyle değiştirildi.

## Bütçe ve yaşam döngüsü

Varsayılan ortak havuz bütçesi **128 MiB**, boş yüzey grace süresi **2.000 ms**'dir. İlk yalnız-maske dilimindeki 96 MiB, dört eşzamanlı 4K RGBA8 yüzey (126,56 MiB) için genişletildi. Bütçe aktif + boş yüzeylerin `width × height × 4` tahminini kapsar; benchmark'ın **512 MiB bilinen kaynak guard'ı değiştirilmedi**. Dış content/final ve yedi native efektin output/ara yüzeyleri de bu havuzdadır. Ana canvas, GPU singleton/FBO/texture, medya ve JS heap bu havuzda değildir; uygulamanın toplam RAM'i sınırlandırılmış sayılmaz. Çok derin/yüksek çözünürlüklü eşzamanlı geçişler admission reddi alabilir; kaliteyi sessizce düşüren fallback yoktur.

1. Pozitif tamsayı backing-pixel ölçüleri ve byte hesabı doğrulanır. NaN/overflow veya zamanlayıcı aralığını aşan grace ayarı reddedilir.
2. Aynı boyutta boş yüzey varsa tekrar kullanılır. Aktif bir yüzey paylaşılmaz; recursive/nested render ayrı lease alır.
3. Yeni tahsis öncesinde bütçe kontrol edilir. Gerektiğinde en eski boş yüzeyler backing store'ları küçültülerek çıkarılır.
4. Aktif çalışma kümesi isteğe yer bırakmıyorsa allocation öncesi açıklayıcı RangeError döner. Render sonucu sessizce maskesiz başarılı gösterilmez. UI/proxy ve kapsamlı export admission politikası sonraki entegrasyondur.
5. Lease `finally` ile iade edilir. İki kez release sayacı bozmaz. Host, silhouette, lookup veya destination çizimi hata verse de aktif rezervasyon kalmaz.
6. İade edilen boş yüzey tek cleanup timer'ıyla grace sonunda bırakılır. Cleanup render/RAF döngüsü başlatmaz. `clearIdle()` aktif lease'i korur; `dispose()` yeni acquire'ı durdurur ve aktif yüzeyleri son release'te bırakır.

Yeniden kullanımda `canvas.width` aynı değere atanır. Bu native reset; önceki piksel, transform, clipping/path, save stack, alpha/filter ve origin-clean durumunun sonraki nesneye taşınmasını engeller. Yalnız `clearRect` veya property sıfırlama yeterli değildir. Tarayıcının backing store'u aynı fiziksel allocation'da tutacağı veya RSS'nin hemen düşeceği iddia edilmez. [Canvas reset/boyut sözleşmesi](https://html.spec.whatwg.org/multipage/canvas.html)

Lease süresince canvas ölçüsü değiştirilmez ve release sonrası canvas/context kullanılmaz. Yanlışlıkla yeniden boyutlandırılmış yüzey iade edildiğinde havuzda tutulmaz.

## Ölçüm ve olaylar

`getSnapshot()` bağımsız bir kayıt döndürür:

| Alan | Anlamı |
| --- | --- |
| `maxBytes` | Bu havuzun rezervasyon üst sınırı |
| `residentBytes` / `activeBytes` / `idleBytes` | Yönetilen tahmini pixel byte'ları; active + idle = resident |
| `peakResidentBytes` | En yüksek byte rezervasyonu; gerçek process peak'i değildir |
| `activeSurfaces` / `idleSurfaces` | Ödünç ve yeniden kullanılabilir yüzey sayıları |
| `allocations` / `reuses` | Başarılı canvas/context oluşturma ve tekrar kullanım sayıları |
| `evictions` / `budgetDenials` | Bırakılan yüzey ve admission reddi sayıları |

Native EventTarget üzerinden `allocation`, `eviction`, `budgetexceeded`, `dispose` olayları vardır. Consumer `addEventListener/removeEventListener` kullanır; güncel sayıları snapshot'tan okur. Her frame/reuse için telemetri event'i veya scene/history kaydı üretilmez. Panel bu snapshot'ı okur; yeni MCP aracı eklenmedi.

## Kaynak ve Performans paneli

Üst araç çubuğunda **Kaynaklar** veya **Menu → View → Kaynak ve Performans** ile açılır. `resourceMonitor` kimliğiyle mevcut dock içinde taşınır, kapatılır ve tekrar açılır. Tekrar açmak mevcut sekmeyi seçip genişletir; kopya panel oluşturmaz. Eski kayıtlı yerleşimde bu panelin bulunmaması düzeni sıfırlamaz. Varsayılan yeni yerleşimde sağ Properties grubundadır.

- `src/components/resources/ResourceMonitorPanel.tsx`: Genel, Medya, CPU / GPU ve Tamponlar kategorileri. `SurfacePoolSection.tsx`, genişleyen ortak havuzu gösterir; dock kimliği ve collector değişmez.
- `observeResourceMonitor.ts`: panel açık ve etkin sekmeyken 500 ms aralık; document gizlenince timer ve GPU gözlem lease'i bırakılır, görünür olunca hemen güncellenir. Unmount ve duraklatma listener/timer/query kaynaklarını kaldırır. Panel geçmiş örnek veya trace tutmaz; render süreleri ayrı bounded collector'dadır.
- **İzlemeyi duraklat** yalnız panel örneklemesini durdurur; animasyon, export ve havuzun kendi idle temizliği devam eder.
- **Boş yüzeyleri bırak** `clearIdle()` çağırır ve paneli hemen yeniler. Aktif lease, kaynak asset, scene ve undo korunur. Kümülatif sayaçlar sıfırlanmaz.
- Bellek **Tahmini · RGBA8**, işlem sayıları **Ölçülen · adet** olarak etiketlidir. `src/lib/format/formatBytes.ts` panel ve Assets görünümü için ortak IEC byte gösterimini sağlar.

Tamponlar kategorisi dış katman içeriği, native efektler ve maske yüzeylerini kapsayan ortak 128 MiB havuzunu gösterir. Canvas2D toplamına ikinci kez eklenmez. Proje genelindeki diğer kaynaklar aşağıdaki adapter'larla ayrıca izlenir; bu tek havuz bütçesi uygulamanın tamamına uygulanmış değildir. Kısa aktif lease'ler 500 ms örnekler arasına düşebilir; aktif yüzey sayısının sıfır olması o aralıkta render yapılmadığını kanıtlamaz. Ayrıntılı trace, grafik ve yerel rapor sonraki aşamadır.

## Proje genelinde toplama ve kapsam

`src/lib/resources/monitor/ProjectResourceMonitor.ts` kaynak sahiplerinin salt okunur tanı API'lerini birleştirir. React/platform çizim kodu içermez; setter yalnız güncel scene/media/callback referanslarını değiştirir, geçmiş sahneleri biriktirmez. Proje katman/timeline/track/keyframe sayıları scene kimliği değişince yeniden sayılır; büyük JSON kopyası veya her örnekte serialization yapılmaz. `getSnapshot()` numerik veri ve en fazla 25 medya satırı döndürür; arama/sayfalama bütün asset listesini kapsar. Scene, DOM/GPU handle veya kaynak URL'leri snapshot'a taşınmaz.

| Veri | Gerçek giriş noktası | Kapsam / kalite |
| --- | --- | --- |
| Canvas2D ve WebGL renk yüzeyleri | `memory/CanvasMemoryTracker.ts`; `createOffscreen`, `createWebGLOffscreen`, `CanvasRenderer.render` | Yaşayan yüzey boyutları × 4; RGBA8 tahmini. Aynı canvas kimliği bir kez sayılır; resize ve sıfır boyutlu eviction okunur. |
| Görüntü/sprite ve video | `monitor/mediaResources.ts`; güncel `useAssetCache` haritası | Gerçek element readiness/error ve decoded ölçüler. Görüntü RGBA8; video yalnız bir RGBA ekran karesi. Decoder, ağ tamponu ve driver kopyaları bilinmiyor. |
| Ses PCM | `AudioAssetService.getMemorySnapshot`, `AudioEngine.getResourceSnapshot`, `useAudioEngine.getResources` | Float32 sample × kanal; shared cache + engine/active-source pin'leri AudioBuffer kimliğine göre deduplicate edilir. LRU sırası değiştirilmez, decode başlatılmaz. Oturum cache'i önceki projeden kaynak tutabilir. |
| Kaynak dosya boyutu | Asset metadata `filesize` | URL kimliğine göre tek sayılan kaynak byte'ları; bilinmeyen boyut ayrı sayılır. Decoded RAM'e eklenmez. Font vb. cache durumu bağlı olmayan asset'ler “Durum izlenmiyor” kalır. |
| CPU değerlendirme ve viewport | `performance/RenderWorkMonitor.ts`; page `evaluateFrame`, `useCanvasRenderer` | `performance.now` ile senkron geçen süre. Ghost çizimi viewport'a dahildir; her stage en fazla 120 tamamlanmış örnek tutar. Son 5 sn ortalama/p95, son 1 sn gözlenen çizim ve toplam süre ayrı. |
| GPU workload ve buffer'lar | `performance/GpuWorkRegistry.ts`; WebGLInstancedQuadBackend | Gerçek draw/son instance, ayrılmış VBO kapasitesi ve CPU staging byte'ı. Sistem GPU kullanım yüzdesi değildir. |
| GPU draw zamanı | `render/gpu/WebGLDrawProbe.ts` | Destekli WebGL2 extension ile instanced draw çevresindeki asenkron süre. En fazla 3 pending query; sonuç ancak available ve disjoint değilse ns → ms. WebGL1/extension yoksa bilinmiyor; context loss sonucu geçersizleştirir. Canvas2D composition/diğer pass'ler dahil değil. |
| JS heap | `memory/BrowserMemoryReader.ts`; `performance.memory` | Chromium legacy tahmini; realm paylaşımı ve worker kapsamı nedeniyle proje/process RAM'i değildir. |
| Sayfa bellek örneği | Aynı reader; `measureUserAgentSpecificMemory` | Yalnız açık kullanıcı eylemi; secure + cross-origin isolated capability ve tek pending ölçüm. Hata/eksik destek sıfır sayılmaz; attribution URL'leri tutulmaz. Güvenlik header'ları değiştirilmez. |

**Bilinen kaynaklar** = tracked Canvas2D + WebGL renk yüzeyi + görüntü RGBA8 + tek video karesi + tekil PCM + izlenen VBO + CPU staging. Maske havuzu tracked Canvas2D'nin alt kümesi olduğundan tekrar eklenmez. Heap ve sayfa ölçümü bu toplamla veya birbirleriyle toplanmaz. Bu kısmi toplam tüm proje/işlem RAM'i, fiziksel VRAM veya sistem CPU/GPU yüzdesi diye sunulmaz. JS nesneleri/undo/path cache'leri heap tahmininde yer alabilir; bütün worker, driver, decoder ve browser kopyaları için tam kaynak muhasebesi yoktur.

Canvas takibi **WeakRef + FinalizationRegistry** kullanır; kaynakları canlı tutmaz. Timer çalıştırmaz ve canvas yaratmaz. GC sonrasındaki bookkeeping temizliği finalizer veya snapshot sweep ile olur; fiziksel bellek bırakılma zamanını belirlemez. Bütçeleme ve dispose yetkisi asıl sahibinde kalır. GPU query'leri yalnız görünür/gözlenen panelde etkindir; panel kapanınca/duraklatılınca son gözlem lease'i pending query'leri bırakır. CPU sayaçları panel kapalıyken de sabit kapasiteli 120 örneklik buffer ile çalışır; UI render veya RAF başlatmaz.

Minimal kullanım:

```ts
const monitor = new ProjectResourceMonitor({ scene, media: assetCache,
  isPlaying: false, audio: audioTransport.getResources,
  audioErrors: () => audioTransport.getState().errors })
const snapshot = monitor.getSnapshot() // polling'in sahipliği paneldedir
// Current scene/cache changed: monitor.setInputs(nextInputs).
// Only while actively observed: const release = monitor.observe(); release() on close.
```

Sınırlar için birincil API belgeleri: [Chromium heap](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory), [sayfa bellek ölçümü ve güvenlik koşulları](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory), [Khronos WebGL2 timer query sözleşmesi](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).

## Kullanım

```ts
const lease = renderSurfacePool.acquire(width, height)
try {
  drawContent(lease.context)
  destination.drawImage(lease.canvas, 0, 0)
} finally {
  lease.release()
}
```

Bu örnekte `drawContent` ve `destination` caller'a aittir. Ölçüler CSS pikseli veya zoom değil, gerçek backing boyutudur. Alpha, efekt halo'su ve koordinat dönüşümleri render consumer'ının sözleşmesinde kalır. Sonraki ROI/quality entegrasyonu origin/output ölçeğini ayrıca tanımlamalıdır.

## Doğrulama

Unit testler aynı anda aktif lease izolasyonu, yeniden kullanımda reset, budget preflight, idle eviction/grace, dispose, allocation/context başarısızlığı, idempotent release ve mask callback hatalarını kapsar. 3.000 maskelik tek liste ve sonraki 60 karede iki yüzeyle bounded allocation kontrol edilir. Bu, 3.000 katmanlı gerçek projenin process RAM ölçümü değildir.

Panel testleri 500 ms örnekleme, gizli document/resume, idempotent unsubscribe ve yeniden mount sırasında tek timer, gerçek pool sayaçlarının panel adapter'ına aktarılması, aktif lease korunarak temizleme ve kapsam etiketlerini kapsar. Dock testleri eski/kapalı panel içeren kayıtları korur; tekrar açma, genişletme ve duplicate/corrupt kayıt reddini doğrular. Resource paneli odaktayken Delete/Backspace sahne nesnesi veya keyframe silmez. Ortak byte gösterimi IEC birimlerini doğrular.

İlk maske paneli tesliminde **156 dosya / 1.507 test**, MCP ve Next üretim derlemeleri geçti. Chrome'da araç çubuğu/menüden açma, duraklatma, Enter ile sürdürme, idle temizleme mesajı, kapsam detayı, kapatma/tekrar açma ve tekrar açmada tek panel davranışı doğrulandı. Odaktaki panelde Backspace sonrası demo sahnenin iki katmanı korundu.

Proje geneli genişletmede **163 dosya / 1.523 test**, `tsc --noEmit --incremental false`, MCP ve Next üretim derlemeleri geçti. Yeni testler 3.000 medya için bounded sayfalama, kaynak/decoded boyut ayrımı, tekil PCM/pin muhasebesi, canvas kimliği/resize, sahne değişimi, heap/query/pool toplamlarının ayrılması, single-flight bellek örneği, CPU kapasitesi ve GPU unavailable/disjoint/query cleanup yaşam döngüsünü doğrular.

**Gerçek MCP + Chrome doğrulaması:** ayrı test editörüne `import_asset` ile 128×128 PNG, 1 saniyelik sessiz mono WAV ve 128×72 video eklendi; 256 max parçacıklı emitter, bir maske ve explicit `resource_monitor_qa` timeline'ı kullanıldı. Panel 3/3 hazır kaynak, görüntü **64 KiB**, video karesi **36 KiB**, bu tarayıcıdaki çözülmüş PCM **172,3 KiB** gösterdi. CPU viewport/değerlendirme süreleri ve WebGL2 draw/instance/buffer sayaçları arttı; destekli GPU draw query'sinde yaklaşık **0,06 ms** gözlendi. Bu değer performans hedefi veya genel GPU tüketimi değildir. İzleme duraklatıldıktan sonra MCP seek ve devam eden oynatma sırasında panel metni birebir sabit kaldı; sürdürme güncelledi. Medya araması, oynayan video sayacı ve mask cleanup mesajı doğrulandı.

`validate_scene` → `valid:true, warnings:[]`; 800 ve 2.500 ms PNG önizlemeleri incelendi. Son durumda oynatma duraklatıldı, timeline izolasyonu `[]` ile kaldırıldı, audio loading/error listeleri boştu. [Taşınabilir MCP test projesi](../../projects/resource-monitor-mcp-qa-20261107-v1.chorono.json) **35.375 byte**, revision 6 olarak kaydedildi. Bu küçük fixture 3.000 katmanlı projenin RSS/FPS benchmark'ı değildir.

Tam repo kontrolleri:

```sh
npm test -- --maxWorkers=2
npm run mcp:build
npm run build
```

Next build öncesinde Next dev/production sunucusu durdurulur. Bu iç render değişikliği MCP/script API'sini değiştirmez.

Gerçek tarayıcı fixture'ı `src/lib/render/resources/__tests__/browser-check.ts` içindedir. Eski algoritmanın yalnız testte tutulan referansını yeni renderer ile karşılaştırır: add/subtract/intersect, feather, opacity, inversion, birden fazla clip, boş/kayıp mask ve kareler arası reuse. RGBA kanalları aynı browser/backend içinde byte-byte karşılaştırılır. Kalıcı uygulama koduna test giriş noktası veya ikinci maske algoritması eklenmez.

Çalıştırmak için:

```sh
mkdir -p /tmp/chorono-surface-qa
./node_modules/.bin/esbuild src/lib/render/resources/__tests__/browser-check.ts --bundle --platform=browser --outfile=/tmp/chorono-surface-qa/check.js
printf '%s\n' '<!doctype html><html><body><script src="check.js"></script></body></html>' > /tmp/chorono-surface-qa/index.html
python3 -m http.server 4318 --bind 127.0.0.1 --directory /tmp/chorono-surface-qa
```

`http://127.0.0.1:4318` sayfasını aç; kaynak değişirse bundle'ı yeniden oluştur ve sayfayı yenile. PASS, bütün piksel karşılaştırmalarının sıfır fark vermesini, iki havuz yüzeyiyle reuse'u ve grace sonrası sıfır resident byte'ı gerektirir. İş bitince geçici HTTP sunucusunu durdur.

İlk Chrome doğrulaması: **14 senaryoda sıfır değişen RGBA kanalı**, 60 ek karede **2 allocation / 155 reuse**, grace sonrası **0 resident byte**. Bunlar bu fixture'ın sonuçlarıdır; genel FPS, RSS veya 37 GB probleminin tamamen çözüldüğü iddiası değildir.

Sonraki entegrasyonlar: paint-bounds/ROI ve viewport görünürlüğü, decoded medya residency ve uygulama genelinde admission/job yaşam döngüsü. Dış mask/native effect yüzeylerinin ortak havuza alınması aşağıdaki teslimde uygulanmıştır.

## Efekt sahipliği ve devir — 7 Kasım 2026

`EffectPlugin.apply(input, effect, surfaces?)` girdiyi ödünç alır. Aynı girdiyi veya yeni caller-owned sonucu döndürür. Managed context verildiğinde bütün yeni output/ara yüzeyler bu allocator'dan alınmalıdır; output döndüren eski eklenti bu sözleşmeyi sağlamıyorsa açıklayıcı hata alır. Cached/borrowed yabancı GPU çıktısı yeni sahip olunan output yerine döndürülemez. Built-in GPU blur sonucunu değişmeden ödünç alıp kendi leased Canvas2D output'una kopyalar; singleton GPU canvas'ı release edilmez.

İki argümanlı standalone kullanım normal canvas sonucu döndürmeye devam eder. Yerel ara yüzeyler açıkça küçültülür; caller final sonucu/girdiyi yönetir. `EffectRegistry.applyChain` input'u bırakmaz; önceki sonuç yeni geçişte tüketilince hemen bırakılır. Final sonuç caller'a geçer. Managed pipeline ilk host'u zincir bitince bırakır; mask content/final geçişleri eski çizim sırasını korur. Render/admission/lookup/composite hatasında `finally` cleanup çalışır ve maskesiz bir kare başarılı sayılmaz.

```ts
import { withEffectSurfaces, type EffectPlugin } from '@/lib/effects'

const copyEffect: EffectPlugin = {
  type: 'copy',
  apply: withEffectSurfaces((input, _effect, surfaces) => {
    const out = surfaces.create(input.width, input.height)
    out.getContext('2d')!.drawImage(input, 0, 0)
    return out // native adapter sadece sonucu caller/scope'a aktarır
  }),
}
```

Native piksel regresyon girişi `src/lib/effects/__tests__/browser-surface-check.mjs` içindedir. Yedi eski efektin dondurulmuş `.snapshot` referansları yalnız testte bulunur; production bunları import etmez. Önce/sonra bütün CSS ve GPU yolları aynı native browser'da karşılaştırılır. Render canvas'larına `getImageData` uygulayıp reuse sırasında backend'i değiştirmemek için yalnız ayrı `willReadFrequently` kopyaları okunur; input'un kendisiyle karşılaştırılması da sıfır fark şartıdır. İlk doğrudan-readback denemesindeki farklar ayrı log'da tutulmuştur; piksel toleransı artırılmamıştır.

Hazırlamak için Next kapalıyken `npm run perf:prepare -- artifacts/performance/opt2-surfaces-20261107/build`; ardından native test bundle'ı:

```sh
./node_modules/.bin/esbuild src/lib/effects/__tests__/browser-surface-check.mjs --bundle --platform=browser --target=es2022 --loader:.snapshot=ts --outfile=artifacts/performance/opt2-surfaces-20261107/build/effects-check.js
```

Basit `effects.html` test script'ini yükler; `npm run perf:serve -- artifacts/performance/opt2-surfaces-20261107/build 4319` ile yalnız loopback'te sunulur. Normal Four Seasons ölçümü `/?case=four-seasons` varsayılan profilidir: 60 aktif saniye ısınma + 6 zaman × 10 tekrar, aynı 512/768 MiB guard'ları. Çalışma bitince geçici server kapatılır. [Güncel ham rapor ve karşılaştırma](../../artifacts/performance/opt2-surfaces-20261107/README.md).

Son doğrulama: **169 dosya / 1.593 test**, TypeScript, MCP ve Next build geçti. Native referanslara karşı **44 efekt + 14 maske** senaryosunda sıfır değişen RGBA kanalı; iki sahnede 120 süre örneği ve 12/12 eşleşen hash. Four Seasons artık aynı guard ile complete: **49,79 MiB** bilinen kaynak sabit, **165,5/205,4 ms** çizim p50/p95; süre örneklerinde yeni canvas kimliği 0, idle sonunda havuz 0 byte. Son koşu havuz tepe rezervasyonu **23,73 MiB / 3 yüzey** ile eski 96 MiB'ın da altındadır. Karma sahnede 118 → 0 canvas kayıt artışı ve 49,84 MiB sabit kaynak var. Çıktı 1920×1080 kalırken Four Seasons browser viewport yüksekliği ilk referanstan 56 px farklıydı; raporda belirtilir. Bu kısa kabul süreç RAM'ini veya uzun oynatma plateau'sunu kanıtlamaz.

## Görünürlük ve katman sayaçları — 7 Kasım 2026

[Paint görünürlüğü](paint-visibility.md) tamamlandı: CSS pan/zoom, boyalı sınırlar ve
muhafazakâr efekt/dependency geri dönüşleri. Kaynaklar panelinde Genel ve CPU / GPU
kategorileri son ana viewport karesinin toplam/çizime giren/elenen katmanlarını ve
ayrı ziyaret sayaçlarını gösterir. Ghost/export güncellemeleri panel örneğine karışmaz.
Sahne verisi ve decoded kaynaklar korunur. Effect ROI, medya residency ve job/admission
sonraki ayrı işlerdir; görünürlük elemesi süreç RAM'inin tamamını ölçmez/boşaltmaz.

## Statik grup LOD

[Statik grup LOD](static-group-lod.md), owned proxy'leri ayrı 64 MiB/256-entry
bütçeyle tutar. Canvas2D pixel byte'ları toplamda tek kez sayılır; metadata/cap
ve hit/miss/eviction bilgileri ayrıca gösterilir. Idle iki saniyede release ve
allocation öncesi ret vardır. Legacy borrowed cache API'si korunur.

## Maske ve efekt ara tamponlarında ROI

[ROI sözleşmesi](mask-effect-roi.md), native kaynak rasterizasyonu ve son birleşim
boyutunu koruyarak aradaki efekt/maske yüzeylerini küçültür. GPU blur/glow/shadow ve
tint opt-in sözleşmesi kullanır; CSS blur ve extent bağımlı efektler tam alanda kalır.
GPU kaybında kısmi lease'ler bırakılıp tek tam-domain retry vardır. Havuz değişen
animasyon boyutları için idle canvas'ı resize ederek tekrar kullanır; boyut başına
kalıcı scratch cache oluşturulmaz. 128 MiB pool ve 512/768 MiB benchmark guard'ları
korunur. Kaynak tanımları ve decoded medya eviction'ı bu işin kapsamı değildir.

## Viewport zamanlaması ve lifecycle indeksi — 7 Kasım 2026

`useCanvasRenderer` browser invalidation/ResizeObserver ve tek bekleyen çizim
işinin sahibidir. Mevcut `createLatestFrameScheduler` kullanılır; React commit'leri
bir sonraki browser karesinden önce gelirse önceki görev iptal edilir ve son
committed snapshot çizilir. Dependency cleanup/unmount eski scene görevini iptal
eder. Son paused/seek durumu da çizilir; sürekli idle RAF/polling yoktur. Upstream
evaluation, runtime olayları, state machine ve medya saatleri atlanmaz/yuvarlanmaz.

`src/components/canvas/render/drawViewportFrame.ts` önceki senkron çizim/ghost
adapter'ını tutar. Canvas caller'a aittir; referanslar çağrı boyunca ödünç alınır.
CSS bounds çalıştırma anında okunur; koordinatlar composition backing pixel,
zaman global ms ve viewport scale CSS ölçeğidir. Ana render/ghost sırası korunur.
RenderWorkMonitor gerçek synchronous draw süresini sayar; kuyruk bekleyişi dahil
değildir. `CanvasRendererOptions` eski hook yolundan type re-export edilir. Final
renderer/MCP preview'nin senkron çağrıları editor scheduler'ına girmez.

Minimal kullanım: `useCanvasRenderer(canvasRef, { scene, timeMs, assets,
selectedLayerId: null, snapEnabled: false, snapToGridOn: false, gridSize: 10,
dragOverrides })`. Consumer scene/map girdilerini ilgili veri değişene kadar
stabil tutar. Draw callback yeni bir resource/cache sahibi oluşturmaz.

`detectLifecycleEvents`, ileri zaman geçişinde bir frame-local `LayerTrackIndex`
oluşturur. Canonical ID completion sorgusu O(track + layer + eşleşme)'dir;
O(layer × track) taraması kaldırıldı. Son authored key zamanı, duplicate target,
katman/olay sırası, marker/segment/frame ve görünürlük davranışı korunur. Track
sıralama/yorumlama değişmez; noktalı/boş eski ID prefix yolu kalır. Equal/backward
zamanda forward completion taranmaz; diğer olaylar hesaplanır. İndeks çağrı sonunda
bırakılır; scene/undo'ya yazılmaz. React runtime ve standalone player zaten bu ortak
fonksiyonu kullanır; ikinci evaluator algoritması yoktur.

Native scheduler kabulü: 20 commit → **20 yerine 1 çizim**, **20 evaluation**
korunmuş. Simple/Four Seasons son kare, seek, pan/zoom ve küçük ghost için toplam
**7/7 hash eşliği**; paused resize, idle sıfır çizim, remount ve pending unmount
iptali geçti. Four Seasons örneklenen known kaynak **44,26 MiB**, guard **512 MiB**.
Bu burst testi sabit FPS/steady-state CPU kazancı değildir; normal playback her
frame'de çizim gerektirebilir. [Ham raporlar ve sınırlar](../../artifacts/performance/opt9-runtime-20261107/README.md).
Ortak admission/medya residency, job backpressure ve uzun oynatma/panel overhead/
plateau/RSS kabulü halen tamamlanmamıştır.

## Runtime input ve saat sahipliği — 7 Kasım 2026

`src/lib/runtime/scheduling/RuntimeFrameScheduler.ts` yalnız mutable talep/dirty
bitleri ve detached sayaçlar tutar; scene, event veya medya payload'ı tutmaz.
Mevcut `createLatestFrameScheduler` ile tek bekleyen görev kullanır. Schedule/cancel
fonksiyonları browser adapter'ı `useRuntimeFrameSignal` tarafından verilir. Idle
durumda görev yoktur. Segment ve SM test modu aynı görevi paylaşır; global playback
host'u zaten zaman üretiyorsa runtime kendi RAF'ını açmaz. Global clock durunca
kalan segment/SM talebi aynı tek runtime görevine geçer. Kaynak saat ve hızlar
değişmez: segment ve blend wall-clock ms, ana timeline global composition ms'tir.

`useInteractiveRuntime(scene, { playbackDriven: isPlaying })` kullanıcısı global
zaman, scene, parametreler, segment state ve `frameRevision` ile evaluation memo'sunu
geçersiz kılar. `playbackDriven:true` yalnız host gerçekten global zamanı ilerletip
her karede evaluate ediyorsa verilmelidir. Varsayılan false bağımsız preview için
runtime'a talep halinde kendi clock'unu verir. Eski segmentTick/smTestTick alanları
korunur; inactive/host-driven durumda son değerlerini tutarlar. Yeni tüketici
runtime kaynaklı input için `frameRevision` kullanır. Örnek:

```tsx
const runtime = useInteractiveRuntime(scene, { playbackDriven: isPlaying })
const frame = useMemo(() => runtime.evaluateFrame(timeMs), [
  scene, timeMs, runtime.paramValues, runtime.segmentState, runtime.frameRevision,
])
// Canvas, audio/video sync ve MCP aynı frame'i paylaşır; ayrı ayrı evaluate etmez.
```

`fireEvent` ve dış `dispatchSMEvent` paused preview'yi bir kez invalidate eder.
Scheduler yalnız isteği birleştirir; input payload'ları FIFO kuyrukta korunur.
Evaluation başlangıcı dirty input'u acknowledge eder ve kuyruk snapshot'ını alır.
Bu pass sırasında üretilen feedback sonraki pass'te hem SM hem trigger bridge'inden
bir kez geçer. Bu, eski SM emit'in yalnız trigger'a ulaşıp SM geçişini kaçırmasını
düzeltir. Parametre aksiyonu sonraki effective map'e yansır; recursion aynı pass'e
geri sokulmaz. Blend'i zaman içinde ilerletmek için playback veya SM test clock'u
aktif olmalıdır. Scheduler event feedback döngülerini kesmez ve event kuyrukları
için genel job/backpressure politikasının yerini almaz.

`useRuntimeParameters`, mevcut `ParameterStore`'u preview'ye özel instance olarak
kullanır; global store'u paylaşmaz. Strict equality aynı yazımı bastırır. Yeni
readonly revision getter'ı gerçek değişimde ilerler; effect subscription ilk
commit'e kadar oluşmuş yazımları revision tekrar okuyarak yakalar. Aynı parametre
ve boş reset map kimliğini/evaluation'ı değiştirmez. Snapshot caller-owned kopyadır;
store/scene/undo birbirine yazılmaz. Source default'ları ve unknown debug override
anahtarlarının mevcut merge semantiği korunur. Listener unmount'ta bırakılır.

SM tanımı aynı immutable object ise sync yapılmaz; yeni tanım bir kez sync edilir,
aktif state korunur. Segment completion microtask'i yalnız segmentRef hâlâ boşsa
state'i temizler; arada başlayan yeni segmenti silemez. Frame cleanup tek pending
task'i iptal eder. Stop/start dirty intent'i StrictMode effect replay için korur;
stopped instance yayın yapmaz. Genel project-switch/undo ve uzun RSS kabulü ayrıca
uygulanacaktır; bu küçük native fixture onların yerine geçmez.

[OPT10 kanıtları](../../artifacts/performance/opt10-runtime-signals-20261107/README.md):
17 native kontrol; global playback+segment+SM için steady RAF **3→1**, aynı parametre
20 tekrarında **20→0 evaluation**, FIFO 50/50 input, feedback geçişi, paused olay,
segment/blend timing, completion yarışı ve 10 unmount döngüsü. Four Seasons aynı
512 MiB guard ile **44,26 MiB known**, OPT9'un 7/7 hash'i korunmuş. Genel kaynak
bütçesi/admission, medya residency ve ağır job backpressure/cancel bu teslim tarihinde sıradadır; aşağıdaki scratch/LOD entegrasyonu ilk kısmı ilerletir.

## Ortak admission ve aktif cache pin'leri — 7 Kasım 2026

`src/lib/resources/budget` platformdan bağımsız ledger'ı sağlar. Pending ve resident
allocation'lar aynı 512 MiB / 4.096 kayıt limitini paylaşır. `renderSurfacePool` ve
`staticGroupLodCache` native allocation öncesi rezervasyon yapar; yerel 128/64 MiB
sınırları korunur. Aktif scratch ve LOD lease'leri protected'tır; global LRU yalnız
idle owner'ı temizleyebilir. Cleanup başarısızlığı kaydı silmez. LOD clear/invalidate
aktif canvas'ı retire eder; son consumer bırakana kadar canvas ve charge kalır.
Composite/restore hatasında GroupLodFrame finally pin'i bırakır.

Overview'daki **Managed allocation budget** bu sınırlı kapsamı açıklar; charged,
resident/pending, protected/reclaimable, peak ve ret sayaçları görünür. Known/heap
toplamına eklenmez. Idle temizleme kaynak medya veya undo'yu silmez.

[OPT11 native kanıtları](../../artifacts/performance/opt11-shared-budget-20261107/README.md):
9 bütçe/panel, 22 LOD, 59 ROI ve 22 paint kontrolü geçti. 60 saniye ortak görünür
ısınma ve 60 dengeli çiftte Four Seasons 6/6 RGBA hash eşliği korundu. Her iki
renderer için örneklenen known peak **44,47 MiB** (512 MiB guard); adayın kayıtlı
scratch peak'i **21,07 MiB**, 2,25 saniye idle sonrası charge ve scratch **0**.
Bu fixture'da LOD cache kullanılmıyor; medya/GPU admission kabulü değildir.

Arşivlenmiş OPT6 schema-stage bundle referansıyla frame CPU p50 **294,8→278,3 ms**,
p95 **835,6→804,6 ms** ölçüldü. Evaluation p95 **49,8→71,5 ms** ve yüksek uç
oynaklığı da rapordadır. Bu yalnız bütçe değişikliğini izole eden deney veya FPS
garantisi değildir; kaynak hash'leri ve mevcut/önceki bundle kimlikleri raporda
saklıdır. Önceki farklı koşullardaki sürelerle başarı yüzdesi hesaplanmaz.

Son kontroller 185 dosya / 1.685 test, TypeScript, MCP build ve Next build geçti.
Kaynak sözleşmesi, örnek ve aşamalı entegrasyon sınırları
[shared-resource-budget.md](shared-resource-budget.md) belgesindedir. Sıradaki iş
decoded medya/PCM, source/undo sahipliği ve bounded hazırlık; ardından ağır job ve
uzun bütün-editör kabulüdür. Export E0 henüz başlamadı.

## Medya hazırlığı kuyruğu ve consumer iptali — 7 Kasım 2026

`src/lib/resources/jobs` içindeki `BoundedJobQueue`, ilk somut tüketicisi olan
AudioAssetService'in fetch+decode hazırlığını **2 aktif / 128 bekleyen** ile
sınırlar. URL dedupe admission öncesindedir. Her engine/waveform consumer kendi
abort signal'ına sahiptir; tek consumer'ın iptali diğerini durdurmaz. Son consumer
iptal olunca fetch abort edilir, non-abortable native decode gerçekten bitene
kadar slot korunur. Geç sonuç cache'e yazılmaz; aynı URL ile yeni talep etkilenmez.

AudioEngine remove/replacement/dispose ve waveform overview/detail effect cleanup
kendi consumer'ını bırakır. Source URL revoke edilmez. `clear()` eski borrowed
caller'ları korur; explicit `cancelPending()` generation iptalini yapar. Media
sekmesi active/queued, concurrency ve cancelled/denied sayaçlarını gösterir;
eski adapter'da veri yoksa Not tracked görünür. CPU yüzdesi veya PCM byte sınırı
olarak etiketlenmez.

[OPT12 native kabulü](../../artifacts/performance/opt12-audio-preparation-20261107/README.md):
gerçek Web Audio ile **10/10** kontrol, stereo PCM/waveform eşliği, aynı URL'nin
bağımsız consumer'ları, stale generation ve engine remove/re-add geçti. Gerçek
panelde **2 aktif / 4 bekleyen → 0 / 0** görüldü. Private completion gate geç
native teslimi kontrollü tutar; AudioBuffer değerleri gerçek decoder'dan gelir.
188 dosya / 1.702 test, TypeScript, MCP ve Next build geçti.

Bu teslim PCM lease/shared byte admission değildir. AudioEngine hâlâ bütün audio
asset'lerini ister ve cache dışında buffer referansları tutabilir. Genel worker,
image/video, source/undo sahipliği ve uzun tam-editör kabulü açık kalır. Sonraki
adım PCM sahipliği + audible zaman penceresi talebidir. Public entry point, örnek,
hata ve lifecycle sözleşmesi [resource-job-queue.md](resource-job-queue.md).

## PCM lease, shared admission ve audible demand — 7 Kasım 2026

AudioPcmCache + ResourceBudgetGroup yerel 256 MiB / 128 kayıt ve global 512 MiB
sınırını aynı PCM owner'ına uygular. Mevcut ResourceBudget LRU/admission yeniden
kullanılır. Delivery, engine, native source ve detail waveform ayrı consumer
pin'leri tutar; invalidate aktif kaydı retire eder, son pin'e kadar charge kalır.
Idle PCM en fazla 2 saniye warm tutulur; pressure veya Release unused resources
daha erken çıkarabilir. Native source setup/start hata yolları pin'i temizler.

Ana useAudioEngine artık bütün scene.assets'i hazırlamaz. AudioDemandResolver
mevcut audio visibility/scope/clone/clip hesaplarıyla current + 500ms lookahead
talep üretir; hierarchy/asset index'leri immutable kimlik değişiminde yenilenir.
Görsel viewport audio talebini etkilemez. Tamamlanan yükleme en güncel transport'u
reconcile eder; aynı demand için recursive promise döngüsü oluşmaz.

Overview/Media PCM byte partition'larını ve resident/loading/not-resident ayrımını
gösterir. Retired PCM sayısal kaynak envanterinde kalır; panel sampling LRU/grace'i
yenilemez. Raw compatibility load fonksiyonları deprecated; gerçek playback,
waveform, normalize ve mevcut offline input caller'ları lease'e geçti. Dosya/JSON,
undo ve MCP tool şemaları değişmedi.

[OPT13 kanıtları](../../artifacts/performance/opt13-audio-residency-20261107/README.md):
1.722 test / TS / MCP / Next build; gerçek Web Audio + hook + waveform + panelde
14/14 native kontrol. 3.002 kaynakta ilk pencere bir decode; 10 seek iki decode
ve sabit 38.400 byte private PCM; son PCM charge 0. Private context 48 kHz,
uygulama context'i bu cihazda 44,1 kHz ölçüldü. Fiziksel RAM/GC veya whole-editor
uzun playback kabulü bu sonuçtan çıkarılmaz.

Decode öncesi 64 MiB tahmini rezervasyon native decoder geçici peak'ini kesin
sınırlamaz; raw dış borrows, compressed/output peak ve diğer medya owner'ları açık
kapsamdır. Sözleşmeler ve ayrıntılar [audio-residency.md](audio-residency.md).

## Orijinal kaynak ve history sahipliği — 7 Kasım 2026

`src/lib/asset/sources` orijinal Blob URL'yi document/history/transaction ve async
iş referanslarıyla tutar. Import creator document adoption'ından sonra bırakılır;
hata/discard yolları da creator'ı temizler. Decode cache artık üretmediği URL'yi
unmount'ta revoke etmez. Registry logical delete active undo/job kaynağını kesmez;
`revokeUrl:false` primary/runtime alias'ların ikisini de korur.

Array kimliğine göre weak/coalesced lease grubu kaynak listelerini her sequence
frame'inde yeniden taramaz. Acquire-before-release ve bir microtask final cleanup
StrictMode ve synchronous transfer'i korur. Portable/MCP/raster/sequence, audio
hazırlık/offline input, autosave ve versioning kendi async source scope'unu tutar.
Decode handle veya source byte budget bu sözleşmenin parçası değildir.

Native StrictMode PNG/history/cache/transaction/portable save **16/16** geçti;
reload/undo exact RGBA eşliği korundu. Current/history boşken save bir original
referansı tuttu; save sonrası owned/references/failed 0. 1.735 test, TS, MCP ve
Next build geçti. [Girişler, lifecycle, örnek ve sınırlar](asset-source-lifetime.md),
[ham kanıt](../../artifacts/performance/opt14-source-lifetime-20261107/README.md).

Panel URL sayısını decoded/process RAM olarak etiketlemez. Image/video/GPU demand
ve eviction hâlâ açıktır; mevcut visual loader eager'dır. Kaynak URL temizliği
fiziksel RAM'in anında düştüğünü veya 37 GB kök nedeninin çözüldüğünü kanıtlamaz.
Compressed/output preflight, kalan ağır job iptali ve uzun whole-editor kabulü
sonrasında Export E0'a geçilir.

## Ortak decoded lifecycle ve visual servis — OPT15

AudioPcmCache pin/retire/grace/admission ve AudioAssetService delivery/consumer
workflow'u ortak feature owner'larına çıkarıldı. VisualAssetService aynı
ResidentResourceCache ve SharedPreparationQueue ile image/sheet paylaşımı,
clip-specific video decoder, reserve-before-native ve final src/reset sağlar.
Destructor failure protected/charged quarantine olarak kalır; disposed sayılmaz.
Sonuç teslimiyle yarışan iptal exact-value invalidation ile yeni kaydı korur.

Native PNG/WebM **14/14**, mevcut Web Audio/hook/waveform **14/14** tekrar geçti;
198 dosya / 1.750 test, TS/MCP/Next başarılı. [Sözleşme](visual-media-residency.md),
[ham testler](../../artifacts/performance/opt15-visual-ownership-20261107/README.md).
Bu temel servis teslimidir: useAssetCache eager, per-asset video sync/render,
frame demand ve final consumer pin entegrasyonu açıktır. Four Seasons CPU/RSS,
GPU kaynakları ve genel kaynak kabulü tamamlandı sayılmaz; Export E0 başlamadı.

## Frame media demand ve bağımsız final pin'leri — OPT16

Ana editör useAssetCache managed mode'a geçti. Drawing ve media canonical frame,
root visibility ve affine paint bounds hesabını paylaşır. Mask/repeater/unknown
dependency kaynakları korunur. 128 CSS px pay ve 500 composition ms warm adaylar
actual clipping'i değiştirmez. Warm consumer pin bırakır; aktif/required kaynak
yerine süresiz protected kalmaz. Video lookup scoped clip kimliğindedir.

MCP preview/raster required kaynakları ve video seeked'i bekler. Sequence tek
job scope'unu yeniden kullanır; viewport Map'i async lifetime sahibi değildir.
Player Canvas adapter bağımsız scope alır ve destroy/replace sonunda bırakır.
Panel current project readiness ile editor-session visual owner byte'larını ayırır.
Font/GPU, native internal peak, kalan ağır job ve uzun bütün-editör kabulü açıktır.
[Sözleşme ve örnek](viewport-media-demand.md).

Gerçek 3.001 source / actual CSS viewport hooks fixture'ında 14/14 kontrol:
ilk görünüm dört decode, 16 KiB estimate (12 KiB protected / 4 KiB reclaimable),
pan iki yeni image; final consumer/gerçek raster encode sonrasında charge 0.
200 dosya / 1.763 test, TS/MCP/Next başarılı. Four Seasons sparse A/B ve CPU
kabul sınırları [ham raporda](../../artifacts/performance/opt16-viewport-media-20261107/README.md).

## Snapshot tahsisleri ve CPU tanısı — OPT17

`render/materializeOverrides.ts` içindeki mevcut immutable projection, katman
başına geçici `flatMap` dizileri yerine ilk değişiklikte çıktı oluşturur. Değişen
ilk katmanın önündeki authored prefix kopyalanır; değişmeyen sahne ve layer/branch
kimlikleri korunur. Instance'lar aynı authored kaynaklardan çözülür; omission ve
typed override sözleşmeleri değişmez. Yeni cache/owner veya serialized alan yoktur.

Test-only stage profiler'a `frame` modu eklendi. Per-frame inclusive süreler
evaluator, frame hazırlığı, culling, ROI ve surface aşamalarını ayırır; probe
maliyeti ve iç içe ölçümler nedeniyle kabul CPU/FPS değeri olarak kullanılmaz.

**201 dosya / 1.771 test**, TS/MCP/Next başarılı. Exact archived OPT16 referansı
ile 60 dengeli çift / 6/6 RGBA hash eşliği; 512 MiB known guard korunur. Known peak
44,47 MiB ve idle scratch/managed charge 0 değişmez. Frame CPU p50
229,3→223,6 ms, p95 1.056,8→1.198,5 ms: **CPU kabulü açık**. OS snapshot'ları
makine genelinde swap/compression faaliyeti gösterir; bu tek başına uygulama kök
nedeni değildir. Font/GPU ve bütün-editör kaynak kabulü halen yapılacaktır.
[Ham kanıt ve tekrarlama](../../artifacts/performance/opt17-frame-preparation-20261107/README.md).

## GPU workspace sahipliği — OPT18

Ortak GpuStorageOwner, ResourceBudget/ResourceBudgetGroup admission'ını mutable
GPU depolarına uyarlar: old+replacement peak, current-job borrow koruması,
streaming pass pin'i, 2s idle grace ve başarısız cleanup quarantine. Yeni LRU
algoritması yoktur. GpuEffectBackend iki texture/FBO/quad/default canvas yaşam
döngüsünü, WebGLParticleResources VBO/VAO/staging ownership'ini toplar. İlk
50.000 particle VBO tahsisi kaldırıldı; mevcut packer headroom kuralı korunur.
Motion blur sample canvas'ı da shared surface lease/finally kapsamındadır.

Texture'lar boyut değişiminde allocate, aynı boyutta texSubImage2D ile upload
edilir. Capability limiti context başına cache'lenir. Admission reddi açık
GpuAdmissionError'dır; sessiz kalite/backend değişimi değildir. Native loss tüm
backend'lerde pin/store temizler, restoration sonraki admitted draw'ı bekler.

GPU-local 192 MiB/64 kayıt bütçesi global 512 MiB ile örtüşür. Panel effect pass,
instanced draw ve texture byte'larını ayırır; known toplamına texture store'ları
ilk kez dahil edilir. Driver/native kopyalar ve shader binary boyutları bilinmez.

**204 dosya / 1.789 test**, TS/MCP/Next başarılı; Chrome WebGL2'de **22/22 native
kontrol** exact RGBA, pressure/rebuild ve blur/particle/motion loss/restore'ı
doğrular. Four Seasons 60 dengeli çift, aynı 512/768 MiB guard, 6/6 RGBA eşliği:
raw known peak **44,47→53,11 MiB** (yeni texture muhasebesi dahil), idle known
**23,40→7,91 MiB**, idle managed/scratch/GPU stores 0. CPU p50 **172,5→172,7 ms**,
p95 **213,7→207,8 ms**; CPU genel kabulü açık kalır. Font/native peak, kalan ağır
job ve uzun bütün editör kabulü tamamlanmadan Export E0 başlamaz.
[Sözleşme ve örnek](gpu-resource-ownership.md),
[ham sonuçlar](../../artifacts/performance/opt18-gpu-ownership-20261107/README.md).

## Font hazırlığı ve sahipliği — OPT19

FontAssetService mevcut ResidentResourceCache/SharedPreparationQueue ve ortak
ledger'ı kullanır. Local 32 MiB/64 kayıt, 2 active/128 queued, 15s consumer deadline
ve 2s idle grace vardır. İptal edilen native load gerçekten settle olmadan slot,
reservation veya source bırakılmaz. Authored family+URL scoped runtime alias'a
çevrilir; JSON/undo authored kalır. Aynı ailede farklı dosyalar ve bağımsız final
pin'leri karışmaz. Native font belleği opaque: policy estimate knownBytes'a eklenmez.
Panel ayrı font ownership/readiness ve policy charge gösterir.

NativeDemandBranches explicit nativeMediaFree sertifikası ile unrelated vektör
alt ağaçlarını media preparation traversal'ından ayırır; masks/instances/unknown
pluginler konservatif kalır. Family keyframe index'i canonical target parser'ını
kullanır. Geometry, aligned picking ve animated-family overrides aynı hazır
alias/measureTextLayout hesabını kullanır. Existing large CanvasRenderer/renderer
incremental entegrasyon noktalarıdır; resource owner/converter ayrı modüllerdedir.

**209 dosya / 1.813 test**, TypeScript/MCP/Next başarılı. Gerçek Chrome'da **18/18**
font/viewport/glyph RGBA/selection/picking/import/final-pin/panel kontrolü geçti.
Private fixture sonunda font job ve policy charge 0. İlk QA microtask cleanup
kontrolü ve bir aşaması belirlenemeyen QA wait timeout raporu kanıtta tutulur;
son başarılı koşu bu önceki başarısızlıkları silmez.

Four Seasons exact OPT18 referansı, 60s warmup / 60 dengeli çift, aynı 512 MiB known
ve 768 MiB heap guard: **6/6 RGBA**, known peak **53,11→53,11 MiB**, idle known
**7,91→7,91 MiB**. Scratch/GPU idle 0. Legacy benchmark host aktif font consumer'ını
idle'da tutar: önceden sayılmayan **1 MiB font policy charge** artık ledger'dadır;
fon tüketiminin gerçek native RAM'i diye yorumlanmaz. Global managed peak
**54,95→55,95 MiB**, bu yeni policy charge ile açıklanır.

Son CPU p50 **204,5→206,8 ms**, p95 **552,1→358,4 ms**, ortalama
245,20→211,84 ms. Önceki farklı koşulda alınan run p95 198,3→215,0 ms idi;
run'lar arası mutlak süreler index kazancı diye karşılaştırılmaz. **Genel CPU tail
kabulü açık**: tek koşunun p95 iyileşmesi stabil bütün-editör performansını kanıtlamaz.
[Font sözleşmesi](font-resource-ownership.md),
[ham kanıt ve sınırlar](../../artifacts/performance/opt19-font-ownership-20261107/README.md).

Kalan kritik sıra: CPU tail/stall kabulü → compressed/output/native peak preflight
ve kalan import/worker/IO backpressure/cancel → uzun bütün-editör ve native player
transport kabulü → Export E0. 37 GB gözleminin process/heap kökü henüz kanıtlanmadı.

## Kare içi override sahipliği ve CPU ölçüm kontrolleri — OPT20

Mevcut `render/materializeOverrides.ts` yaprak projector'ı aynı karede ardışık
kardeş track yazımlarında önceden kopyalanmış private parent'ı kullanır. Her path
derinliği için yalnız son private container tutulur; scratch O(path depth) ve
tek çağrı ömürlüdür. Yeni cache/owner/JSON veya public API yoktur. Kaynak ve caller
payload'ları, önceki kareler, Map yazım sırası, typed/schema/instance sözleşmeleri
korunur. Noncanonical array key'lerin eski slice davranışı açıkça korunmuştur.
Altı invariant testi copy sayısı, alias/payload izolasyonu, no-op, sıra ve array
sınırlarını doğrular. **210 dosya / 1.819 test**, TS/MCP/Next başarılı; son QA
frame-view eklemesinden sonra TS de geçti.

Tek realm/aynı evaluated input/60 dengeli çift component probe: projector p50
**27,60→25,30 ms**, p95 **37,70→33,60 ms**, ortalama **28,03→25,98 ms**. Bu dar
kopyalama kazancıdır; genel renderer FPS/CPU başarısı değildir. WeakSet denemesi
kazanç göstermediği için elendi ve ham kayıtları korundu.

Aynı kodlu A/A iframe kontrolünde de süre yanlılığı görüldü; iframe sırasını
ters çevirmek bunu çözmedi. Ek test bundle'ı aynı sahne/renderer/canvas üzerinde
yalnız preparer'ın materializer import'unu değiştirir. Aynı function'lı A/A
kontrolünde p95 **400,8→212,8 ms**; gerçek A/B'de p50 **189,5→185,4 ms**, p95
**269,9→320,4 ms**, ortalama **193,55→219,34 ms**. Uzun duraklamanın nedeni
kanıtlanmadı; **genel CPU kabulü açık** kalır.

Her protokolün kendi referansına karşı **6/6 RGBA eşliği**, aynı 512 MiB guard,
known peak **53,11→53,11 MiB**, idle known **7,91→7,91 MiB** korunur. Scratch/GPU
idle 0; benchmark font lease'inin **1 MiB policy charge**'ı gerçek native RAM
değildir. Görsel olarak incelenen production-path 6000 ms karesi archived OPT19
hash'iyle aynıdır. Aynı-canvas tekrarlı readback protokolünün hash'i farklıdır;
bu protokoller arası farkın nedeni kanıtlanmadı ve gelecekte E0 parity örneği
olarak korunur. İlk yanlış cross-protocol doğrulama kaydı silinmedi; tolerans
artırılmadı. [Ham kanıt, kapsam ve tekrarlama](../../artifacts/performance/opt20-frame-cost-20261107/README.md).

Güncel kalan sıra: **CPU tail/stall kabulü → ortak native medya hazırlığı toplam
eşzamanlılık sınırı → input/output/native peak admission ve import/worker/IO
backpressure/iptal → uzun bütün-editör ve player A/V kabulü → Export E0**.
Audio/visual/font servislerinin her biri yerel 2-job sınırına sahiptir; uygulama
geneli toplam 2 sınırı henüz bağlanmamıştır. SceneCanvas'ın gizli editor UI için
hazırladığı bounds işlemi CPU incelemesi adayıdır; henüz kazanç kanıtı değildir.
37 GB kök nedeni ve bütün süreç RAM'i bu dar ölçümle çözülmüş sayılmaz.

## Talebe bağlı editör geometri hazırlığı — OPT21

SceneCanvas, seçim/hover sorgusu olmasa bile her zaman/override değişiminde bütün
sahneyi bounds için materialize/index ediyordu. Bu iş standalone renderer CPU
ölçümüne dahil değildi. Mevcut `createLayerWorldBoundsResolver` dördüncü optional
`LayerWorldBoundsOptions` argümanıyla `deferPreparation:true` kabul eder. Default
eager sözleşmesi korunur; opt-in ilk sorguda aynı implementasyonu hazırlayıp
mevcut frame memo'sunu kullanır. Kaynak/override scope boyunca immutable kalır;
hazırlık hatası ilk sorguda yayılır, sonraki sorgu tekrar deneyebilir. Yeni cache,
timer, native owner, JSON veya layer schema yoktur.

SceneCanvas opt-in kullanır. Gizli gizmo için display/world transform hesabı
atlanır; görünür cetvel seçili nesnenin sınırını göstermeye devam eder. Rulers
kapalıysa ve başka bounds tüketicisi yoksa selected playback/preview hazırlığı
da yapılmaz. Hover ve secondary selection gerçek sorgularında mevcut davranış
korunur. Büyük SceneCanvas sadece ilgili presentation sınırında güncellenmiştir.

**211 dosya / 1.824 test**, TS/MCP/Next başarılı. Beş yeni invariant testi erteleme,
eager uyumluluğu, group/instance animasyonu, frame izolasyonu ve hata/retry/null
semantiğini doğrular. Gerçek Chrome testinde frozen eski/yeni SceneCanvas, shared
ready assets ve gerçek editor/snap/history hook'larıyla 60s warmup/60 dengeli çift:
senkron React commit p50 **30,0→9,9 ms**, p95 **48,8→21,0 ms**, ortalama
**31,6→11,0 ms**; gereksiz tam bounds hazırlığı **60→0**. RAF canvas çizimi bu
süreye dahil değildir; genel frame FPS/CPU kazanımı diye yorumlanmaz.

**6/6 canvas RGBA**, sekiz işlevsel durum geçti: seçim, hareketli cetvel,
rulers-off playback/preview, hover, preview'dan edit'e dönüş, resize preview/commit
ve undo/redo. İlk QA aynı-zamandaki visibility değişiminde geçerli memo varken
yeni hazırlık bekliyordu; test düzeltildi, production değişmedi ve ilk hata
korundu. Son kod açıklaması değişikliği sonrası rebuild aynı tested bundle/CSS
hash'lerini üretir. İki canlı viewport kapsamındaki known peak **62,01 MiB**,
aynı 512 MiB sınırının altındadır; eski tek-renderer 53,11 MiB ile doğrudan fark
alınmaz. Pan/zoom/clipping kapsamı farklı hash protokolleri karıştırılmaz.
[Ham rapor, görsel ve tekrarlama](../../artifacts/performance/opt21-editor-geometry-20261108/README.md).

Bu dar editör CPU işi doğrulandı; **genel CPU tail/stall kabulü açık**. Ortak
native medya toplam 2-job sınırı, input/output/native peak ve import/worker/IO
iptal/backpressure işleri; ardından uzun bütün-editör/player/CPU/RSS kabulü
tamamlanacaktır. Export E0 başlamadı; 37 GB kök nedeni kanıtlanmadı.

## Ortak toplam medya hazırlık kapasitesi — OPT22

Audio/visual/font servislerinin yerel ikişer hazırlığı toplam altı producer'a
izin verebiliyordu. Yeni küçük `JobExecutor` sözleşmesi mevcut BoundedJobQueue
tarafından uygulanır. Composition root `editorMediaPreparation` tek **2 aktif /
128 shared queued** policy'sini frozen submit/getSnapshot görünümüyle paylaşır;
domain servisleri global cancelAll/dispose yapamaz. Yerel 2/128 FIFO/dedupe ve
bağımsız iptal sözleşmeleri korunur. Private constructor optional `executor`
alabilir; eski yalnız-local kullanım uyumludur. Yeni cache/worker/LRU algoritması
ve source JSON yoktur.

Shared admission'dan önce DOM/context/FontFace veya domain byte reservation
oluşmaz. Aktif non-abortable iptal her iki slotu gerçek settlement'e kadar tutar.
Shared→local teslim sınırının hangi tarafında abort kazandıysa tek discard sahibi
orasıdır. Eski exact-value invalidation ve independent final pin'ler korunur.
Panelde aggregate pipeline ile local active/queued ve executing/shared wait
ayrıdır; bekleyen yerel işler native CPU işi gibi sayılmaz, toplamlar eklenmez.
Bu kapasite yalnız managed service pipeline'ları içindir; kalan import probe'ları
ve browser/driver iç thread sayısının limiti değildir.

**214 dosya / 1.832 test**, TS/MCP/Next ve son QA TS başarılı. Gerçek Chrome'da
**16/16 native kontrol**, panelde **2 active / 2 queued → 0 / 0**, private native
peak 2 ve final byte charge 0. WAV/PCM/peaks, PNG, WOFF glyph ve iki bağımsız video
clock doğrulandı. WOFF static-host 404 düzeltmesi ve default-context 16-byte
glyph readback farkı ham kayıtlarda tutulur. Aynı kodlu default tekrar da 16 byte
fark verdi; explicit readback bağlamında A/A ve pin karşılaştırması 0 farktır.
Production çizimi ve tolerans değiştirilmedi; backend nedeni kanıtlanmış değildir.

Four Seasons exact archived OPT20 child ile 60s/60 çift, aynı 512 MiB known ve
768 MiB heap guard: **6/6 RGBA**, known peak **53,11→53,11 MiB**, idle
**7,91→7,91 MiB**. Scratch/GPU idle 0; benchmark font lease'i iki tarafta 1 MiB
policy charge tutar. CPU p50 **189,9→184,0 ms**, p95 **376,6→292,4 ms**; önceki
A/A değişkenliği nedeniyle bu sonuç scheduler kaynaklı genel CPU başarısı değildir.
[Public sözleşme ve örnek](resource-job-queue.md#ortak-toplam-hazırlık-kapasitesi--opt22),
[ham kanıt ve sınırlar](../../artifacts/performance/opt22-shared-preparation-20261108/README.md).

Sıradaki uygulama compressed/input/output/native peak ve kalan import/worker/IO
bounded okuma, backpressure ve iptaldir. Uzun editör/player/panel/heap-RSS ve genel
CPU tail kabulü sonra doğrulanacaktır. Export E0 başlamadı; genel hedef aktiftir.

## Sınırlı encoded girdi ve kopya sahipliği — OPT23

`resources/io` içindeki BoundedBinaryReader, AudioAssetService'in sınırsız
arrayBuffer ve ImportManager URL yolunun sınırsız blob okumasını değiştirir.
Actual response cap **128 MiB**, local **256 MiB/128 kayıt**, mevcut global ledger
ile örtüşür. Contiguous buffer büyümesi/kompaktlama old+new peak'i allocation
öncesi admit eder. Identity Content-Length yalnız erken ret ipucudur; gerçek
byte'lar her zaman sayılır, encoded wire boyutu body boyutu sayılmaz.

OwnedBinaryInput, detached native girdinin logical charge'ını gerçek decode
settlement'ine kadar tutar. `withCopy` tam boyutlu geçici binary kopyayı admit eder;
callback bitmeden original release tamamlanmış sayılmaz. Empty input gerçek 0
byte ve minimum 1-byte policy charge kullanır; eski positive-size ledger değişmez.
Runtime `input` kategorisi ve English budget resident/pending satırı eklendi.
Transport/native decoder/kalıcı source Blob kopyaları bu buffer tahmini değildir.

ImportExecution signal'ı format seçenekleri/scene JSON'undan ayrıdır. Yeni optional
argümanlar eski çağrıları korur; geç legacy handler sonucu publication öncesinde
reddedilip source lease bırakılır. Handler native olarak hemen durdu diye
gösterilmez. Application URL import ve audio encoded input aynı kontratı/bütçeyi
kullanır; bütün File handler/ZIP/GIF ve UI proje-scope iptali henüz bağlanmamıştır.

**217 dosya / 1.852 test**, TS/MCP/Next geçti. **10/10 native Chrome kontrolü**:
WAV/PCM/peaks, exact PNG, gerçek ImageHandler/transaction/source adoption,
detached input ve geç iptal. Gate sırasında encoded resident **9.816 B**, File
copy pending **172 B**; actual native settlement sonunda input/private ledger 0.
Test fixture reader limiti 256 KiB, host ledger 512 MiB'dır; production 128 MiB kalır.

Four Seasons exact OPT22 child, 60s/60 çift/aynı 512 MiB guard: **6/6 RGBA**,
known peak **53,11→53,11 MiB**, idle **7,91→7,91 MiB**. CPU p50 **168,1→165,9 ms**,
p95 **266,2→199,7 ms**; genel CPU tail kabulü açık. Bu sahne input workload
içermediği için girdi tepe-bellek kazanımı bu sayılardan çıkarılmaz.
[Public kontrat ve devir](bounded-binary-input.md),
[ham kanıt](../../artifacts/performance/opt23-bounded-input-20261108/README.md).

Sıradaki işler File/ZIP/GIF-worker input entegrasyonu, native metadata/decoded
peak ve import UI cancellation/backpressure; ardından raster/sequence/offline
audio/portable output ve uzun editor/player/CPU/RSS kabulüdür. Export E0 başlamadı.


## Sınırlı ZIP / dotLottie input — OPT24

ZIP açılımı ve Lottie File/text scope'ları mevcut bounded reader ve shared ledger
üzerinden yönetilir. Gerçek açılmış byte sınırı, CRC, native cancellation/consumer
settlement ve source ownership korunur. Eski raw ZIP API'leri bounded handoff
adapter'larıdır; app metadata yolu lease kullanır. **220 dosya / 1.869 test**,
TS/MCP/Next ve **13/13 native kontrol** başarılı. Genel CPU/uzun editör kabulü ve
kalan GIF/File/UI/job/output işleri açıktır; Export E0 başlamadı.
Four Seasons'ta aynı 512 MiB guard ile 6/6 RGBA, known peak 53,11 MiB ve idle
7,91 MiB korunur. Renderer child byte-identical A/A'dır; p95 277,1→255,7 ms olsa
da mean 162,87→188,39 ms/max 312,7→874,8 ms değişimi genel CPU kabulünü kapatmaz.
Bu sahnede ZIP workload yoktur; input sahipliği kanıtı native kontrollerdendir.
[Kontrat ve sınırlar](bounded-zip-import.md),
[ham ölçüm](../../artifacts/performance/opt24-bounded-zip-20261108/README.md).


## Sınırlı GIF / worker hazırlığı — OPT25

GIF framing/count/pixel admission native decode öncesidir. Ortak sequential
composer caller tarafında bir VideoFrame tutar; source/copy/workspace/output
scope'ları actual settlement'e kadar yaşar. App işi aynı toplam 2-job medya
executor'ına bağlanır. Panel input satırı GIF workspace/encoding policy tahminlerini
ve native encoder kopyalarının ölçüm dışında olduğunu açıklar. **1.889 test**,
TS/MCP/Next ve **15 native kontrol** başarılı; son private budget/jobs 0, 4/4 worker
kapandı. Kısmi kare/disposal ve production renderer loop RGBA eşliği doğrulandı.
Four Seasons aynı 512 MiB sınırında 6/6 hash, 53,11 MiB known peak ve 7,91 MiB idle
korur. Renderer byte-identical A/A olduğundan p95 192,3→208,0 ms/mean 157,14→165,90 ms
farkı GIF'e bağlanmaz; genel CPU/uzun editör kabulü açık kalır.
[Kontrat/limits](bounded-gif-preparation.md),
[ham kanıt](../../artifacts/performance/opt25-bounded-gif-20261108/README.md).

## Belgeye bağlı import iptali ve dış IO kapasitesi — OPT26

ImportManager girişleri mevcut bounded job/deadline altyapısıyla tek dış
**2 aktif / 128 bekleyen** kuyruğa bağlanır. URL/clipboard → File geçişi yeniden
submit etmez. Native medya kuyruğu ayrıdır; counts örtüşür ve toplanmaz. 60s
deadline/abort, aktif non-abortable producer'ın actual settlement'ini bekler.
useEditorState runtime document signal, useImport action sahipliği, generic picker/
modal provenance ve handoff kontrolleri geç sonucun yeni projeye yazmasını engeller.
Çoklu File tek scope'tur; geç clipboard read/getType yeni işe başlayamaz.
English durum/Cancel imports ve panelde Import preparation sayaçları eklenir;
yeni scene alanı, cache veya polling yoktur.

**227 dosya / 1.908 test**, TS/MCP/Next ve **17 native kontrol** başarılı. Gerçek
StrictMode editor/import hook'ları, PNG, source adoption/undo/redo, proje değişimi,
batch/preflight/clipboard ve gerçek iptal düğmesi doğrulanır. Post-native delivery
gate input+copy 216 B tutar; final private ledger/jobs/source owner 0. Bu değer
native peak veya process RAM'i değildir. Four Seasons aynı 512 MiB guard ile
6/6 RGBA, known peak 53,11 MiB ve idle 7,91 MiB korur; CPU p95 204,1→185,4 ms,
mean 157,47→157,56/max 294,9→394,9 ms genel CPU kabulünü kapatmaz.

Kalan File/text/native metadata/decode ön kabulü ve yardımcı picker kapsamından
sonra output sahipliği ve uzun editor/player/panel/heap-process/CPU kabulü gelir.
Export E0 başlamadı; genel hedef aktif. [Kontrat/devir](import-cancellation.md),
[ham kanıt](../../artifacts/performance/opt26-import-lifecycle-20261108/README.md).

## Sınırlı belge metni, proje açılışı ve native picker — OPT27

SVG/scene JSON/Open File.text okumaları BoundedTextReader'a taşındı; Lottie aynı
UTF-16 policy implementasyonuna bağlandı. Default scene/open64 MiB, SVG16 MiB;
normal2×UTF-16, SVG sanitizer8×UTF-16 kopya politikası input'la birlikte actual
consumer settlement'e kadar korunur. Aynı512 MiB host ledger kullanılır; parsed
JSON/DOM/native Blob/GC RAM'i bu tahmin değildir. SceneDocumentLoader dış IO
kuyruğunu paylaşır; son open isteği kazanır, başarısız/stale sonuç sahneyi değiştirmez.
Generic/sprite/layer media/project picker'ları belge kimliği yakalar ve native
input node/listener'larını seçim/iptal/reset/hata sonunda bırakır. İlk detached
chooser hatası DOM owner eklenerek düzeltildi; extension ayarı değiştirilmedi.

**232 dosya /1.930 test**, TS/MCP/Next ve **18 native kontrol** geçti. Immutable eski
SVG handler'ıyla exact production RGBA, kaynak temizliği, gerçek StrictMode open/
cancel ve gerçek Four Seasons FileChooser doğrulandı.14.287.707 B kaynak4079 layer/
2 timeline/48s olarak açıldı; input+text peak40,88 MiB, final private ledger/jobs/
source owner0. Four Seasons render kontrolünde6/6 hash, known peak53,11 MiB ve
idle7,91 MiB korundu; p95 192,4→204,2 ms/mean158,30→166,04/max310,6→395,3 ms genel
CPU kabulünü kapatmaz. Native metadata/decode, sprite preview/font-outline input,
output ownership ve uzun editor/player/panel/heap-process/CPU kabulü kalır.
Export E0 başlamadı. [Kontrat](bounded-document-input.md),
[ham kanıt](../../artifacts/performance/opt27-document-input-20261108/README.md).

## Native metadata, decoded-output ön kabulü ve outline fontları — OPT28

PNG/JPEG/WebP/GIF başlıkları sınırlı prefix reader'ıyla okunur; supported frame
boyutu/bütçesi image oluşmadan kontrol edilir. Opaque girdiler için açık tahmin
politikası kalır; native decoder/process RAM'i hard-cap edilmez. Image.decode
actual settlement korunur. Image/video/audio probe ve sprite modal preview pin'i
mevcut ortak iki-job kapasitesine ve512MiB ledger'a bağlıdır. Grid sabit DOM/CSS
kullanır, subpixel cell üretemez. Yeni polling/cache algoritması eklenmedi.

FontFace ve outline aynı32MiB actual encoded reader'ı kullanır; SFNT/WOFF bounds
ve advisory WOFF2 policy ayrıdır. Native font ArrayBuffer backing'i, lazy parsed
font input'u, pin/idle ve failed-cleanup mevcut residency owner'larıyla yönetilir.
Parsed font URL'ye göre ayrılır; hatalı global tek-font pending cache kaldırıldı.
Supported PCM WAV output gerçek context rate'inde Float32 olarak decode öncesi
reserve edilir. [Kontrat, girişler ve örnek](native-media-admission.md).

**246 dosya /2.025 test**, TS/MCP/Next, **33/33 native** ve41 kanıt kontrolü geçti.
Native glyph ve frozen outline geometry/RGBA; stereo PCM reference; gerçek
StrictMode modal replay/unmount/late pin ve production kaynak paneli doğrulandı.
Final private ledger/jobs/source refs0; SVG opaque policy peak64MiB. Bu gerçek
native/OS RAM peak ölçümü değildir. Panelde probe/outline policy ayrı gösterilir.

Four Seasons exact archived OPT27 ile iki yerleşimde toplam120 çift/**12/12 RGBA**;
known peak53,11MiB/idle7,91MiB korundu. Kullanılan fontun66.268B encoded backing'i
artık input owner'ında kalır; eski1MiB font policy'den ve known RAM toplamından
ayrı kapsamdadır. Final pin bırakılınca kaynak cleanup'ı native testte doğrulandı.
Birleşik CPU p95 **1774,4→2122,5 ms** olduğundan CPU kabulü açık; yüksek arkaplan
OS yükü gözlemi tek başına neden değildir. A/A/profil/uzun editör kabulü kalır.

[Ham native/karşılaştırma/provenance kanıtı](../../artifacts/performance/opt28-media-preflight-20261108/README.md).
Sıradaki iş raster/sequence/offline-audio/portable output sahipliği; ardından uzun
editor/player/panel/heap-process/CPU kabulü gelir. Export E0 henüz başlamadı.
