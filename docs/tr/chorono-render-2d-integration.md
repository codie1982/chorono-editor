# Chorono Render 2D render entegrasyonu

## Sürüm sınırı

- **v0.5.0'da uygulanmış durum:** Chorono Render ayrı çalışan yerel uygulamadır;
  editör discovery/bearer korumalı köprüyle kareleri aktarır. Aşağıdaki mevcut
  akış bu teslimi belgeler.
- **v0.6.0 hedefi:** Chorono Render motoru masaüstü Chorono editör paketinin
  parçası olacaktır. Kullanıcı ayrı uygulama kurmaz, launcher açmaz, servis
  discovery veya bağlantı ayarı yönetmez. Motor izolasyon için worker/child
  process kullanabilse de ürün ve dağıtım sınırı tek uygulamadır.

v0.6.0 geçişinde mevcut `ChoronoRenderBridge` ve
`/api/render/2d-sequence` davranışı frame/job sözleşmesinin kaynağı olarak
kullanılır; harici uygulama bağımlılığı masaüstü ürün yolundan kaldırılır.
Ayrıntılı teslim ve kabul koşulları
[v0.6.0 ana planındadır](plans/v0.6.0-master-plan.md).

## v0.5.0 mevcut kullanıcı akışı

Editörün **Export → Render…** eylemi ayrı bir Render Settings penceresi açar. Pencere önce yerel Chorono Render servisini denetler; servis bulunursa Chorono Render'ı, bulunamazsa uygulamanın yerleşik renderer'ını otomatik seçer. Chorono bağlı olsa bile kullanıcı yerleşik renderer'ı elle seçebilir.

Kullanıcı iki çıktı niyeti seçebilir:

- **Current frame:** mevcut global playhead zamanından tek PNG kare hazırlar. Chorono backend bu kareyi 2D Video Studio'da açar; yerleşik backend PNG'yi doğrudan indirir.
- **Video:** kompozisyonun tamamını seçilen FPS, çözünürlük çarpanı ve arka planla PNG karelerine hazırlar. Chorono backend bu değişmez kaynak diziyi MP4 finishing için açar. Yerleşik backend'de MP4 encoder olmadığı için gerçek çıktı açıkça PNG sequence ZIP olarak gösterilir ve indirilir.

Image Sequence ZIP, doğrudan tarayıcı indirmesi olarak bağımsız kalır. Render eylemi sahneyi, undo geçmişini veya düzenlenebilir animasyon verisini değiştirmez.

## v0.5.0 giriş noktaları ve veri akışı

1. `src/components/export/RenderSettingsDialog.tsx` kullanıcı ayarlarını, bağlantı durumunu, otomatik backend seçimini ve manuel backend değişimini yönetir.
2. `src/lib/export/sequence/SequenceExportEngine.ts` ortak raster yolunu kullanarak PNG karelerini üretir. `startTimeMs` + `frameCount: 1` mevcut kareyi, varsayılan aralık tüm kompozisyonu örnekler.
3. `src/lib/export/choronoRender/ChoronoRenderBridge.ts` yalnız aynı origin `/api/render/2d-sequence` rotasıyla konuşur.
4. Sunucu rotası `~/.chorono-render/editor-service.json` keşif kaydını okur, loopback servis örneğini doğrular ve ZIP'i bearer ile `/v1/editor/sequence` uç noktasına aktarır. Bearer, port ve keşif yolu tarayıcıya dönmez.
5. Chorono Render aktarılan asset'i 2D Video Studio'da açar. Nihai PNG/MP4 kodlama ve atomik dosya yayını Chorono Render sorumluluğudur. Chorono yoksa yerleşik backend mevcut raster/sequence motoru ve tarayıcı indirmesiyle tamamlanır.

## Korunacak sözleşmeler ve sınırlar

- Kareler PNG'dir; aktarım arşivi en çok 128 MiB olabilir.
- Chorono Render en çok 1800 kare ve eksen başına 4096 piksel kabul eder. Yerleşik sequence yolu en çok 4096 kare kabul eder.
- MP4/H.264 için genişlik ve yükseklik çift sayı olmalıdır. Şeffaf pikseller videoda siyah üzerine birleştirilir; ses mux edilmez.
- FPS tamsayı ve `1..120` aralığındadır. Kare zamanı global timeline milisaniyesidir.
- İptal ve belge değişimi geç sonuçların UI'a yayınlanmasını engeller. Üretim/aktarımı yöneten kaynak lease'i tüketim tamamlanana kadar canlı kalır.
- Editör şu anda mevcut Canvas2D final-raster yolunu kullanır; çözünürlük çarpanı kompozisyon bitmap'ini ölçekler. Chorono Render nihai video finishing/kodlama katmanıdır, editör evaluator'ının yerine geçmez.

## v0.6.0 gömülü hedef akışı

1. Masaüstü uygulama açılırken native render adapter'ı paket içindeki Chorono
   Render çekirdeğini hazırlar; ayrı kurulum veya uygulama keşfi yapılmaz.
2. **Export → Render…** aynı canonical frame request'i gömülü motora verir.
   Render Settings ve ortak Jobs yüzeyi progress/cancel/retry durumunu gösterir.
3. Gömülü motor MP4/PNG finishing ve atomik dosya yayınını uygulamanın seçilen
   output konumunda tamamlar; kullanıcı başka bir Video Studio penceresine
   aktarılmaz.
4. Motor başlatılamaz, çöker veya capability sınırını karşılamazsa uygulama
   tanıyı kaydeder ve açık gerçek çıktı adıyla dahili PNG/PNG sequence
   fallback'ine geçer.
5. Uygulama kapanırken render işi ve motor kontrollü biçimde iptal/dispose
   edilir; sahipsiz process, geçici dosya veya kilit bırakılmaz.

Editör evaluator'ı, immutable frame isteği, boyut/FPS doğrulaması, kaynak
lease'i, stale sonuç reddi ve çıktı capability raporu korunur. Harici servis
discovery/bearer protokolü ise yalnız v0.5.0 uyumluluk/geçiş kodudur ve
masaüstü v0.6.0'ın kullanıcı sözleşmesi değildir.

## v0.5.0 minimum kullanım örneği

Editörde **Export → Render…** seçin. Chorono Render çalışıyorsa otomatik olarak tercih edilir ve **Continue in Chorono Render** ile Video Studio'ya geçilir. Kurulu veya açık değilse Built-in renderer otomatik seçilir; **Render PNG** ya da **Render PNG Sequence** çıktıyı doğrudan indirir. Retry, servis daha sonra açıldığında önceliği yeniden Chorono Render'a taşır.
