# Font kaynak sahipliği ve hazırlık

Bu dilim 2D/2.5D kaynak yönetiminin font açığını kapatır; Export E0/parity
çalışmasının tamamlandığı anlamına gelmez. Tarayıcının FontFace ve glyph-cache
belleği ölçülemez. Aşağıdaki kabul tutarları gerçek RAM ölçümü değildir.

## Giriş noktaları ve sorumluluk

- `src/lib/asset/fonts/index.ts`: FontAssetService, fontCatalog, describeFont,
  FontBindingsSnapshot ve dar FontBindings/FontDecoder sözleşmeleri.
- FontAssetService: talep olduğunda native hazırlık, dedupe, independent cancel,
  consumer pin, retirement, idle ve bütçe sahipliği. React/scene değerlendirmez.
- FontCatalog/FontFamilyList: DOM'suz CSS aile listesi ve mevcut asset metadata'sı
  arasında dönüşüm. Immutable asset/asset-array kimliği ile weak metadata cache.
- browserFontDecoder: yalnız kendi FontFace kaydını ekleyen/silen browser adapter.
- VisualDemandResolver/VisualMediaSession: mevcut görsel medya talebine font
  bağımlılıklarını ekler. Session adı korunur; mevcut consumer API'si genişletilir.
- `src/lib/render/media/projectFrameFonts.ts`: çizim/geometri için readonly alias
  projection; frame override ailesi tekrar materialize edildiğinde alias korunur.
- `src/lib/text/resolveTextFontFamily.ts`: ölçümün platformdan bağımsız readonly
  lookup port'u. Default font composition bu port'u yapılandırır. Global bir
  "current project" tutulmaz; çağrı açık source asset kapsamı verir.
- ProjectResourceMonitor ve MediaResourcesSection: native face/status bilgisini
  public ownership sözleşmesinden okur; polling kaynak yükleyip pin'lemez.

Yeni LRU veya ikinci scheduler yazılmadı. ResidentResourceCache,
SharedPreparationQueue, ResourceBudget/ResourceBudgetGroup ve AssetSourcePool
mevcut yaşam döngüsü/admission algoritmaları olarak tekrar kullanılır.

## Source ve çalışma anı isimleri

Kalıcı veri değişmez: `Asset.type = 'font'`, `url` ve `metadata.notes` içindeki
`family: Aile` satırı kullanılır. TextStyle.fontFamily authored CSS aile listesidir.
Family list parser quote, comma, backslash/hex escape ve generic fontları ayırır.
Aynı aile adına sahip birden çok asset varsa **son authored asset** seçilir;
asenkron yüklemenin hangi sırada bittiği sonucu belirlemez. Geçersiz metadata
asset listesinde hata olarak görünür; parser rastgele bir aile adı üretmez.

Native font **authored aile adıyla global kayıt edilmez**. Her yeni face,
servis instance'ları arasında da benzersiz bir runtime alias alır. İki eşzamanlı
proje aynı aile adıyla farklı dosyalar kullanabilir; birinin yüklemesi diğerinin
piksellerini/metrics'ini değiştirmez. Source identity aile + URL'dir, asset ID değil.

Media Map'in image/video değer sözleşmesi korunur. Non-enumerable `.fonts`
FontBindings view'u `resolveFamily(css, assets)` ve `state(asset)` sağlar; Face,
pin veya URL döndürmez. Kullanım süresi originating consumer pin'ine bağlıdır.
Native face, alias ve dense runtime state scene/undo/portable JSON'a yazılmaz.
UI query projection'ı editör komutlarına verilmez; kaynak/ref authored kalır.

## Talep ve final hazırlık

Built-in text plugin `mediaDependencies.fontFamilies` bildirir. Görünür/aktif text,
maske/repeater/instance kaynak kapanışı ve seçili text'in ölçüm ihtiyacı korunur.
Font ailesi keyframe değerleri shutter/ghost için konservatif hazırlanır; canonical
track-target parser kullanılır ve immutable timeline dizisi weak olarak indekslenir.
İkinci bir runtime/evaluation tick'i yapılmaz. Bilinmeyen plugin sözleşmesi tüm
native source'ları konservatif tutar. Kullanılmayan imported fontlar managed
viewport'ta sırf asset listesinde bulunuyor diye yüklenmez.

`NativeDemandBranches`, registry'nin optional `nativeMediaFree` sertifikası ile
kaynak kullanmayan vektör alt ağaçlarını native talep traversal'ından çıkarır.
Bu alan plugin'in **bütün supported property değerlerinde** doğrudan asset/font/
referenced-media okumadığını bildirir; masks ve ordinary children dispatcher'da
kalır. Boş current mediaDependencies sonucu böyle bir sertifika sayılmaz.
Instance, mask host ve bilinmeyen/dynamic plugin adayları korunur. Immutable source
edit/registry generation değişince metadata adayları yeniden çıkarılır; her karede
current parent zincirleri korunur. Aynı sparse branches warm prefetch'i de besler.
Bu indeks nesne silmez, draw culling veya başka bir LRU sistemi değildir.

Hazır olmayan managed aile önizlemede authored fallback listesinden çıkarılır;
hiç fallback kalmazsa sans-serif kullanılır. Bu geçici önizlemedir. `withMediaFrame`
her required font pin'ini bekler; hata/deadline halinde sessiz fallback ile başarılı
final çıktı bildirmez. Final/preview job'u viewport'tan bağımsız session kullanır,
kendi asset source/pin'lerini callback ve encode tamamlanana kadar tutar.

Frame zamanı composition milisaniyesidir. Font kaydı zamandan bağımsızdır;
animated family dependency seçimi frame/shutter policy'sindedir. Pixel ölçümleri
layer-local koordinatta, bounds dönüşümü mevcut açık 2D affine sözleşmesindedir.

## Bütçe, iptal ve cleanup

Default local font kabul limiti **32 MiB / 64 kayıt**, shared ledger **512 MiB /
4096 kayıt** ile örtüşür. OPT28'de default browser yolu sınırlı **32 MiB actual
encoded input** okur; FontFace URL'yi yeniden sınırsız indirmek yerine bu buffer'ı
alır. Policy tutarı actual encoded boyutun 8 katı, SFNT table/reference boyutu ve
1 MiB'nin en büyüğüdür. WOFF2 totalSfntSize advisory'dir; gerçek reconstruction
veya glyph cache için kesin üst sınır değildir. Input lease native registration'ın
son cleanup'ına kadar ayrıca korunur. Decoder-only custom adapter'lar eski declared
filesize/unknown 4 MiB politikasını ve kendi input sorumluluğunu korur. Bu açık
heuristic bir admission kuralıdır; ölçülen native glyph RAM'i değildir.
Font policy tutarları `knownBytes`/decoded media byte toplamına **eklenmez**.
Panel font policy charge/limit, protected/reclaimable, records/failed cleanup ve
active/queued değerlerini ayrı gösterir; asset RAM satırı unknown kalır.

Shared queue **2 active / 128 waiting**, default consumer deadline **15 saniye**
(kuyruk bekleme dahil). Yeni reusable `withPreparationDeadline` yalnız caller
signal'ini/deadline'ını birleştirir. Native `FontFace.load()` abort edilemez.
Consumer abort/timeout hızlı reject eder ama gerçek native load settle olmadan
slot, reservation ve original source URL serbest bırakılmaz. Diğer shared caller
iptal olmaz. Native ready sonrası stale/cancel check yapılmadan kayıt yayınlanmaz.

Pin release idempotent'tir; released pin'den value/retain kullanımı hatadır.
Cache `clear` eski lookup'ı retire eder, devam eden caller/pin'i bozmaz. Last
retired release cleanup yapar. Warm face en fazla 2 saniye idle grace veya bütçe
basıncına kadar kalır. Başarısız native cleanup quarantine edilir ve charge
korunur; explicit clearIdle tekrar dener. Timer/pressure cleanup aktif pin'i silmez.
Orijinal Blob URL'nin son release'i mevcut source pool'daki bir microtask transfer
penceresinden sonra revoke olur; font eviction undo kaynağını silmez.

FontHandler artık runtime document signal'ını iletir; yalnız beklenen native
FontRegistrationUnavailable import warning'i üretir. Container/transport/budget,
abort ve deadline hataları başarılı import diye maskelenmez. Yazıyı spline'a
çeviren parsed font native fonttan ayrı bir owner'dır;
[OPT28 girişleri ve örnek](native-media-admission.md) encoded backing, URL-keyed dedupe ve idle sınırlarını
belgeler. Eski tek-font/global-rejected-promise cache'i kaldırılmıştır.

## Minimal kullanım

```ts
import { fontAssetService } from '@/lib/asset/fonts'

const pin = await fontAssetService.acquire(fontAsset, { signal })
try {
  // Async consumers must keep this pin through drawing/encoding.
  context.font = `32px ${JSON.stringify(pin.value.alias)}`
  context.fillText('Chorono', 0, 32)
} finally {
  pin.release()
}
```

Üretim frame çağrıları doğrudan alias/pin yönetmek yerine mevcut VisualMediaSession
ve withMediaFrame yolunu kullanır. Private bir FontAssetService kullanan geometri
consumer'ı `projectFrameFonts`/`projectFrameFontOverrides` ile kendi scoped readonly
snapshot'ını verir. Raw synchronous ölçümün default port'u yalnız default servis
hazır lookup'ını görür; kaynak hazırlığı başlatmaz. Externally owned legacy Map
çağrıları eski native/global aile davranışını korur; pin sahipliği dış consumer'dadır.
Bu uyumluluk yolu async final kaynak sahipliğinin yerine geçmez.

## Doğrulama

Deterministic tests source alias/dedupe, last-family policy, CSS parsing, metadata
hataları, independent pins/cancel, timeout'ta actual-native-slot koruması, source
URL yaşamı, pre-allocation budget denial, stale generation, finite idle,
failed-cleanup retry, dependency closure, Map/source immutability ve panelin policy
charge'ı known RAM'e eklememesini kapsar. Eski warm image consumer yeniden acquire
olduğunda eski MediaElementSnapshot'ın disposed element'i tekrar göstermesi de
aynı ownership entegrasyonunda regresyon testiyle düzeltildi.
Text picking de ortak measureTextLayout yardımcısını kullanır: stale stored size
yerine aynı aligned/animated local metrics ve explicit asset kapsamı korunur.

Gerçek Chrome fixture: iki WOFF dosyası, actual managed viewport hook, exact glyph
RGBA/reference, selection/animated-family metrics, same-name independent source,
viewport kapanırken held final pin, cold PNG export, non-ASCII font import/discard,
invalid native font reject ve gerçek panel. Unit cancellation gates simulated
native settlement'dır; gerçek native abort/decoded RAM kanıtı diye sunulmaz.

Komut: `node scripts/perf/fonts.mjs <output-directory>`; sonra mevcut perf:serve ve
`font-check.html` arayüzündeki Run native checks. Input WOFF dosyaları repository'den
inline fixture JSON'a alınır; harici font servisi, browser injection veya yeni
üretim endpoint'i gerekmez. Build kaynak/bundle/CSS/fixture SHA256 kaydı oluşturur.
Ham kabul raporları ve Four Seasons paired karşılaştırması:
`artifacts/performance/opt19-font-ownership-20261107/`.
