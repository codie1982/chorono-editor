# Chorono Render 2D render entegrasyonu

## Amaç ve kullanıcı akışı

Editörün **Export → Render…** eylemi ayrı bir Render Settings penceresi açar. Pencere önce yerel Chorono Render servisini denetler; servis bulunursa Chorono Render'ı, bulunamazsa uygulamanın yerleşik renderer'ını otomatik seçer. Chorono bağlı olsa bile kullanıcı yerleşik renderer'ı elle seçebilir.

Kullanıcı iki çıktı niyeti seçebilir:

- **Current frame:** mevcut global playhead zamanından tek PNG kare hazırlar. Chorono backend bu kareyi 2D Video Studio'da açar; yerleşik backend PNG'yi doğrudan indirir.
- **Video:** kompozisyonun tamamını seçilen FPS, çözünürlük çarpanı ve arka planla PNG karelerine hazırlar. Chorono backend bu değişmez kaynak diziyi MP4 finishing için açar. Yerleşik backend'de MP4 encoder olmadığı için gerçek çıktı açıkça PNG sequence ZIP olarak gösterilir ve indirilir.

Image Sequence ZIP, doğrudan tarayıcı indirmesi olarak bağımsız kalır. Render eylemi sahneyi, undo geçmişini veya düzenlenebilir animasyon verisini değiştirmez.

## Giriş noktaları ve veri akışı

1. `src/components/export/RenderSettingsDialog.tsx` kullanıcı ayarlarını, bağlantı durumunu, otomatik backend seçimini ve manuel backend değişimini yönetir.
2. `src/lib/export/sequence/SequenceExportEngine.ts` ortak raster yolunu kullanarak PNG karelerini üretir. `startTimeMs` + `frameCount: 1` mevcut kareyi, varsayılan aralık tüm kompozisyonu örnekler.
3. `src/lib/export/choronoRender/ChoronoRenderBridge.ts` yalnız aynı origin `/api/render/2d-sequence` rotasıyla konuşur.
4. Sunucu rotası `~/.chorono-render/editor-service.json` keşif kaydını okur, loopback servis örneğini doğrular ve ZIP'i bearer ile `/v1/editor/sequence` uç noktasına aktarır. Bearer, port ve keşif yolu tarayıcıya dönmez.
5. Chorono Render aktarılan asset'i 2D Video Studio'da açar. Nihai PNG/MP4 kodlama ve atomik dosya yayını Chorono Render sorumluluğudur. Chorono yoksa yerleşik backend mevcut raster/sequence motoru ve tarayıcı indirmesiyle tamamlanır.

## Sözleşmeler ve sınırlar

- Kareler PNG'dir; aktarım arşivi en çok 128 MiB olabilir.
- Chorono Render en çok 1800 kare ve eksen başına 4096 piksel kabul eder. Yerleşik sequence yolu en çok 4096 kare kabul eder.
- MP4/H.264 için genişlik ve yükseklik çift sayı olmalıdır. Şeffaf pikseller videoda siyah üzerine birleştirilir; ses mux edilmez.
- FPS tamsayı ve `1..120` aralığındadır. Kare zamanı global timeline milisaniyesidir.
- İptal ve belge değişimi geç sonuçların UI'a yayınlanmasını engeller. Üretim/aktarımı yöneten kaynak lease'i tüketim tamamlanana kadar canlı kalır.
- Editör şu anda mevcut Canvas2D final-raster yolunu kullanır; çözünürlük çarpanı kompozisyon bitmap'ini ölçekler. Chorono Render nihai video finishing/kodlama katmanıdır, editör evaluator'ının yerine geçmez.

## Minimum kullanım örneği

Editörde **Export → Render…** seçin. Chorono Render çalışıyorsa otomatik olarak tercih edilir ve **Continue in Chorono Render** ile Video Studio'ya geçilir. Kurulu veya açık değilse Built-in renderer otomatik seçilir; **Render PNG** ya da **Render PNG Sequence** çıktıyı doğrudan indirir. Retry, servis daha sonra açıldığında önceliği yeniden Chorono Render'a taşır.
