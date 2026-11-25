# Spline modelleme: Offset, Outline, Chamfer ve Fillet

Seçili spline katmanı için bağımsız **Edit** dock sekmesini açın; Properties
üzerindeki **Open Edit** düğmesi veya panel menüsü de bu sekmeyi açar. Eski
Spline Modeling sekmesinin kayıtlı konumu Edit'e taşınır. Üstteki işlem
listesinden Offset, Outline, Chamfer veya Fillet seçin; yalnız seçilen işlemin
ayarları altta görünür. **Source**, canvas'ta seçilen noktanın düzenleyicisini
ve kapalı spline'dan ayrı Mesh2D oluşturma işlemini içerir. Nokta seçmek Edit
panelini açar. Basic Shape katmanları bu panelde düzenlenmez; kendi parametrik
kontrolleri Properties'te kalır. Mesh2D kaynak/grid, texture, deformation clip ve
pin ayarları da Edit'te ayrı satırlardan açılır. Transform, görünüm ve spline
fill/stroke/trim kontrolleri Properties'te kalır. Animasyon eğrisi modifier'ları
ayrı **Animation Modifiers** panelindedir.

Kontur ve **katmana yerel piksel** cinsinden pozitif mesafe seçin. Kapalı
konturda Offset/Outline yönü outward/inward; açık konturda kontur sırasına göre
left/right'tır. **Preview** kaynak/history'yi değiştirmez; **Apply** tek Undo
adımıyla uygular, **Cancel** atar. Önizleme sonrasında belge veya revision
değişirse yeniden Preview gerekir. Layer veya işlem değiştirmek geçici taslağı
atar. Bu liste mevcut modelleme araçlarının ayarlarını düzenler; kalıcı,
sıralanabilir geometri modifier kayıtları eklemez. Offset/Outline ayrı layer
oluşturur; Chamfer/Fillet kaynak konturu değiştirir.

Offset, paralel konturu yeni kardeş spline katmanına koyar. Outline, kapalı kaynakta iki even-odd konturlu bant; açık kaynakta uçları kapatılmış şerit üretir. Kaynak geometri ve animasyonu değişmez. Chamfer/Fillet yalnız seçili konturu yeniden oluşturur. Panelde birden fazla uygun köşe seçilebilir; canvas'taki nokta da kullanılabilir. Açık uçlar ve kilitli noktalar seçilemez. Değiştirilecek kontura adreslenmiş animasyon track'i varsa işlem reddedilir; önce bake veya track temizliği gerekir. Diğer konturların kayıtları ve kimlikleri korunur.

Eğriler, en çok 0,25 yerel piksel kiriş sapmasıyla (en fazla 12 bölme derinliği) örneklenir. Offset mesafesi örneklenmiş kenarlara göredir. Chamfer, örneklenmiş yay uzunluğundan keser. Fillet'in yarıçapı iki düz kenarda tamdır; eğrisel kenarda teğet kübik yaklaşım kullanılır. Sert içbükeylik, kendiyle kesişme, sıfır uzunluk, çakışan köşe kesimleri ve çöken offset reddedilir. Büyük ölçek/zoom'da 0,25 yerel piksel yaklaşımı görünür olabilir. Apply sonrası sonuç normal düzenlenebilir spline verisidir; mevcut renderer, portable save/load ve export yolunu kullanır.

`src/lib/spline/modeling` içindeki `createOffsetOutline` ve `treatSplineCorners` geometri girişleridir. `sampleContourEdges` eğri örneklemesini, `assertContourAnimationSafe` track kontrolünü, `modeledSplineLayer` kardeş katmanı sahiplenir. Dock paneli önizlemeyi sahiplenir ve Apply sırasında kaynak kontrolünü yineler. Script tarafında `layer.spline.offsetContour`, `outlineContour`, `chamferCorners` ve `filletCorners` aynı işlevleri kullanır. Offset/Outline yeni katman ID'sini döndürür; script çağrıları önizlemesiz, doğrudan native komutla uygulanır. Yeni serialized spline alanı veya runtime sınıfı eklenmez.
