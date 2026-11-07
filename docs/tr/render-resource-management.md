# Render ve proje kaynak yönetimi

Bu belge, geçici katman/efekt/maske canvas'ları için ortak kaynak sahipliği ve proje genelindeki Kaynak ve Performans panelinin ölçüm sözleşmesini açıklar. Panel kaynakları görünür kılar; viewport culling, medya residency ve bütün kaynaklara ortak bütçe/admission sistemi tamamlanmış değildir.

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
