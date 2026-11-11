# Üst araç çubuğu ve bağlama göre spline çizimi

11 Kasım 2026. Üst çubukta **Project**, **Preview** ve **Export** bulunur.
Project; JSON indirme, kayıt klasörü seçme/değiştirme, sürüm kaydetme, JSON
inceleme ve kopyalamayı toplar. Export; mevcut image, SVG, image sequence,
standalone HTML ve Runtime JSON işlemlerini aynı callback'lere yönlendirir.
Resources düğmesi üstten kaldırılmıştır; panel **Menu → View → Resources &
Performance** ve dock üzerinden açılır. Kaynak izleme sistemi kaldırılmamıştır.

Animation/SM üst seçicisi kaldırılmıştır. Canvas ve State Machine dock sekmeleri
aynı çalışma alanını yönetir; `Cmd+Shift+M` kısayolu korunur. Motion Keys yalnız
geçerli seçili nesnede görünür; seçim boşsa, nesne gizliyse veya spline/pen çizimi
etkinse gösterilmez. Bu araç konum animasyonu key'lerini düzenler.

## Menü ve kayıt sözleşmesi

`TopToolbar/DropdownButton.tsx` sadece açılma/odak/klavye davranışını sahiplenir.
Arrow Up/Down, Home/End, Enter, Escape ve Tab desteklenir; kapalıyken document
listener yoktur. Dışarı tıklama focus'u geri çalmaz; Escape veya action seçimi
trigger'a döner, sonra açılan dialog focus'u alabilir. Native file picker
callback'i aynı kullanıcı click'inde çağrılır; timer/microtask ile ertelenmez.

`ProjectMenu` eski standalone `FileVersioningControl` görünümünü değiştirir;
`useFileVersioning` kaynak sahipliği, dosya yazma ve zamanlayıcıları aynı kalır.
Klasör desteği yoksa JSON indirme/inceleme devam eder; Save Version kayıt klasörü
olmadan veya yazma sürerken kapalıdır. Kayıt durumu/folder/sürüm bilgisi menüde
gösterilir. `exportMenuItems.ts`, File ve Export menülerinin ortak action
kataloğudur; ikinci bir export veya serialization pipeline'ı kurulmamıştır.

## Spline akışı

Kalıcı New Spline/Append üst seçicisi yoktur. Layer → Add ile primitive çizilir;
seçili spline varsa mevcut world→local adapter üzerinden ona yeni contour eklenir.
Line çizimi seçili açık endpoint'ten devam edebilir; diğer açık uç seçilirse o
uçtan ekler. Sağ tık menüsündeki **Continue spline**, açık ucu; **Add line to
spline**, endpoint olmayan/kapalı bir spline'a ayrı contour eklemeyi seçer.
**Draw new spline line**, seçimi çizim hedefinden ayırıp yeni katman oluşturur.

Tıklamalar yeni köşe noktalarını biriktirir; son nokta ile mouse arasında kesikli
preview çizilir. Enter veya sağ tık açık çizimi bitirir; karşı uca yakın tıklama
contour'ı kapatır. Escape bekleyen çizimi source/history'ye yazmadan iptal eder.
Çizim boyunca geçici noktalar source'e girmez. Commit tek undo olur; eski
point/segment/handle kimlikleri, parent transform ve mevcut animasyonlar korunur.
Başlangıç ucundan eklerken eski contour yönü değiştirilmez. Bu akış iki ayrı
katmanı yıkıcı biçimde birleştiren bir Attach işlemi değildir.

`spline/edit/extendSplineContour.ts` finite layer-local noktalarla açık contour'ı
genişletir; eski normalized kayıtları ödünç alır, yeni kayıt/ID'leri üretir.
`useSplineDrawing` mevcut `placeSplineInLayer`, `mergeSplineData` ve editor
komutlarını kullanır. Belge/revision/hedef/local time değişmişse eski çizim
reddedilir; kilitli veya singular hedefe source yazılmaz. Warning yeni gesture
başında temizlenir; pointer ve keyboard listener'ları bitirme/iptal/unmount'ta
bırakılır. Yeni geometri/polyline world-space önizlenir; source layer-local'dir.

## Doğrulama ve kapsam

Çalışma ağacında 352 dosya / 2.822 test; bu teslimin temiz kaynak kopyasında
352 dosya / 2.821 test geçti. Fark, korunmuş önceki keyboard testidir. Her iki
kaynakta standalone TypeScript; çalışma ağacında MCP ve production build geçti.
Production build'in mevcut JSON version import/Browserslist uyarıları sürer.
Ek numerical kontroller endpoint yönü, closure, immutable eski kayıtlar ve
locked/non-finite girişleri kapsar. Gerçek Chrome'daki ayrı fixture; Project
keyboard/focus, export routing, desteklenmeyen klasör, boş seçimde Motion Keys,
devam çizimi + sağ tık + exact undo/redo, Escape, stale ret ve yeni polyline'ı
doğrular. Sekiz fixture kontrolüne ek olarak açık editörün menü/dock geçişi ve
yenileme öncesi/sonrası source JSON eşliği doğrulandı: toplam dokuz kabul.
Sayısal kaynak kontrolü DOM'da gösterilen JSON üzerinden yapılır.

Fixture: `node scripts/perf/toolbar-interactions.mjs <output-dir>`; mevcut
`scripts/perf/serve.mjs` ile sunulur. Kaynak `TopToolbar/__tests__/browser-toolbar.tsx`.
Kanıtlar `artifacts/validation/toolbar-spline-20261111/` altındadır. Kullanıcının
projesine test geometrisi eklenmez. E−1.5A ve sonraki ana geliştirme sırası değişmez.
