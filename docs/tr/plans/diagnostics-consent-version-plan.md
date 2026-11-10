# Sade hata özeti ve sürüm kontrolü

10 Kasım 2026. Kullanıcının “hata içinde boğulmayalım” düzeltmesiyle ilk kapsam
küçültüldü. **D0–D2 ara işi**, kalan E−1 öncesindedir. D0 kısa özet/sürüm
altyapısı tamamlandı; D1 ilk açılış onayı/kuyruk ve D2 servis henüz uygulanmadı.

## Kullanıcıya sunulacak davranış

Tek **Share error reports** seçeneği, varsayılan kapalı. Kullanıcı açıkça izin
verirse yalnız beklenmeyen uygulama hatalarının kısa özetleri gönderilir.
İzni kapatmak yeni toplamayı/gönderimi durdurur ve bekleyen özetleri temizler.

**İlk çalıştırmada tek seferlik onay** gösterilir: “Anonim hata özetlerinin
Chorono sunucusuna düzenli gönderilmesine izin veriyor musun?” Kısa açıklamada
sürüm/hata kodu/tekrar sayısının paylaşılacağı, proje içeriğinin gönderilmeyeceği,
servis hedefi ve dolu kuyruk için 5 dakikalık gönderim aralığı belirtilir.
UI seçenekleri **Allow** / **Don't send** olur; önceden seçili onay yoktur.
Yanıt bu tarayıcıda saklanır; red veya pencereyi kapatma sonrası her açılışta
yeniden sorulmaz. Yanıt verilmemesi onay değildir. Mevcut kullanıcıya özellik
ilk geldiğinde aynı soru bir kez gösterilir. Tercih Resources ayarından
değiştirilebilir; kabul yalnız bundan sonraki anonim hata özetlerini kapsar.

Her mouse hareketi, seçim, başarılı işlem veya normal iptal raporlanmaz.
Escape, boş tıklama, eşik altı hareket, normal blur ve her `source-cancel`
otomatik olarak hata sayılmaz. Kataloglanmış commit/işlem başarısızlığı,
beklenmeyen rollback veya uygulama çökmesi hedeflenir.

Ayrıntılı Interaction kaydı bugünkü gibi **gerektiğinde elle açılan yerel tanı
aracı** olarak kalır. İlk sürümde uzak Interaction olay penceresi, gesture zinciri
ve ayrıntılı trace upload yoktur. Eski yerel kayıtlar paylaşım iznine dahil olmaz.

## Hata kalabalığını önleme

Aynı sürüm/build + hata kodu + modül + bilinen sabit hata noktası **tek satırda**
gruplanır. Örneğin: `0.2.1 · Move commit failed · 143 tekrar`. Her tekrarda yeni
issue veya bildirim oluşmaz. Gruplama raw mesaj, stack, nesne ID'si veya
koordinatlardan türetilmez. Yeri bilinmeyen genel hatalar “unclassified” sayılır;
bunların aynı kök neden olduğu iddia edilmez.

Her grup için günlük tekrar sayısı ve en fazla **bir temizlenmiş örnek** tutulur.
Bakım listesi yalnız **Yeni / İnceleniyor / Düzeltildi** durumlarını, önem düzeyini
ve etkilenen sürümü gösterir. Önce çökme/veri kaybı, sonra işlem başarısızlığı;
uyarılar ve performans ayrıntıları ilk kapsama girmez. Tekrar sayısı kullanıcı
sayısı değildir; her tekrar için e-posta/bildirim gönderilmez.

## Asgari veri ve sınırlar

- Rapor/schema sürümü, retry için rastgele `reportId`, uygulama sürümü/resmi
  build, sabit errorCode/module/failureSite, gün kovası ve tekrar sayısı.
- Örnek yalnız kataloglanmış işlem/sonuç kodlarıdır. İsim, hesap/kurulum
  kimliği, proje içeriği, nesne ID'si, dosya yolu, URL, raw mesaj/stack, kesin
  konum veya medya gönderilmez. Yerel build kimliği `local` olur.
- Gün içinde en çok **20 farklı hata grubu**; taşan hatalar ayrıntısız bir
  overflow sayacında tutulur. Tekrar sayıları sınırlı tamsayıdır.
- Özetler en erken **5 dakikada bir**, yalnız kuyruk dolu/online/görünür ve
  gesture dışında gönderilir. Tek aktif request, en çok **16 KiB/batch**,
  **256 KiB/24 saatlik** yerel kuyruk ve sınırlı retry/timeout bulunur.
- Retry aynı `reportId` ve sabit count delta'yı kullanır; tekrar gönderim hata
  sayısını artırmaz. Yeni hatalar sonraki batch'e girer. Servis duplicate ID'yi
  tekilleştirir; bilinmeyen alan ve aşırı payload'ı reddeder.
- Gönderim öncesi güncel izin yeniden kontrol edilir. Eski sekme/geç async
  sonuç kapatılmış izni veya kuyruğu geri getiremez. İzin öncesi ağ isteği yoktur.

Onay metni gerçek servis hedefini ve saklama süresini açıklar. HTTPS, cookiesiz
ve referrer'sız gönderim; ayrı hata deposu ve otomatik silme gerekir. Önerilen
saklama: tek örnek 7 gün, günlük sayaçlar 90 gün. Ağda IP görünürlüğü ve hosting
log ayarları da doğrulanır; tam anonimlik garantisi verilmez.

## Sürüm kontrolü ve kodla uyum

Sürüm kontrolü ayrı bir ayardır: Check now ve isteğe bağlı günde bir kontrol.
Yeni sürüm ve release notları gösterilir; otomatik kurulum bu iş değildir.
Uygulama paket sürümü/build bilgisi kullanılır; `MCP_VERSION` ve raw MCP status
uygulama sürümü veya paylaşım verisi olarak kullanılmaz.

`InteractionTrace`/sessionStorage değişmez; ayrıntılı kayıt/JSON indirme yereldir.
Yeni özet collector, temizleme, gruplama/kuyruk ve transport ayrı sorumluluklar
olarak `src/lib/diagnostics` altında; build/release işleri `src/lib/version`
altında önerilir. UI mevcut Resources alanını kullanır. Pointer handler'a ağ işi
eklenmez. UTF-8 boyut yardımcıları yeniden kullanılır; scene/undo'ya log yazılmaz.

## Uygulama sırası ve kabul

| Dilim | İlk teslim |
| --- | --- |
| **D0 — tamamlandı** | Hata kodları ve küçük DTO, sürüm/build bilgisi, temizleme ve tekilleştirme. [Gerçek sözleşme](../../../src/lib/diagnostics/README.md). |
| **D1 — sıradaki** | İlk çalıştırmada tek seferlik onay, saklanan tercih ve ayarlardan kapatma; bounded özet kuyruğu, yerel mock collector; mevcut yerel kayıt korunur. |
| **D2** | Gerçek servis/saklama ve sade hata listesi, sürüm kontrolü, uçtan uca kabul. |

Kabul: ilk çalıştırmada onay sorusu; kabul/red/kapatma ve yeniden açmada tercihin
korunması; izin öncesi sıfır request; normal işlemlerden sıfır hata raporu; aynı
hatanın 1.000 tekrarında tek grup ve doğru sayaç; farklı sabit hata noktaları
ayrı; retry sayacı şişirmez; hassas canary alanları dışarı çıkmaz; offline/limit/
TTL/revoke/çoklu sekme source'u etkilemez. Mevcut first-drag/guide/creation ve
tek undo davranışı korunur. Uygulamada repo testleri, MCP/build ve gerçek
mock-servis tarayıcı kontrolü çalışır; build öncesi Next durdurulur.

D0 uygulaması: `src/lib/version` uygulama paket sürümünü kullanır; varsayılan
build `local` olur. `src/lib/diagnostics` yalnız açıkça verilen sabit hata
noktalarını kabul eder, günlük 20 grupta tekilleştirir ve temizlenmiş immutable
rapor üretir. Sayım ve rapor dönüşümü ayrı; reportId üretimi, count delta/retry
ve izin/gönderim D1'e aittir. Gün değişince önceki bellek grupları bırakılır;
bu store henüz kalıcı kuyruk değildir. Herhangi bir aktif collector, UI onayı,
ağ çağrısı veya mevcut Interaction geçmişinin aktarımı eklenmedi.

[Mevcut yerel kayıt sözleşmesi](../../../src/components/canvas/interactions/diagnostics/README.md)
ve [pointer kabulü](../pointer-gesture-lifecycle.md) uygulama dayanaklarıdır.
