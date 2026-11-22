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

## Sonraki teslim A — nokta/topoloji

Break nokta konumunu koruyarak bağımsız uçlar oluşturur. Weld iki uygun açık
ucu tolerans içinde birleştirir; Fuse kimlikleri birleştirmeden merkezlerine taşır.
Reset Tangents komşu eğrilere göre kolları üretir; tangent clipboard yerel kol
vektörlerini ve bağlantı tipini taşır. Split kenarı tıklanan parametrede keser.
Mevcut Refine/Divide, exact Bézier bölmesini kullanmaya devam eder.

## Sonraki teslim B — kesişim/kontur

Trim tıklanan kesişim aralığını kaldırır; Stroke Trim animasyonundan ayrıdır.
Extend açık ucu terminal teğette hedefin en yakın ileri kesişimine uzatır.
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
