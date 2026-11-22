# Öneri: 3D modifier stack altyapısı ve Modeling arayüzü

16 Kasım 2026 · **Edit Mode seçim altyapısı uygulanmıştır; geometri işlemleri ve kalıcı modifier stack plandır.**
İlk Polygon / Primitive dilimi çalışır: Box, Sphere, Cylinder, Cone ve Plane 3D
sahneye eklenir, seçilir, düzenlenir, kaldırılır ve v4 kaynakta saklanır.
Spline Extrusion ayrı mod olarak görünür; extrusion geometrisi, editable poly
topolojisi, Subdivision, Bend ve Smooth sonraki teslimlerdir. Desteklenmeyen
bir işlem arayüzde çalışıyormuş gibi sunulmaz.

## İki modelleme yolu, tek sonuç sözleşmesi

1. **Spline extrusion / mekanik profil:** 3D nesne kendi düzenlenebilir 2D
   spline profilini taşır; düzlem, derinlik ve yön bilgisiyle kapakları ve yan
   yüzleri olan bir mesh üretir. Açık eğriler, kapanmamış veya kendini kesen
   profiller ve delikler ayrı doğrulama/diagnostic kurallarına sahiptir. İlk
   geometri teslimi doğrusal extrusion'dır; sweep, bevel ve Boolean daha sonra.
2. **Polygon / primitive:** Box gibi parametrik ilkel şekiller mesh üretir.
   Edit Mode kaynak primitive'in üstünde çalışır; primitive ölçüleri parametrik
   kalır. İlk gerçek işlem v5/modeling v2 kaynağına ayrı Edit Poly uygulaması
   ekler. Mode'a giriş, seçim ve çıkış kaynak veya Undo kaydı oluşturmaz.

İki yol ayrı kaynak üreticileridir; ikisi de aynı sürümlü `MeshSnapshot`
(topoloji, pozisyon, corner UV, normal, bounds) sözleşmesine dönüştürülür.
**Modifier stack, render, seçim, materyal, export ve bake hattı bu noktadan
sonra ortaktır.** Kaynak türüne göre desteklenmeyen modifier açık capability
sonucu verir. Profil, primitive parametresi veya poly topolojisi değişince aynı
stack'in türetilmiş sonucu geçersizleşir. 2D editördeki spline, 3D sahneye
ancak açık bir kopyalama/dönüşüm komutuyla girer; 3D nesne kendi profilini
sahiplenir. Böylece 2D Layers paneli
3D iç nesneleri göstermez ve 2D spline düzenlemesi 3D kaynağı gizlice değiştirmez.
Profilin yerel `(u, v)` düzleminden Y-up 3D eksenlerine dönüşümü ve 2D piksel →
3D sunum birimi ölçeği açık parametrelerle tanımlanır; sessiz birim dönüşümü
yapılmaz. Mevcut `SplinePathData`, spline topolojisi ve contour/flatten yardımcıları
bir adaptör üzerinden yeniden kullanılır; 2D renderer 3D geometri üretmez.

## Sıradaki modifier altyapısı

- Modeling alanında **Polygon / Primitive** ve **Spline Extrusion** modları
  ayrıdır. Polygon primitive ekleme/kaldırma ve kaynak ayarları çalışır; spline
  modunda gerçek üretici gelene kadar açık bir boş durum vardır. Bir sonraki
  altyapı dilimi seçili nesnenin **Base object → Modifier stack** düzenini kurar.
  Stack base'den yukarıya kayıtlı dizi sırasıyla işlenir; node grafı yerine
  numaralı liste kullanılır.
- Her satır için ad/tür, etkinlik, genişlet/daralt, parametre bölümü, taşıma,
  silme ve destek durumu için ortak arayüz kurulur. Açık satır ve seçim geçici UI
  durumudur. Parametre kontrolleri kayıtlı tür şemasından üretilir; gerçek tür
  kaydedilene kadar sahte property veya etkisiz bir modifier sunulmaz.
- Ekleme, parametre güncelleme, etkinleştirme, yeniden sıralama ve silme
  işlemlerinin doğrulama, komut ve yerel Undo/Redo sözleşmeleri kurulur. Aynı
  değişiklik, Apply & return ile ana geçmişte tek Undo adımı olur; Cancel kaynak
  belgeyi değiştirmez. İlk üretim arayüzünde eklenebilir modifier listesi,
  kayıtlı gerçek tür yoksa boş durum gösterir. Komutlar test kayıtlarıyla uçtan
  uca sınanır.
- **Satırı daraltma** yalnız property bölümünü kapatan UI işlemidir. **Collapse
  stack** ise hesaplanmış sonucu yeni bir base mesh'e dönüştüren tahribatlı
  işlemdir. İkisi ayrı adlandırılır. Collapse/merge komut kontratı ve UI eylem
  yeri bu aşamada hazırlanır; gerçek bake dönüşümü yokken butonlar gerekçesiyle
  pasiftir. Kaynağı sessizce düzleştiren veya no-op yapan bir eylem olmaz.

## Kaynak ve sürümleme

Mevcut `Model3DData` v1/v2/v3 aynen okunur ve sırf editör açıldı diye
yükseltilmez. İlk kalıcı primitive değişikliği açık v4 yükseltmesidir.
**Uygulanan** `modeling` v1 yalnız primitive kayıtlarını taşır. Spline ve stack
eklendiğinde kaynak yeniden sürümlenecek; eski v4 okuyucu bunları sessizce
atmayacaktır. Onaylanan sonraki kaynak ilişkisi:

```text
model3d v4 (bugün)
  modeling v1
    objects[]: stable object id, name, geometry (Box/Sphere/Cylinder/Cone/Plane), placement, color

model3d v5 (öneri; stack ve spline eklendiğinde)
  mevcut asset/content, kamera, ışık ve iç klip alanları
  modeling v2
    objects[]: stable object id, name, placement, source
      source = splineExtrusion(profile, plane, depth, unitScale)
             | primitiveMesh(kind, typed params)
             | editablePoly(topology, positions, attributes)
    definitions[]: kind, tool version, capability and parameter schema reference
    instances[]: stable id, definition kind/version, typed parameters
    applications[]: stable id, authored object id, instance id, enabled, ordered operations[]
      operation: stable id, tool version, mode, stable selection ids, parameters,
                 input topology fingerprint, external references and optional seed
```

İlk Edit Mode yalnız authored Box, Sphere, Cylinder, Cone ve Plane için çalışır.
Imported içerik için hedef, mevcut instance ID ve revision-bound node ID ile
doğrulanır; authored spline ve polygon nesneler kendi kalıcı object ID'lerini
kullanır. Imported içerik iki authored modelleme yolundan biri sayılmaz;
uyumlu statik mesh için stack bağlama ayrıca capability ister. `object.id` ve
`modifier.id` taşıma, Undo, clone ve portable save/load boyunca sabit kalır.
Kaynakta Three nesnesi, GPU buffer, üretilmiş
mesh veya UI daraltma durumu bulunmaz. Eski v3 okuyucu v4'ü açıkça reddeder;
bilinmeyen modifier türü veya geçersiz parametre sessizce atılmaz. v4 geçişi
asset byte'larını, imported node/material override'larını, klipleri ve dış 2D
kutu transform'unu korur.

## Sözleşme ve modül sınırları

| Sahip | Bu aşamadaki görev |
| --- | --- |
| `src/lib/model3d/modeling/poly/primitiveSource.ts` | Bugünkü v4 primitive tipleri, saf ekle/kaldır/güncelle, ID/boyut doğrulaması |
| `src/lib/model3d/modeling/poly/PrimitiveScene.ts` | Box/Sphere/Cylinder/Cone/Plane mantıksal snapshot'ından türetilen Three buffer'ı, cache ve dispose |
| `src/lib/model3d/modeling/source` | Gelecek stack/spline kaynak sürümü, hedef ve parametre doğrulaması |
| `src/lib/model3d/modeling/stack` | Saf liste komutları; değişmeyen input, kararlı sıra/ID, işlem sonucu ve hata tanısı |
| `src/lib/model3d/modeling/registry` | Modifier tanımı ve typed property şeması; ayrı değerlendirme capability'si |
| `src/lib/model3d/modeling/evaluation` | Sıralı yürütücü kontratı, unsupported/failed sonucu, cache anahtarı ve yaşam döngüsü arayüzü |
| `src/lib/model3d/modeling/spline` | İleride `SplinePathData` profili → mesh dönüştürücüsü; 2D topolojiyi adaptörle kullanır |
| `src/lib/model3d/modeling/poly` | İleride primitive → mesh ve editable poly dönüştürücüleri; vertex/face topolojisi ayrıdır |
| `src/components/detail/model3d` | Modeling ağacı, stack listesi, property bölümleri, erişilebilir kontrol ve hata gösterimi |

Metadata/şema ile geometri değerlendirmesi ayrı kontratlardır. Bir tür ancak
gerçek evaluator, kaynak uyumluluğu ve render desteği kayıtlıysa eklenebilir.
Yürütücü etkin satırları listedeki sırada çağırır; bilinmeyen/uyumsuz türde
önizleme ve export sessizce orijinal mesh'e düşmez, açık capability hatası
verir. Testler için kullanılan kimlik/pass-through evaluator üretim türü olarak
görünmez. Uygulanan `meshSnapshot.ts`, primitive'den kararlı vertex/edge/face
ID'leri, half-edge twin ilişkisi ve face-corner UV/normal payload'ı türetir.
Render üçgenleri edit kenarı değildir. `meshTriangulation.ts` ve
`PrimitiveRenderGeometry.ts` render buffer'ını aynı snapshot'tan türetir;
`PrimitivePolyView` Three kamera ve nesne matrisini yalnız picking/projection
adaptörü olarak kullanır. Gelecek concave Edit Poly yüzleri için ayrı
triangulation stratejisi gerekir.

Mevcut `ModelClipDraft` ve detay editörünün yerel komut geçmişi genişletilir.
`ModelComposition`, `ModelAssetService` ve 2D compositor sözleşmeleri korunur.
Başka sistemlerin v4 kaynağı yanlışlıkla v3'e çevirmemesi için parse,
validation, clone, draft Apply, Undo, MCP ve portable save/load girişleri aynı
sürüm kuralına bağlanır. Desteklenmeyen v4 kaynak için açık hata, kısmi kayıt
yerine tercih edilir.

## Collapse ve birleştirme hazırlığı

Bu planda **birleştirme**, seçili **ardışık modifier aralığının** tek bake
sonucuna dönüştürülmesi olarak tanımlanır; ayrı 3D nesneleri birleştirme değildir.
Stack collapse tüm etkin aralığı base mesh'e bake eder. Her iki işlem için
aynı hazırlık hattı öngörülür: hedef/revision ve geometri bütçesi doğrulaması,
deterministik değerlendirme, yeni mesh/asset sahipliği, atomik yayın ve eski
kaynakların bırakılması. Yerel Undo önceki source kaydını geri getirir;
oluşturulan mesh kaynağının ömrü history tarafından yönetilir. Başarısız veya
iptal edilen bake mevcut stack'i ve önizlemeyi korur.

Modifier stack arayüzü eklendiğinde bake edilebilir snapshot üreticisi henüz
yoksa **Collapse stack** ve **Merge selected modifiers** eylemleri görünür fakat
devre dışıdır; erişilebilir yardım metni eksik capability'yi söyler. Satırın
UI daraltması, sıralama ve Undo/Redo hazırlığı çalışır. İlk gerçek modifier ve
mesh adaptörüyle bu iki eylem ayrı kabul kapısından geçirilir.

## Teslim kapıları

### 16 Kasım 2026: Edit Mode seçim dilimi

`ModelDetailWorkspace` viewport seçimini yerel React state olarak tutar. Viewport ve
Scene Explorer nesne menüsündeki **Edit Mode** yalnız tek, görünür ve donmamış
authored primitive'de açılır; Modeling alanı ve Properties > Modifiers sekmesi
açılır. Object, Vertex, Edge, Border, Polygon ve Element modları kullanılır.
Viewport `ModelInspector.poly` üzerinden CSS-pixel projection/picking yapar;
Box'ın GPU üçgen diyagonali bir edit edge değildir. Shift/Ctrl ekler, Alt
çıkarır; boş yere tıklama seçimi temizler. Seçim sayısı ve tek bileşen ölçüsü
salt okunurdur. Ölçümler nesnenin **yerel metre uzayında** hesaplanıp panelde
seçili cm/in/px/m birimi ve alan için kare birim etiketiyle gösterilir;
nonuniform scale olsa bile yerel kalır. Dünya ölçüleri Object sekmesindedir.
Mode'a giriş, viewport seçimi ve çıkış sahne verisini/Undo'yu değiştirmez.
Properties'teki stack bu yüzden yalnız parametrik base'i ve boş modifier
durumunu gösterir. **Bu dilimde Edit Poly geometri komutu, v5 yazıcısı ve bake
yoktur.**

İlgili kod: `src/lib/model3d/modeling/poly/meshSnapshot.ts` (yerel metre,
half-edge bağlantısı, corner UV/normal), `meshTriangulation.ts` ve
`PrimitiveRenderGeometry.ts` (türetilmiş GPU buffer), `PrimitivePolyView.ts` (perspektif ve
ortografik seçim), `editSelection.ts` (sınır/element/seçim kümesi),
`src/lib/model3d/modeling/stack/contracts.ts` (gelecek modifier kayıt ve
değerlendirme sözleşmeleri), `src/components/detail/model3d/ModelEditPolyPanel.tsx`
ve `ModelPolyOverlay.tsx`. `PrimitiveScene` snapshot'ı ve render buffer'ını
geometri imzasına göre önbellekler; nesne silinince veya geometri değişince bırakır. GPU geometri ve
material ayrı adaptörün sahipliğindedir. Çalışan örnek: Box ekle → sağ tık
Edit Mode → Vertex seç → görünür köşeye tıkla → sağ panelde koordinatı oku →
Escape/Exit Edit Mode. Kaynak hâlâ v4/modeling v1'dir.

### Primitive üreticisi ve kararlı kimlik

Primitive'ler **ortak parametrik üreticiden mantıksal polygon topolojisi**
üretir; render buffer'ları bu topolojinin face-corner verisinden türetilir.
Render vertex kopyaları (UV dikişi veya sert normal sınırı) geometrik vertex
kimliğini değiştirmez. Renderer buffer'ından edit topolojisi çıkarılmaz.
Kapalı Sphere ve Cylinder'da UV/normal dikişleri Border oluşturmaz. Box 8
vertex/12 gerçek edge/6 quad face taşır; render fan diyagonalleri gerçek edge
listesine girmez.

| Kaynak değişikliği | Kimlik ve yeniden değerlendirme kuralı |
| --- | --- |
| Box genişliği, Sphere yarıçapı ve topolojiyi koruyan ölçü | Kaynak primitive ve üretici sürümü aynıysa vertex/edge/face ID'leri korunur; konumlar yeniden hesaplanır. |
| Segment sayısı veya kaynak türü değişimi | Topoloji farklıdır; provenance ile güvenli eşleme aranır, bulunmazsa geçici seçim sıfırlanır ve kalıcı işlem Needs Rebind verir. |
| Portable dosyayı yeniden açma | Aynı kayıtlı kaynak + aynı üretici sürümü aynı topolojiyi ve kimlikleri üretir. RNG veya storage index'i kimlik olamaz. |
| Üretici algoritması değişimi | Yeni üretici sürümü, açık migration ve eski sürümün okuma/değerlendirme kararı gerekir; v4 için üretici sürümü örtük `1`dir. |

v4'te segment sayıları sabittir (Sphere 24×16, Cylinder/Cone 24); ilk teslimde
segment kontrolü yoktur. Parametrik segment ayarı geldiğinde sürümlü kaynak
alanı açılacak. Mantıksal kimlikler şimdi deterministiktir; üretici sürümü
topoloji parmak izine dahildir.

### Edit Mode yaşam döngüsü ve seçim sınırı

| Olay | İlk teslim davranışı |
| --- | --- |
| Escape veya Exit Edit Mode | Mod kapanır, alt nesne seçimi temizlenir; kaynağa ve Undo'ya dokunulmaz. Escape önce Edit Mode tarafından tüketilir, detay editörünü kapatmaz. |
| Nesne silinir, gizlenir, dondurulur veya izolasyonda görünmez olur | Edit Mode kapanır; geçersiz seçim tutulmaz. Kaynak komutu varsa kendi Undo kuralıyla çalışır. |
| Başka 3D sahne açılır | Detay bileşeni yeni session ile kurulur; eski sahnenin geçici seçimi taşınmaz. |
| Undo/Redo ile primitive kaynağı değişir | Aynı üretici/topoloji ve ID varsa seçim korunur; nesne kaybolur veya topoloji parmak izi değişirse mod kapanır. |
| Modeling'den Animation/Render/Texture alanına geçilir | Edit Mode kapanır; başka çalışma alanında alt nesne picking'i sürmez. |
| Başka nesne Scene Explorer'dan seçilir | Önceki Edit Mode kapanır; nesne seçimi ve alt nesne seçimi birleşmez. Viewport Edit Mode sırasında başka nesneyi pick etmez. |

Viewport seçimi ve etkin mod dosyaya yazılmaz. **Commit edilen geometri
işleminin modu ve seçili kararlı kimlikleri ise operasyon kaydında kalıcıdır**;
yeniden açılışta aynı işlemi üretmek için zorunludur.

### Edit Poly uygulamasının seçimi, Commit ve yeniden bağlama

Yeni işlem, stack'te **açıkça etkin seçilmiş Edit Poly uygulamasına** eklenir.
Etkin uygulama yoksa yalnız ilk **başarılı, geometriyi değiştiren Commit**
v5/modeling v2 terfisini ve yeni uygulamayı atomik olarak oluşturur. Oturum
sınırı kalıcılık kuralı değildir. Dosya yeniden açıldığında hedef uygulama
stack satırından seçilir; UI oturumunu hatırlamak gerekmez. Cancel, hata veya
etkisiz/no-op işlem kaynak sürümünü yükseltmez, boş modifier yaratmaz ve Undo
adımı eklemez. Parametrik primitive base olarak kalır.

Önceki/alt aşamanın çıktısı değişip sonraki operasyonun kayıtlı seçim kimliği
provenance ile güvenle eşlenemiyorsa **o operasyon ve ona bağımlı sonraki
operasyonlar durur**. Son geçerli aşama editörde `Needs Rebind` tanısıyla
gösterilir; kullanıcı yeni seçimi açıkça onaylayarak bağlar. Render/export
eksik zinciri sessizce son geçerli mesh olarak kullanmaz; açık capability/
değerlendirme hatası verir. Bütün işlemler dizide kayıtlı sırayla yürütülür.

### Kabul testlerinin teslimlere ayrılması

**İlk teslim:** Box 8/12/6; Sphere/Cylinder UV seam veya hard normal nedeniyle
yanlış Border oluşturmama; aynı topolojide boyut değişince ID kararlılığı;
perspektif/ortografik picking; görünür/donmuş/izole nesne kuralları; test
düzeyinde açık yüzey ve iki bağlantısız parçalı fixture ile Border/Element;
mod açma/seçim/çıkışta Undo ve kaynak değişmemesi; portable yeniden açılışta
deterministik primitive snapshot; gerçek tarayıcı görüntüsü.

**Geometri aşamaları:** İki quad Remove–Delete farkı, geometri Commit/Cancel
Undo'su, v4→v5 migration, işlem replay'i ve Needs Rebind durumları ilgili
algoritma tesliminin kabulüdür. İlk teslimde bunların fixture ve sözleşmeleri
hazırlanır; çalışan geometri eylemi gibi sunulmaz.

### Edit Poly algoritma ana planı

Kaynak şartname `Chorono_Poly_Edit_5_Mod_Algoritmalari_v1 (2).docx` içindeki K01–D04
kartlarıdır. Bu kopyanın metni önceki `Chorono_Poly_Edit_5_Mod_Algoritmalari_v1.docx`
ile aynıdır. Uygulamaya geçmeden önce aşağıdaki kabul kuralları her araç için
aynı kalmalıdır:

- **Topoloji:** Vertex, half-edge (origin/next/prev/twin/face/edge), edge,
  face ve face-corner UV/normal ayrı kimlikler taşır. Editable edge yalnız
  mantıksal topoloji edge'idir. N-gon render için üçgenlense de gizli diyagonal
  edit edge olmaz. Her değişimde manifold, winding, dejenere yüz ve açık sınır
  kontrolü yapılır. Açık boundary vertex için giriş/çıkış tutarlılığı aranır.
- **İşlem çıktısı:** Immutable mesh, ID provenance/remap, seçim kimlikleri,
  değişen kanal maskesi ve tanılar üretilir. İşlem kaydı tool sürümü, mod,
  seçim, parametre, giriş topoloji parmak izi ve varsa dış referans/seed taşır.
  Kaybolan ID rastgele storage index'ine eşlenmez; güvenli eşleme yoksa
  **Needs Rebind** tanısı verir.
- **Önizleme:** Her pointer güncellemesi işlem başlangıç snapshot'ından saf
  hesaplanır. Commit tek yerel Undo adımıdır, Cancel kaynak/önbellek sahipliğini
  bırakır. Değişen aşamadan yukarısı dizi sırasıyla yeniden hesaplanır.
  Viewport, çıktı ve export aynı değerlendirilmiş mesh sonucunu tüketir.
- **UV/material/normal:** UV ve normal face-corner sahibidir; topolojik weld
  UV dikişini kendiliğinden birleştirmez. Yeni yüzler deterministik material,
  smoothing ve UV politikası alır; normal/tangent/bounds/triangulation türetilir.
  Remove mümkünse incident yüzleri tek mantıksal yüze çözer; Delete ilgili
  yüzleri kaldırıp boundary oluşturabilir.

| Aşama | İşlem kartları | Kabul örnekleri |
| --- | --- | --- |
| 1 — Temel | K01 Split Edge/Face, K02 Dissolve/Contract, S01 Picking, V01 Remove/Delete, V03 Connect, E01 Insert Vertex, E02 Remove, E03 Delete, G01 Move | İki quad Remove ile tek n-gon; Delete ile delik; kararlı ID, manifold, Undo ve portable reload |
| 2 — Dikiş/sınır | K03 Separate Fans/Boundary Walk, V02 Break, V05–V06 Weld/Target Weld, E04 Split, E07 Weld, B01–B04 Border/Cap/Bridge, G02 Attach/Detach | Açık tüp Cap, yasak Target Weld atomik ret, UV seam korunumu |
| 3 — Yüz üretme | V07–V08 Chamfer/Extrude, E05–E06 Extrude/Chamfer, E08–E09 Connect/Bridge, P01–P06 Extrude/Inset/Outline/Bevel/Bridge | Grup extrusion iç kenara yan yüz eklemez; concave inset çakışma tanısı; materyal aktarımı |
| 4 — Kesme/yön | P07 Hinge, P08 spline extrusion, G03–G08 Cut/Slice/QuickSlice/Flip/Turn | Concave yüz, dönüşüm matrisleri ve Flip–Turn ayrımı |
| 5 — Kalite/hız | S02–S08 seçim/soft, G09–G14 Planar/Relax/Tessellate/MSmooth, A01–A03 UV/normal, D01–D04 Paint, worker/cache | Tam hesap eşdeğerliği, brush tek Undo, ölçülmüş kaynak bütçesi |

Kart numaraları şartnamedeki adları izler; uygulama sırası tablodaki aşamadır.
Araçlar yalnız evaluator, mod ve seçim önkoşulları sağlandığında etkinleşir.
Varsayılan seçim culling'i ile backface etkisi ayrı ayardır. Loop/Ring belirsiz
kutup veya n-gon üzerinde kendiliğinden devam etmez. Strict-diameter Weld,
link-koşullu Target Weld, split fan ayrımı, offset çakışması ve brush örnekleme
politikaları ilgili işlem sürümünde açıkça test edilir. Autodesk arayüzü
davranış referansıdır; sayısal algoritmalar Chorono sözleşmesidir.

| Kapı | Tamamlanma kanıtı |
| --- | --- |
| P0 — polygon ilk dilim | v1–v3 değişmeden okunur; v4 Box/Sphere/Cylinder/Cone, ekle/kaldır/property, pick/render, portable save/load, yerel/ana Undo ve eski okuyucunun açık reddi |
| A0 — sonraki kaynak | Spline/stack için yeni kaynak sürümü; iki aile ve stack parse/validation, clone, eski okuyucunun açık reddi |
| A1 — komutlar | Test türleriyle ekle/parametre/etkinlik/taşı/sil, kararlı ID, sıralı yürütme, unsupported tanısı ve Undo/Redo |
| A2 — Modeling UI | İki mod korunur; spline gerçek üretici gelene kadar boş durum gösterir. Stack için satır genişlet/daralt, klavye/focus, property şeması, komut akışı, Apply/Cancel |
| A3 — bake hazırlığı | Collapse/merge capability, atomik komut ve history/resource yaşam döngüsü kontratı; pasif UI için açık gerekçe |
| A4 — entegrasyon | MCP/skill/capability metinleri gerçek destekle eşit; `npm test`, `npm run mcp:build`, `npm run build`, gerçek tarayıcı kontrolü |

## Sonraki teslimler

1. **Spline extrusion teslimi:** 3D içinde sahiplenilen spline profilinin
   çizim/düzenleme akışı, kapalı profil ve delik doğrulaması, doğrusal extrusion,
   kapak/yan yüz normalleri, UV, seçim, bounds ve gerçek render/export. İlk
   desteklenmeyen spline combine mode'ları açık diagnostic ile reddedilir.
2. **Editable Poly teslimi:** Parametrik primitive üstünde Edit Poly uygulaması;
   vertex/edge/border/polygon/element işlemleri sıralı alt adımlar olarak yazılır.
3. **Geometri modifier'ları:** Subdivision (topoloji artırma), Bend (konum
   bükme), Smooth (açı eşiğiyle normal yumuşatma) ayrı stratejiler ve property
   şemaları olarak eklenir. Bunlar bu altyapı tesliminin kabul koşulu değildir.
4. **Bake:** Collapse stack ve seçili aralığı birleştirme, gerçek snapshot →
   kalıcı mesh dönüştürücüsü, bütçe ve Undo kaynak ömrüyle etkinleştirilir.
5. **Genişleme:** Uyumlu imported statik mesh'ler ve modifier animasyonu ayrı
   capability/versiyon kararlarıyla açılır; skinned/morph glTF için destek
   varsayılmaz.
