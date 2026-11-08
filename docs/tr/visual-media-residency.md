# Görsel medya sahipliği ve hazırlığı

Bu belge OPT15 decoded resim/video servis sözleşmesidir. OPT16 ana editörde
frame demand, clip-specific lookup, player ve bağımsız final pin adapter'larını
bağladı. [Güncel viewport sözleşmesi](viewport-media-demand.md). Font/GPU ve
bütün editörün uzun kaynak kabulü henüz tamamlanmadı.

## Girişler ve veri akışı

- `src/lib/asset/visual/index.ts`: VisualAssetService, composition root
  visualAssetService ve decoder/resource/lease tipleri. Import/construction decode
  başlatmaz; yalnız acquire iş ister. Metadata/URL kimliği ve byte ölçümü buradadır.
- `browserVisualDecoder.ts`: native image/video create, drawable readiness,
  15s deadline, hata/abort callback cleanup ve final native reset. Transport,
  React, scene ve original URL ownership platform adapter'ın işi değildir.
- `src/lib/resources/residency/ResidentResourceCache.ts`: PCM'deki mevcut pin,
  retire, grace ve local/shared admission çıkarıldı. AudioPcmCache Float32 ölçüm
  ve buffer-named compatibility adapter'ı olarak kaldı. DOM/audio tipi içermez.
- `src/lib/resources/jobs/SharedPreparationQueue.ts`: AudioAssetService'teki
  in-flight dedupe, independent consumer abort ve delivery workflow'unun ortak
  sahibidir. Audio ve visual kullanır; alt FIFO/native concurrency BoundedJobQueue,
  byte/LRU algoritması ResourceBudget olarak kalır.
- [Original source owner](asset-source-lifetime.md) URL lifetime'ını ayrı yönetir.
  Pending input submission'dan gerçek settlement'e kadar borrowed tutulur.

Akış: frame/job consumer acquire → resident hit veya keyed queue → byte reserve →
native create/ready → actual RGBA frame ölçümü/admit → protected delivery → consumer
pin → release → warm/pressure eviction. Scene/undo JSON'una native handle eklenmez.

## Kimlik, birim ve kullanım

Image/sprite-sheet aynı URL'de bir decoded element paylaşır; asset ID farklı
olabilir. URL replacement eski decode'a hit etmez. Sheet'in tüm decoded boyutu
hesaplanır; frame seçimi frameSequence renderer'ın işidir.

Video URL'si tek başına yeterli değildir: consumerId **host/document scope ve
clip kimliğinden** oluşmalıdır. İki farklı local saatteki klip farklı ID ve native element
alır. Aynı ID verilirse caller'lar bilerek aynı mutable clock owner'ını paylaşır.
Orijinal source URL paylaşılır. Tuple kimliği delimiter collision üretmez.

```ts
import { visualAssetService } from '@/lib/asset/visual'

const pin = await visualAssetService.acquire(asset, {
  signal, consumerId: `${documentScope}:${clip.id}`, // video için zorunlu
})
try {
  if (signal.aborted) return // geç sonucu da finally bırakır
  drawUsingMedia(pin.value.element)
} finally {
  pin.release()
}
```

Örnekte asset/signal/clip/scope/draw consumer girdileridir, yeni MCP API'si değil.
Raw element retained kullanılacaksa pin de tutulur; bağımsız owner `pin.retain()`
alır. Release idempotent; released value/retain hata verir. Release sonrası raw
element kullanılmaz. Width/height native piksel, video.currentTime saniyedir.
Servis composition saati/offset/loop uygulamaz; transport adapter'a aittir.

## Admission, iptal ve lifecycle

Visual local profil **192 MiB / 256 kayıt** ve aynı mevcut **512 MiB global**
ledger'dır. Image/video bir local sınırı paylaşır, ticket kategorileri ayrıdır.
PCM'nin 256 MiB yerel sınırı korunur; örtüşen sayılar toplanmaz. Bunlar optimum
ölçümü veya bütün browser RAM garantisi değildir.

Metadata biliniyorsa width×height×4 DOM yaratılmadan reserve edilir. Bilinmiyorsa
64 MiB tahmin (yerel sınıra kadar) kullanılır; native boyutlarla uzlaştırılır.
Sığmayan result açık hata alır; untracked başarılı DOM dönüşü veya sessiz kalite
azaltma yoktur. Video ölçümü **bir RGBA display frame** tahminidir; decoder,
network/codec iç kopyaları ve GPU hariçtir. Yanlış metadata/tek büyük decode geçici
peak'i aşabilir; compressed/native output preflight açık kalır.

Default queue **2 aktif / 128 bekleyen**, dedupe admission öncesidir. Bir consumer
abort diğerini bozmaz. Son consumer queued işi çıkarır; non-abortable native slot
ve charge gerçek settlement'e kadar kalır. Tam admission/delivery arasında iptal
gelirse exact-value invalidation eski sonucu retire eder, yeni same-key result'ı
silemez. CORS/dimension/readiness failure açık hatadır.

clear lookup/generation'ı invalid eder; eski promised caller retired pin alabilir.
cancelPending ayrıca queue'yu iptal eder. dispose yeni admission'ı kapatır; aktif
pin'ler son release'e kadar geçerlidir. Shared singleton consumer'ı global dispose
yerine kendi pin/signal'ını bırakır. Son release video pause/src removal/load;
image src removal yapar. Orijinal URL revoke edilmez.

Resource cache başarılı admit ile value ownership devralır. Failed preparation
discard ile mevcut reservation altında temizlenir. Destructor başarılı olmadan
charge bırakılmaz. Failure value/charge'ı quarantined tutar, lookup'tan çıkarır ve
failedEntries sayar; timer retry loop yoktur. clearIdle açık retry yapar. Failed
cleanup'ta korunan charge tahmindir, gerçek ölçüm iddiası değildir. Idle en fazla
2s warm; pressure daha erken çıkarabilir. Bir timer vardır, sonsuz RAF yoktur.
Final destruction sonrası entry payload da null olur; released lease closure'ı
decoded payload'ı tutmaz. Kaynak dosya/URL ownership bu owner'a aktarılmaz.

## Kabul ve açık entegrasyon

[OPT15 kanıtı](../../artifacts/performance/opt15-visual-ownership-20261107/README.md):
**14/14 visual native** PNG/WebM, exact RGBA reload, ayrı 100/500ms video kareleri
ve final reset/charge 0. Ortak owner çıkarımı sonrası **14/14 mevcut PCM native**
kontrol tekrar geçti. 198 dosya / **1.750 test**, TS, MCP ve Next build başarılı.
Bu fixture Four Seasons CPU, whole-editor uzun kaynak veya OS RSS kabulü değildir.

OPT16 visibility/dependency/evaluator frame demand, 128 CSS px spatial pay /
500ms temporal warm adaylar, per-clip sync/map, viewport/player/MCP/raster/sequence
pin'leri ve panel adapter'ını bağladı. Font/text ve GPU owner'ları açık kalır.
Ardından kalan ağır IO/backpressure/cancel/preflight ve uzun editör kabulü gelir.
Export E0 henüz başlamadı; 37 GB root cause bu fixture'dan kanıtlanmaz.
