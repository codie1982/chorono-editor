# Mesh2D topoloji — teknik referans ve uyarlama kararları

24 Kasım 2026. Kullanıcının verdiği **Chorono — 2D Mesh Topology & Modifier
Engine, teknik taslak v1.0** geliştirmelerde tekrar okunacak matematik ve araç
referansıdır. [34 sayfalık özgün PDF](references/mesh2d-topology-v1.pdf) repository'de
değiştirilmeden saklanır. Araçların teslim durumu [Mesh Edit planındadır](plans/mesh2d-edit-modes-plan.md).
PDF tasarım önerisi ve örnek API içerir; mevcut kodun bitmiş özellik listesi değildir.
Özgün ad: `Chorono_2D_Mesh_Topology_Teknik_Dokuman.pdf`.
SHA-256: `2f30d458faeb8542fca8a3adc8da2aeb108234eea95725b9026b40b19e3c40cf`.

## Her Mesh değişikliğinde okunacak bölümler

| İş | PDF bölümü / sayfa | Kodda aranacak koruma |
| --- | --- | --- |
| Her geometri/topoloji işlemi | §1–§3, s.4–8 | Koordinat/birim, orient/alan, kararlı ID, açık remap, atomik komut ve Undo. |
| Vertex ekle/sil, Weld/Break, Smooth/Relax | §4, s.9–11 | One-ring/fan, Jacobi giriş snapshot'ı, pin/lock ayrımı, attribute interpolasyonu. |
| Split/Collapse/Flip/Bridge/Loop | §5, s.11–13 | İki tarafta aynı yeni vertex, manifold/degeneracy, UV seam, quad komşuluğu. |
| Face/Fill/Inset/Knife/triangulation | §6, s.14–16 | Kapalı basit contour, hole/coverage/overlap, doğru komşu yüz yenilemesi. |
| Convert/retopology/Mirror/Decimate | §7, s.16–17 | Adaptif Bézier örnekleme, constrained boundary, negatif determinant, 2D silhouette error. |
| Deformasyon/UV/skin/morph/fizik | §8–§10, s.18–24 | Rest/edit/evaluated ve UV ayrımı, ağırlıklar, seed/zaman, topology version, fixed-step/bake. |
| Modifier/CPU-GPU/cache/export | §11, s.25–27 | Mevcut genel stack, tür/uzay capability, source→render eşlemesi, kaynak ömrü. |
| Her teslimin kabulü | §12–§14 ve Ek B, s.28–33 | Matematik invariants, golden mesh, portable/raster/Undo ve ölçülmüş performans. |

Bu referansın §14 checklist'i; Split/Flip/Weld/Collapse gibi kaynak bağlantısı
değiştiren her yeni operatörün tasarım ve review girişidir. Bir önceki aracın
hesabını kopyalamadan ilgili domain yardımcıları ve testleri aranır.

## Mevcut Chorono sözleşmesine uyarlamalar

1. **Koordinat ve winding:** PDF Y-up/CCW önerir. Chorono'nun mevcut 2D verisi
   yerel **X sağa / Y aşağı**, pozitif signed double-area kullanır. Bu sözleşme
   kayıt/renderer/solver için korunur; yeni half-edge çekirdeğinde farklı uzay
   gerekirse giriş/çıkış adapter'ı açık olur. Mevcut vertex'ler dosya açılışında
   ters çevrilmez; Mirror/Flip Winding determinant ve yüz doğrulamasıyla ele alınır.
2. **Subdivision:** PDF s.17/s.20'deki midpoint 1→4/Loop örnekleri, kullanıcının
   daha önce seçtiği **öncelikli constrained Delaunay ve ayrı Grid/Karelaj**
   algoritmalarının yerine geçmez. Bunlar mevcut `MeshSubdivisionStrategy`
   sözleşmesindedir. Midpoint/Loop ancak ayrıca kararlaştırılan yeni strategy olabilir.
3. **Edit topolojisi ve render:** Yeni mantıksal quad/triangle yüz görünümü
   renderer triangle buffer'ından ayrıdır. Şu an genel n-gon/half-edge source
   veri modeli uygulanmış değildir. Temel Split Edge, Flip Edge, Delete Face ve
   Fill mevcut triangle/quad komşuluğunu kullanır. Split iki komşuya aynı vertex
   kimliğini verir. UV ve konum aynı kenar parametresinde enterpole edilir.
   §2 half-edge/Euler modeli, genel n-gon, Weld, Collapse ve Dissolve fazında ele alınır.
   Triangle adjacency yerine ikinci bağımsız renderer veya solver kurulmaz.
4. **UV/attribute:** Mevcut Mesh UV'si vertex başınadır. PDF'nin face-corner UV,
   seam, color, material ve weight modeli yeni payload/adapter gerektirir.
   Aynı konumdaki farklı UV'ler sessizce weld edilemez; mevcut destek sınırı ve
   açık ret politikası devam eder. Per-face Material/UV araçları tamamlandı sayılmaz.
5. **Zaman:** Örnek `timeSeconds`/XPBD saniyesi ile Chorono composition-ms aynı
   alan değildir. Sınırda açık dönüştürme yapılır; mevcut clip/timeline birimleri
   yeniden yorumlanmaz. Parametre animasyonu ve fizik ilk statik Edit paketini bekletmez.
6. **Genel modifier:** PDF'deki descriptor alanları kavramsaldır. Mevcut genel
   `Modifier`, registry, kategori adapter'ları ve ordered Execute genişletilir;
   geometriye bağımlı yeni bir root base veya ayrı Point/Edge/Face runner kurulmaz.
   Topoloji, konum, attribute ve simülasyon etkileri ayrı capability/remap/cache
   sözleşmesiyle aşamalı açılır; eski type/settings kayıtlarının anlamı korunur.
7. **Saklama ve tolerans:** Edit hesabı JS number/float64, renderer buffer'ları
   ayrı runtime verisidir. PDF'nin Map/typed-array örnekleri doğrudan scene JSON
   veya Undo'ya konmaz. Mevcut sayısal eşikler bir dosya açılırken değişmez;
   yeni işlem ölçekli absolute+relative toleransını ve birimini açık belirtir.

## Matematik kontrol kartı

- **Orient/alan:** `orient(a,b,c) = cross(b-a,c-a)`, `A = orient/2`.
  Kaynak commit'i mevcut robust planar predicate ve topology validator'ından geçer.
  Toplam alan eşliği tek başına overlap veya coverage doğruluğunu kanıtlamaz.
- **Euler:** Planar manifold'ta dış sınırsız yüz sayılmadan `V-E+F = C-H`;
  bağlı disk için `1`, bir hole'lu bağlı region için `0`. Mantıksal quad sayısı
  ile renderer triangle/diagonal sayısı aynı hesapta karıştırılmaz.
- **Split:** `p(t) = (1-t)a + tb`; iki komşu taraf aynı yeni source vertex ID'yi
  kullanır. Vertex attribute'ları ağırlıklarla, seam UV'leri her corner tarafında
  ayrı aktarılır. İç triangle edge split için `Δ(V,E,F)=(1,3,2)`.
- **Face deformasyonu:** Seçili face/edge vertex'lerinin birleşimi alınır;
  paylaşılan vertex bir kez hareket eder. Komşu yüzün bağlantısı da bunu izler;
  bağımsız hareket için açık topoloji Split/Detach gerekir.
- **Barycentric:** Yeni yüzey noktası ve UV/weight interpolasyonu aynı triangle
  katsayılarını kullanır; seam tarafları ayrı ele alınır. Topology remap belirsizse
  mevcut animation/morph/pin başka ID'ye bağlanmaz, açık rebind/rebake gerekir.
- **Smooth/Relax:** Uniform Smooth her iterasyonda aynı giriş komşuluk snapshot'ını
  kullanır; boundary/hole korunumu ve shrink davranışı bellidir. Relax aynı
  hesap/amaç olacaksa ayrı isimle kopya araç sunulmaz; farklı enerji/quality
  hedefi varsa ayrı strategy ve kabul gerekir.
- **2D Decimate:** XY düzlemindeki 3D plane-QEM tek başına silüet hatası değildir.
  Boundary doğruları + shape/attribute cezası ve geçerli collapse kontrolleri gerekir.
- **Pin/Lock/Simulation:** Kullanıcı Point Lock, deformasyon Pin ve fiziksel
  inverse-mass ayrı anlamlardır. FPS'ye bağlı solver adımı veya frame başına
  kontrolsüz random, deterministik seek garantisi vermez.

## Mevcut giriş noktaları ve kabul

`src/lib/geometry/mesh2d/selection/MeshFaceTopology.ts`: mantıksal yüz/diagonal;
`MeshComponentSelection.ts`: dünya uzayında pick/region ve tekil vertex hedefi;
`Mesh2DTopologyValidator.ts`: kaynak geometri geçerliliği;
`Mesh2DAdjacencyBuilder.ts`: ortak triangle komşuluğu;
`modeling/`: mevcut Smooth ve Delaunay/Grid hesapları.
Komutlar `src/lib/editor/modifiers/commands.ts`, yürütme `src/lib/modifiers`;
UI `src/components/canvas/mesh2d` ve `src/components/editorGeometry` sahibindedir.

Temel kabul örneği 4×3 Grid'dir: **20 vertex, 31 mantıksal edge, 12 quad face**;
renderer **24 triangle** kullanır. `20-31+12=1`. İç diyagonal pick edilmez;
Face seçimi dört vertex'i, yan yana iki Face altı tekil vertex'i hedefler.
Diğer temel fixtures: iki diagonal, triangle-only, delikli/ayrık region, legacy
Grid, transformed parent, UV seam reddi, ters/çöken yüz, Undo/Redo ve portable.

Native tarayıcı kabulü `node scripts/perf/mesh-face-edit.mjs /tmp/chorono-mesh-face-qa`
ile hazırlanır; Next hazırlama/build sırasında durdurulur. Bu fixture bağımsız
üretim bileşenlerini kullanır; bağlı kullanıcı sahnesinde test yapıldığı anlamına
gelmez. Genel manuel test sırası [test planında](releases/v0.5.0-manual-test-plan.md),
adımlar [kabul kılavuzundadır](releases/v0.5.0-manual-acceptance-tests.md).
