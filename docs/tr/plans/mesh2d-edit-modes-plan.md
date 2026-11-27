# Mesh2D — Vertex / Edge / Face düzenleme ve modifier kapsamı

24 Kasım 2026. Kullanıcının modlara göre araç/modifier listesi bu planın ürün
kapsamıdır. Aşağıdaki mevcut temel ile sonraki paketler ayrı tutulur; listede
adının bulunması uygulanmış araç veya çalışan UI anlamına gelmez.
Her yeni işlemde [PDF teknik referansı ve uyarlama kararları](../mesh2d-topology-reference.md)
yeniden okunur; ilgili matematik/ID/attribute/Undo checklist'i tasarıma bağlanır.

## 1. Seviyeler ve mevcut temel

| Seviye | Kısayol / panel | Düzenlenen kaynak |
| --- | --- | --- |
| Vertex / Point | `1` / Vertex | Tek veya çoklu stable vertex ID; bütün nokta işaretleri görünür, seçili noktalar kırmızı. |
| Edge | `2` / Edge | Mantıksal yüzlerin çevre kenarları; seçili kenar kırmızı. Bir quad'ın renderer diyagonali düzenleme kenarı değildir. |
| Face / Polygon | `3` / Face | Grid'de gerçek dörtgen hücre; kalan Delaunay/sınır geçiş triangle'ı ayrı yüz. Seçili yüz yarı saydam kırmızı dolgu ve kırmızı sınır alır. |
| Object | Edit dışında layer seçimi | Nesnenin gerçek transformu, pivot, duplicate/instance ve ortak appearance. Edit içinde bütün geometri için Face → Ctrl/Cmd+A kullanılabilir. |

Spline `1/2/3` Point/Edge/Object davranışı korunur. Mesh panelinde Vertex/Edge/Face
düğmeleri mode girişini sağlar; ayrı Enter edit mode düğmesi eklenmez. Panel
face/quad/triangle sayılarını ve aktif alt seçim sayısını gösterir. Stack Edit
oturumundan bağımsız kullanılabilir; boş seçim otomatik bütün bileşenleri seçmez.

Uygulanan Edit temeli seçim, Shift/Ctrl toggles, region seçimi, Ctrl/Cmd+A ve
Move/Rotate/Scale'dir. Seçili yüz/kenarların ortak vertex'leri yalnız bir kez
dönüştürülür. Yerel hareketler mevcut tek etkin tail **Edit Mesh** modifier'ında
birikir; her hareket ayrı Undo'dur. Gerçek layer TRS/origin, UV ve connectivity
korunur. Ghost giriş geometrisini korur; çıkıp girince güncel başlangıcı alır.
Noktalar üç Mesh Edit seviyesinde de görünür. Viewport sağ tık mode/seçim
eylemlerini gösterir; Mesh alt seçiminden root Delete/Group'a düşmez.

## 2. Mantıksal yüz ve uyumluluk sözleşmesi

- `MeshFaceTopology`, doğrulanmış `quadIndices` kayıtlarını tek yüz kabul eder;
  sahip oldukları iki render triangle'ını ayrıca seçilebilir yüz yapmaz. Kalan
  triangle'lar kendi yüzleridir; kapalı delik veya boş ada aralığı seçilmez.
- `StructuredGridMesh2DGenerator` yeni çıktılarda optional v1 quad metadata'sı
  üretir. İki diagonal yönü de aynı çevreyi taşır; triangle renderer değişmez.
  Eski triangle-only dosyalar aynı hash/veri ile açılmaya devam eder.
- Eski Grid yalnız korunmuş structured-grid recipe, stable ID düzeni ve bütün
  triangle bağlantıları eşleşirse düzenlemede dörtgen olarak türetilir.
  Arbitrary Delaunay triangle'ları kendiliğinden quad'a eşlenmez.
- Topoloji korunurken Edit Mesh/Smooth sonrası legacy recipe stack source'undan
  okunabilir. Açık Bake, legacy hücre bilgisini kalıcı quad metadata'sına çevirir;
  bu yeni metadata hash'e dahildir. Pin/clip bağlıysa açık kaldırma/rebind gerekir.
  Dosya açılışında otomatik Bake veya hash yenileme yoktur.
- Face ID'leri vertex kimliklerinden türetilir; sırf konum değişikliği seçimi
  kaybetmez. Topoloji hash'i, belge veya layer değişirse geçici seçim temizlenir.
  Seçim/ghost/aktif mod scene JSON ve final PNG/SVG'ye yazılmaz.

## 3. Vertex araçları

| Araç | Durum / gereken ek sözleşme |
| --- | --- |
| Move / Rotate / Scale | Mevcut Edit Mesh ile seçili vertex grubu. |
| Create Point, Delete Point | P1: yüz/kenar sahipliği, sahipsiz vertex politikası ve ID remap. |
| Merge / Weld, Break / Split | P1: tolerance, bağlantı birleştirme/ayırma ve UV seam korunumu. |
| Connect Points | P1: yalnız yüz içinde geçerli yeni kenar ve yüz bölme; bağımsız wire mesh modeli varsayılmaz. |
| Slide Point | P1: bağlı kenar parametresi, uç/branch ve çökme sınırı. |
| Smooth Points, Relax Points | P1: açık vertex hedefleri; Smooth ve Relax sayısal anlamları ayrı belirtilir. |
| Align / Distribute, Snap | Mevcut Scene/Local hizalama ve dağıtma, Grid/Vertex Snap ve geçici edit pivot’u. Kenara snap ileri geliştirmedir. |
| Pin / Unpin | Mesh pin preset'leri mevcut; seçili vertex'lerle Pin/Unpin bağlantısı P1. |
| Point Lock, Vertex Groups | P1: stable ID kümeleri, topoloji değişiminde açık tanı ve geçerli sahiplik. |
| Soft Selection | P2: falloff, etki bütçesi ve modelleme/solver ağırlık ayrımı. |
| Weight Paint | P2: bone/modifier ağırlık payload'ı ve sürümlü sahiplik. |
| Vertex Color / Alpha | P2: vertex attribute, renderer/runtime/export desteği. |
| UV Editing | P2: vertex/corner UV ve seam modeli; ortak texture yerleşimi mevcut ayrı araçtır. |

### Vertex modifier'ları

| Modifier | Durum / paket |
| --- | --- |
| Smooth | Mevcut `meshSmooth` bütün Mesh'i işler; seçili vertex kapsamı P1. |
| Relax | P1: komşuluk tabanlı, ayar ve sınır koruması tanımlı ayrı algoritma. |
| Noise, Displace, Attract / Repel, Vertex Wave, Vertex Jitter | P2: static hedef/seed/alan ve yerel birim sözleşmeleri. |
| Pin Constraint, Soft Selection Falloff | P2: constraint ve ağırlık sahipliği. |
| Wiggle, Vertex Morph, Vertex Physics | P2: zaman, seek/determinism, rest state ve gerekirse bake. |

## 4. Edge araçları

| Araç | Durum / gereken ek sözleşme |
| --- | --- |
| Move / Rotate / Scale | Mevcut Edit Mesh; seçili kenar uçları tekil vertex kümesine dönüşür. |
| Create Edge, Delete Edge, Dissolve Edge | P1: bağlı yüzleri silme ile yüzleri birleştirme ayrı komutlardır. |
| Split Edge | Mevcut. İki komşu yüz aynı yeni vertex’i paylaşır. Panel yüzde, sağ tık kenar üzerindeki konumu kullanır. |
| Subdivide Edge, Collapse Edge | Çoklu bölüm ve collapse için ayrı topoloji işlemleri planlıdır. |
| Flip Edge | Mevcut. İki komşu üçgenin oluşturduğu dışbükey alanda ortak diyagonali değiştirir. |
| Edge Slide, Edge Length | P1: komşuluk kısıtı, yerel/scene mesafesi ve dejenere yüz reddi. |
| Connect Edges, Bridge Edges, Edge Stitch | P1: açık boundary eşleşmesi, winding, delik ve manifold doğrulaması. |
| Edge Extrude 2D | P1: aynı düzlemde yeni yüzey; 3D extrusion açmaz. |
| Loop Selection, Ring Selection, Loop Cut | P2: gerçek quad komşuluğunda çalışır; üçgen/branch sınırında açık durma kuralı gerekir. |
| Mark Boundary | P1: türetilmiş dış sınır ile kullanıcı etiketi ayrı tutulur. |
| Mark Seam | P2: corner UV/seam altyapısına bağlıdır. |

### Edge modifier'ları

| Modifier | Durum / paket |
| --- | --- |
| Edge Subdivide, Edge Chamfer, Edge Offset | P1: kaynak hedefleri ve gerçek topoloji üretimi; Stroke Width değiştirme değildir. |
| Edge Smooth, Edge Relax | P1: seçili bağlı zincir, uç/branch ve seçim dışı komşu kuralları. |
| Edge Noise, Edge Wave, Edge Zigzag, Boundary Deform | P2: sınır hareketi, iç geometri yayılımı ve self-intersection koruması. |
| Edge Length Constraint, Edge Spring | P2: constraint/fizik, zaman ve bake sahipliği. |

## 5. Face araçları

| Araç | Durum / gereken ek sözleşme |
| --- | --- |
| Face Transform | Mevcut Edit Mesh; seçili yüz vertex'leri dönüşür, komşu yüzler ortak vertex'i paylaşır. Bağımsız taşımak için ileride Detach/Split gerekir. |
| Delete Face ve Fill | Mevcut. Face modunda seçili yüzler silinir. Edge modunda tek deliğin tam sınırı seçilerek doldurulur. |
| Create Face | Serbest nokta seçimiyle yüz oluşturma ileri fazdadır. |
| Split Face, Subdivide Face, Poke Face | P1: yerel yüzün komşularıyla uyumlu yeni connectivity ve UV interpolasyonu. |
| Inset Face, Extrude Face 2D | P1: gerçek planar yeni sınır/yüz; çökme ve delik kontrolü. |
| Triangulate, Triangles to Quads, Merge Faces | P1: açık kullanıcı eylemi; geçerli komşuluk ve attribute/seam eşliği gerekir. Delaunay'a otomatik quad dayatılmaz. |
| Knife / Cut | P2: kesişim, sürükleme önizlemesi, bütün komşu yüzlerin bölünmesi. |
| Flip Winding | P2: mevcut pozitif signed-area sözleşmesi sessizce ihlal edilmez; veri/renderer politikası önce belirlenir. |
| Material Assign, Face Color / Alpha, Face Material Override | P2: per-face material/attribute modeli; şu an Mesh ortak layer paint/texture kullanır. |
| UV Mapping, Face Mask, Face Selection Set | P2: yüz kimliği, seam/UV ve saklı seçim/görünürlük kayıtları. |

### Face modifier'ları

| Modifier | Durum / paket |
| --- | --- |
| Face Subdivision / Tessellation | Mevcut Mesh Subdivision Delaunay/Grid bütün girdiyi işler; seçili yüz kapsamı P1. |
| Inset, Triangulate, Face Smooth, Face Offset | P1: native hesapla aynı hedef/sınır doğrulamasını paylaşan parametrik sürümler. |
| Face Decimate | P2: geometri/UV hata eşiği, hole ve boundary korunumu. |
| Face Noise, Face Displacement, Face Morph, Face UV Warp | P2: attribute/alan ve gerekirse zaman kontratları. |
| Face Mask, Face Material Override | P2: face görünürlük/materyal veri modeli ve output parity. |

## 6. Object seviyesi

Mevcut: layer Move/Rotate/Scale, pivot, Duplicate/Instance, nesne
Align/Distribute, Convert Spline/Shape → Mesh, ortak Material/Texture ve Bake
Modifiers. Mevcut kısıtlar [dönüşüm sözleşmesindedir](../geometry-conversion.md).

Planlı: Mesh Attach/Detach/Merge Objects, Separate Islands, geometri Mirror,
Image alpha → Mesh, genel Mesh Retopology, açık Auto Triangulate, UV Unwrap,
Bind Skeleton ve kullanıcıya açık Collision Generation. Genel nesne işleminin
mevcut olması yeni vertex/edge/face işleminin uygulanmış olduğunu göstermez.

## 7. Ortak modifier sözleşmesi ve önerilen sonraki sıra

Genel `Modifier`, registry ve ordered stack korunur; Point, Edge ve Face için
ayrı runner/solver/stack kurulmaz. Mevcut Mesh kayıtları Smooth, Subdivision,
Edit Mesh ve Deformation Clip'tir. Her biri kendi ayarlarını yönetir;
Source → etkin adımlar → sonuç, Execute/toggle/reorder/remove/Bake/Undo kullanılır.
Smooth/Subdivision'ın şu an **bütün Mesh** kapsamı panelde açıkça yazılıdır;
mod değiştirmek onların hedefini sessizce değiştirmez.

**Önerilen API genişletmesi; henüz uygulanmadı:** descriptor'ın desteklediği
bileşen seviyeleri ve kayıt ayarlarında açık `{level, ids, topologyHash}` hedefi.
Seçim ancak açık Use selection ile ayara alınır; boş/eski hedef bütün Mesh'e
genişlemez. Topoloji değiştiren bir önceki adım hedefi geçersiz kılarsa yeniden
hedef seçimi gerekir. Eski kayıtta hedef yokluğu eski whole-mesh anlamını korur.

1. Temel seçim/overlay/panel, mantıksal yüzler, Edit Mesh Undo ve portable kabulü.
2. Ortak topoloji komut/sonuç-ID remap sözleşmesi; Delete Face, Split/Subdivide
   Edge, Edge Flip ve Fill. Her işlem native tek Undo ve atomik ret.
3. Weld/Split/Connect, seçili Smooth/Relax, Slide/Align/Snap/Pin; ardından
   Inset/Extrude/Bridge ve aynı hesapları kullanan temel parametrik modifier'lar.
4. Quad loop araçları, UV/seam/material/attribute; ayrı solver/zaman kararı
   isteyen fizik ve hareket modifier'ları ileri pakette.

Her dilimde hole/ada, triangle/quad, iki diagonal, source lock/clip/pin,
transformed parent, UV, seçim dışı geometri, ayrı Undo/Redo ve portable/PNG
doğrulanır. Animasyonlu modifier parametreleri bu ilk temel paketin ön koşulu
değildir. Başarısız hesap kısmi geometri veya Undo kaydı yazmaz; desteklenmeyen
araç menüde çalışıyormuş gibi sunulmaz.

## 8. Temel teslim doğrulaması — 24 Kasım 2026

Uygulama commit’i: `40f0e55a`, branch `codex/mesh2d-mesh0`.

582 test dosyasında 4.188 test, TypeScript, MCP/CLI ve Next production build
geçti. Bağımsız gerçek Chrome Mesh fixture'ı panel/shortcut, 12 quad/31 edge,
bütün modlarda vertex işaretleri, kırmızı edge/face, alt seçim sağ tıkı, tek
Edit Mesh/tek hareket Undo, sabit TRS/UV/ghost, Ctrl/Cmd+A, portable ve Bake'i
doğruladı. Edit açık/kapalı final PNG pikselleri eşleşti; gerçek viewport
görüntüsü incelendi. Spline/Mesh birleşik regresyon fixture'ında 26 grup geçti.

Eski browser assertion'ları güncel Bézier etiketi, Object seviyesinde çizim
önkoşulu ve Add/Execute düğme yerleşimine uyarlandı; uygulamanın Spline
1/2/3 anlamı değişmedi. Bu kabuller özel üretim-bileşeni fixture'larıdır; bağlı
kullanıcı sahnesindeki manuel `MESH-17` turu PASS diye işaretlenmedi.

Tekrar üretme: `scripts/perf/mesh-face-edit.mjs` ve
`scripts/perf/spline-edit.mjs`; Next hazırlama/build sırasında kapalı tutulur.
Ölçülmüş 1K/10K/50K performans veya PDF'deki ileri half-edge/UV/physics
araçlarının tamamlandığı iddia edilmez.

## 9. Temel ve ileri geliştirme paketi

| Faz | Kapsam | Doğrulama |
| --- | --- | --- |
| Temel Mesh | Delete Face, Split Edge, Flip Edge, Fill. Her işlem aynı Edit Mesh satırında ayrı Undo adımıdır. | 4×3 Grid, üçgen çifti, iç ada ve birden fazla delik, UV, kaydet/aç ve Execute. |
| Temel Spline | Bézier Pen, Freehand, Spiral, kısmi Edge Offset, Object/Edge Mirror ve Duplicate. Spline ve Mesh için bileşen hizalama/dağıtma, Grid/Vertex Snap ve geçici pivot. | Pen ile dış sınır ve delik çizme, mesh’e dönüştürme, deliğin kenarını bölme, yeni vertex’i taşıma ve iki ayrı Undo. |
| İleri | Genel n-gon, Weld/Collapse, Bridge, Loop Cut, Knife, UV seam, bileşen hedefli modifier, B-Spline, Skew/Shear, değişken genişlik, deformasyon ve animasyon. | Her özellik kendi topoloji, remap ve zaman sözleşmesiyle teslim edilir. 3D profil/katı üretimi 3D yol haritasındadır. |

`src/lib/geometry/mesh2d/edit/topologyEdit.ts` girdiyi yerel px cinsinden alır.
Kaynak değişmeden, doğrulanmış geometri döner. `makeMeshTopologyCmd` sahne,
layer ID, Edit Mesh ID ve `{kind, ids, topologyHash}` alır. Split ek olarak
`vertexId` ve 0–1 aralığının içinde bir `t` alır. Komutun `changes` alanı
eklenen/silinen bileşenleri ve eski kimliklerin hangi yeni bileşenlere
dönüştüğünü verir. Örneğin bölünen iç kenar iki kenara, komşu iki quad'ın
her biri bir quad ve bir üçgene eşlenir. Değişmeyen kimlikler kendini temsil eder.

`MeshTransformModifier` her topoloji adımından önce o ana kadarki yerel dönüşümü
uygular. Sonraki vertex hareketleri yeni topolojiye aittir. Eski kayıtlarda
`topologySteps` bulunmadığında aynı evaluator doğrudan eski dönüşümü uygular.
Pin veya deformasyon bağlantısı bulunan mesh'te topoloji işlemi gerekçesiyle
reddedilir. Boş veya eskimiş seçim sahneyi değiştirmez.

Adımlar ve beklenen sonuçlar [MESH-18 ve MESH-19 kabul senaryolarında](../releases/v0.5.0-manual-acceptance-tests.md#mesh-18--yerel-topoloji-ve-undo) yer alır.


24 Kasım otomatik kabulünde 584 dosyada 4.203 test geçti. Bağımsız Chrome
oturumunda dokulu Grid üzerinde Delete Face ve Fill sonucu hem viewport
hem PNG örneğinde kontrol edildi. Pen ile çizilen delik, dönüşüm, kenar
bölme ve yeni vertex hareketinden sonra açık kaldı. Spline Edit (26 grup),
Offset (6 grup), canlı Outline (10 grup) ve Boolean/Attach tarayıcı
senaryoları geçti. Kullanıcı sahnesinin manuel kabulü ayrı izlenir.
