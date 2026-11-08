# Kaynak hazırlığı iş kuyruğu

`src/lib/resources/jobs` public sınırındaki `BoundedJobQueue`, eşzamanlı hazırlık
işlerini ve bekleyen metadata'yı sınırlar. Byte bütçesi ve domain cache'den ayrı
bir sorumluluktur; worker oluşturmaz, CPU kullanımını ölçmez veya byte rezervasyonu
yapmaz. Audio, Visual ve FontAssetService aynı delivery ve scheduler sözleşmesini
kullanır. Genel import/worker/IO işlerinin entegrasyonu ayrı kalan iştir.

**Güncel durum (OPT22):** Uygulamanın yönetilen audio/visual/font servisleri aynı
`editorMediaPreparation` kapasitesini paylaşır: realm genelinde toplam **2 aktif
pipeline / 128 shared wait**. Her servisin yerel 2 aktif / 128 queued sınırı ve
bağımsız iptali korunur; local active shared slot bekleyen işleri de içerir.
Bu iki kuyruk düzeyinin sayıları toplanmaz. Source/history sahipliği OPT14'te,
image/video viewport demand OPT16'da tamamlandı. Font consumer deadline/settlement
sözleşmesi
[font kaynak sahipliği](font-resource-ownership.md) belgesindedir. Compressed/output
peak admission, kalan import/worker/IO ve uzun bütün-editör kabulü hâlâ açıktır.
Önceki teslim açıklamaları aşağıda tarihsel bağlamıyla korunur.

## Sözleşme ve yaşam döngüsü

`submit(work, { signal?, discard? })` FIFO iş gönderir. Work bir sonraki microtask'te
başlar; çalışacağı slot önceden ayrılır. Full queue RangeError ile, disposed queue
Error ile reddeder; work çağrılmaz. Cancelled iş AbortError ile reddedilir.

Bekleyen iş iptal edilince kuyruktan hemen çıkar. Aktif işe abort signal iletilir;
**native iş gerçekten bitmeden slot boşalmaz**. Decode API'sinin iptali görmezden
gelmesi yeni bir decode başlatmak için gerekçe değildir. Geç sonucun explicit
cleanup ihtiyacı varsa caller `discard(result)` verir. GC ile bırakılan düz
değerler için callback gerekmez. Cleanup da slot bırakılmadan önce tamamlanır;
hatası promise'e yansır. Work hataları sonraki işi engellemez.

`cancelAll()` mevcut işi iptal eder ama yeni gönderime izin verir. `dispose()`
kalıcı kapatır; idempotent'tir. İkisinde de non-abortable aktif iş snapshot'ta
bitene kadar kalır. Signal listener'ları her terminal yolda ayrılır. Timer, scene
JSON ve birikimli trace tutulmaz. `getSnapshot()` detached sayılar döndürür.
Completed/failed/cancelled sayaçları yaşam boyudur; cancellation isteği ve sonradan
cleanup hatası aynı işte görülebilir, ayrık toplam diye toplanmaz.

```ts
import { BoundedJobQueue } from '@/lib/resources/jobs'

const queue = new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })
const controller = new AbortController()
const result = queue.submit(signal => prepareMedia(signal), {
  signal: controller.signal,
  discard: ownedResult => ownedResult.dispose(),
})
// Caller awaits/catches result; cancellation is not a successful preparation.
controller.abort()
await result.catch(error => { if (error.name !== 'AbortError') throw error })
queue.dispose()
```

`prepareMedia` örnekteki consumer adapter'ıdır; production generic medya API'si
olarak henüz mevcut değildir. Gerçek kullanım `AudioAssetService.prepare` içindedir.
Byte reservation ve source revision/commit kuralı somut owner'ın sorumluluğudur.

## Ses adapter'ı

`AudioAssetService` varsayılanı **2 aktif / 128 bekleyen** fetch+decode işidir.
Constructor `maxConcurrent/maxQueued` opsiyonları private test servisleri içindir;
uygulamadaki shared service bütün playback/waveform/offline decode taleplerini
paylaşır. URL bazlı dedupe kuyruk admission'dan önce yapılır. Cache hit yeni iş
oluşturmaz. Full queue açıklayıcı hata verir; PCM eksikmiş gibi başarılı sonuç
vermez. Bu ilk politikada overflow otomatik tekrar kuyruğuna alınmaz; waveform
Retry veya yeni explicit talep gerekir. Demand residency sonraki aşamada bütün
asset'lerin bir anda talep edilmesi problemini kaldırmak için
[audio zaman penceresi talebi](audio-residency.md) uygulanmıştır.

`load(asset, { signal? })` ve `loadUrl(url, { signal? })` mevcut borrowed PCM dönüş
tipini korur. Her consumer ayrı iptal edilebilir. Yalnız son consumer iptal olursa
ortak fetch abort edilir; başlayan native decode bitince sonucu cache'e yazılmaz.
İptal edilen URL dedupe'dan hemen çıkarılır; yeni talep eski native slot bitene
kadar kuyrukta bekleyebilir. Eski completion yeni aynı-URL request'i silemez.

Uyumluluk için `clear()` yalnız cache/generation'ı invalid eder: bekleyen eski
borrowed caller buffer alabilir ama cache'i tekrar dolduramaz. Project/service
iptali için yeni `cancelPending()` kullanılır. `dispose()` admission'ı kapatır,
pending'i iptal eder ve owned context'i kapatır; geç fetch başka context yaratamaz.
Bu işlemler source blob URL'lerini revoke etmez veya başka playback graph'ının
tuttuğu PCM'i silmez.

AudioEngine her pending asset için yalnız kendi consumer controller'ını tutar;
remove/replacement/dispose onu iptal eder. Aynı ID+URL ile yeniden eklenmiş asset'e
eski completion yazamaz. Waveform component'in overview/detail effect'leri de
kendi controller'larını unmount/URL/resolution değişiminde iptal eder. Peak cache
aynı decode sonrasında tekrar kontrol edilir: aynı resolution sonucu paylaşılır,
view'ların iptal yaşam döngüsü birbirine bağlanmaz.

Panel Media sekmesindeki local active/queued, limit ve cancelled/denied değerleri
yerel queue snapshot'ındandır. Local active, fetch/decode yanında shared slot
bekleyişini de kapsar; executing/shared wait bunu ayrıca gösterir. Ortak Media
pipeline active/queued toplam managed kapasitesidir; CPU yüzdesi değildir.
Eski diagnostic adapter `preparation` veya yeni stage marker'larını sağlamıyorsa
**Not tracked** görünür.
Current URL pending sayısı eski cancelled native işi kapsamayabilir; active sayısı
onu native settlement'e kadar korur.

## Açık sınırlar ve sonraki işler

İlk OPT12 tesliminde PCM lease/admission yoktu. Güncel
[OPT13 PCM sahipliği](audio-residency.md) engine/detail/offline input consumer'larını
lease'e bağlar; ana hook audible zaman penceresini ister. `setAssets` yalnız
explicit preload compatibility yoludur. Source dosya/URL ve undo sahipliği
decoded cache'den ayrı ele alınacaktır. Compressed
response byte sınırı, uzun audio output çalışma kümesi, image/video hazırlığı,
CPU-heavy worker önceliği ve bütün editörün uzun kaynak kabulü halen açıktır.

## Doğrulama

Queue testleri FIFO/capacity, queued/active abort, native settlement, late result
cleanup, signal detach, sync hata, yeni generation ve shutdown
sözleşmelerini kapsar. Audio testleri dedupe + bağımsız consumer, son consumer
abort, stale same-URL retry, clear uyumluluğu ve engine remove/re-add/dispose
yarışlarını doğrular. Waveform testleri cache paylaşımı, cached pre-abort ve
decode completion ile yarışan iptali kapsar.

[OPT12 kanıtları](../../artifacts/performance/opt12-audio-preparation-20261107/README.md)
gerçek Web Audio ile 10 native kontrol, karşıt stereo PCM/waveform eşliği ve gerçek
panelde **2 aktif / 4 bekleyen → 0 / 0** geçişini içerir. Completion gate yalnız
kontrollü native geç tamamlanmayı ve panel incelemesini sağlar; AudioBuffer'lar
tarayıcı tarafından gerçek WAV verisinden çözülür. Tam editör playback/RSS veya
PCM residency kabulünün yerine geçmez.

## Ortak delivery sahibi — OPT15

`SharedPreparationQueue<T>` AudioAssetService'teki keyed in-flight dedupe,
independent consumer abort, protected delivery ve stale same-key completion
işlemlerinin ortak sahibidir; Audio ve VisualAssetService bunu kullanır.
Alt queue kapasite/FIFO/native slot sahibi BoundedJobQueue olarak kalır.
Projections synchronous kendi pin'ini alır; son projection sonrasında delivery
bırakılır. Optional holdInput submission'dan gerçek settlement'e kadar input'u
korur. forget lookup generation'ını ayırır, eski promised caller'ı iptal etmez.
Late admission/delivery iptalinde domain discard exact-value invalidation yapar;
yeni same-key result korunur. [Sözleşme ve native kanıt](visual-media-residency.md).

Bu çıkarım genel import/worker/IO kuyruğu entegrasyonu değildir. OPT16 viewport
visual demand ve bağımsız final pin'lerini bağladı; session hafif metadata'dan
en fazla iki request gönderir. Warm prefetch consumer pin'i bırakır ve pressure'a
açıktır. Ağır job cancellation ve bütün editör kabulü açık kalır.
[Güncel adapter sözleşmesi](viewport-media-demand.md).

## Ortak toplam hazırlık kapasitesi — OPT22

`JobExecutor` yalnız `submit<T>(work, {signal?, discard?})` sözleşmesidir. Domain
servisleri host scheduler'ını dispose/cancelAll edemez. `BoundedJobQueue` bu
sözleşmeyi uygular. `editorMediaPreparation` aynı sınıfın bir örneğini ve frozen
submit/getSnapshot görünümünü oluşturur; yeni queue/LRU algoritması yoktur.
Audio/visual/font singleton composition noktaları mevcut shared byte ledger ile
aynı executor'ı verir. Private/embedded servis constructor'larındaki optional
`executor` host tarafından sağlanır; verilmezse eski yerel davranış korunur.

Veri akışı: cache hit → bağımsız pin; cache miss → keyed yerel delivery dedupe →
yerel FIFO admission → shared FIFO admission → domain byte reservation ve native
hazırlık → protected delivery → tüketicinin kendi lease'i. Bekleyen shared iş
henüz DOM/context/FontFace veya byte reservation üretmez. Source holdInput yerel
submission'da başlar ve queued iptal veya gerçek native settlement sonunda biter.

Bir tüketicinin iptali diğer aynı-key tüketicileri bozmaz. Son tüketici iptali
yalnız kendi global job signal'ına gider. Bekleyen iş shared listeden çıkar;
başlamış non-abortable iş hem yerel hem shared slotu gerçekten bitene kadar
tutar. Shared queue geç sonucu discard edip reject ederse local queue yeniden
discard etmez. Shared sonuç local kuyruğa teslim edildikten sonra iptal kazanırsa
local queue tek cleanup sahibidir. Exact-value cache invalidation yeni same-key
generation sonucunu silmez. Domain reservation/dispose/quarantine kuralları aynen
geçerlidir; font timeout her iki bekleme süresini de kapsar.

`SharedPreparationQueue.getSnapshot()` önceki active/queued alanlarını korur ve
`executing`, `waitingForExecutor` ekler. Executing producer gövdesidir, shared
pipeline active ise fetch/native/settlement slotudur. Arada kısa handoff evresi
olabilir; iki stage marker'ın active'i mutlaka bölmesi beklenmez. Yerel overflow
yerel denied, shared overflow shared denied sayacındadır; ayrık toplam değildir.
Shared 128 sınırı üç servisin yerel queued metadata'sını kapsayan tek bir toplam
128 request sınırı değildir; her yerel kuyruk ayrıca 128 ile sınırlıdır.

```ts
import { BoundedJobQueue } from '@/lib/resources/jobs'
import { VisualAssetService } from '@/lib/asset/visual'
import { FontAssetService } from '@/lib/asset/fonts'

const executor = new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })
const visual = new VisualAssetService({ executor })
const fonts = new FontAssetService({ executor })
// acquire/release caller pins as usual. Disposing one service does not close
// the borrowed executor. The embedding host owns executor disposal.
```

**214 dosya / 1.832 test**, TS/MCP/Next geçti. Yeni kontroller cross-owner FIFO,
iki slot sınırı, bağımsız same-key iptali, held native/input reservation, overflow,
iki delivery sınırındaki tek cleanup, gerçek domain lease'leri ve production
singleton wiring'ini doğrular. Gerçek Chrome'da **16/16 native kontrol** WAV/PCM,
PNG, WOFF glyph, bağımsız video clock'ları ve gerçek paneli kapsar. Panelde
**2 active / 2 queued → 0 / 0**, private final charge 0. Gate'ler gerçek native
sonuçların teslimini geciktirir; native veriyi taklit etmez. Font/private QA
deadline'ı inspection için 120s'dir; uygulama varsayılanı 15s kalır.

İlk QA WOFF dosyasını static host sunmadığı için 404/NetworkError verdi. Host
flat dosya allowlist'ine `font/woff` eklendi ve fixture loader HTTP başarısını
kontrol ediyor. Sonraki varsayılan canvas glyph karşılaştırması 16 byte fark
gösterdi; aynı kodlu art arda çizim kontrolü de 16 byte fark gösterdi. Açık
`willReadFrequently` QA bağlamında A/A ve pin invalidation karşılaştırması **0
RGBA farkı** verdi. Production renderer ve tolerans değiştirilmedi; alttaki
backend nedeninin kanıtlandığı iddia edilmez. Bütün başarısız ham kayıtlar korunur.
[Ham kaynak/bundle/yerel tarayıcı kanıtları](../../artifacts/performance/opt22-shared-preparation-20261108/README.md).

Bu kapasite managed servis pipeline'ları içindir; tarayıcı iç thread sayısı,
driver işleri veya henüz bağlanmamış import metadata probe'ları için toplam
native eşzamanlılık garantisi değildir. Compressed/input/output/native peak,
kalan import/worker/IO ve uzun editor/player/CPU kabulü açık kalır; Export E0
başlamadı.

**OPT23 input güncellemesi:** Ses encoded response'u ve URL importu artık
[sınırlı binary input](bounded-binary-input.md) portunu kullanır. Native job slotu
yanında input buffer/temporary copy charge'ı da gerçek settlement'e kadar tutulur.
Bu ekleme ortak CPU-heavy IO/worker queue veya bütün native peak işini tamamlamaz.


## GIF hazırlığının ortak kapasiteye katılması — OPT25

App GifImportService.inspect/prepare da aynı editorMediaPreparation executor'ını
ödünç alır. Toplam 2 active/128 shared wait kapasitesi audio/visual/font/GIF için
ortaktır; native browser thread sayısı garantisi değildir. GIF waiting File IO
başlatmaz, deadline/abort onu kuyruktan çıkarır. Çalışan native frame/encode işi
actual settlement'e kadar slotu ve byte owner'ını tutar. Static visual probe aynı
executor'a ikinci iş göndermediği için nested slot deadlock'u oluşturmaz.
Final owned PNG cancellation handoff'u existing discard callback'iyle bırakılır.
Diğer import/proje-scope UI ve bütün ağır IO işleri henüz bu sınırda değildir.
[GIF portları ve akış](bounded-gif-preparation.md).
