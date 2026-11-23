# Spline Edit — native araçlar ve teslim durumu

22 Kasım 2026. Onaylanan model: Apply gerçek spline geometrisini değiştirir;
önizleme geçicidir, her uygulama ayrı Undo'dur. Araçlar yeni modifier oluşturmaz.

## İlk bağımsız teslim

- Nesne adı → Point/Edge/Object → seçim özellikleri → moda özel araçlar → ortak
  transform → kapalı Source / History sırası.
- Chamfer/Fillet Point; Offset Path Edge/Object. Panel ve sağ tık aynı admission
  ve native worker/command yolunu kullanır. Seçim yoksa bütün nesneye fallback yoktur.
- Offset Replace varsayılanı; Keep source ile Append. Inside/Outside Inset/Outset
  olarak sunulur. Tam contour edge seçimi gerekir; kısmi seçim sessizce büyütülmez.
- Object ID/adı, seçilmemiş contour/delikler, gerçek layer TRS/origin/paint korunur.
- Dört eski modifier evaluator'ı ve kayıtları korunur; yeni UI chooser'ında yoktur.
  Eski generated source açıkça/tek Undo ile editable spline'a uygulanabilir.
- MCP `offset.resultMode` opsiyoneldir; omitted mevcut append/promotion davranışını
  korur, replace strict contour seçimi ister. Point enum değerleri değişmez.

## Teslim A — nokta/topoloji (23 Kasım 2026)

Break nokta konumunu koruyarak bağımsız uçlar oluşturur. Weld iki uygun açık
ucu tolerans içinde birleştirir; Fuse kimlikleri birleştirmeden merkezlerine taşır.
Reset Tangents komşu anchor'lara göre nokta tipine uygun kolları üretir; tangent
clipboard yerel kol vektörlerini ve bağlantı tipini taşır. Break/Fuse/Reset ve
Copy/Paste Tangents Point; Split Edge paneli ve sağ tık menüsündedir. Split panelde
yüzde parametresinde, menüde tıklanan kenar konumunda keser; çizgiyi düzleştirmez.
Her geometri uygulaması bir Undo'dur; Copy kaynak veya geçmiş değiştirmez.
Clipboard aynı belgede mod/nesne/seçim değişiminde korunur, yeni belgede sıfırlanır.
Uygun seçim yoksa araçlar nedeni ile devre dışıdır; açık uç Break yapılamaz.
Mevcut Refine/Divide, exact Bézier bölmesini kullanmaya devam eder.

Doğrulama: 563 dosyada 4.016 test; Point/Edge paneli ve sağ tıkta yedi özel
tarayıcı kabul grubu. Kilit/driver/CAS, Undo/Redo, save/load, Bézier kontrol
korunumu ve layer TRS/origin kontrolleri bu kapsama dahildir. Özel kabul sayfası
`scripts/perf/spline-point-tools.mjs` ile, Next durdurulmuşken hazırlanır.

## Teslim B1 — Trim ve Extend (23 Kasım 2026)

Trim tıklanan kesişim aralığını kaldırır; Stroke Trim animasyonundan ayrıdır.
Extend açık ucu terminal teğette hedefin en yakın ileri kesişimine uzatır.
Edge panelinde araç seçilip viewport'ta parça/uç tıklanır; sağ tık aynı komutu
tıklanan parametrede doğrudan uygular. Her değişiklik bir Undo/Redo'dur. Esc veya
Cancel kaynak değiştirmeden çıkar; arming sahneye/stack'e/geçmişe kaydedilmez.

Trim aralığı birden fazla edge'i ve kapalı contour dikişini kapsayabilir. Açık
uçlar, en az bir kesişim olduğunda terminal sınırdır; kapalı contour iki ayrı
kesişim ister. Tam Bézier parçaları, kaynak sahipliği ve seçilmemiş delikler
korunur. Extend orijinal eğriyi korur; teğet boyunca bir düz uzantı ekler, hedefe
weld yapmaz. Kesişim yoksa kaynak aynı kalır ve Undo eklenmez.

Aynı spline ve diğer görünür spline layer'ları hedef alınır. Parent transformları,
animasyonun geçerli frame'i, hidden ve Solo kapsamı hesaplanır. Basic Shape ve Mesh
bu teslimde kesişim hedefi değildir. Üst üste binen veya çözülemeyen eğri temasları
destructive tahmin yerine açık tanıyla reddedilir. Ayrıntılar ve sınırlar
[Spline Edit sözleşmesindedir](../spline-edit-and-paint.md#trim-ve-extend).

Doğrulama: 567 dosyada 4.038 test. Geometri/kesişim, yakın kök ayrımı, kübik
self-crossing, sahne/parent/frame, source CAS, native Undo/Redo, MCP planları ve
panel/menü/viewport picker adaptörü kapsanır. Bu teslimin DOM testleri gerçek
tarayıcı piksel kabulü olarak sayılmaz.

## Sonraki teslim B2 — diğer kontur araçları

Simplify tolerans/köşe/uç/delik korumalı nokta azaltır. Smooth anchor'ları
koruyarak tangent düzenler; Subdivide geometriye nokta ekler. Interpolation
örnekleme hassasiyetidir ve kendi başına vertex eklemez. Kısmi Edge Offset/Outline
bağlantılı seçili zincirle sınırlı olacaktır.

## Sonraki teslim C — Outline ve gelişmiş transform

[Outline v2](spline-outline-band-v2-plan.md) gerçek kapalı bant üretir. Varsayılan
kaynak yerine bant; Keep source yeni Object ekler. Kalınlık sabit, köşe/eğride
vertex yoğunluğu artar. Cap/join/alignment/dash gerçek geometriye uygulanır.
Skew/Shear/Mirror noktaları ve kolları değiştirir; layer TRS/origin değişmez.
Edit pivot'u transient'tir. Align/Distribute/Snap toolbox Scene/Local çerçevesini
kullanır. Appearance/preset/clipboard genişletmeleri Outline v2'de kalır.

## Kabul

İlk teslim için native panel/menu, legacy bake+Undo, Offset replace/append ve
Chamfer/Fillet gerçek worker testleri vardır. Ayrıca açık/kapalı/delikli contour,
Bézier, animasyonlu/nonuniform parent, kilit/key/ref/stale-source, TRS/paint ve
save/load kontrolleri gerekir. `npm test`, MCP/CLI/production build ile doğrulanır;
Next hazırlama/build sırasında durdurulur. Sonraki teslimler bu kayıtta tamamlandı
olarak işaretlenmez ve UI'ya TODO veya sahte çalışan komut eklenmez.
