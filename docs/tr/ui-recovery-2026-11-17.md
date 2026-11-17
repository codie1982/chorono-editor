# Özgün 2D arayüz değişikliklerinin geri alınması

17 Kasım 2026 tarihinde, 14–15 Kasım'daki özgün kaynak patchleri ana çalışma kopyasına aktarıldı. Ana depo `/Users/nilayerol/developer/caamtscr/chorono-editor` dizinidir. Kurtarma işlemi arayüzü yeniden tasarlamaz; eski değişiklikleri mevcut 2D sahiplerine bağlar. Agent Handoff ve Spline Modeling çalışmaları korunur. 3D çalışma alanı veya model kaynakları bu aktarıma dahil değildir.

## Geri gelen davranışlar

- Project menüsü export işlemlerini içerir. Etkileşimli önizleme düğmesi yalnızca tıklanabilir/sürüklenebilir içerik veya etkin önizleme varsa görünür; Timeline Play animasyon oynatmayı sürdürür.
- Timeline gezinmesi Play'in iki yanında dört açılır düğmededir. İkincil toplu işlemler `TimelineTools` içindeki kapalı başlayan native disclosure'da toplanır; komutları ve seçim sahipliği değişmez.
- Layers başlığındaki Timeline/Isolate düğmeleri kaldırılmıştır; isolation satırın sağ tık menüsündedir. Scene Explorer alt ağaç araçları ikon kullanır; Find Selected, arama alanının yanındadır.
- Inside/Touching tek erişilebilir switch ile değiştirilir.
- Snap ayarları Move / Rotate / Scale / Options sekmelerinde ortak `useSnapSettings` üzerinden yönetilir. Eski Snap dock sekmesi ve Shortcuts dock sekmesi `migrateDockLayout` ile kaldırılır; diğer sekmelerin yerleri, kapalı durumu ve bölme oranları korunur. Shortcuts, File menüsünden açılan native dialog içinde canlı kısayol kaydını gösterir.
- Motion Keys sağ tıkla açılır, Properties yanındaki ayrı dock paneline mevcut kontroller portal edilir. Panel yalnızca kontrollerin DOM yüzeyini ödünç verir; key/draft/transport sahipliği `MotionPathOverlay` içinde kalır. Gizli panel tuvali örtmez. Pan modunda hareket key'leri düzenlenmez.
- Rotate halkasında eksenler ve teğet yön okları vardır. Açı kutusu dönüştürülmüş artboard yerine viewport'a portal edilir; istemci koordinatı bir kez dönüştürülür, etiket viewport içinde sınırlandırılır.

## Snap adaptörleri ve veri sözleşmeleri

`SnapSettingsMenu` bir ayar adaptörüdür; sahneye veya geçmişe yazmaz. Grid görünürlüğü, piksel aralığı ve önde çizim tercihi `ViewportGridPreferences` ile localStorage'da saklanır. Grid görünürlüğü Move snapping anahtarından bağımsızdır; gizli grid yakalanmaz. Render/export önizlemesinde editör grid'i çizilmez.

Eski menünün Rotate/Scale alanlarını işlevsel tutmak için özgün `transformDragPreview` bağlantıları da aktarılmıştır. Rotate ve Scale kendi anahtarlarına sahiptir; Move kapalıyken de kullanılabilir. Ölçek adımı başlangıç pozuna göre çarpandır. Refleksiyon ve etkin olmayan eksen korunur. Açık yüzde ölçekleme son faktörü belirlediğinde sonradan kayacak bir grid hit'i gösterilmez.

`prepareSceneSnapContext`, bir hareket başlangıcında değerlendirilen kompozisyon koordinatlarında hedefleri hazırlar. Hareket eden alt ağaç ve ataları kendi hedeflerinden çıkarılır; doğrudan parent kenarları ayrıca sunulur. Döndürülmüş nesneler gerçek path kenarları yerine mevcut dünya eksenli bounds sözleşmesini kullanır. Ekran pikselindeki yakalama yarıçapı zoom'a göre dünya pikseline çevrilir.

`resizeSnapping` gerçek kenar/köşe tutamağını yakalar; imlecin tutamağı tuttuğu ofset kaynak geometrisini kaydırmaz. Oran/eksen kısıtları sonrasında yalnızca gerçekten ulaşılan guide'lar gösterilir. `SnapPointOverlay` yalnızca editör geri bildirimidir. Bu yardımcılar DOM veya sahne mutasyonu içermez; preview/commit/tek Undo mevcut drag transaction sahiplerinde kalır.

## Doğrulama ve kurtarma kaydı

Son kaynakta 381 Vitest dosyası ve 3.028 test geçti; TypeScript, MCP, CLI ve üretim derlemeleri başarılıdır. Resize testleri karşı köşenin korunmasını, döndürülmüş parent'ı ve oran kısıtlarını; transform testleri Move kapalıyken bağımsız açı/yüzde snapping'i kapsar. Dock migration testleri özel yerleşimlerin korunmasını ve tekrarlı geçişin etkisizliğini doğrular.

Yerel kurtarma kanıtları, özgün patch kopyaları ve test/build kayıtları git dışında `artifacts/recovery-20261117/` içindedir. Aktarımdan önceki ana repo dosyaları ZIP olarak ve emekliye ayrılan kopyanın tüm Git ref'leri bundle olarak saklanır. Eski `Documents/ChatGPT/chorono` dizini çalışma alanından kaldırılmış, geri alınabilir biçimde Çöp Sepeti'ne taşınmıştır. Kaynak veya kullanıcı sahnesi bu taşıma sırasında silinmemiştir.
