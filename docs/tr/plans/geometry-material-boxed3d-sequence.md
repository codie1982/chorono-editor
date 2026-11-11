# Poly, materyal ve kutulu 3D için güncel geliştirme sırası

8 Kasım 2026; ara iş sadeleştirmesi 10 Kasım 2026. Kullanıcı tarafından onaylandı.
Önce D0–D2 kullanıcı onaylı hata özeti/sürüm ara işi tamamlandı.
E−1.Q [MCP araç kalitesi ve uyumlu sadeleştirme](mcp-tool-quality-plan.md) de
tamamlandı. E−1.1 zorunlu okuma/revision ve E−1.2 kaynak kökeni de tamamlandı; E−1.3 ortak hiyerarşi de tamamlandı; E−1.4 Set Key/transport ve E−1.5 zorunlu prosedürel eğri/bake dilimi de tamamlandı; sırada [E−1.5A input expression](input-expression-plan.md), ardından kalan viewport/ortak araç kabulü,
ardından yeni özellik sırası var.
11 Kasım ilerleme: input expression A1 ve A2 tamamlandı; sırada A3 boolean/koşul,
A4 field adapter'ları, A5 ve ortak araç kabulü var. [Kapı/kabul kaydı](pre3d-completion-audit.md).
Bu belge uygulama teslimi değildir; tam bağımsız 3D Modeling/Game Engine modunu
etkinleştirmez. Ana çalışma alanı 2D Animation olarak kalır.

**Ek öncelik tamamlandı:** V5 sonrası [komşu mesafeleri ve cetvel/guide araçları](../viewport-layout-editing.md)
uygulandı. Genel 3D/Poly sırasından önce kalan ortak düzenleme/araç kabulü tamamlanır.

**Sadeleştirilen ara öncelik:** [kullanıcı onaylı hata özetleri ve sürüm
kontrolü](diagnostics-consent-version-plan.md). D0–D2; yalnız beklenmeyen hataları
tekilleştirip tekrar sayısıyla gösterir. Ayrıntılı Interaction yerelde elle açılır,
uzak olay akışı ilk kapsama girmez. D0 ve D1 tamamlandı: kalıcı onay, kuyruk,
gerçek alıcı API/depo ve aynı izinle sürüm kontrolü yerelde doğrulandı.
D2 sade bakım listesi de uygulandı: token ile `/diagnostics`, günler arası tek
satır/tekrar ve kalıcı New / Investigating / Fixed. Public servis yayını ayrıdır.
[D1 sözleşmesi](../diagnostic-sharing.md), [D2 ve kabul durumu](../diagnostic-management.md).

## Erteleme sınırı

Önceki optimizasyon kabulü korunur. Yeni özelliklerden sonra bütün alanları
kapsayan ikinci ölçüm/iyileştirme turu yapılır. Her yeni feature kendi kaynak
sahipliği, bütçe, release/dispose, cache invalidation ve cancellation kontrolleriyle
teslim edilir; bunlar son optimizasyon turuna ertelenmez.

Tam Export E0 ve devamı, yüksek kaliteli final renderer ve çoklu format teslimi
özelliklerden sonra yapılabilir. Önceden gerekli dar sözleşmeler: kesin frame
zamanı, hedef çıktı boyutu, alpha/renk politikası, kaynak hazırlığı ve açık
runtime/export capability. Her katman kaydet/aç/undo/clone ve asgari raster
çıktı veya açık bake/fallback kontrolünden geçer. Mevcut exporter'ların yeni
katmanları sessizce atlamasına izin verilmez. Bileşen kütüphanesi source modeli
export compiler'a zorunlu bağımlı olmadan tasarlanır; runtime derlemesi sonradır.

## Onaylanan sıra

| Sıra | İş | Tamamlanma sınırı |
| --- | --- | --- |
| Tamamlandı | V4 subtree duplicate / drag-copy | [Uygulama ve kabul](../viewport-clone-editing.md); native Copy/Instance destek sınırları açık. |
| Tamamlandı | V5 çoklu Array | [Gerçek uygulama ve kabul](../viewport-array-editing.md): V4 forest üzerinden dört pattern, bounded preview ve tek undo. |
| Tamamlandı | Komşu mesafeleri, cetvel ve guide | [Gerçek uygulama ve kabul](../viewport-layout-editing.md); seçim, keyframe ve tek undo korunur. |
| Ara iş D0–D2 tamamlandı | Sade hata özeti ve sürüm kontrolü | Kalıcı tek onay/kuyruk/gerçek alıcı ve izinli sürüm kontrolü; admin token ile sade bakım listesi. Public yayın ayrı; Interaction yerel/elle. |
| Tamamlandı — E−1.Q | MCP araç/isim/şema kalitesi | MCP 1.1.0 standard 40 / legacy 77 katalog ve uyumlu alias/keşif; eski çağrılar korunur. |
| Tamamlandı — E−1.1 | Zorunlu güncel sahne okuması/revision | MCP 2.0.0; tek kullanımlık bağlantı/belge/revision token, son browser CAS, plan/batch/retry korumaları. |
| Tamamlandı — E−1.2 | İnsan/ajan kaynak kökeni | Optional bounded authoring v1; creation/field/last writer, copy/import, undo/redo/save/load ve runtime temizliği. |
| Tamamlandı — E−1.3 | Ortak editör hiyerarşisi | Explorer/Timeline source tree, Find, tam subtree flag/undo, çoklu dal filtreleri ve güvenli UI reparent. [Sözleşme](../editor-hierarchy.md). |
| Tamamlandı — E−1.4 | Set Key/toplu key/transport | Typed keyset, source örnekleme, ID/easing koruma, tek undo ve ortak çakışma/zaman politikası. [Sözleşme](../timeline-authoring.md). |
| Tamamlandı — E−1.5 | Prosedürel eğri/Wire/bake | Zorunlu 1–4; [gerçek sözleşme](../procedural-authoring.md). Serbest zaman ifadesi controller'ı ayrı. |
| Sıradaki — E−1.5A | Input'larda düz değer ve expression | Ortak numeric giriş/fx/çift tıklama, kalıcı formül; çoklu kaynak/zaman ve typed sonuçlar, tüm field adapter'ları. [Plan](input-expression-plan.md). |
| Ardından | Kalan E−1 ve araç kabulü | E−1.5A dahil V6/E−1.7 birleşik kullanıcı akışı ve aynı 512 MiB büyük sahne regresyonu. |
| 1 | Ortak dar entegrasyon sözleşmeleri | Asset/source kimliği, kesin yerel saat, frame hazırlığı, capability ve kaynak sahipliği; bütün export motorunu önceden yazmak gerekmez. |
| 2 | Kutulu 3D ilk dikey dilim | GLB/glTF import, model hiyerarşisi, kamera/ışık/basit materyal, şeffaf çıktı yüzeyi ve 2D kompozisyon; Timeline transform/clip kontrolü, seç/bounds/undo/save/load. |
| 3 | Editable Poly 2D | Shape-to-Poly dönüşümü, sabit ID/topoloji, vertex/edge/tri/quad düzenleme, grid ve triangulation; renderer ve hit-test dahil. |
| 4 | Poly görünümü | UV, vertex color, basit 2D material ve dokulu/deforme triangle çizimi; texture transform ve UV düzenleyicisi. |
| 5 | Kutulu 3D ileri düzenleme | Bir kutuda birden çok model, kamera animasyonu, malzeme kontrolleri, imported skeleton/clip/morph oynatma ve elle pose düzeltme. Yeni rig üretme/weight painting/IK ayrı artımlı dilimlerdir. |
| 6 | Yeni katmanların ortak araç adapter kabulü | Tamamlanan clone/array/ortak düzenleme sözleşmeleri Poly ve kutulu 3D için de doğrulanır; ikinci clone algoritması yazılmaz. |
| 7 | Bileşen kütüphanesi ve karakter | Source component/local clock, 2D karakter rig/sprite/state-machine; ortak parametre/expression'a bağlı Canvas Slider/Switch/Checkbox/Input bileşenleri ve yeniden kullanılabilir üretim kontrolleri. |
| 8 | Fizik ve kırılma | Sabit adım/core, collision/force fields/bake; Poly kaynaklı Voronoi kırılma, particle entegrasyonu. |
| 9 | Kumaş | Poly rest mesh + UV + pin/collision/gravity/wind, elle düzeltme ve bake. |
| 10 | Blob, sıvı ve akışkan | Değişken topolojili Blob Surface, solver/contour/mesh adapter'ları ve bake. Sabit Poly vertex/UV kimliği kendiliğinden korunmuş sayılmaz. |
| 11 | Export tutarlılığı ve final kalite | Yeni türler dahil canonical değerlendirme/parity, hedef çözünürlük, efekt/maskeler, renk/örnekleme; desteklenmeyen vektör/runtime hedeflerde açık bake/fallback. |
| 12 | Çoklu format ve üretim otomasyonu | Gerçek destek/capability üzerinden çıktı profilleri ve işler. |
| 13 | Bütün ürün için ikinci optimizasyon ve birleşik kabul | Four Seasons + dokulu Poly + 3D/rig + cloth/Blob/fluid + export fixture'ları; CPU/heap/RSS/GPU/asset/job plateau, görüntü eşliği ve sınır bütçeleri. |
| Mevcut 1–13 serisi kabulünden sonra — ileri faz CFX | Katman kontrolleri, kompozisyon/efekt/maske, video kurgu, yerel tracking ve katmanlı 3D compositing | [CFX1–CFX11](advanced-compositing-tracking-plan.md); ayrı sonraki ürün fazı, mevcut serinin yeni önkoşulu değildir. |

V3 viewport position key authoring, V4 native clone ve V5 forest Array tamamlandı.
Komşu mesafesi/ruler-guide araçları ve D0–D2 ara işi de tamamlandı. Yeni
3D/Poly bloğundan önce kalan E−1 ortak düzenleme/araç kabulü tamamlanır. Soft selection/connected-loop konuşması
kullanıcının önceki isteğine göre en son tartışılacak ayrı başlıktır.

## Sonraki faz kaydı — 11 Kasım 2026

Kullanıcının mevcut iş akışını koruma kararıyla [CFX planı](advanced-compositing-tracking-plan.md)
mevcut serinin 13. adımı tamamlandıktan sonraya eklendi. E−1.5A sıradaki iş
olarak kalır. CFX; maske doğruluğu → katman sütunları → kompozisyon ayarları →
efekt blokları → gelişmiş maske → Adjustment Layer → video clip akışı →
yerel tek/çift nokta ve stabilizasyon → planar/Corner Pin → ortak kameralı
3D compositing → 3D kamera çözümü sırasını izler.

CFX10, bu belgede planlanan kutulu 3D çekirdeğini yeniden kullanır; ilk kutulu
3D teslimine tracking/kamera çözümü önkoşulu eklemez. Yeni özellikler kendi
bounded kaynak, görüntü, portable/undo ve çıktı kabulünden geçer. Tam bağımsız
3D çalışma alanı açılmaz. Mevcut serinin son optimizasyonu CFX'in otomatik
kabulü sayılmaz.

## Poly, UV ve basit materyal

Mevcut `polygon` parametreli shape'i editable mesh değildir. Poly ayrı source
türü ve mevcut Shape araçlarından açık dönüşüm olarak eklenir. Source tri/quad
yüzleri korunur; render için kararlı triangle buffer türetilir.

Bağlantı/topoloji, 2D/3D konum, UV, renk ve backend buffer sahipliği ayrılır.
UV dikişlerinde bir geometrik vertex birden çok yüz-köşesi UV'sine sahip olabilir;
GPU buffer adapter'ı gerektiğinde vertex çoğaltır, source topolojiyi parçalamaz.
Vertex color ve UV edit işlemleri geometry deformasyonundan bağımsızdır.

İlk material: image asset referansı, tint, opacity, vertex-color etkinliği,
texture offset/rotation/scale ve clamp/repeat. 2D başlangıcı unlit'tir; 3D PBR
roughness/metalness/normal gibi ayarlar ayrı payload/backend kabiliyetidir.
Renk/alpha/texture renk uzayı ve birleştirme kuralları açık tanımlanır.

İki ayrı araç gerekir: nesne üzerinde texture gizmo'su (görseli taşı/döndür/ölçekle)
ve UV paneli (image üzerinde UV vertex/edge/island seç/taşı/döndür/ölçekle,
reset/fit/checker/undo). İlk sürüm planar UV; seam/unfold/pack daha ileri dilimdir.
Bu, image dosyasının piksellerini boyayan bir texture-paint editörü değildir.
Canvas2D'nin path fill'i genel UV deformasyonu ve interpolated vertex color'ı
tek başına sağlamaz; triangle tabanlı backend/adaptör ayrıca uygulanır.

## Kutulu 3D sahne ve animasyon sınırı

Bir kutu bir modelle sınırlı değildir: kendi scene tree, kamera, ışık, modeller,
material ve clip kontrolleri olan bir alt sahne olabilir. 2D timeline kutunun
konum/ölçek/opacity'sini; ayrı hedefler iç model TRS, camera ve clip saatini
kontrol eder. Chorono milisaniyesi Three.js saniyesine adapter'da çevrilir;
scrub/export sabit zamandan değerlendirilir, ekran FPS'ine bağlanmaz.

Kutu Three.js ile şeffaf yüzeye render edilir, sonra mevcut 2D compositor'a
girerek mask/effect/sıralama alır. Farklı kutular arasında ortak depth/ışık/gölge
kendiliğinden oluşmaz; birbirini 3D'de örtecek modeller aynı kutuda tutulur.
Her kutuya sınırsız ayrı WebGL context açılmaz; render hizmeti ve GPU kaynakları
bütçeli sahiplerle paylaşılır. Three.js runtime nesneleri source/undo JSON'a girmez.

Three.js imported rig ve animation oynatmayı sağlar; Chorono içinde rig oluşturma,
weight painting, IK ve kapsamlı 3D modelleme UI'sını kendiliğinden sağlamaz.
Detaylı sahne desteği draw call, texture, ışık/gölge ve render hedefi bütçeleriyle
kademeli doğrulanır. Her çıktı formatında native 3D/SVG/Lottie desteği vaat edilmez.

## İnceleme dayanakları

Kod: `src/lib/core/IRenderer.ts`, `src/lib/registry/LayerRendererRegistry.ts`,
`src/lib/modes/bootstrap.ts`, `src/lib/types/core.ts`, `package.json`.
Bootstrap yalnız 2D modunu kaydeder; doğrudan Three.js bağımlılığı ve bu belgede
önerilen tam Poly/UV/material/3D source katmanları henüz mevcut değildir.

- https://threejs.org/docs/pages/BufferGeometry.html
- https://threejs.org/docs/pages/MeshBasicMaterial.html
- https://threejs.org/docs/pages/GLTFLoader.html
- https://threejs.org/docs/pages/AnimationMixer.html
- https://github.com/mrdoob/three.js/blob/dev/docs/pages/SkinnedMesh.html.md

Bu tur dokümantasyon/bağımlılık değerlendirmesidir. Runtime değişikliği, paket
kurulumu veya canlı sahne mutasyonu yapılmadı; uygulama testleri yeniden çalıştırılmadı.
