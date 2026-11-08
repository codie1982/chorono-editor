# Sınırlı ZIP / dotLottie importu

OPT24, eski ZipReader'ın sınırsız `Response.arrayBuffer()` açılımını ve
dotLottie metadata yolunun sınırsız `file.arrayBuffer()/text()` okumalarını
değiştirir. Ortak [binary reader](bounded-binary-input.md), ResourceBudget ve
mevcut import/source sahipliği kullanılır. Yeni scheduler, cache veya sahne alanı
yoktur. GIF worker, diğer File handler'ları ve genel IO kuyruk işi devam eder.

## Modül sınırları ve girişler

- `src/lib/import/zip/index.ts`: ZIP public girişidir. `ZipReader`, `ZipEntry`,
  `ZipLimits`, `ZipInflater`, `ZipReaderOptions` sunar.
- `ZipDirectory`: modül içi saf ZIP32 doğrulama algoritmasıdır; IO/React/bütçe
  handle'ı tutmaz. Arşivi yalnız senkron çağrı boyunca ödünç alır.
- `ZipReader`: doğrulanmış aralıkların native açılımı, gerçek byte sayımı, CRC ve
  çıktı lease sahipliğini yönetir. `ZipInflater` sadece sıkıştırılmış veriden
  stream üreten küçük platform portudur; varsayılan raw-DEFLATE backend'idir.
- `src/lib/format/checksum`: mevcut ZipWriter CRC-32 algoritmasının tek sahibidir.
  Import/export burayı kullanır; eski `export/sequence/ZipWriter` ve export index
  üzerinden `crc32` importları re-export ile korunur.
- `handlers/document/lottie/LottieMetadataReader`: original File, decoded entry
  ve geçici metin scope'larını yönetir. `LottieMetadataConverter` JSON'dan yalnız
  küçük scalar metadata kaydını döndürür; layer/asset dizileri tutulmaz.
- `LottieDocumentHandler`: metadata portunu kullanıp değişmemiş original kaynağı
  mevcut withImportSource üzerinden sonuç sahibine devreder. Uygulama kurulumu
  initImportPipeline'da tek editorResourceBudget'ı enjekte eder. Private handler
  ve reader kullanımları yerel politikaya sahiptir.

## Kapasite ve doğrulama

Varsayılan sınırlar **128 MiB original ZIP**, **64 MiB tek açılmış entry**,
**128 MiB toplam beyan edilmiş/açılmış entry**, **4096 entry**'dir. ZipReader'ın
yerel explicit buffer bütçesi **256 MiB / 8192 kayıt**; opsiyonel host ledger ve
binary reader'ın daha dar limitleriyle örtüşür. Yerel/global sayaçlar toplanmaz.
Birim byte'tır, koordinat/zaman bağımlılığı yoktur. Geçersiz politika kurulumda
RangeError, kapasite aşımı açık ret üretir; çıktı kesilmez veya kalite düşürülmez.

Tam central directory ve local kayıtlar açılımdan önce doğrulanır: terminal EOCD
ve comment boyu, sayılar/aralıklar, local/central isim-metot-flag eşleşmesi,
STORE boyları, ZIP32 descriptor'lar ve çakışan local aralıklar. Kısmi directory
listesi dönmez. Aynı isimli entry ve belirsiz/unsafe path reddedilir; dosya
sistemine yazma yapılmaz. Çıktı merkezi kayıt sırasını korur; aralık kontrolü
ayrı kopyayı sayısal native sort ile sıralar. Zaman O(byte + n log n), n sınırlıdır.

STORE, raw-DEFLATE ve imzalı/imzasız ZIP32 data descriptor desteklenir. ZIP64,
şifreleme, split/disk arşivleri, central digital signature ve desteklenmeyen
flag/metotlar açık capability hatasıdır. Önceki reader gibi adlar UTF-8 okunur;
bozuk UTF-8 artık replacement karakterle birleştirilmez, reddedilir. Tam CP437
ve Unicode extra-field dönüşümü eklenmiş değildir.

Biçim referansı: [PKWARE APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT),
§§4.3.7–9, 4.3.12, 4.3.16. CRC algoritması yeniden yazılmamıştır.

Native açılım output'u mevcut BoundedBinaryReader'dan geçer. Geometrik büyüme
ve compact etmede **eski+yeni kapasite allocation öncesi** admit edilir. Beyan
edilen boyut küçük olsa bile actual byte sınırı aşılamaz. Sonuç tesliminden önce
gerçek açılmış boyut ve CRC kontrol edilir; uyumsuzlukta sahiplik bırakılır.
STORE da aynı sahipli çıktı yolunu kullanır; original arşiv view'ı döndürülmez.

## Sahiplik, iptal ve uyumluluk

`extractLease(buffer, entry, execution?)` compact BinaryInputLease döndürür;
başarılı çağrıda release caller'a aittir. `buffer` actual native settlement'e
kadar değişmemeli ve sahibi tarafından bırakılmamalıdır. Entry, aynı arşivin
readEntries sonucundan gelmelidir; caller'ın değiştirdiği/arşiv dışı descriptor
güvenilerek kullanılmaz. readEntries immutable isim/sayı metadata'sı döndürür;
ZipEntry'ye CRC/flags bilgisi eklenmiştir. Arşiv/DOM/runtime cache tutulmaz.

`withEntry` callback bitene kadar decoded çıktıyı korur ve finally ile bırakır.
Callback'ten kalıcı nesne döndürülürse onun ayrı sahibi olmalıdır. Abort native
read/cancel settlement'ini erken tamamlandı saymaz. Callback abort'u dikkate
almıyorsa actual callback sonu beklenir, sonra sonuç teslim edilmeden AbortError
üretilir. İptal, başarılmış importComplete yayınını geriye dönük bozmaz.

Eski `extract` ve `readAll` raw dönüşleri compatibility/deprecated adapter olarak
kalır. Gerçek çıktı boyutu/admission kontrol edilir; readAll kısmi çıktı lease'lerini
birlikte tutar ve tek hata/iptalde tamamını bırakır. Başarılı raw handoff'tan
sonra retention caller'a aittir ve ZIP scope'unda ölçülmez. Uygulamanın dotLottie
tüketicisi artık withEntry kullanır; eski raw adapter'ların uygulama çağırıcısı
yoktur. Bu sınır sonraki tüketiciler için de korunmalıdır.

```ts
import { ZipReader } from '@/lib/import/zip'
import { editorResourceBudget } from '@/lib/resources/budget'

const zip = new ZipReader({ budget: editorResourceBudget })
// encodedInput: original ZIP'i tutan mevcut BinaryInputLease.
const entry = zip.readEntries(encodedInput.buffer).find(e => e.name === 'data.bin')
if (entry) {
  const output = await zip.extractLease(encodedInput.buffer, entry, { signal })
  try { await consumeBorrowedBytes(output.buffer) }
  finally { output.release() }
}
// encodedInput ancak actual extraction/consumer tamamlandıktan sonra bırakılır.
```

Örnekte consumeBorrowedBytes host adapter'ıdır; yeni bir genel decoder değildir.

ImportExecution'ın mevcut ImportManager re-export yolu korunur, sahibi
`import/resources/ImportExecution` olur. Manager → Asset/DocumentImporter → handler
zinciri opsiyonel runtime execution'ı iletir. Preflight da opsiyonel execution
alır. Yeni-aware Lottie handler bunu IO ve publication sınırlarında kontrol eder;
legacy handler'ların mevcut az argümanlı implementasyonları geçerlidir. UI hook
proje değişimi/AbortController bağlantısı bu teslimde tamamlanmış değildir.

## dotLottie ve ölçüm sınırları

Original File stream'i sınırla okunur; bulunan animation entry lease ile açılır.
TextDecoder öncesi en fazla **2×UTF-8 byte boyu** UTF-16 text charge'ı ayrılır.
JSON.parse sonra yalnız version/width/height/fps/duration/layerCount döner. Duration
önceki frame/fps → yuvarlanmış ms kuralını kullanır. Metadata okuma cache'lenmez;
preflight ve import ayrı scopes'tur. Original Blob/source ownership mevcut
AssetSourcePool'dadır; input lease'in bitmesi persistent source'un silinmesi değildir.

Geçersiz JSON veya animation JSON'u olmayan okunabilir arşiv nullable metadata
üretmeye devam eder. Bozuk ZIP, desteklenmeyen format, kapasite/bütçe reddi ve
abort artık sessizce boş metadata/başarılı asset'e çevrilmez. Source yaratılmadan
önce hata dışarı çıkar; geç source construction hatasını withImportSource temizler.
Lottie editable-layer conversion hâlâ ayrı planlı yetenektir; bu teslim onu eklemez.

Bütçe **explicit transient buffer ve text politikasını** izler. Transport/native
decompress chunk'ları, JSON.parse nesne grafiği, metadata string/object overhead'i,
persistent Blob, tarayıcı/sürücü kopyaları ve OS RAM'i için kesin hard cap değildir.
Release referans/sahipliği bırakır, anında GC/fiziksel RAM düşüşü garantilemez.

Panelin İngilizce satırı **Input processing · resident / pending** olur; input
kategorisi artık encoded ve decoded tamponlarla geçici text politikasını kapsar.
Coverage metni JSON.parse nesnelerinin bu sayıya dahil olmadığını açıkça belirtir.
OPT23'teki Encoded input etiketi tarihsel ölçümdür, yeni snapshot etiketi değildir.

## Doğrulama ve sonraki işler

Unit testleri mevcut ZipWriter uyumluluğu, STORE/native DEFLATE, iki descriptor
biçimi, EOCD comment/truncation, aralık/kimlik/CRC, kapasite ve gerçek native
cancel settlement gate'lerini kapsar. Lottie testleri metadata/source/command,
input+text overlap reddi, hataların yutulmaması ve manager execution iletimini
kontrol eder. Test ZIP üreticisine gerçek CRC eklendi; eski CRC=0 fixture'ı artık
integrity kontrolünü atlatmaz. Production CRC toleransı/fallback eklenmedi.

Ham test, native tarayıcı ve Four Seasons kayıtları:
[OPT24 raporu](../../artifacts/performance/opt24-bounded-zip-20261108/README.md).
Kalan sıra GIF/worker ve diğer gerekli File okumaları; native decoded peak/import
UI/ortak ağır IO kapasitesi; çıktı ownership/backpressure; uzun bütün-editör/player,
panel, heap/process ve CPU kabulüdür. Genel export öncesi hedef sürer; Export E0
başlamamıştır. Yeni simülasyon veya full 3D bu sıranın önkoşulu değildir.
