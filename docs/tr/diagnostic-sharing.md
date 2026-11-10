# D1 — kalıcı izin, kısa hata gönderimi ve alıcı servis

10 Kasım 2026. D1 kodu ve yerel uçtan uca kabul tamamlandı. Public servis
yayını/hosting adresi bu teslimde kurulmadı. Varsayılan yapılandırma kapalıdır.

**D2 eklendi:** ayrı [hata yönetimi sayfası ve bakım sözleşmesi](diagnostic-management.md)
alıcıdaki `/diagnostics` yolundadır. Aynı hatalar saklanan günler boyunca tek
satırda sayılır; New / Investigating / Fixed durumu kalıcıdır. Bu sayfa yalnız
server-only `CHORONO_DIAGNOSTICS_ADMIN_TOKEN` ile yetkilendirilir. İşletmecinin
sayfada verdiği token yalnız bellektedir; D1'in aşağıdaki kalıcı kullanıcı onayı
yönetim yetkisi vermez. Public rapor/sürüm API'lerinin wire schema'sı değişmedi.

## Kullanıcı davranışı

Yapılandırılmış editörde ilk kullanılabilir girişte tek soru gösterilir:
**Allow anonymous error summaries and update checks?** Welcome ekranı önce
kapanır. İlk odak Don't send'dedir; Escape/Close `dismissed` kaydeder. Kabul,
ret ve kapatma aynı tarayıcı/profil/origin'in localStorage'ında korunur; olağan
sürüm güncellemesi yeniden sormaz. Yeni profil/veri temizliği veya gerçekten
değişen hedef/policy yeni izin gerektirebilir. Depolama/Web Locks desteklenmiyorsa
arka plan paylaşımı açılmaz. Resources → Interaction'dan tercih değiştirilebilir.

**Aynı onay** hem kısa hata özetlerini hem sürüm kontrolünü kapsar. Onay öncesi
rapor POST'u veya sürüm GET'i yoktur. Sürüm otomatik kontrolü en sık24 saatte
bir; Check now için de60s tabanı vardır. Kurulu sürüm URL'ye gönderilmez ve
güncelleme kurulmaz. Yerel ayrıntılı Interaction kaydı ayrı ve elle açılır;
geçmiş log'lar gönderim kuyruğuna alınmaz.

## Gerçek girişler ve veri akışı

- `src/lib/diagnostics/consent`: hedef/policy doğrulaması ve durable karar.
- `src/lib/diagnostics/browser/sharing.ts`: ref-counted browser edinimi ve
  readonly UI facade. `BrowserDiagnosticSession` kaynak/gesture-idle kontrolü,
  görünürlük/online/storage/broadcast yaşam döngüsünü sahiplenir.
- `browser/failureSignals.ts`: geçmiş tutmayan sabit kod bus'ı. Gerçek
  EditorPointerSession preview/commit exception'ları ve izinli global
  error/rejection kategorileri bağlanır; raw Error/event içeriği okunmaz.
- `src/lib/diagnostics/delivery`: bounded outbox, delta birleştirme, gönderim,
  ACK/tekrar deneme. UI ve render/source/undo'dan bağımsızdır.
- `src/components/resources/diagnostics`: kısa soru, ayar ve sürüm bildirimi.
- `POST /api/diagnostics/reports` ve `GET /api/diagnostics/version`: gerçek
  Next Node API'leri. Depo/izin/retention ayrıntısı [server sözleşmesindedir](../../src/server/diagnostics/README.md).

Özetler sürüm/build/kod/modül/sabit hata noktasına göre birleştirilir; en fazla
20 günlük grup, 200 kuyruk öğesi, 256 KiB/24h, rapor başına16 KiB ve doyan sayaç
sınırları vardır. İlk denemeden sonra reportId ve count delta değişmez; yeni
occurrence sonraki öğeye gider. Sunucu aynı ID/payload'ı tekrar saymaz; ID'nin
başka payload ile kullanılması409'dur. Ortak Web Lock actual fetch/ACK boyunca
tutulur. Kilit bekleyen record callback'leri de200 ile sınırlıdır.

İzin her async sınırda tekrar okunur. Revoke senkron abort, kolektör/timer
temizliği ve eski kuyruğun silinmesini başlatır. Eski nesille gelen geç yanıt,
storage/broadcast mesajı veya eski tab yeni izni/kuyruğu geri getiremez.
Zaten alıcıya ulaşmış rapor abort ile geri çekilmiş sayılmaz. Unmount ise
izin/queue/cache'i silmeden sahiplikleri bırakır. Polling veya unload beacon yoktur.

## Yayın yapılandırması

İstemciye açık hedef ve işletmeci **build sırasında** verilir. Eksik/uygunsuz
hedefte soru ve paylaşım kapalıdır; sağlık kontrolü adı altında onaysız uzak
istek yapılmaz. Yayıncı alıcının hazır olduğunu doğruladıktan sonra yapılandırır.

```sh
export NEXT_PUBLIC_CHORONO_DIAGNOSTICS_ENDPOINT=https://errors.example.org/api/diagnostics/reports
export NEXT_PUBLIC_CHORONO_DIAGNOSTICS_OPERATOR=Chorono
npm run build
```

Yukarıdaki değerler örnektir; gerçek hedefle build ortamında env olarak sağlanır.
Alıcı runtime'ında `CHORONO_DIAGNOSTICS_ENABLED=1`,
`CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS` ve özel `CHORONO_DIAGNOSTICS_DIR` ayarlanır.
Opsiyonel `CHORONO_DIAGNOSTICS_LATEST_VERSION` / `CHORONO_DIAGNOSTICS_RELEASE_NOTES_URL`
sürüm cevabını sağlar. Kökteki paket sürümü ile MCP protokolü ayrıdır.

D2 için runtime'a `CHORONO_DIAGNOSTICS_ADMIN_TOKEN` eklenir; `NEXT_PUBLIC_`
değeri değildir. D1 alıcısı kapalıyken aynı depodaki hatalar yönetilebilir.
Private disk schema'sı V1'den V2'ye ilk başarılı işlemde dönüştürülür; receipt,
count ve TTL korunur. V1'de son receipt zamanı yoktur; eski ilk/son görülme
`expiresAtMs - 90 gün` ile yaklaşık başlangıç olarak gösterilir. V1/V2 writer
aynı depoda birlikte çalıştırılmaz; [geçiş sınırları](diagnostic-management.md)
güncellemeden önce incelenir.

Depo private0700 klasör/0600 atomik dosya ve local filesystem lock kullanır.
Tek host/local disk sözleşmesidir; çok host için transactional DB adapter gerekir.
Kalmış crash lock güvenle çalınmaz; aktif writer olmadığı doğrulanarak işletmeci
tarafından temizlenir. Uygulama raw body/IP/UA loglamaz; proxy/CDN log politikası
ayrıca doğrulanır. Tam ağ anonimliği iddia edilmez. Temizlenmiş örnek/receipt7 gün,
günlük toplam90 gün saklanır; çalışan sunucuda saatlik ve işlem sırasında TTL
temizliği vardır. Duran/serverless servis için harici cleanup/managed TTL gerekir.

## Doğrulama ve bakım devri

D2 HEAD + feature patch snapshot'ında **323 test dosyası / 2.631 test**,
TypeScript, MCP ve production build geçti; ilgisiz workspace WIP hariçtir.
Gerçek HTTP/Chrome, reload/restart ve mobil kabul de geçti; ayrıntı/kanıtlar
[yönetim belgesindedir](diagnostic-management.md#sahiplik-ve-doğrulama).
Aşağıdaki tamamlanmış D1 kabulü ayrı tarihsel kayıttır.

**318 test dosyası / 2.563 test**, TypeScript, MCP ve Next production build geçti.
Gerçek Chrome QA origin'i4346, kullanıcı sahnesinden ve izin deposundan ayrıdır.
Kabul/red/dismissed/Escape ve yeniden açılış; izin öncesi sıfır kuyruk/istek;
izinli aynı hatadan iki sinyal → tek grup/tek gerçek POST/count2; empty queue;
0.2.1 sentetik sürüm bildirimi; iki sekmede revoke ve yeni sinyalin reddi geçti.

Saat ilerletme yalnız fixture'ın açık QA düğmesidir; production periyodu
değiştirilmez. Gerçek Next API HTTP kabulü **7/7**, gerçek sunucu restart'ı
sonrasında yine **7/7** geçti: duplicate ACK/count sabit,409 conflict,400 ek alan,
413 fazla byte, sürüm cevabı ve hassas canary bulunmaması. Yerel kanıtlar
`artifacts/validation/diagnostics-d1-20261110/` altındadır; test ayarları ve
sentetik release sonrasında normal kapalı sunucuya dönülür.

Aynı teslimde viewport `+`/cursor-ruler kapsamı düzeltildi: yalnız çıplak çalışma
alanında görünür; düğme/HUD/cetvel/panel/viewport dışında ve blur/leave durumunda
gizlenir. Fiziksel hit-test capture retargeting'i de denetler; artboard dışındaki
viewport çalışma alanı düzenlenebilir kalır. Layout/guide kabulü **19/19**;
gerçek zoom düğmesi üstünde point/crosshair/rulerX/rulerY sayıları0'dır.

Açık kullanıcı sahnesi build öncesi portable olarak
`projects/d1-before-build-20261110.chorono.json` dosyasına kaydedildi (106 katman,
SHA256 `1f347740188905a89977c2768d21bf111fbcbf2169f03ecd91ab43dcc5f87de7`).
Sekme başka CUA oturumuna ait olduğundan yenilenmedi/değiştirilmedi; gerçek
görsel/etkileşim kabulü yalnız izole fixture'larda yapıldı.
