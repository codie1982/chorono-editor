# Chorono 3D Mode — ana geliştirme yol haritası

Tarih: 19 Kasım 2026. Mode kararı: 21 Kasım 2026. Durum: ana mode planı; uygulama
teslimi değildir. Genel dört mode mimarisi için
[dört ana mod planı](product-mode-master-plan.md), teknik 3D
geliştirme ve kalite programı için [3D uygulama planı](production-3d-roadmap.md)
esas alınır.

## 1. Kullanıcı amacı

Bu mode; film veya oyun davranışı kurmadan düzenlenebilir 3D model,
material, texture ve rig-ready asset üretmek isteyen kullanıcı içindir. Kutulu
3D katman, model asset üretimi için tek kalıcı UI olmak zorunda değildir;
modelleme workspace'i aynı 3D çekirdeği kullanan odaklı çalışma alanıdır.

## 2. Workspace'ler

| Workspace | Sorumluluk |
| --- | --- |
| Model | Primitive, select, edit poly, extrude/lathe/sweep ve modifier stack |
| Sculpt | Multires, brush, mask ve kontrollü topology yaşam döngüsü |
| UV | Seam, unwrap, island, pack ve texel density |
| Texture | Paint/layer, channel ve source image bağlantısı |
| Material | PBR/stylized material, node graph, preview ve instance |
| Rig Setup | Skeleton, skin weight, socket, morph/corrective hazırlığı |
| Render Preview | Camera/light/stage, quality profile ve turntable |
| Export | Portable asset, GLB ve animation/game import profile |

## 3. Sahiplik sınırı

3D Modelleme; mesh/topology, UV, texture, material kaynağı, skeleton bind/rest
ve morph kaynağının sahibidir. Poz, clip, state, camera choreography ve film
zamanı [Render Mode'a](render-mode-roadmap.md); collider, gameplay
component, prefab ve platform shader variant'ı
[Game Mode'a](game-engine-mode-roadmap.md) aittir.

Material kaynağı burada oluşturulur. Game Engine aynı material asset'i runtime
quality/variant profiliyle tüketir; ayrı ve kopuk bir material kopyası üretmez.
Animasyon, modelin topology/bind revision'ını referanslar; güvenli eşleme yoksa
source güncellemesini sessizce uygulamaz.

## 4. Aşamalar

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| G3D0 — mode ve viewport | Project Hub kartı, Model workspace, 3D selection/gizmo ve portable asset | Mode/workspace geçişi 2D verisini bozmaz; model kaydet/aç çalışır |
| G3D1 — hard-surface | Edit poly, extrude/lathe/sweep ve ilk modifier'lar | Gerçek ürün prop'u farklı açılarda düzenlenebilir |
| G3D2 — UV/material | Unwrap, texture dependency ve PBR/stylized material | Editor/preview/export material sonucu tanımlı profilde eşleşir |
| G3D3 — organik üretim | Sculpt, retopology sınırı, subdivision ve morph kaynağı | Yüz/el fixture'ında topology ve detail korunur |
| G3D4 — rig-ready asset | Skeleton, skin weight, corrective ve socket | Bind/rest round-trip ve Render handoff'u geçer |
| G3D5 — üretim paketi | LOD, import/export diagnostics, asset variant ve Game handoff | GLB/portable kaynak, material ve skeleton gerçek projede tüketilir |

Bu aşamalar [3D4 kalite programındaki](production-3d-roadmap.md) Q0–Q5 teknik
teslimlerle eşlenir; iki ayrı geometri veya rig implementasyonu geliştirilmez.

## 5. İlk kabul projesi

Bir hard-surface prop, iki material, basit çevre parçası ve rig-ready karakter
üretilir. Turntable preview, portable save/open ve GLB çıktısı doğrulanır.
Karakter Render Mode'da pozlanır; prop ve material Game
scene'inde prefab'a bağlanır. Kaynak asset revision değişimi her iki tüketicide
stale/review tanısı üretir.
