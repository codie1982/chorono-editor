# Native medya kabulü — OPT28

Metadata, native hazırlık ve font-outline sahipliği uygulanmıştır. **246 dosya /
2.025 test** ve **33/33 gerçek Chrome kontrolü** geçti. Four Seasons karşılaştırması
aşama artefact'ında ayrıca kaydedilir. Bu dilim çıktı tamponlarının sahipliğini,
uzun bütün-editör kabulünü veya Export E0'ı tamamlamaz.

## Sahiplik ve giriş noktaları

- `src/lib/asset/metadata/image`: DOM, editor singleton veya IO içermeyen PNG,
  JPEG, WebP ve GIF başlık algoritmaları. GIF logical-screen hesabı tam GIF
  framing okuyucusuyla ortaktır. Worker bu saf alt yolu kullanır.
- `src/lib/asset/metadata/ImageMetadataReader.ts`: mevcut
  `BoundedBinaryReader.readPrefix` üzerinden varsayılan 1 MiB başlık okur.
  Boyutlar scalar olarak döner; tüm geçici byte sahipliği sonuç/hata öncesi
  bırakılır. URL'nin kalan body cancellation'ı gerçekten settle olmadan teslim
  yapılmaz. Büyük Content-Length, prefix modunda tüm dosyayı okuma nedeni değildir.
- `src/lib/asset/metadata/MediaProbeService.ts`: image/video/audio metadata ve
  sprite preview sahipliği. Yerel 2 aktif/128 bekleyen iş, 15 sn deadline ve
  256 MiB transient owner kullanır. Deadline kuyrukta geçen zamanı da içerir.
- `src/lib/asset/metadata/editorMediaProbes.ts`: uygulamanın mevcut 512 MiB
  ledger ve ortak iki medya hazırlama slotunu enjekte eden composition root.
  Ayrı bir global bütçe veya worker açmaz. Import handler'ları ve sprite modal
  bu örneği kullanır.
- `src/lib/asset/visual/VisualAssetService.ts`: viewport image/sprite yüklemesi
  aynı başlık portunu kendi mevcut işi içinde kullanır. Ortak medya slotundan
  tekrar probe kuyruğuna girmez; iç içe shared-capacity beklemesi oluşturmaz.
- `src/lib/asset/fonts/input`: native font ve outline için ortak **32 MiB actual
  encoded-byte** okuyucusu ve SFNT/WOFF/WOFF2 container hesabı. FontFace ikinci bir
  sınırsız URL fetch'i yerine bu sahibin ArrayBuffer'ını alır. Container doğrulaması
  checksum/glyph program güvenliği veya WOFF2 reconstruction garantisi değildir.
- `src/lib/text/fonts`: URL'ye göre ayrılan parsed-font owner; yerel **32 MiB /
  8 kayıt**, mevcut ortak medya slotları, independent cancel, pin ve idle cleanup.
  Lazy parser'ın DataView backing'i kullanabildiği bütün süre boyunca encoded
  input lease korunur. Aynı URL dedupe edilir; hata kalıcı pending promise yapmaz.
- `src/lib/text/GlyphOutlineExtractor.ts`: async `textToSplineData` ve saf
  `fontTextToSplineData` converter'ı. Scene değişimindeki abort UI publication'ı
  engeller. 4096 UTF-16 birimi / 50000 path command politikası vardır. WOFF2 outline
  extraction, mevcut opentype.js capability'sinde desteklenmez; native font kaydı
  bundan bağımsızdır. Yeni WOFF2 decompressor/fallback eklenmedi.
- `src/lib/audio/metadata/readWavMetadata.ts`: desteklenen PCM/IEEE-float RIFF
  WAV için actual chunk sınırı ve Float32 output tahmini. AudioContext'ın gerçek
  sample rate'iyle resampled frame sayısı + bir rounding frame'i decode öncesi
  reserve edilir. Compressed/extensible/RF64/RIFX opaque politikada kalır.

Başlık IO → desteklenen piksel sınırı/bütçe rezervasyonu → kaynak URL'si/native
handle → actual ready → scalar metadata veya preview pin sırası izlenir. İptal
edilmiş işin decoder'ı hâlâ çalışıyorsa hem slot hem rezervasyon korunur. Native
temizleme başarısızsa handle, kaynak lease'i ve charge karantinada kalır;
`clearIdle()` bir kez açık retry yapar. Başarıyla temizlenmeyen kaynak sıfır
bellek olarak gösterilmez. Tekrarlanan release idempotent'tir.

## Koordinat, zaman ve bellek sözleşmesi

Boyutlar CSS/editor transform'undan bağımsız kaynak pikselidir. PNG/JPEG/WebP/GIF
başlıkları coded/canvas boyutunu verir; native display boyutunda EXIF eksen
değişimi veya density küçülmesi olabilir. Bu nedenle aynı ürünle eksen değişimi
kabul edilir, native ürünün desteklenen başlığı aşması reddedilir. Süre ms'dir;
sesin 50 ms gibi kısa süreleri korunur. Video için eski <100 ms unknown-duration
davranışı korunmuştur.

Varsayılan frame politikası **16384 piksel/eksen, 128 MiB RGBA8** sınırıdır.
Desteklenen header bu sınırı aşıyorsa native image oluşturulmaz. Bilinmeyen veya
1 MiB prefix dışında kalan header **64 MiB opaque tahmin** kullanır; bu, decode
öncesinde gerçek boyutun bilindiği anlamına gelmez. Native video metadata 64 MiB,
audio metadata 1 MiB policy rezervasyonuyla başlar. Bunlar ölçülmüş codec RAM'i
değildir. Header prefix sınırı tüm encoded kaynağın boyutunu veya native Blob
belleğini sınırlamaz; `File.size` 128 MiB image kaynak politikası ayrı bir hint'tir.

Native ara kopyalar, yüksek bit derinliği, animasyon decoder cache'leri, browser
network chunk'ları ve sürücü belleği bu RGBA policy tahmininin dışında kalır.
AVIF/SVG gibi opaque girdilerde allocation öncesi kesin piksel boyutu garantisi
verilmez. Yeni kod tüm browser/işlem RAM'ini 512 MiB ile sınırlandırdığı iddiasında
bulunmaz. Desteklenen bozuk header ve transport hatası, native retry ile atlatılmaz.

FontAssetService önce eski declared-filesize/unknown tahminiyle kapasite alır,
sonra bounded input/container gerçekleriyle policy'yi yeniden hesaplar. Yanlış
yüksek authored filesize başlangıçta konservatif reddedilebilir; geçersiz küçük
metadata actual input sınırını atlatamaz. Policy, font/glyph native RAM ölçümü değildir.

Modern `Image.decode()` promise'i abort/timer ile yarışıp erken tamamlanmaz.
Kaynak reset istenir, fakat owner actual promise settlement'ini bekler.
Metadata-only audio/video reset'i HTMLMediaElement'ın mantıksal yaşam döngüsüdür;
driver'ın fiziksel belleği aynı anda bıraktığının kanıtı değildir.

## Asgari kullanım

```ts
import { editorMediaProbes } from '@/lib/asset/metadata/editorMediaProbes'

const controller = new AbortController()
const info = await editorMediaProbes.image(file, { signal: controller.signal })
// info yalnızca scalar metadata taşır; native image artık probe'a ait değildir.

const preview = await editorMediaProbes.preview(file, { signal: controller.signal })
try {
  previewHost.appendChild(preview.element)
  // UI kullanımı boyunca pin yaşar. İkinci bir img.src yüklemesi yapılmaz.
} finally {
  previewHost.replaceChildren()
  preview.release()
}
```

Gerçek UI, unmount/dosya değişiminde controller'ı iptal eder ve geç gelen preview
pin'ini de bırakır. Sprite grid doğrulaması `buildSpriteGrid` ortak hesabındadır;
her hücrenin en az bir kaynak pikseli olmalıdır. Modal grid'i frame başına DOM
düğümü üretmek yerine sabit sayıda CSS öğesiyle çizer.

## Doğrulama ve kalan kabul

Tüm paket: **246 dosya / 2.025 test**. TypeScript, MCP build ve Next production
build geçti. Native **33/33** kontrol PNG/JPEG/WebP/GIF, opaque SVG, WebM/WAV
metadata, gerçek decode iptali, sahipli preview, kaynak bırakma, native font RGBA,
eski frozen outline geometry/RGBA, PCM output reservation ve exact native-reference
stereo örneklerini kapsar. Chrome'un int16 quantization farkı üretim sesine
müdahale edilerek gizlenmedi; bütün sample'lar aynı native referansla karşılaştırıldı.

StrictMode replay native fixture'ı React development moduyla derlenir ve iptal
sayacının gerçekten arttığını doğrular. Production renderer karşılaştırması ayrı
production bundle'dır. Delivery gate'leri native decode tamamlandıktan sonra
tutulur; bunlar busy native decoder ölçümü diye sunulmaz. Fixture'ın kopya kanıt
canvas'ları ve frozen legacy reference parsed font'u private ledger kapsamı dışıdır.
Son private ledger, işler ve source lease'leri 0; opaque SVG policy peak'i 64 MiB.

Kanıtlar: `artifacts/performance/opt28-media-preflight-20261108/`. Güncel sıra:
çıktı tamponlarının sahipliği → uzun bütün-editor/player/CPU/heap kabulü → Export E0.
Bu küçük codec fixture'ı uzun bellek plateau'su veya native process RAM ölçümü değildir.
