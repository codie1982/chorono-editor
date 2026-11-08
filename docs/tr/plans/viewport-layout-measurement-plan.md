# V5 sonrası — komşu mesafeleri, seçim ve cetvel/guide araçları

8 Kasım 2026 kullanıcı yönlendirmesi. Kullanıcı sıralamayı açıkça **önce V5'i
bitir, ardından ölçü ve guide araçları** olarak seçti. Bu belge bu yeni araçların
kullanıcı kabul planıdır. **L0–L6 uygulandı ve native kabulden geçti**; gerçek
sözleşme, destek sınırları ve doğrulama [uygulama belgesindedir](../viewport-layout-editing.md).
İlk sürükleme ve Alt/Cmd basılı mouse-up regresyonları V5 kapanışında ele alındı.

## Kullanıcının beklediği geometri

İki veya daha fazla seçili nesnede, bütün çiftlerin değil **yatay/dikey en yakın
komşuların kenar boşlukları** gösterilir. Ekran görüntüsündeki solda üç dikey
nesne için iki düşey aralık, orta soldakiyle sağdaki nesne için yatay aralık
gerekir. Sağdaki nesneyle üst soldaki arasına çapraz mesafe çizilmez.

İlk ölçü kuralı: yatay komşuluk için y aralıkları, dikey komşuluk için x aralıkları
örtüşmelidir. Her yönde en yakın uygun komşu seçilir; çiftler tekilleştirilir.
Üst üste binme ile pozitif boşluk ayrı gösterilir. Dönmüş nesnelerde ölçü,
selection ile aynı evaluated composition-space eksen hizalı geometri sınırları
üzerindendir; path uzunluğu veya keyframe zamanı değildir. Efekt taşmalarını
ölçüye dahil etme politikası UI'da açık tutulur.

## Teslim sırası ve kabul

| Aşama | İş | Kabul |
| --- | --- | --- |
| L0 — tamamlandı (V5) | İlk body drag / modifier mouse-up regresyonu | Önceden seçilmemiş statik ve key'li nesne ilk sürüklemede yerinde kalır; ikinci deneme gerekmez. Alt/Cmd bırakılmadan mouse-up kopyayı commit eder. |
| L1 — tamamlandı | Kalıcı çoklu seçim ve ölçü overlay sahibi | Ölçüye tıklamak veya input'a odaklanmak seçimi düşürmez; source/manual conflict, parent-child kökleri, pan/zoom ve undo ile uyumludur. |
| L2 — tamamlandı | En yakın yatay/dikey komşu ölçüleri | Yukarıdaki dört nesneli düzen, üçlü sıra, farklı ölçüler, overlap, döndürme/parent ve zoom fixture'larında doğru çiftler/kenar mesafeleri; çapraz çizgi yoktur. |
| L3 — tamamlandı | Mesafe etiketinden sayısal düzenleme | Etikete tıkla, px değeri gir, Apply veya Enter, Escape iptal; parent inverse ve source/key komutları üzerinden tek undo; geometri/key kimlikleri korunur. |
| L4 — tamamlandı | Fareyi izleyen ruler çizgileri | Düşey/yatay imleç çizgileri ve ruler işareti pan/zoom/DPR ile aynı koordinatta; idle'da sürekli render döngüsü açılmaz. |
| L5 — tamamlandı | Cetvelden sabit guide | Yatay/düşey ruler tıklaması veya sürüklemesi guide oluşturur; numeric konum, taşı/kilitle/sil, görünürlük ve snap; kaydet/aç/undo sahipliği nettir. |
| L6 — tamamlandı | Native birleşik kabul | İlk drag, çoklu seçim, sayı düzenleme, guide üretme/snap, Escape/undo/redo ve portable save/load gerçek viewport'ta doğrulanır. |

Mesafe düzenlemede hangi kökün sabit kaldığı kullanıcıya gösterilir. Uygulanan kural:
ölçü çiftindeki aktif nesne sabit, karşı kök hareketli; aktif nesne o çiftte değilse
sol/üst nesne sabit. Bütün sırayı zincir halinde yeniden dağıtma ayrı açık eylemdir;
bu ayrı özellik bu teslimde uygulanmaz, kullanıcının soft-selection isteğiyle
karıştırılmaz. Aynı seçimde parent+child iki kez hareket ettirilmez.

## Mevcut sahipleri genişletme

`LayerIndex`, selection root normalizasyonu, evaluated world bounds, `Matrix2D`,
`preparedTransforms`, viewport key komutları, `EditorPointerSession`, SnapEngine,
`Rulers` ve mevcut guide tipleri aranıp kullanılır. Ölçü hesapları domain tarafında,
input/pointer/overlay React adapter'ında kalır. Yeni bir render veya undo motoru
kurulmaz. Preview ve transient imleç çizgileri scene JSON'a yazılmaz.

Önce guide'ların mevcut persistence/undo kapsamı incelenir; yeni kaynak alanı
gerekiyorsa schema/defaults/import/export/MCP destek kapsamı birlikte tamamlanır.
Doğru olmayan kaynak/ölçü bilgisi sessizce tahmin edilmez. Büyük seçimde komşuluk
indeksi ve overlay etiket bütçesi vardır; kaynak nesneler/katmanlar elenmez.

Uygulama değişikliklerinde AGENTS.md kontrolleri ve native rendered/pointer
kabulü gerekir. Bu planın yazılması yeni ölçü/guide UI'sının testi değildir.
