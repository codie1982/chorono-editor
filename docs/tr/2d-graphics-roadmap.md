# Chorono 2D Mode — ana geliştirme yol haritası

Tarih: 19 Kasım 2026. Mode kararı: 21 Kasım 2026. Durum: ana mode planı; uygulama
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
