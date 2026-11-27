# Chorono 2D Mode — ana geliştirme yol haritası

Tarih: 19 Kasım 2026. Mode kararı: 21 Kasım 2026. Spline durum güncellemesi:
24 Kasım 2026 (§6). Durum: ana mode planı; uygulama
teslimi değildir. Genel dört mode mimarisi ve sıra için
[dört ana mod planı](product-mode-master-plan.md), teknik 2D
geliştirmeler için [2D uygulama planı](production-2d-roadmap.md) esas alınır.

## 1. Kullanıcı amacı

Bu mode; zaman çizelgesi veya oyun runtime'ı kurmadan çizim, görsel,
tipografi, layout, reusable component ve animation-ready 2D asset üretmek
isteyen kullanıcı içindir.

Başlangıç seçenekleri:

- boş canvas / artboard,
- sosyal medya, sunum, UI ve sprite template'i,
- SVG/image import ve düzenleme,
- component/symbol library,
- var olan 2D asset'i açma.

## 2. Workspace'ler

| Workspace | Sorumluluk |
| --- | --- |
| Draw | Shape, pen/spline, brush adayı, fill/stroke, boolean ve transform |
| Vector | Path/point, contour, Mesh2D hazırlığı, alignment ve precision |
| Typography | Text, font, paragraph, text-on-path ve outline dönüşümü |
| Layout | Artboard, grid/guide, constraint, group/component ve responsive variant |
| Image / Compositing | Crop/mask, blend, filter/effect, color ve çoklu layer |
| Components | Symbol, instance, override, variant ve shared library |
| Export | PNG/WebP/SVG, resolution/ratio variant ve asset package |

## 3. Sahiplik sınırı

2D Grafik; shape/path/text/image, appearance, layout ve statik component
kaynağının sahibidir. Timeline keyframe, rig hareketi ve video sequence
[Render Mode'a](render-mode-roadmap.md); canlı input, collider ve prefab
behavior [Game Mode'a](game-engine-mode-roadmap.md) aittir.

`Animate` eylemi mevcut asset'i kopyalamaz; onu animation scene/clip içinde
referanslar veya açık bir snapshot/component sürümü oluşturur. `Use in Game`
aynı şekilde sprite/UI asset referansı ve import profile üretir.

## 4. Aşamalar

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| G2D0 — mode girişi | Project Hub kartı, template ve Draw workspace | Yeni proje doğru panel/araçlarla açılır; diğer mode verisi kaybolmaz |
| G2D1 — temel çizim | Shape/path/text/image, selection, transform, style ve undo | Kaydet/aç, clone/instance, bounds ve SVG/PNG gerçek çıktı |
| G2D2 — precision/layout | Grid/guide/snap, align/distribute, artboard ve responsive constraint | Çoklu oran kaynağı bozmadan üretilir |
| G2D3 — component sistemi | Symbol/component, variant ve override | Source update instance'ları güvenli günceller; orphan override tanısı vardır |
| G2D4 — compositing | Mask/blend/effect/color ve image workflow | Editor/export parity ve kaynak bütçesi gerçek fixture'da doğrulanır |
| G2D5 — üretim paketi | Asset library, batch variant, Render/Game handoff | Aynı asset Render ve Game Mode'da stable ID ile tüketilir |

## 5. İlk kabul projesi

Bir marka kartı, ikon seti, reusable button component'i ve sprite karakter
sheet'i hazırlanır. Kaynak proje kapanıp açılır; 1:1, 16:9 ve 9:16 varyantlar,
SVG ve PNG çıktıları alınır. Button Game UI'ında, sprite sheet Render Mode'da
açılır; kaynak düzenlemesi kontrollü biçimde iki tüketiciye
yansır.

## 6. Mevcut Spline temeli ve açık işler — 24 Kasım 2026

Aşağıdaki temel mevcut editörde uygulanmıştır; G2D0–G2D5 mode/workspace ve ortak
ürün kabulünün tamamlandığı anlamına gelmez. Teknik durum, teslim kanıtları ve
kalan sıra [2D uygulama planı §9A](production-2d-roadmap.md#9a-spline-edit-görünüm-ve-modifier-teslimleri)
altındadır. Geliştirme branch'i `codex/mesh2d-mesh0`; release/sürüm ataması ayrıdır.

| Alan | Gerçekleşen teslim | Açık sınır |
| --- | --- | --- |
| Vector / Edit | 1 Point, 2 Edge, 3 Object; nokta/tangent tipleri, Break/Weld/Fuse, Copy/Paste/Reset Tangents; Add Vertex, Refine/Divide, Split, Trim/Extend; Object Simplify/Smooth/Subdivide/Interpolation | Edge araçları iki kapalı bölüm altında; Divide sağ tık eşliği ve gerçek kullanıcı oturumunda görünürlük kabulü açık. |
| Draw / görünüm | Properties'te fill türleri, gradient/alpha/stops, pattern; stroke fill/style/align/cap/join/dash. Yeni Spline No Fill, siyah 3 px stroke ile gelir. | Stroke/outline hazır-özel preset ve clipboard henüz tamamlanmadı. |
| Boolean / dönüşüm | Shape → Spline / 2D Mesh; delik ve ayrık adalar; Union/Subtract/Intersect/XOR, Compound/Merge/Separate Paths ve isteğe bağlı kaynak koruyan Boolean | Native sonuç edit edilebilir Spline'dır; Boolean Paths stack modifier'ı ayrı ileri iştir. |
| Statik Spline modifier Faz 1 | Offset Path, Round Corners, Path Simplify, Path Smoothing, Path Resample, Zig Zag, Pucker & Bloat, Repeater; kendi ayarları, sıralama/toggle/remove, Execute/Bake/Undo | Modifier eklemek Edit modunu gerektirmez. Parametre animasyonu ertelendi; ilk fazın ön koşulu değildir. |
| Canlı Outline / Stroke to Path | Gerçek delikli bant, cap/join/alignment/dash ve bağımsız paint; canlı Outline kaynak çizgi değişince güncellenir. Kılavuz aç/kapat ve açık Bake vardır. | Kısmi canlı Edge zinciri, tam v2 Bézier-fit/provenance ve density ayarları açık; eski kayıtlar otomatik dönüştürülmez. |
| Ortak Edit transformu | Move/Rotate/Scale, Scene/Local eksenleri, sabit gerçek origin ve oturum ghost'u; her hareket ayrı Undo | Skew/Shear, Mirror, geçici edit pivot'u ve alt seçim Align/Distribute genişletmesi ayrı kabul ister. |

Sıradaki yerel iş görünür Edge araçları ve menü eşliği; ardından kısmi zincir ve
ortak Edit transform genişletmeleridir. Variable Width, Boolean modifier, Wiggle,
Dynamics, animasyonlu parametreler ve tam Outline v2 ileri fazda kalır. Bu kayıt
mevcut G2D aşamalarının veya diğer mode'ların teslim sırasını değiştirmez.
