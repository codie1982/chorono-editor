# Ortak yönetilen kaynak bütçesi

`src/lib/resources/budget` kayıtlı runtime kaynaklarının tahmini byte ve kayıt
sayısını allocation **öncesinde** sınırlar. Editör composition root'u
`editorResourceBudget` için 512 MiB / 4.096 kayıt kullanır. Bu değer tarayıcı
işleminin RAM sınırı değildir. JS heap, decoder kopyaları ve sürücü belleği
taşınabilir biçimde bu muhasebeye dahil edilemez.

## Sahiplik ve bağımlılıklar

- `ResourceAllocator` owner'ın tek bağımlılığıdır; DOM, React ve zamanlayıcı içermez.
- `ResourceBudget` pending ve resident kayıtları aynı kapasiteden sayar. Alan
  açılması gerekirse Map sırasındaki en eski **idle** owner'a cleanup çağrısı yapar.
- `ResourceReservation` tek allocation'ın yaşam döngüsüdür. Paylaşılan kaynağın
  consumer sayısı owner'a aittir; her consumer için yeniden byte yazılmaz.
- Owner fiziksel kaynağı bıraktıktan sonra reservation'ı `release()` eder. Cleanup
  hata verirse veya release etmezse kayıt korunur, protected olur ve hata sayılır.
- Pending ve aktif/pinned kayıtlar reclaim edilmez. Kapasite yetmiyorsa `reserve`
  null döndürür; owner bu allocation'ı başlatamaz.

`reserved + resident = charged` ve `protected + reclaimable = charged` iki ayrı
bölümlemedir. Bu dört sayı birbirine eklenmez. Snapshot detached sayısal veridir;
URL, scene, asset payload veya DOM/GPU nesnesi dışarı verilmez. Byte değerleri
pozitif safe integer'dır; geçersiz değer RangeError, geçerli kapasite reddi null'dır.

```ts
const allocation = budget.reserve('scratch', width * height * 4)
if (!allocation) throw new RangeError('Resource budget exceeded.')
let surface: HTMLCanvasElement | undefined
try {
  // Native allocation only starts after admission.
  surface = document.createElement('canvas')
  surface.width = width
  surface.height = height
  allocation.commit()
  // While a caller uses surface, allocation remains protected.
  allocation.allowReclaim(() => {
    surface!.width = 0
    surface!.height = 0
    allocation.release()
  })
} catch (error) {
  // If native cleanup throws, leave the uncertain allocation charged.
  if (surface) { surface.width = 0; surface.height = 0 }
  allocation.release()
  throw error
}
```

Bu örnek kullanım sözleşmesini gösterir; gerçek native hata/partial cleanup sahipliği
`CanvasSurfacePool` ve `OffscreenCanvasCache` adapter'larındadır. Mutasyon/reallocation
öncesi `protect()`, büyüme öncesi `resize(bytes)` gerekir. Released handle yeniden
canlandırılamaz. Cleanup içinde reentrant allocation reddedilir; küçültme/release
serbesttir. Uygun idle verileri bile silecek kadar kapasite yoksa preflight mevcut
cache'i boşuna boşaltmaz. Snapshot okumak LRU sırasını değiştirmez.

## Entegre owner'lar

| Owner | Kategori / yerel sınır | Sahiplik |
| --- | --- | --- |
| Ortak `renderSurfacePool` | scratch / 128 MiB | Checkout protected; release idle. Native yüzey oluşturma ve yeniden boyutlandırmadan önce rezervasyon. |
| Ortak `staticGroupLodCache` | preview / 64 MiB, 256 kayıt | Sahip olunan canvas + anahtar metadata'sı. `acquire()` consumer lease'i pin tutar. |
| Shared `AudioAssetService` PCM cache | audio / 256 MiB, 128 kayıt | Pending estimate, delivery ve consumer lease'leri aynı global bütçeye bağlıdır. Idle grace 2 s. |

Yerel sınırlar korunur; global sınır bunların üzerinde ikinci admission kapısıdır.
Test/standalone owner'lar isteğe bağlı `budget` alır; verilmezse önceki yerel sınır
sözleşmesi sürer. Yeni limit kaynak scene/undo/serialize verisini değiştirmez.

`OffscreenCanvasCache.acquire()` idempotent release döndürür. Invalidate/clear
aktif lease'i lookup'tan çıkarır fakat son release'e kadar canvas ve byte kaydı
kalır (`retiredEntries`). Cache yeni bir allocation yaparken bu retained/pending
alanları da yerel limitte sayar. `GroupLodFrame` composite işlemini try/finally
içinde yapar; draw/restore hata verse bile pin bırakılır. Eski `get/getOrCreate`
sonucu sonraki cache mutasyonuna kadar ödünçtür. Eski `set()` caller-owned canvas
kabul eder; allocation öncesi sahipliği olmadığı için global byte kaydı eklemez.
Yeni owned consumer'lar `acquire()` yolunu kullanır.

Panelin Overview → Managed allocation budget bölümü limit, charged, resident,
pending, protected, reclaimable, peak, kayıt ve ret sayılarını gösterir. Kapsam
etiketi scratch/preview owner'larını açıklar. Release unused surfaces yalnız
idle kaydı temizler; aktif/pinned kaynaklar kalır. Mevcut known-resource,
heap ve managed budget sayıları örtüşür; toplam RAM diye toplanmaz.

## Aşamalı entegrasyon ve sınırlar

`image/video/gpu/derived` kategori adları ek owner'ların muhasebe sınırıdır;
şu an hepsinin kayıtlı olduğunu ifade etmez. [PCM owner'ı](audio-residency.md)
bağlandı; decoded image/video, GPU texture/FBO, ana canvas ve diğer cache'lerin
entegrasyonu tamamlanmamıştır. Audio decode öncesi charge tahmindir; native
decoder iç kopyaları/geçici overshoot ve deprecated dış raw borrows kapsanmaz.
`useAssetCache` hâlâ bütün visual scene asset'lerini yükler. Audio demand ve bounded
hazırlık uygulandı; image/video demand açık kalır. Orijinal URL/undo sahipliği
[ayrı source owner'da](asset-source-lifetime.md) uygulanmıştır; decoded byte
bütçesine source-handle sayısı eklenmez.

Kayıtlar yalnız runtime owner'larında bulunur; ordinary scene JSON/undo'ya yazılmaz.
Kaynak URL ve orijinal dosyanın silinmesi/revoke edilmesi budget'ın sorumluluğu
değildir. Medya consumer'ları lease ve stale/cancel sözleşmeleriyle ayrıca entegre
edilecektir. Bütçe reddi halinde render'ın eksik çıktısı başarılı diye sunulmaz.

## Doğrulama

Core testleri protected çalışma kümesi, global LRU, byte/kayıt sınırı, resize,
idempotence, reentrant admission ve başarısız disposer'ı doğrular. Render adapter
testleri gerçek owner sınıflarıyla allocation öncesi ret, çapraz eviction,
çoklu pin/retire, failed paint ve geçici ROI resize temizliğini kapsar.

Native Canvas denemesi gerçek paneli ve owner'ları küçük private bütçeyle çalıştırır;
ana editörün bütçesini veya kullanıcının projesini değiştirmez. Four Seasons
karşılaştırması renderer-only sparse protokoldür; bütün editörün uzun playback,
medya yükü veya process RSS kabulünün yerine geçmez.

## Decoded owner çıkarımı — OPT15

ResidentResourceCache local+shared ticket, pin/retire, warm timer ve destruction
lifecycle'ını PCM ve görsel servis için ortak yürütür. ResourceBudget LRU/admission
algoritması değişmedi. Visual servis 192 MiB/256 local profil ve aynı root budget
ile hazırdır; viewport eager loader henüz bu owner'a taşınmadı. Native visual ve
mevcut PCM kabulü ayrı 14/14 geçti; bu sınırlı servis testi bütün görsel kaynakların
global bütçeye bağlandığını kanıtlamaz. [Detaylar](visual-media-residency.md).

OPT16 ana editörün image/video demand'ini aynı owner'a bağladı. Warm prefetch
protected tutulmaz; pressure veya 2s idle grace ile çıkarılabilir. Current/final
pin'ler protected kalır. Panel managed Map'te warm/retired visual resident byte'ı
bir kez sayar. Legacy foreign ready Map'ler ve browser/GPU iç kopyaları hâlâ
partial/untracked kapsamdır. [Viewport ve final lifecycle](viewport-media-demand.md).
