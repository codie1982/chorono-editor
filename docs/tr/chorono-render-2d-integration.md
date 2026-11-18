# Chorono Render 2D render entegrasyonu

## Amaç ve kullanıcı akışı

Editörün **Export → Render with Chorono Render…** eylemi ayrı bir Render Settings penceresi açar. Kullanıcı iki çıktı niyeti seçebilir:

- **Current frame:** mevcut global playhead zamanından tek PNG kare hazırlar. Chorono Render 2D Video Studio bu kareyi açar; son PNG görünümü ve dosya hedefi orada belirlenir.
- **MP4 video:** kompozisyonun tamamını seçilen FPS, çözünürlük çarpanı ve arka planla PNG karelerine hazırlar. Chorono Render bu değişmez kaynak diziyi açar; renk/optik görünüm, MP4 kodlama, ilerleme, iptal ve dosya hedefi orada yönetilir.

Image Sequence ZIP, doğrudan tarayıcı indirmesi olarak bağımsız kalır. Render eylemi sahneyi, undo geçmişini veya düzenlenebilir animasyon verisini değiştirmez.

## Giriş noktaları ve veri akışı

1. `src/components/export/RenderSettingsDialog.tsx` kullanıcı ayarlarını ve bağlantı durumunu yönetir.
2. `src/lib/export/sequence/SequenceExportEngine.ts` ortak raster yolunu kullanarak PNG karelerini üretir. `startTimeMs` + `frameCount: 1` mevcut kareyi, varsayılan aralık tüm kompozisyonu örnekler.
3. `src/lib/export/choronoRender/ChoronoRenderBridge.ts` yalnız aynı origin `/api/render/2d-sequence` rotasıyla konuşur.
4. Sunucu rotası `~/.chorono-render/editor-service.json` keşif kaydını okur, loopback servis örneğini doğrular ve ZIP'i bearer ile `/v1/editor/sequence` uç noktasına aktarır. Bearer, port ve keşif yolu tarayıcıya dönmez.
5. Chorono Render aktarılan asset'i 2D Video Studio'da açar. Nihai PNG/MP4 kodlama ve atomik dosya yayını Chorono Render sorumluluğudur.

## Sözleşmeler ve sınırlar

- Kareler PNG'dir; aktarım arşivi en çok 128 MiB olabilir.
- Chorono Render en çok 1800 kare ve eksen başına 4096 piksel kabul eder.
- MP4/H.264 için genişlik ve yükseklik çift sayı olmalıdır. Şeffaf pikseller videoda siyah üzerine birleştirilir; ses mux edilmez.
- FPS tamsayı ve `1..120` aralığındadır. Kare zamanı global timeline milisaniyesidir.
- İptal ve belge değişimi geç sonuçların UI'a yayınlanmasını engeller. Üretim/aktarımı yöneten kaynak lease'i tüketim tamamlanana kadar canlı kalır.
- Editör şu anda mevcut Canvas2D final-raster yolunu kullanır; çözünürlük çarpanı kompozisyon bitmap'ini ölçekler. Chorono Render nihai video finishing/kodlama katmanıdır, editör evaluator'ının yerine geçmez.

## Minimum kullanım örneği

Chorono Render'ı başlatın, editörde **Export → Render with Chorono Render…** seçin, çıktı türünü ve ayarları belirleyip **Continue in Chorono Render** düğmesine basın. Kare hazırlama ve aktarım tamamlanınca 2D Video Studio öne gelir; tek kare için PNG, animasyon için MP4 dışa aktarımını orada tamamlayın.
