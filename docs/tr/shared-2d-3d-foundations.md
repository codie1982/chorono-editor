# Chorono 2D–3D ortak temeller ve kesin sınırlar

Tarih: 17 Kasım 2026. Durum: mimari sınır sözleşmesi; tek başına uygulama
teslimi değildir. [2D ana planı](production-2d-roadmap.md) ve
[3D ana planı](production-3d-roadmap.md) ürün özelliklerini ayrı izler. Bu
belge yalnız iki hattın aynı işi ikinci kez geliştirmemesi gereken temel
sözleşmeleri ve paylaşılmaması gereken anlamları tanımlar.

## 1. Ortak kullanılacak altyapı

| Ortak sözleşme | Paylaşılan bölüm | Moda ait adapter/veri |
| --- | --- | --- |
| Kaynak ve kimlik | Stable ID, revision/hash, sürümlü serialization, clone/instance referans kuralları | 2D layer/shape/character şeması; 3D node/geometry/material/rig şeması |
| Zaman | Explicit frame ve timeline-local zaman, deterministik seek/reverse, time-range sözleşmesi | 2D property/clip değerlendirmesi; 3D clip saniyesi ve özel timeline adapter'ı |
| Komut ve geçmiş | Native command transaction, Apply/Cancel, tek undo/redo, UI–MCP aynı mutasyon yolu | Mesh2D, Character Motion ve 3D modelleme komutları kendi feature alanında kalır |
| İş ve bake yaşam döngüsü | Immutable snapshot, job ID, progress/cancel, source hash, stale, atomik commit, re-bake ve manifest sahipliği | Track, 2D rig, mesh deformation, particle/grid/surface, 3D control clip ve raster sequence ayrı typed payload/decoder kullanır |
| Asset ve portable kayıt | Stable asset ID, dependency manifest, content hash, acquire/release ve round-trip tanısı | Font/image/audio; 3D geometry/texture/environment/decoder capability payload'ları ayrıdır |
| Topoloji çekirdeği | Index/connectivity, adjacency, manifold/degenerate doğrulama, topology fingerprint ve değişmez buffer sözleşmeleri | 2D konum/UV/triangulation; 3D position/normal/tangent/UV/subdivision/skin/rest verileri açık adapter'larla bağlanır |
| Kaynak yönetimi | Admission/budget, lease, cache invalidation, dispose/cancellation, context-loss ve ölçüm sözleşmeleri | Canvas2D yüzeyleri ile WebGL texture/buffer/render target sahipleri ayrı backend'lerdir |
| Çıktı ve capability | Canonical frame isteği, destek bildirimi, açık fallback/unsupported, portable kaynak ile final çıktının ayrımı | 2D renderer katman yüzeyini üretir; 3D renderer şeffaf yüzey üretip 2D compositor'a teslim eder |
| Tanı ve doğrulama | Structured diagnostic, fixture, gerçek kare karşılaştırması ve eski proje regresyonu | Geometri, rig, solver ve renderer'a özel invariant/kabul testleri kendi alanındadır |

Bu ortak katmanlar somut 2D ve 3D tüketicilerden çıkarılır. Yalnız gelecekte
kullanılabilir düşüncesiyle genel bir motor, her şeyi taşıyan scene tipi veya
zorunlu workspace paketi oluşturulmaz. Ortak sözleşme küçük kalır; platform,
React, DOM, Canvas ve Three.js ayrıntıları adapter'larda tutulur.

## 2. Kesinlikle ortak modele dönüştürülmeyecek yapılar

| Alan | 2D sahibi | 3D sahibi | Yasaklanan karışım |
| --- | --- | --- | --- |
| Geometri ürünü | `Mesh2D`: spline/grid'den üretilen sabit üçgen topolojisi ve Blob gibi ayrı değişken yüzeyler | Editable 3D mesh, modifier, sculpt, subdivision ve skin topolojisi | Mesh2D'yi “Edit Poly 2D” yapmak veya 3D modelleme komutlarını 2D nesneye açmak |
| Transform | 2D affine, anchor ve kompozisyon piksel uzayı | TRS/quaternion/matris, kamera ve projection | Eski 2D transformlara genel `z` eklemek ya da cast ile iki vektör tipini eşitlemek |
| Render | Chorono 2D evaluator/renderer/compositor | Three.js/WebGL 3D dünya ve şeffaf çıktı yüzeyi | Tek renderer'ın iki backend'in bütün capability'lerini sağladığını varsaymak |
| Karakter ve IK | Katman/sprite tabanlı 2D rig; ilk solver analitik iki kemikli IK | Skeleton, skin weight, bind/rest, corrective morph ve 3D IK | Solver, joint limiti veya pose payload'larını yalnız adları aynı diye paylaşmak |
| Fizik ve kumaş | Düzlemsel rigid/fluid; Mesh2D üzerinde yerel derinlikli kumaş görünümü | Gelecekte ayrıca onaylanacak hacimsel 3D solver | 2D solver cache'ini 3D dünya simülasyonu saymak; Rapier adapter'ını 3D ürün kapsamı yapmak |
| Kamera, ışık, materyal ve depth | 2D layer/compositor efektleri | 3D kamera/projection, PBR materyal, ışık, ortak depth | 3D tone mapping'i 2D marka renklerine uygulamak veya ayrı kutular arasında otomatik depth/gölge kurmak |
| Çalışma alanı | 2D Mode ve Render içindeki 2D Animation/Character UI | Kutulu 3D detay editörü ve aşamalı 3D Mode kabuğu | Tek canvas'a bütün 2D ve 3D araçlarını doldurmak |

IK, mesh, topology, material veya bake sözcüğünün iki planda geçmesi tek
başına aynı domain nesnesi oldukları anlamına gelmez. Paylaşım yalnız giriş,
çıkış, birim, ownership, mutation ve failure anlamları gerçekten aynıysa
küçük bir contract üzerinden yapılır.

## 3. Bağımlılık yönü

1. 2D ve 3D feature kodu birbirinin implementation ayrıntısını import etmez.
2. Ortak domain contract'ları renderer veya UI sınıflarına bağımlı olmaz.
3. Temel topoloji connectivity'si vertex konumundan ve dimensional
   attribute'lardan ayrılır; dönüştürme named adapter/converter ile yapılır.
4. Ortak job/bake orchestration sonucu yorumlamaz. Her payload kendi decoder,
   interpolator, renderer ve output compiler'ına sahiptir.
5. 3D görüntü, açık alpha/renk/profil sözleşmesiyle normal bir 2D katman yüzeyi
   olarak compositor'a girer; 2D compositor 3D scene graph'ını bilmez.
6. Portable dosyada yalnız sürümlü kaynak ve manifest tutulur. DOM/GPU
   nesneleri, runtime sınıfları ve yoğun geçici tamponlar iki modda da dışarıda
   kalır.

## 4. Ortak temel için kabul kapısı

Bir yapı “ortak” sayılmadan önce en az bir gerçek 2D ve bir gerçek 3D tüketici
aynı contract'ı uyumlu anlamlarla kullanmalıdır. Eski 2D proje 3D bağımlılığı
yüklemeden açılmalı; 3D içeren proje capability eksikliğinde sessiz veri
kaybetmemelidir. Her iki tüketicide undo/redo, save/open, random seek, stale
job, cancel, asset dispose ve desteklenen gerçek render çıktısı doğrulanır.
Ortaklaştırma bu kanıt yoksa ertelenir ve iki domain'e özel kod zorla tek tipe
dönüştürülmez.
