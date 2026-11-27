# Boolean / boxed 3D ve editör etkileşimlerinin birleşimi

22 Kasım 2026 · Birleşim commit'i: `7c82974f`

## Kaynak ve korunmuş çalışma

`codex/developing-3d-mode` branch'inin `18db0874` commit'i, editörün
`df611e25` etkileşim checkpoint'i üzerine birleştirildi. Kaynak worktree'nin
kaydedilmemiş 3D/MCP değişiklikleri değiştirilmedi ve bu birleşime alınmadı.
Birleşim mevcut `codex/mesh2d-mesh0` branch'ine fast-forward ile aktarıldı.

## Çakışmalarda uygulanan sözleşmeler

- **Edit paneli:** `editorGeometry` ve `SplineToolsPanel`, Spline nokta/kenar/
  nesne düzenlemesini ve Boolean araçlarını aynı dock'ta sunar. Eski
  `splineModeling` / `splineTools` kayıtları `geometryEdit` paneline taşınır;
  tekrar eden sekmeler ayıklanır. Basic Shape doğrudan editable geometri değildir.
- **Ekleme:** Layers ve boş canvas sağ tık menüsü, mevcut
  `layers/add/buildAddLayerMenu` ve `activateAddLayerItem` sahiplerini kullanır.
  3D içe aktarma korunur. Spline Line, Add → Spline Objects altındadır;
  bağımsız “Draw new spline line” satırı kaldırılmıştır. Alt menüye tıklamak,
  hover ile açılmış menüyü kapatmaz.
- **Seçim ve dönüşümler:** Yeni seçim/spline gesture denetleyicileri kullanılır;
  bağımsız seçim bölgesi stili, çoklu işlem menüsü, toplu Lock/Solo, kopyalama
  deseni, eksen snap'i, Cmd ölçekleme ve görünür origin davranışları korunur.
  Mesh deformation bilgisi seçim ve render sorgularına taşınır.
- **Gruplama:** `GroupPlacement` ortak bounds merkezini parent uzayına çevirir.
  Grup başlangıç matrisi identity kalır; çocukların transform ve animasyonları
  değiştirilmez. Ungroup, anchor içeren matris bileşimini kullanır; temsil
  edilemeyen shear/singular durumlar sessizce yanlış transform üretmez.
- **Medya ve çıktı:** `VisualMediaSession`, Mesh deformation ile 3D model
  kaynaklarının ikisini de taşır. Runtime çıktısının sahibi
  `RuntimeSceneCompiler` olarak kalır; Boolean flatten, 3D capability kontrolü,
  composition background ve önceki Mesh/bake sahiplik kuralları birlikte uygulanır.
- **MCP:** Spline edit planları ve önceki Mesh/physics/bake araçları birlikte
  korunur. Katalog 62 standart, legacy açıkken 99 araçtır. Canonical skill
  kaynakları güncellenir; CLI kopyaları `cli:build` ile üretilir.

## Doğrulama

Ana checkout'ta 534 test dosyası / 3.848 test geçti. `npm run mcp:build`,
`npm run cli:build` ve `npm run build` tamamlandı. Production derlemesindeki
mevcut version named-export ve Browserslist uyarıları sürüyor.

Gerçek tarayıcı kabul kontrolleri, sentetik ve kullanıcı projesinden bağımsız
sahnelerde grup konumu/merkezi ve Undo/Redo, gerçek worker ile 11 Boolean
önizleme/Apply kontrolü, 20 boxed 3D render/kaynak kontrolü, 11 kamera ve
6 viewport kutu etkileşimi kontrolünü kapsadı. Son production arayüzünde
2001 portunda Edit paneli ve boş alan Add kategorileri ayrıca doğrulandı.

## Sonraki geliştirme

Yeni Convert → Spline / 2D Mesh geometri stack'i bu birleşimde uygulanmadı.
[Dönüşüm planı](plans/basic-shape-conversion-plan.md), mevcut planar/Boolean
hesaplarını ve Mesh üçgenleme hattını yeniden kullanacak sınırları, görünüm
kayıplarını ve kabul kontrollerini tanımlar.
