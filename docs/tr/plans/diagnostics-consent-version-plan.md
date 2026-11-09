# Kullanıcı onaylı hata raporları ve sürüm kontrolü

9 Kasım 2026. Kullanıcının istediği **ara iş D0–D5**, kalan E−1/ortak araç
kabulünden önce yapılacak. Bu belge geliştirme planıdır; uzak servise gönderim,
servis kurulumu veya uygulamada yeni bir paylaşım izni etkinleştirilmedi.

## 1. Amaç ve mevcut kod

Aralıklı viewport hatalarını yerinde yakalamak, kimlik bilgisi ve proje içeriği
taşımayan teknik raporlarla sürüm bazında incelemek ve yeni sürümü kullanıcıya
bildirmek. İlk uygulama Interaction + uygulama hatalarıdır; sonraki Poly, 3D,
simülasyon ve export alanları aynı rapor sözleşmesine adapter ekleyebilir.

Mevcut `src/components/canvas/interactions/diagnostics` yeniden kullanılır:
`InteractionTrace` isteğe bağlı 300 olay tutar; ayrı sessionStorage adapter'ı
aynı sekmede yenileme boyunca saklar. `exportJson()` yerel ayrıntılı indirme
olarak kalır. Pointer sahibine ağ, retry veya depolama sorumluluğu eklenmez.

Bugünkü scalar kısıtlama ve uzunluk sınırları uzak rapor için yeterli veri
temizliği değildir: kayıt layer/guide ID'leri, CSS/composition konumları, epoch
zamanı ve boot kimliği içerir. Ayrıca genel `error`/`unhandledrejection` collector,
uzak rapor kuyruğu ve release manifest servisi henüz yoktur.

Editor ve CLI paket sürümü şu anda **0.2.0**, `MCP_VERSION` ise protokolün
**1.0.0** değeridir. `/api/mcp?op=status` sürüm alanı uygulama sürümü yerine
kullanılamaz; payload ayrıca PID ve yerel yollardan türetilen kimlikler taşır.
Mevcut proje/MongoDB kimlik ve veri akışı tanı servisine taşınmaz.

## 2. Onay ve kullanıcı akışı

Resources → Interaction içinde **yerel kayıt** korunur; aynı alanın ayrı
Diagnostic sharing bölümü aşağıdaki kontrolleri sunar. UI dili İngilizcedir.

| Kontrol | İlk durum | Etkisi |
| --- | --- | --- |
| Record locally | Kapalı | Bugünkü yerel kayıt; sunucuya paylaşım izni değildir. |
| Share error reports automatically | Kapalı | Açık onaydan sonraki uygulama hatalarını temizlenmiş rapor olarak toplar/gönderir. |
| Include interaction context | Kapalı | Hata çevresindeki kısa pointer/transaction bağlamını rapora ekler; hata paylaşımına ayrıca bağlıdır. |
| Send this report | Kullanıcı eylemi | Temizlenmiş payload önizlemesi ve hedef gösterilerek yalnız seçili rapor gönderilir. Otomatik paylaşımı açmaz. |
| Check for updates automatically | Kapalı | Hata paylaşımından bağımsız release manifest kontrolü. Check now elle çalışır. |

Onay ekranı gerçek servis işletmecisini/adresini, veri kategorilerini, periyodu,
saklama sürelerini ve kapatma yöntemini açıklar. Önceden işaretli kutu veya
editör kullanımını engelleyen izin zorunluluğu bulunmaz. Red yanıtı sonrası
her açılışta yeniden sorulmaz; ayarlardan tekrar açılabilir.

Onay kaydı scene/undo içine değil yerel tercihlere yazılır: amaç/kategori,
policy sürümü, hedef servis kimliği ve yerel verilme zamanı. Hedef, amaç veya
veri kapsamı genişlerse yeniden onay gerekir; bozuk/eksik kayıt kapalı kabul
edilir. MCP/script/AI bu izni kullanıcı adına açamaz.

Otomatik izin geçmiş yerel kayıtları kapsamaz. Paylaşım açıkken Interaction
bağlamı için ayrı, sınırlı bir bellek penceresi başlar; Record locally düğmesini
ve mevcut geçmişi değiştirmez. Eski kaydı bir kez göndermek kullanıcı seçimi
ve önizleme gerektirir. Otomatik paylaşım kapalıyken yeni uzak rapor birikmez.

İzin geri alındığında timer/subscription durur, pending request abort edilir,
kuyruk temizlenir; yeni sekmeler storage/broadcast bildirimiyle aynı kararı
uygular. Geç tamamlanan yanıt izni veya kuyruğu geri getiremez. Abort, sunucunun
zaten teslim aldığı veriyi geri çekmez; UI bunu kesin silme gibi göstermez.
Yerel kaydı ve yerel JSON'u silmek ayrı eylemdir.

Builder, kuyruk lease'i ve gönderim aynı onay nesline bağlanır. Fetch'ten hemen
önce ve gecikmiş sonuçları kaydetmeden önce güncel izin/policy/nesil yeniden
denetlenir; eski sekme veya async builder revoke sonrası kuyruğu dolduramaz.

## 3. Gönderilecek veri sözleşmesi

Yeni `DiagnosticReport` DTO'su **izinli alanlar listesiyle** oluşturulur.
Ham `InteractionTrace.exportJson()` hiçbir transport'a verilmez. Bilinmeyen
alanlar dönüştürücüde atılır, servis şemasında reddedilir.

| Gönderilebilen | Dönüşüm / sınır |
| --- | --- |
| Uygulama sürümü, yayın build kimliği, kanal | Paket/build manifest'inden; resmi olmayan yerel build için `local`, özel Git dalı/commit/yol bilgisi yok. |
| Rapor/schema ve onay policy sürümü | Uygulama sürümünden ve MCP protokolünden ayrı alanlar. |
| Hata kodu, sahip modül, önem düzeyi | Sabit enum/katalog; serbest exception mesajı değildir. |
| Gesture olayları, button/modifier, guard ve sonuç kodları | İlk/final ve iptal/commit bağlamı; hareket başına tam event stream değildir. |
| Rapor içi olay/oturum ilişkisi | Her raporda yeni `s1`, `p1` alias'ları; raporlar arası eşleme yok. |
| Zaman ve geometri özeti | Rapor başlangıcına göre bağıl süre; mümkünse eşitlik/değişim/yön ve mesafe kovaları. Kesin x/y, canvas rect, path ve key değeri yok. |
| Gerekirse çalışma ortamı | Yalnız tarayıcı ailesi/ana sürümü ve kaba platform kategorisi; yüksek ayrıntılı cihaz/GPU fingerprint yok. |

Gönderilmez: ad/e-posta/hesap/kurulum kimliği, proje/nesne/timeline isimleri ve
ham ID'leri, scene JSON, text içeriği, shape/path/key değerleri, görsel/ses/video,
ekran görüntüsü, URL/query, yerel dosya yolu, token/cookie/header, raw stack,
console çıktısı, epoch/boot/source-reference kimliği. Bunların hash'lenmesi tek
başına temizleme sayılmaz. İlişki gerekiyorsa yalnız rapor içi yeni alias kullanılır.

Global hata adapter'ı kullanıcı script/metni içerebilen `Error.message`, rejection
reason veya üçüncü taraf stack'ini saklamaz/göndermez. İlk sürüm kataloglanmış
internal kod ve genel `unhandled-error` / `unhandled-rejection` kategorisiyle
başlar. Bilinen uygulama build konumlarına symbolication ancak ayrı temizleme
sözleşmesi ve testleriyle eklenebilir. `console` monkey-patch yapılmaz.

Normal Escape, sürüklemesiz seçim, eşik altı hareket ve kullanıcı iptali hata
raporu değildir. Beklenmeyen rollback, commit failure ve geçersiz lifecycle
durumları açık sınıflandırılır; başarılı gesture'lar sınırlı hata bağlamıdır.
Kullanıcının bildirdiği semptom için manuel Report a problem yolu da bulunur.

**Kimliksiz içerik ile ağ metadatası ayrılır:** servis/hosting ağı istemci IP'sini
bağlantı sırasında görür. Tam anonimlik garantisi verilmez. Uygulama raporuna IP
eklenmez; proxy/CDN/WAF/erişim loglarının IP ve tam UA saklaması da incelenir,
azaltılır ve gerçek saklama politikası onay metninde açıklanır. Bu koşul
doğrulanmadan “kimliksiz otomatik paylaşım hazır” kabulü yapılmaz.

## 4. Yaşam döngüsü, bütçe ve gönderim

İlk sınırlar ürün varsayımlarıdır; uygulamada yapılandırılır ve fixture ile
ölçülür. Daha çok veri toplamaya yönelik uzaktan ayar bu sınırları/izni genişletemez.

- Hata etrafında en çok 40 önceki + 10 sonraki temizlenmiş Interaction olayı;
  yalnız bu bağlam izni açıksa. Sonraki olaylar için en fazla 2 saniye beklenir;
  yeni olay gelmemesi veya sekmenin gizlenmesi raporu süresiz bekletmez. Hata
  raporu, bağlam eksikse yine çalışır.
- Rapor en çok **64 KiB UTF-8**; kuyruk en çok **20 rapor / 1 MiB / 24 saat**.
  Hangisi önce dolarsa eski/düşük önemdeki kayıt kontrollü bırakılır; sayaç görünür.
  Kuyruk yalnız temizlenmiş DTO saklar, scene/raw error tutmaz.
- En çok bir aktif gönderim. Online, görünür ve aktif gesture dışında en erken
  60 saniyelik aralıkta sınırlı batch; idle'da boş request gönderilmez. Rapor
  hazırlığı gesture commit/undo veya render'ı bekletmez.
- Otomatik üretim/gönderim için 24 saatte en çok 20 rapor; aynı hata kısa
  pencerede birleştirilir, tekrar sayısı bounded olur. Kullanıcının açık tek
  gönderimi servis limitlerine tabidir; sonsuz retry oluşturmaz.
- Timeout/abort, üstel backoff+jitter, sınırlı deneme ve `Retry-After` desteği.
  Network/408/429/5xx tekrar denenebilir; diğer kalıcı 4xx/schema hataları bekleyen
  sonsuz kuyruğa dönüşmez. Sahte saat/timer değişiminde TTL ve limitler sınanır.
- Her rapora yeni rastgele `reportId`; retry aynı ID/payload ile idempotent.
  Sunucu ACK vermeden kuyruktan çıkarılmaz. Çoklu sekmede ortak queue lease veya
  kilit sahibi olur; crash sonrası aynı ID'yi tekrar gönderme servisçe tekilleştirilir.
- Fetch adapter'ı `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, HTTPS,
  sabit izinli hedef ve iptal edilebilir request kullanır; redirect reddedilir.
  Auth/identity SDK veya MCP token'ı kullanılmaz. Gizli/unload anında kontrolsüz
  beacon/background sync yok; sonraki uygun oturumda izin tekrar kontrol edilir.

Paylaşımı kapatırken çalışan request'ın sonlanması, offline/reload kuyruğu,
gizli sekme, storage quota ve ağ hatası source edit/undo'ya dokunamaz.
Pending/sent/dropped/last failure/last send durumu kullanıcıya gösterilir;
bu sayılar sistem CPU/GPU yüzdesi gibi sunulmaz.

## 5. Servis ve sürüm kontrolü

Yerel Next route tek başına kullanıcıların raporunu merkezi toplamaz. Ayrı
Chorono collector deployment'ı gerekir. Hedef adres, işletmeci ve saklama
konfigürasyonu yayın adımında somutlaşır; şu an tanımlı servis uydurulmaz.

Önerilen API'ler: `POST /v1/diagnostic-reports` ve salt okunur
`GET /v1/releases/stable.json`. Bunlar henüz public API değildir. Rapor alımı
content-type/byte/count/schema doğrular, bilinmeyen alanı reddeder, duplicate
reportId'ye aynı ACK'i verir. Rate limit/abuse kontrolü, ayrı tanı deposu,
erişim yetkisi ve otomatik TTL içerir; proje/account deposuyla join yapılmaz.
Browser'a gizli bir “API key” koymak servis doğrulaması sayılmaz. Body/IP içeren
genel request log'u açılmaz; rate limit için geçici ağ sinyali varsa süre ve
saklama sözleşmesi ayrıca yazılır.

Önerilen üst sınır: temizlenmiş olay raporları **7 gün**, yalnız sürüm/hata kodu
bazında toplulaştırılmış sayaçlar **90 gün**; bu değerler gerçek deployment'da
uygulanıp test edilmeden onay metni yayımlanmaz. Tam UA/IP/serbest metin
toplulaştırma boyutu olmaz. İlk bakım görünümü hatayı appVersion/build/errorCode
ile gruplar; görülme/son görülme ve düzeltmenin yayın sürümünü tutar. Benzersiz
kullanıcı sayısı iddia edilmez. Admin sorguları son kullanıcıya açılmaz.

`BuildInfo` tek build-time kaynaktan appVersion/buildId/channel sağlar. CLI
version, MCP protocol ve report schema version birbirine karıştırılmaz.
Release manifest sabit kanalda sürüm, tarih, doğrulanmış release-note URL'si
ve desteklenen rapor schema aralığını taşır; yürütülebilir talimat içermez.
SemVer karşılaştırması prerelease/build metadata'yı doğru ele alır; bozuk veya
uyumsuz manifest çalışmayı engellemez. Otomatik kontrol ayrı izinle en sık
24 saatte bir + jitter; Check now kullanıcı eylemidir. Güncel sürüm request
query'sine gönderilmeden manifest yerelde karşılaştırılır. UI mevcut/yeni
sürümü ve release notlarını gösterir; güncelleme kurma ayrı kullanıcı işlemidir.

## 6. Sahiplik ve uygulama sırası

Aşağıdaki modül/sınıf isimleri öneridir; public API olarak kullanılmaz.

| Dilim | İş ve modül sınırı | Kabul |
| --- | --- | --- |
| **D0** | `src/lib/diagnostics/contracts`, `conversion`; `src/lib/version` BuildInfo. Mevcut trace için read-only adapter ve error kod kataloğu. | Sürümler ayrı; allowlist ve zararlı veri canary'leri geçer; henüz ağ yok. |
| **D1** | `diagnostics/consent`, platform tercih adapter'ı; `src/components/resources/diagnostics` içinde onay, önizleme, tek gönderim ve durum UI'si. | Varsayılan kapalı, eski veri dahil değil, revoke ve çoklu sekme doğru. |
| **D2** | `diagnostics/queue` domain'i, `diagnostics/browser` error/trace/storage/fetch adapter'ları. | Bütçe/TTL/dedup/retry/abort; local mock collector ile uçtan uca. |
| **D3** | `src/server/diagnostics` gibi ayrı service owner veya gerekçeli ayrı deploy paketi; schema/ingest/repository/retention. | Gerçek merkezi servis ve log politikası doğrulanır; schema/abuse/TTL testleri geçer. |
| **D4** | Release manifest producer/parser/checker; D1 ayarlarına sürüm bildirimi. Resmi collector'a transport bağlama. | Sürüm bildirimi ayrı izinli; release/build ile rapor ayrıştırılır. |
| **D5** | Gerçek editör + mock servis + yayın konfigürasyonu kabulü, bakım/devralma dokümantasyonu. | Ağ/izin/veri sınırları ve first-drag/guide/creation regresyonları birlikte geçer. |

Collector'ın gerçek adresi/onay metni hazır olmadan D2 yalnız yerel mock ile
çalışır; D3/D4 yayın kabulünden önce uzak gönderim açılmaz. Proje sahnesi test
için değiştirilmez. Yeni bağımlılık veya workspace package yalnız dağıtım sınırı
gerektiriyorsa eklenir; genel bir telemetry framework kurmak teslim değildir.

`utf8ByteLength` / `measureJson` mevcut boyut hesapları için yeniden kullanılır.
`BoundedJobQueue` ancak gereken concurrency/cancellation sözleşmesi uyuyorsa
özel instance ile kullanılır; medya preparation kuyruğuna rapor işleri eklenmez.
Saf dönüşüm/onay/retry domain'i React, fetch, IndexedDB/DOM veya server handle
tutmaz. Runtime kaynaklar scene JSON/undo dışında, sahiplik ve cleanup ile yaşar.

## 7. Doğrulama ve tamamlanma kapısı

- İzin öncesi, izin reddinde, endpoint yokken ve paylaşım kapalıyken **sıfır
  tanı network request'ı**. Sürüm kontrolü de kendi ayarı dışında başlamaz.
- Eski local kayıt, rastgele secret/path/text/URL/error canary'leri uzak payload,
  kuyruk ve servis log'una sızmaz. Bilinmeyen alan/reason/stack düşer/reddedilir.
- Kaydı açmak izin açmaz; manuel bir gönderim otomatik izni açmaz. Revoke,
  policy/endpoint değişimi, pending retry, in-flight completion, reload ve ikinci
  sekme izin sınırlarını aşamaz. UI payload önizlemesi gerçek gönderilen DTO'dur.
- Offline/timeout/429/5xx/kalıcı 4xx, bozuk ACK, duplicate ID, storage quota,
  64 KiB/20/1 MiB/TTL sınırları ve repeated error fırtınası test edilir.
- Servis istemciye güvenmeden tekrar doğrular; retention/ACK/dedup ve admin
  erişimi test edilir. Hosting/CDN erişim log'u ayarı ayrıca kontrol edilir.
- Release SemVer, prerelease, farklı schema, yanlış URL/redirect ve bozuk JSON
  test edilir. Güncelleme kontrolü sahne veya uygulama sürümünü değiştirmez.
- İzleme/gönderim açık ve kapalı halde idle, drag/guide/creation ve uzun kullanım
  ölçülür; sürekli frame loop, per-move upload veya sınırsız listener/heap büyümesi
  olmaz. Editör mevcut first-release ve tek undo kabulünü korur.

Her uygulama diliminde `npm test`, `npm run mcp:build`, `npm run build`; Next
build öncesi sunucu durdurulur. UI/network değişiklikleri gerçek tarayıcı ve
mock collector ile gözlenir. MCP public capability değişirse canonical skill
güncellenir; mevcut yerel kayıt paylaşım izni olarak belgelenmez.

Bu planlama turunda yalnız dokümanlar değişti. Runtime testleri/build tekrar
çalıştırılmadı; servis açılmadı, veri gönderilmedi, açık editör yenilenmedi.

## Dayanaklar

- [Mevcut Interaction sözleşmesi](../../../src/components/canvas/interactions/diagnostics/README.md)
- [Pointer lifecycle ve gerçek hata kabulü](../pointer-gesture-lifecycle.md)
- [Fetch credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)
  ve [referrer policy](https://developer.mozilla.org/en-US/docs/Web/API/Request/referrerPolicy)
- [Semantic Versioning](https://semver.org/)
