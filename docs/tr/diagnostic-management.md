# D2 — sade hata yönetimi

10 Kasım 2026. D2 uygulaması, repository testleri, derlemeler ve gerçek
HTTP/tarayıcı kabulü tamamlandı. Public servis hosting/yayını bu teslimin
parçası değildir.

## Kullanım ve erişim

Alıcı sunucunun kendi origin'inde **`/diagnostics`** açılır. Sayfa boş giriş
kabuğudur; açılması veya render edilmesi hata verisi isteği başlatmaz.
İşletmeci **Admin token → Connect** ile bağlanır. Liste tek satırda tekrar
sayısını, sürümü, son görülmeyi ve **New / Investigating / Fixed** durumunu
gösterir. Details yalnız sabit kodları, build'i, ilk görülmeyi ve varsa
temizlenmiş işlem/sonuç örneğini açar. Durum/sürüm filtresi, son görülme/tekrar
sıralaması, sayfalama ve elle Refresh vardır; sürekli polling yoktur.

Token yalnız bu sayfanın belleğinde tutulur. URL, snapshot, localStorage,
sessionStorage veya cookie'ye yazılmaz. Disconnect/unmount token'ı ve görünür
veriyi temizler, devam eden istekleri iptal eder; yeniden yükleme yeniden giriş
gerektirir. Bu, **D1'in kalıcı kullanıcı paylaşım onayından ayrıdır**. D1 onayı
rapor gönderme/sürüm kontrolüne izin verir; yönetim yetkisi vermez.
Hesap/JWT veya proje veritabanı kullanılmaz.

## Sunucu kurulumu

Alıcının Node/Next runtime ortamına şu değerler verilir:

```sh
CHORONO_DIAGNOSTICS_DIR=/absolute/private/diagnostic-depot
CHORONO_DIAGNOSTICS_ADMIN_TOKEN='<32-256-karakterlik-gizli-token>'
```

Token güçlü ve rastgele seçilir; 32–256 boşluksuz, yazdırılabilir ASCII karakter
olmalıdır. **Server-only** değerdir: `NEXT_PUBLIC_` ön ekiyle veya istemci build
ayarında verilmez; log ya da dokümana gerçek değeri eklenmez. Eksik/geçersiz
token yönetim API'sini 404 ile kapatır. İşletmeci aynı değeri sayfaya elle verir;
istemciye token sağlayan bir endpoint yoktur.

Yönetim aynı depoyu kullanır ve D1 alıcısı kapalıyken de çalışır; yönetim için
`CHORONO_DIAGNOSTICS_ENABLED=1` veya D1 CORS listesi gerekmez. D1 gönderimini
açmak ayrı [paylaşım yapılandırmasını](diagnostic-sharing.md) gerektirir.
Varsayılan depo `.chorono/diagnostics`; tek host/private local disk,
0700 klasör/0600 dosya ve atomik filesystem sözleşmesi korunur.

Uzak erişim HTTPS, yerel geliştirme yalnız localhost/127.0.0.1/[::1] HTTP'dir.
Sayfa alıcının origin'inden kullanılır. Proxy gerçek protokol/Host'u doğru
iletmelidir; Forwarded başlıklarından yönetim origin'i türetilmez. Yönetim CORS
izni veya oturum cookie'si üretmez. Proxy/CDN Authorization başlığını
loglamamalıdır; uygulama secret/raw hata içeriği loglamaz.

## Gruplama, durum ve zaman sözleşmesi

Issue anahtarı tam `appVersion + buildId + channel + errorCode + module +
failureSite` birleşiminin SHA256'sıdır. **UTC gün anahtara girmez**; saklanan
günlük gruplar tek satıra toplanır. Farklı build/sürüm/noktalar ayrıdır. Tekrar
sayısı occurrence sayısıdır, kişi sayısı veya tüm zamanların toplamı değildir;
90 günlük saklanan gruplarla sınırlıdır ve `MAX_SAFE_INTEGER`'da doyar.
Unclassified satır aynı kök nedenin kanıtı değildir.

İlk durum sanal `new`, `revision: 0`, `updatedAtMs: null`'dır. Durum değişimi
kalıcı ayrı triage kaydıdır. Yeni rapor veya duplicate retry manuel durumu
sıfırlamaz; **Fixed otomatik yeniden açılmaz**. Aynı mevcut durum/revision'a
yazmak no-op'tur. Durum değişimi revision'ı bir artırır; eski revision 409'dur.
Gelen tekrar sayısı triage revision'ını artırmaz. Son günlük grup TTL ile
silinince ona ait triage da kaldırılır; sonra gelen hata yeniden New olur.

`firstSeenAtMs` / `lastSeenAtMs` sunucunun raporu aldığı epoch milisaniyesidir;
istemcinin kesin olay saati değildir. Liste tarayıcının saat dilimini kullanır.
Örnekler/receipt'ler 7, günlük gruplar 90 gün saklanır; bir günlük grubun TTL'si
ilk alındığında başlar. Liste/durum işlemleri de TTL temizler. Durum filtrelerinin
sayıları **issue adedidir**: sürüm filtresi uygulanır, durum filtresinden önce
üç sayı hesaplanır. `total` her iki filtre sonrası issue adedidir;
satırdaki `occurrenceCount` ayrı ölçüdür.

## Gerçek API

Her çağrı `Authorization: Bearer <token>` ister. D1'in
`X-Chorono-Diagnostics-Policy` başlığı bu erişimi sağlamaz. İstekler no-store,
cookiesiz ve referrer'sızdır. PATCH aynı origin `Origin` ister; GET başlığı
olmayan olağan same-origin browser çağrısını kabul eder, açık yabancı origin'i
reddeder. Kimlik/origin kontrolü body/depo erişiminden öncedir.

| Yol | Sözleşme |
| --- | --- |
| `GET /api/diagnostics/issues` | `status=all\|new\|investigating\|fixed`, tam SemVer `appVersion`, `sort=recent\|occurrences`, `offset`, `limit`. Varsayılan all/recent/0/50; limit 1–100, offset 0–10.000. Bilinmeyen/tekrarlı query reddedilir. |
| `PATCH /api/diagnostics/issues` | En çok 1 KiB JSON: yalnız `{ "key": "<64-hex>", "status": "investigating", "expectedRevision": 0 }`. Başarılı yanıt `{ "issue": ... }`. |

GET sonucu `{ items, total, counts: { new, investigating, fixed }, offset,
limit }`'tir. Issue DTO'su sabit kod/build alanları, key/count/zaman/status/
revision ve tek temizlenmiş örnek içerir; receipt ID/digest, raw dosya veya
ayrıntılı Interaction kaydı içermez. Query URL'sine token konmaz.

401 yanlış token; 403 origin/transport; 400 geçersiz query/update; 404 kapalı
yönetim veya artık saklanmayan issue; 409 eski revision; 413 body sınırı;
415 yanlış medya türü; 429 admission; 503 depo/konfigürasyon hatasıdır. Ayrı
yönetim sınırı process başına dakikada 120 başlangıç ve 4 eşzamanlı işlemdir.
PATCH body okuma ve istemci istekleri 10 s timeout; istemci 128 KiB response
sınırı kullanır. Bir satırda tek değişim yürür; eski login/filter yanıtları
atılır, conflict sonrası liste yenilenir. Eski revision otomatik üstüne yazılmaz.

## Depo V1 → V2 geçişi

`DiagnosticReport` ağ schema'sı **1 olarak kalır**; D1 kuyrukları ve alıcının
tekilleştirme/ACK davranışı korunur. Yalnız private dosya schema'sı 2'dir:
günlük gruplara ilk/son receipt zamanı, depoya ayrı triage kayıtları eklenir.
V1 otomatik okunur; receipt/count/TTL kaybolmadan ilk başarılı transaction'da
V2 yazılır. Eski veride son receipt saati yoktur; ilk/son zaman için
`expiresAtMs - 90 gün` kullanılır. Geçmiş son olay saati geri kazanılamaz;
yeni raporlar gerçek lastSeen zamanını sağlar. Geçişte durumlar New'dur.

Güncellemeden önce eski writer'lar durdurulup private depo yedeklenir.
**V1 ve V2 writer aynı depoda birlikte çalıştırılmaz.** Eski V1 yazılımı V2'yi
reddeder; triage'ı sessizce silmez. Geri dönüş için V2 üzerinde eski yazıcı
çalıştırmak yerine ayrı/yedek V1 depo gerekir. Depo 16 MiB, 10.000 receipt,
10.000 günlük grup ve en çok 10.000 issue/triage ile sınırlıdır; kapasite dolunca
canlı kimlikler düşürülmeden istek reddedilir.

## Sahiplik ve doğrulama

Browser-safe DTO/repository sözleşmesi
`src/lib/diagnostics/management/index.ts`'dir. `issueProjection.ts` kimlik,
aggregation/query'yi; `FileDiagnosticRepository` triage/ingest/TTL'yi;
`FileStateStore` ortak lock/atomik yazmayı sahiplenir. HTTP config/auth/conversion
`src/server/diagnostics/management` altındadır. `/diagnostics` →
`DiagnosticManagementController` → aynı-origin HTTP adapter → repository akışı
scene/render/undo ve D1 kullanıcı onay deposundan bağımsızdır.

Yalnız HEAD + D2 feature patch'inden hazırlanan snapshot'ta **323 dosya / 2.631
test**, TypeScript, `npm run mcp:build` ve `npm run build` geçti; workspace'teki
ilgisiz devam eden işler bu koşuya dahil edilmedi. Testler V1 geçişi, günler arası
sayım, duplicate, restart, status korunması, CAS yarışı, TTL/capacity, auth/
origin/body sınırları, token saklamama, filter/logout yarışları ve UI'yi kapsar.
Gerçek HTTP ilk 7 kontrol ve gerçek sunucu restart'ından sonraki son 6 kontrol
geçti: 4 issue/18 tekrar, günler arası 12 tekrar, duplicate, tam sürüm filtresi,
401/409/403. Chrome'da giriş/geçersiz token, durum geçişleri, filtre/sıralama ve
Refresh doğrulandı; durumlar reload ve gerçek server restart sonrasında korundu.
Ingestion kapalı (`CHORONO_DIAGNOSTICS_ENABLED=0`) yeniden başlatıldığında
yönetim çalıştı. 375 px ekranda sayfa taşmadı (client/scroll 369 px); tablo
335/812 px klavye odaklı kendi kaydırma alanında kaldı. Desktop/mobile kanıtları
`artifacts/validation/diagnostics-d2-20261110/` altındadır. Sıradaki geliştirme
kalan E−1 ortak düzenleme ve araç kabulüdür; public hosting ayrı dağıtım işidir.
