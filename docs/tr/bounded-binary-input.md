# Sınırlı binary girdi ve geçici kopya sahipliği

OPT23, ses hazırlığındaki sınırsız `Response.arrayBuffer()` ve URL importundaki
`Response.blob()` yollarını ortak `src/lib/resources/io` modülüne bağlar. ZIP,
GIF/worker, yerel dosya handler'ları ve bütün import UI iptali henüz bu teslimle
tamamlanmış değildir. Genel export öncesi hedef ve CPU tail kabulü açık kalır.

Güncel takip: [OPT24 ZIP/dotLottie](bounded-zip-import.md), bu reader'ı ZIP açılımı
ve Lottie File/metin tüketicisine bağladı. Aşağıdaki OPT23 ölçümleri tarihsel
kapsamını korur; GIF/diğer File handler'ları ve UI/job/çıktı/uzun kabul işleri sürer.

[OPT25 GIF hazırlığı](bounded-gif-preparation.md) de bounded File/native-copy/
workspace/output scope'larını ve mevcut shared job kapasitesini kullanır. Diğer
File/native metadata ve genel UI/IO/output/uzun kabul işleri halen açıktır.

## Public sınır ve bağımlılıklar

- `BinaryInputReader.readResponse(response, {signal?})`: yalnız input okuma portu.
- `BinaryInputLease`: scope boyunca borrowed buffer/byteLength, `release()` ve
  tam boyutlu binary kopya için `withCopy(work)` sahipliği.
- `BoundedBinaryReader`: gerçek response byte sınırı, büyüme/kompaktlama admission'ı
  ve stream cancellation adapter'ı. Varsayılan **128 MiB** actual response sınırı,
  yerel **256 MiB / 128 kayıt**; optional host budget ile örtüşür.
- `OwnedBinaryInput`: yalnız bir geçici buffer/ticket sahibi. Cache, orijinal
  URL, decoder, scene veya tarihsel frame kaydı tutmaz.

Mevcut ResourceBudget/ResourceBudgetGroup kullanılır; yeni LRU/scheduler yoktur.
`input` runtime bütçe kategorisi eklendi. Sayılar byte'tır; geometri koordinatı
veya animasyon zamanına bağlı değildir. Minimum kayıt politikası boş buffer'da
1 byte'tır; bu, ledger'ın positive-size sözleşmesini değiştirmez. Boş buffer'ın
gerçek byteLength'i 0 kalır. Hiçbir runtime lease scene/undo JSON'una yazılmaz.

Domain servisleri reader portuna bağlıdır. AudioAssetService optional inputReader
alır; varsayılan okuyucusu verilen host budget'ı paylaşır. ImportManager optional
inputReader/fetch alır; uygulama singleton'ı mevcut 512 MiB ledger'ı enjekte eder.
Private servislerin yerel sınırlaması vardır. Buffer sınıfları küçüktür; büyük
ImportManager sadece ilgili IO/publication sınırında güncellenmiştir.

## Veri akışı, kapasite ve hata sözleşmesi

Reader response body lock'unu tek başına sahiplenir. Native transport chunk'ını
bir sonraki await öncesi kendi contiguous buffer'ına kopyalar. Buffer geometrik
büyür; sınırsız sayıda küçük chunk nesnesi tutulmaz. Büyüme ve son kompaktlamada
**eski kapasite + yeni kapasite** önce reserve edilir, sonra allocation/copy
yapılır. Eski referans bırakılınca charge yeni kapasiteye iner. Bu logical owner
muhasebesidir; JS GC'nin fiziksel belleği anında bırakacağı iddia edilmez.

Identity encoding Content-Length sadece erken ret ipucudur. Eksik, yanlış veya
küçük başlık actual-byte limitini atlatmaz. Content-Encoding varsa wire boyutu
decompressed body boyutu sayılmaz; actual byte kontrolü yine uygulanır. HTTP
başarısızlığı, actual limit veya bütçe reddi body'yi cancel eder ve owned belleği
bırakır. Streaming body sağlamayan backend açık hata verir; sınırsız fallback
yoktur. Caller response'u önceden tüketmemeli/lock etmemelidir.

Abort read/cancel isteği yollar; devam eden native read/cancel promise'i gerçekten
bitmeden owner tamamlandı sayılmaz. Başarılı dönüşten sonra input lease'in release'i
caller'a aittir. Buffer.native decode tarafından detach edilse bile orijinal
logical byteLength/charge gerçek decoder settlement'ine kadar korunur. Detach
edilmiş veriyi yeniden buffer/kopya diye kullanma girişimi hata verir.

`withCopy` callback çağrılmadan önce ilave tam boyutlu binary kopyayı admit eder.
Başarısız admission callback'i çalıştırmaz. Callback sırasında release istenirse
orijinal input da gerçek callback settlement'ine kadar tutulur. Bu işlem bütün
encoder/string/native kopyalarını otomatik ölçmez; farklı temsil/solver çıktıları
kendi boyut ve sahiplik sözleşmesiyle ayrıca admit edilmelidir.

## Mevcut tüketiciler ve cancellation sınırı

Audio pipeline: existing local/shared admission → PCM estimate reservation →
fetch → bounded encoded input → native decode → actual PCM admission → input
release. İptal edilmiş consumer erken reject olabilir; native pipeline, kaynak
URL, PCM estimate ve encoded input gerçek settlement'e kadar korunur. Eski raw
load API'sinin oversize PCM fallback sınırı değişmedi; encoded input limiti ona da
uygulanır. Native decoded PCM overshoot hâlâ ayrıca preflight gerektirir.

URL import: URL doğrulama → fetch → bounded input → File kopya reservation'ı →
format detection/handler/transaction hazırlığı → kopya/input release. Kalıcı
orijinal Blob/source lifetime'ı AssetSourcePool/importSources'a transfer edilir;
geçici input charge bitmesi o kaynak dosyanın native RAM'den çıktığı anlamına gelmez.
Yerel File'lar sırf kontrol için komple RAM'e kopyalanmaz; handler yolları ayrı
migrasyon işi olarak kalır.

`ImportExecution {signal?}` format seçeneklerinden ayrı, runtime-only opsiyondur:
`importFile`/`importUrl` dördüncü; `importFileAs` beşinci argüman olarak alır.
İptal hazırlık/publication sınırlarında gözlenir. Legacy handler abort'u doğrudan
desteklemiyorsa tamamlanması beklenir; sonra source lease bırakılır, command/complete
event yayımlanmaz. `importComplete` başarı publication noktasıdır; daha sonraki
iptal tamamlanmış sonucu geriye dönük bozmaz. UI hook'larının proje değişimi ve
cancel kontrollerine bu runtime signal'ın bağlanması sonraki iştir.

```ts
import { BoundedBinaryReader } from '@/lib/resources/io'
import { editorResourceBudget } from '@/lib/resources/budget'

const reader = new BoundedBinaryReader({ budget: editorResourceBudget })
const input = await reader.readResponse(await fetch(url, { signal }), { signal })
try {
  // Await ACTUAL native completion, including cancellation of non-abortable work.
  await decoder(input.buffer)
} finally {
  input.release()
}
```

`decoder` örnekte host adapter'ıdır; yeni bir genel decoder API'si değildir.
Custom byte politikası reader injection'ıyla seçilir, sessiz kalite değişimi yoktur.

OPT28 `BinaryPrefixReader.readPrefix(response, maxBytes, { signal })` capability'sini
aynı buffer-growth/ownership implementation'ına ekler. Büyük full-source
Content-Length prefix okumayı reddetmez; yalnız istenen prefix kopyalanır, kalan
body cancel'ı gerçekten settle olmadan lease teslim edilmez. Bu full encoded
dosyanın boyut sınırı değildir. Image header varsayılanı 1 MiB'dir. Font native ve
outline yolları prefix yerine 32 MiB actual full-read kullanır; lazy font backing'i
son consumer/idle cleanup'ına kadar resident input olarak kalabilir. Input satırı
bu nedenle yalnız o anda çalışan IO işlerini saymaz.

## Panel ve ölçüm sınırları

Managed allocation budget, **Encoded input · resident / pending** satırını
gösterir. Eski snapshot kategoriyi sağlamazsa Not tracked görünür. İki partition
ve host/local ledger birbirine eklenmez. Transport-provided chunk'lar, browser
network/decompression/decoder kopyaları, persistent source Blob storage ve bütün
process RAM'i bu transient buffer politikasıyla ölçülmez veya hard-cap edilmez.
Partial known-resource toplamı ve JS heap ayrı kapsamlardır.

## Doğrulama ve sonraki tüketiciler

**217 dosya / 1.852 test**, TS/MCP/Next geçti. Reader testleri chunk bağımsızlığı,
yalancı/encoded başlıklar, actual byte cap, old+new overlap, gerçek cancel completion,
HTTP/unavailable backend, empty minimum charge, detach ve protected copy kapsamını
doğrular. Native stream kilidi bırakılırken hata oluşursa hazırlanmış ama caller'a
devredilememiş input da bırakılır; bu hata yolu önce başarısız regresyon testiyle
doğrulandı. Audio testleri native-detached input ve PCM charge'ının korunmasını;
import testleri gerçek kaynak lease'i, MIME/File kopyası, admission reddi ve stale
publication cleanup'ını kapsar. Eski arrayBuffer-only test transportları gerçek
Response/stream'e güncellendi; production'da sınırsız fallback eklenmedi.

Gerçek Chrome'da **10/10 native kontrol**: WAV decode/stereo peak, PNG handler ve
command/source adoption, exact PNG pixel, detached input, gecikmiş iptal ve son
byte charge 0. Private test 512 MiB host ledger/256 KiB reader limitini kullanır;
production reader default'u 128 MiB kalır. Source microtask revoke beklentisi unit
testinde düzeltildi; production source lifetime değişmedi.
[Tekrarlama ve ham kanıt](../../artifacts/performance/opt23-bounded-input-20261108/README.md).

Sıra: bu reader'ı gereken File/ZIP/decompression ve worker input tüketicilerine
bağlamak; native metadata/decoded-output peak preflight; import UI proje-scope iptali
ve ortak ağır IO/job backpressure; raster/sequence/offline-audio/portable paketleme
çıktı sahipliği; ardından uzun editor/player/panel/heap-RSS/CPU kabulü. Export E0
henüz başlamadı. Yeni simülasyon/3D veya ileri profiler bu sıraya önkoşul değildir.
