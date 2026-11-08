# Sınırlı GIF hazırlığı ve worker sahipliği

OPT25, GIF importundaki sınırsız File okumalarını ve bütün VideoFrame'leri
biriktiren iki ayrı main/worker döngüsünü değiştirir. Mevcut binary reader,
ResourceBudget, JobExecutor/deadline, source owner ve sprite-grid helper kullanılır.
Yeni katman/scene formatı, scheduler veya cache eklenmez; mevcut frameSequence ve
image çıktıları korunur. GIF tarafı tamamlanmıştır; bütün import/çıktı/uzun editör
kabulü bu teslimle tamamlanmış sayılmaz.

## Public girişler ve sorumluluklar

- `src/lib/import/gif/index.ts`: GifImportService, GifImportProvider, PreparedGif
  ve ilgili typed port/policy kayıtları.
- `readGifMetadata`: senkron saf GIF87a/89a framing taraması; native frame açmaz.
  Dosyayı değiştirmez/tutmaz; logical screen, image rect, palette/sub-block
  sınırları, frame count ve trailer kontrol edilir. O(byte) zaman/O(1) ek bellek.
- `planGifSheet`: önceki `ceil(sqrt(n))` packing kuralının tek sahibi. Boş son
  hücreler dahil tam canvas boyu kontrol edilir; piksel/kare kesilmez veya küçültülmez.
- `composeGif`: main ve worker'ın ortak sequential native döngüsü. Typed
  GifPlatform/GifFrameDecoder/GifSurface portları handle sorumluluklarını ayırır.
- `browserGifPlatform`: ImageDecoder ve OffscreenCanvas/HTMLCanvas adaptörüdür.
  Hazır/completed promise'lerini birlikte gözler; tüm frame/native/canvas handle'ları
  finally ile kapanır. Canvas context kurulumu hata verirse bitmap sıfırlanır.
- `GifDecodeWorkerClient`: bir one-shot Worker'ın handshake, transfer, cancellation,
  deadline ve cleanup sahibidir. Frame döngüsü veya source URL üretmez.
- `GifImportService`: File/native/PNG admission ve JobExecutor orchestration'ı.
  Asset/Layer/React oluşturmaz. `GifHandler` yalnız mevcut result/command/source
  dönüşümünü yapar; output PNG kaynak sahipliği withImportSource'a geçer.

Uygulama initImportPipeline'da **editorResourceBudget + editorMediaPreparation**
enjekte eder. GIF inspect/prepare işleri audio/visual/font ile aynı toplam
**2 active / 128 shared wait** slotunu paylaşır. Slot alınmadan File okunmaz.
Static probe mevcut browserVisualDecoder/source owner adaptörünü doğrudan kullanır;
aynı executor'a iç içe ikinci iş gönderilmez, kapasite 1'de deadlock oluşmaz.
Private servis default local 2 active/128 wait kuyruğa sahiptir. Borrowed executor
üzerinden diğer servisleri cancelAll/dispose etme yetkisi verilmez.

## Sınırlar ve ölçüm kapsamı

| Varsayılan politika | Sınır |
|---|---:|
| Encoded File actual bytes | 128 MiB |
| Frame count | 4096 |
| Frame/sheet tek eksen | 16384 px |
| Tek frame RGBA8 politikası | 64 MiB |
| Padded sheet RGBA8 politikası | 64 MiB |
| PNG output sınırı | 128 MiB |
| Servis yerel explicit policy | 256 MiB / 8192 kayıt |
| Prepare/preflight deadline | 30000 ms, queue bekleyişi dahil |

Yerel/reader/host bütçeler örtüşür; toplanmaz. Varsayılan global host 512 MiB'dır.
Geçersiz sayı/deadline kurulumda reddedilir; browser timer taşmasıyla anlık timeout'a
dönüşmez. File header beyanı actual byte limitini atlatmaz. Native decode başlamadan
önce encoded input, native codec için bir full-size copy scope, bir frame/full
sheet workspace ve PNG output kapasitesi birlikte admit edilir. Büyüme/compaction
existing reader'ın old+replacement rezervasyonunu kullanır.

PNG encode rezervasyonu `min(maxOutputBytes, 2×sheetRGBA + 64 KiB)` policy
tahminidir. Native encode tamamlanınca gerçek Blob boyu tekrar kontrol edilir;
rezervasyon gerçek boyuta iner ve PNG caller tarafından bırakılana kadar korunur.
Bu formül browser encoder/decompress/driver iç belleğine matematiksel hard cap
iddiası değildir. Codec iç frame history/cache, padding, structured-clone Blob
kopyaları, transport, persistent source storage, JS/DOM overhead ve OS RAM tam
ölçülmez. Pixel/count cap ve controlled allocation, sonsuz decoder retry yerine
açık ret verir. Release anında fiziksel GC/RAM düşüşü garanti etmez.

Panelin **Input processing · resident / pending** satırı bu policy scope'larını
içerir. Coverage metni GIF workspace/encoding tahminlerini native encoder/driver
kopyalarından ayırır. Known-resource, heap ve bu shared ledger toplanmaz.

## Frame/native akışı ve cancellation

`inspect(file, execution?)` yalnız bounded File→header→plan yürütür; boyut/kare
sayısı için artık native frame 0 açılmaz. `prepare` boyutu/packing'i doğrular,
çalışma belleğini admit eder ve seçilen backend'i başlatır. Her native frame:

1. Önceki frame kapanmışken decode edilir.
2. Native count/display dimensions/pixel policy doğrulanır.
3. Integer sprite-cell konumuna çizilir ve finally ile hemen kapatılır.

Caller tarafında en fazla **bir VideoFrame** canlıdır; native codec'in kendi
disposal/history verisi bunun dışındadır. Decoder PNG encode öncesi kapanır;
canvas actual encode bitene kadar tutulur, sonra sıfırlanır. Durations native
mikrosaniyeden eski average-ms kuralına çevrilir; FPS önceki round/min-1 kuralını
korur. Individual frame duration track'i veya yeni scene alanı eklenmez.

Worker önce gerçek codec/canvas desteği için ready mesajı yollar; bundan önce
buffer transfer edilmez. Main copy scope, worker'a aktarılan input'un logical
charge'ını actual producer settlement'e kadar korur. Worker aynı header/planı
doğrulayıp aynı composer'ı kullanır. Cancel isteği AbortController'ı işaretler;
native await bitip finally cleanup tamamlanınca cevap gelir. Client o zamana
kadar worker/input/workspace sahipliğini bırakmaz. Error/deadline sonlandırması
Worker.terminate handle sınırıdır; native driver/OS belleğinin anında boşaldığı
iddia edilmez. Timer, callback ve abort listener her client çıkışında ayrılır.

Ana backend abort'u native decode/encode await sonrasında kontrol eder. Ortak
withPreparationDeadline iptal sinyalini üretir; çalışan native işi bitti diye
göstermek için promise race kullanılmaz. Bekleyen iş timeout/abort ile File IO
başlamadan çıkar; çalışan iş gerçek settlement'e kadar slot/bütçeyi tutar.
Main-native API hiç settle etmezse deadline fiziksel native bitiş garantisi değildir.

Queue'nun son handoff `discard`'ı PreparedGif.release'i çağırır. İç File helper'ı
owned result yaratıldıktan sonra ayrıca abort fırlatmaz: bu, result'un executor'a
ulaşmadan kaynak kaybetmesine yol açardı. Scope cleanup input'u bırakır; owned
sonucun final iptal/teslim kararı executor'dadır.

## Hata/fallback ve compatibility

Yalnız **explicit setup/capability failure ve transfer edilmemiş input** bir kez
main backend'e geçebilir. Capacity, timeout, abort, corrupt native decode veya
transfer sonrası hata yeniden decode/static fallback başlatmaz. Codec desteklenmiyorsa
veya GIF gerçekten statikse bounded native image probe ile still result üretilir;
önceki still warning/image şeması korunur. Bozuk/büyük veri sessiz kalite düşüşüyle
başarılı import'a çevrilmez. Plain-text GIF rendering açık unsupported durumudur;
LZW/disposal pixel doğruluğu native codec'e aittir, özel LZW decoder eklenmez.

Internal worker protokolü ready/decode/cancel/result/error oldu. Client'ın eski
raw `decode(buffer, timeout)` çağrısı, admitted `GifSheetComposer.compose` portuna
taşındı; bütün repo çağırıcıları güncellendi. Bu private worker ABI scene JSON'u
değildir. Next default Worker URL bundling'i korunur; standalone native QA yalnız
Worker factory URL'sini derlenmiş aynı worker modülüne uyarlar. Default Next UI
import/transport'un uzun bütün-editör kabulü ayrıca kalan iştir.

PreparedGif.sheet başarılı PNG'yi release'e kadar ödünç verir; sonra erişim hata
verir. Metadata immutable scalar'dır. Handler PNG Blob'u existing source owner'a
adopt edip transient lease'i bırakır; statik çıktı original File kaynağını kullanır.
Animated importun önceki gibi canonical sprite PNG kaynağı vardır; tüm original
GIF native buffer'ları kalıcı asset/history içinde tutulmaz. Result source sahibi
commit/discard sonrasında mevcut releaseImportSources akışını izler.

```ts
import { GifImportService } from '@/lib/import/gif'
import { GifHandler } from '@/lib/import/handlers/asset/GifHandler'
import { ImportManager } from '@/lib/import/ImportManager'
import { editorResourceBudget } from '@/lib/resources/budget'
import { editorMediaPreparation } from '@/lib/resources/jobs'

const manager = new ImportManager()
manager.registerHandler(new GifHandler(new GifImportService({
  budget: editorResourceBudget, executor: editorMediaPreparation,
})))
const preflight = await manager.preflight(file, {}, { signal })
const result = await manager.importFileAs(file, 'image/gif', {}, undefined, { signal })
// result.commands[0] existing atomic import command'dır. App mevcut commit/source
// adoption akışını kullanır; discard durumunda releaseImportSources(result) gerekir.
```

## Doğrulama ve kalan hedef

Unit tests: framing/policy, padded bytes, bir canlı frame, draw/encode/context hata
temizliği, native settlement, worker transfer/cancel/timeout/postMessage, queue
backpressure, owned-result handoff iptali ve existing layer/source/command davranışı.
Native QA gerçek Worker/ImageDecoder, exact PNG/RGBA/timing, partial transparency/
disposal, actual renderer loop ve producer settlement'i kapsar. İlk renderer QA
konumu hatası ve ham başarısız kayıt saklanır; renderer/tolerans değiştirilmedi.

Referanslar: [GIF89a biçimi](https://www.w3.org/Graphics/GIF/spec-gif89a.txt),
[WebCodecs ImageDecoder](https://www.w3.org/TR/webcodecs/#imagedecoder-interface).
[Ham native/paired kaynak kanıtları](../../artifacts/performance/opt25-bounded-gif-20261108/README.md).

Genel hedef sürer: kalan File/native metadata/decoded peak sınırları, import UI
proje iptali/IO backpressure, raster/sequence/offline-audio/portable output sahipliği,
uzun bütün-editör/player/panel/heap-process/CPU kabulü; ardından Export E0. Yeni
simülasyon/full 3D veya ileri profiler UI bu geçişin önkoşulu değildir.
