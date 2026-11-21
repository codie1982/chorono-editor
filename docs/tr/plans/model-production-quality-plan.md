# 3D4 — ayrıntılı model ve karakter üretimi

17 Kasım 2026 · **Kullanıcı tarafından ana plana eklenmesi onaylanmış
geliştirme planı; uygulama veya görsel kalite kabulü değildir.**

Bu belge [3D ana planının](../production-3d-roadmap.md) 3D4 aşamasının
ayrıntılı sözleşmesidir. Teslim sırası ana planda, bu aşamanın teknik ve
görsel kabulü burada izlenir. [3D entegrasyon mimarisi](../multi-mode-architecture.md)
ve mevcut kaynak/komut/asset sözleşmeleri yeniden kullanılır. 2D işleri
[2D ana planında](../production-2d-roadmap.md) kalır.

## 1. Amaç ve sabit kararlar

Kalite hedefi; sıcak pencere ışıklı bir atölyede kalın amber cam, fırçalanmış
metal, ayrıntılı yüz ve eller, kısa dalgalı saç, dokulu gömlek/önlük ve doğal
poz taşıyan stilize fiziksel 3D üretimdir. Referans kare sanat yönünü ve
ayrıntı düzeyini tarif eder; düz bir görsel üretmek düzenlenebilir mesh veya
pozlanabilir karakter teslimi değildir.

- Modeller Chorono içinde üretilir; dış model servisleri zorunlu bağımlılık
  değildir. Mevcut 3D detay editöründeki Modeling, Animation, Texture/Material
  ve Render alanları genişler. Ayrı üst düzey 3D belge modu açılmaz.
- UI ve MCP aynı doğrulanmış komutları kullanır. Her yeni araç kaynak,
  düzenleme, seçim/bounds, Undo/Apply/Cancel, portable ve render ile teslim edilir.
- Ana görünüm stilize fizikseldir; Toon ramp ve kontur isteğe bağlı kalır.
  İlk birleşik kalite GPU'da kabul edilir. CPU Toon/eski profiller korunur;
  ileri CPU malzemeleri ve GI ayrıca kabul edilir.
- Hafif önizleme ve ayrıntılı final aynı kaynak ve açık kalite profillerinden
  çıkar. Final iş önizleme mesh'ini sessizce kullanmaz; temas/poz final
  ayrıntıda da kontrol edilir. Cihaz performansı ölçülmeden FPS garantisi verilmez.
- İlk somut kabul üçlüsü **amber kavanoz + fırçalanmış metal kap + bileği
  bükülmüş kavrayan el**dir. Tam karakter öncesinde organik risk denemesi yapılır.
- Multires/skin/morph bağlandıktan sonra topoloji korunur. Yeni topoloji için
  açık model dalı ve yeniden bağlama gerekir; otomatik reprojection ilk kapsamda yoktur.

Araç altyapısı, iyi hazırlanmış başlangıç modelleri/üretim tarifleri ve render
kalitesi ayrı teslimlerdir. Birinin varlığı diğerinin kalite kanıtı sayılmaz.

## 2. Teslim sırası ve kabul kapıları

### 3D4/Q0 — mevcut temel, kaynak ve ölçüm

1. Geliştirme dalındaki model/primitive, half-edge/seçim, özel klip, PBR,
   kamera/ışık ve render bağlantılarını kod ile tarihli test/görsel kanıtlara
   bağla. Her yetenek uygulandı/kabulü eksik/plan olarak listelensin; bu
   envanter 3D0–3D3 durumunu güncellesin. Mevcut uygulamalar kopyalanmasın.
2. UI ve MCP için ortak nesne/geometri/malzeme/özel klip komut hattını kur.
   Kaynak yetkisi, revision/readToken ve tek Undo/atomik commit korunsun.
3. Ağır geometri işleri worker'da progress/cancel/stale korumasıyla çalışsın.
   Büyük asset aktarımı parçalı staging, içerik hash'i ve atomik tamamlama
   kullansın; MCP JSON isteği sınırsız binary kanalı sayılmasın.
4. Primitive, accessor, mesh/texture ve resident bütçelerini temsilî işlerle
   ölç. Asset/instance paylaşımı, hazırlık kuyruğu ve lease/cache ömrü üzerinden
   kapasite geliştirilsin; yalnız sabit limitleri yükseltmek teslim sayılmasın.
5. Sabit kamera/ışık/renk ayarlarıyla clay, wireframe, UV checker ve beauty
   karşılaştırmaları; cihaz/GPU, soğuk hazırlık, sıcak p50/p95 ve peak managed
   kaynak ölçümleri tanımlansın. Önizleme ve final bütçeleri ayrı kaydedilsin.

**Kabul:** Aynı nesne UI ve MCP'den üretilir, düzenlenir, geri alınır,
kaydedilip açılır ve aynı kaynakla renderlanır. Eksik veya bütçeyi aşan iş
boş/eksik başarılı çıktı üretmez.

### 3D4/Q1 — ayrıntılı ve düzenlenebilir geometri

- Segment kontrollü primitive, profil döndürme/lathe, extrusion ve eğri
  boyunca sweep; sweep'te profil, tilt ve taper kontrolleri.
- Edit Poly sırası: taşı/böl/bağla/sil-dissolve → weld/sınır/cap/bridge →
  extrude/inset/bevel → ileri seçim ve yüzey işlemleri. Mantıksal n-gon ile
  render üçgeni ayrı; concave yüzler ve geçersiz offset açık tanı alır.
- Modifier'lar: Mirror, Shell/Solidify, Bevel, Subdivision, Bend ve normal
  yumuşatma; crease ve destek döngüleri biçimi korur. Yüzeye bağlı kıyafet,
  cep ve dikiş için Shrinkwrap; metre temelli ölçü, hizalama ve snapping.
- Mevcut clone/instance/array sahipliğine bağlanan tekrarlı parça ve scatter;
  seed ve kaynak kimliği kayıtlıdır, her örnek ayrı mesh kopyası değildir.
- Catmull–Clark değerlendirmesi sürümü sabitlenmiş OpenSubdiv CPU/worker-WASM
  adaptöründen alınır. Derleme, iptal, bellek ve gecikme entegrasyonu erken
  ölçülür; topoloji/komut/seçim sahibi Chorono'dur. Runtime CDN bağımlılığı yoktur.

**Kabul:** Kavanozun iç/dış duvarı, kalın tabanı ve ağzı; kabın kenarı,
kalınlığı ve sapı gerçek geometriyle düzenlenebilir. Profil/boyut değişimi,
bevel/subdivision, farklı bakışlar, kesit ve portable tekrar açılış doğrulanır.

### 3D4/Q1-O — erken organik risk kapısı

Q1 sırasında küçük bir baş kontrol kafesi ve bükülen parmak oluşturulur.
Ortak mesh'in UV, subdivision, sınırlı skin/morph ve poza bağlı corrective
deformasyonu taşıdığı gösterilir. Bu minimal rig altyapısı Q2 ve Q4'te
genişletilir; paralel bir karakter motoru kurulmaz.

**Kabul:** Önden/profilden/üç çeyrek baş; düz ve bükülü parmakta siluet,
eklem hacmi, normal ve UV. Başarısızlıkta geometri temeli Q2'ye geçmeden
düzeltilir. Bu deneme tam karakter veya anatomik başlangıç modelinin kabulü değildir.

### 3D4/Q2 — ilk birleşik görsel kalite

- Image asset, texture view, sampler, material instance ve face slotları ayrı
  kimlikler taşır. Assign/Make Unique ve paylaşılan kullanım sayısı çalışır.
- UV projeksiyonu, seam/island düzenleme, unwrap ve paketleme; xatlas için
  sürümü sabitlenmiş worker adaptörü. UV dikişi render vertex'ini çoğaltabilir,
  mantıksal vertex kimliğini değiştirmez.
- Yerel doku üretimi/boyama ve yüksek ayrıntıdan düşük ayrıntıya normal/AO
  bake. Renk ve data texture yorumları, tangent yönü, mip ve swizzle açıktır.
- Aşağıdaki GPU stilize fiziksel yüzeyleri ve ışık profilini tamamla.
- Minimal beş parmaklı el/bilek rig'iyle kavrama ve bırakma; corrective ile
  eklem hacmi ve kap teması korunsun.

**Kabul:** Aynı ışıkta kavanoz + kap + bileği bükülmüş kavrayan el.
Ön/yan/üç çeyrek yakın planlar ile 6 saniye/30 FPS/180 karelik
kavrama → bilek dönüşü → bırakma hareketi gerçek final karelerde incelenir.
Tam karakter aşaması bu kapıdan sonra başlar.

### 3D4/Q3 — karakter, saç ve kıyafet üretimi

- Simetri, soft selection, referans görünümleri ve subdivision kontrol kafesi.
- Sabit topolojili multires sculpt: Grab, Smooth, Inflate, Flatten, Crease ve
  Pinch; fırça örnekleri/katmanları kayıtlı, her stroke tek Undo.
- Chorono içinde hazırlanmış kaliteli başlangıç modelleri: yüz anatomisi,
  göz kapağı/ağız edge akışı, beş parmaklı el ve deformasyon bölgeleri.
  Başlangıç modellerinin üretimi ve sanat incelemesi ayrıca teslim edilir.
- Saçta büyük ve ikincil eğri tutamları; profil/tilt/taper ve yönlü parlama.
  Kıyafette yüzeyden parça çıkarma, shrinkwrap/shell, yaka, cep, dikiş ve
  anlamlı geometrik kıvrımlar; mikro ayrıntı doku/normalde tutulur.

**Kabul:** Aynı karakter önden, profilden, üç çeyrek açıdan ve yüz/el yakın
planında tutarlıdır. Siluet, anatomi, göz/yüz, parmak ve kıyafet kaynakları
düzenlenebilir; tek güzel beauty karesi yeterli değildir.

### 3D4/Q4 — rig, corrective ve hareket

- Skeleton/bind pose; skin ağırlığı düzenleme/normalizasyon; gövde, el ve
  parmak kontrolleri; iki kemikli kol/bacak IK ve bakış hedefi.
- Göz kırpma/kaş/ağız morph'ları; göz kapağının göz yüzeyine uygun deformasyonu.
  Omuz, dirsek, bilek ve parmaklar için kayıtlı poz sürücülü corrective morph.
- Tutma/bırakmada animasyonlanabilir bağlantı ağırlığı ve world transform
  koruyan offset; gizli parent sıçraması olmaz. Poşetin sıkılması kemik/morph,
  kıyafet tepkisi skin/corrective ile oluşturulur.
- Mum parçaları instance tabanlı hareket ve bake cache kullanır. Doğrudan
  animasyon mutlak zamanda örneklenir. Geçmişe bağlı süreçlerde sabit adım,
  seed, checkpoint/bake ile aynı kareye ulaşılır; bu destek genel fizik/sıvı
  solver'ı olarak sunulmaz.
- Mevcut özel 3D timeline ve kanal sahipliği kullanılır. Ana 2D Timeline
  dış kutuyu yönetir; rig/morph kanalları yeni kayıtlı içerik kanallarıdır.

**Kabul:** Ekipmanı tut/ekle/bırak hareketinde temas, eklem hacmi ve kıyafet
korunur. Reverse/rastgele seek, soğuk/sıcak cache ve yeniden açılış aynı pozu verir.

### 3D4/Q5 — yeniden kullanılabilir üretim paketi

Kabul edilmiş model/malzeme/hareket tarifleriyle kamera ve atölye birleştirilir.
1080×1920, 30 FPS, `[0,10000 ms)` aralığında 300 kare final iş üretilir;
kontrol zamanları 0, 2.5, 5, 7.5 ve son geçerli kare 9.966… saniyedir.
Render işi kesilip sürdürülebilir; tamamlanmış dosyalar atomik yayımlanır.

Final çıktı 2D katmanına kaynak revision/hash, kamera, zaman aralığı, FPS,
boyut, material/ışık/kalite profili ve asset bağımlılıklarıyla bağlanır.
Kaynak değişince çıktı stale olur; re-bake kullanıcı düzenlemelerini korur.

**Kabul:** Portable düzenlenebilir kaynak + bağımlılıklar + tarif sürümleri
ve doğrulanmış final çıktı. 3D → final → 2D katmanı turu, kesinti/sürdürme,
Cancel ve yeniden açılış birlikte geçer.

## 3. Kaynak, bağımlılık ve tarif sözleşmeleri

### Topoloji ve korunan bağlı kaynak

Mevcut half-edge/MeshSnapshot, spline, modifier, ModelClipDraft, asset servisi
ve hazırlık/cache sözleşmeleri genişletilir. Topoloji, pozisyon, face-corner
UV/normal, material slotları ve renderer state ayrı tutulur.

Multires/skin/morph bağlanınca ilgili topoloji ve bind/rest kaynak korunur.
Kararlı ID tek başına yeterli değildir; topoloji parmak izi, rest revision'ı ve
üretici sürümü de doğrulanır. Bağımlılığın altındaki topoloji veya bağlı rest
geometriyi değiştiren komut doğrudan uygulanmaz. İzin verilen sculpt detay
katmanı, poz ve üst aşama deformasyonları çalışır; her modifier kendi uyumluluğunu bildirir.

**Yeni model dalı** özgün modeli korur. Yeni dalda kaynak değişince bağlı
sculpt/UV/skin/morph kayıtları uyumluluk durumuyla tutulur; geçersiz olanlar
etkin değerlendirmeye girmez ve final renderı durdurur. Açık kaldırma veya
yeniden üretme/bağlama gerekir. Yeni vertex'e rastgele ağırlık/UV/morph
atanmaz; ilk sürümde otomatik reprojection veya retopology yoktur.

### Üretim tarifleri ve elle düzenleme

Alt katman extrude/bevel/weld, material assignment ve weight edit gibi normal
komutlardır. Üst katman kalın tabanlı kavanoz, metal kap, dikişli önlük,
dalgalı saç ve stilize el tarifleridir. Tarif düzenlenebilir kaynak/parametre
üretir ve aynı komutları kullanır; ayrı gizli geometri motoru değildir.

Regenerate yalnız tarife ait tabanı günceller. Elle yapılan işlemler üstte
ayrı operasyon/override olarak kalır; güvenli ID eşlemesiyle yeniden
değerlendirilir. Eşleme yoksa commit durur, mevcut kaynak korunur ve Needs
Rebind gösterilir. **Bağımsızlaştır** tarif bağlantısını açıkça kaldırır.
Tarif sürümü sabittir; yükseltme fark önizlemesiyle açık bir komuttur.

### Sürüm, API ve sahiplik

- Planlanmış `Model3DData v5 / modeling v2` geometri/stack geçişi kullanılır.
  Material, tarif ve rig kendi sürümlü kaynak kayıtlarını taşır. Eski projeler
  salt açılışta yeniden yazılmaz; yeni ID/API adları bu belgede öneridir.
- Yoğun mesh, texture ve frame/cache verileri hash'li asset'tir; kaynak/Undo
  tarifleri ve referansları tutar. Three/DOM/GPU handle'ları kaydedilmez.
- MCP nesne sorguları ve `prepare_model_edit → apply_model_edit /
  discard_model_edit` UI ile aynı komutlara bağlanır. Güncel revision/token,
  gerçek önizleme, atomik commit, tek Undo, cancel/stale ve retry kuralları korunur.
- Cache kaynak/ayar hash'i, algoritma/tarif sürümü, seed ve zaman politikasını
  taşır; kaynak değişimi cache'i stale yapar. Yarım cache tamamlanmış sayılmaz.
- Worker sonucu, geometry/texture/model lease ve history sahipliği açıkça
  belgelenir; iptal/stale/error sırasında tahsisler bırakılır.

## 4. Stilize fiziksel görünüm ve renderer bağımlılığı

| Yüzey | Zorunlu profil ve kabul |
| --- | --- |
| Amber cam | İç/dış yüzey, IOR/transmission, kalınlık ve soğurma; içinde wax ve arkadaki desenle yakın plan. |
| Metal | Roughness, anisotropy ve tangent/fırçalama yönü; ışık/kamera hareketinde yönlü highlight. |
| Ten | Mikro normal, kontrollü specular, kalınlığa bağlı wrap/backscatter; ilk yaklaşım fiziksel SSS etiketi taşımaz. |
| Kumaş | Sheen, mikro normal ve gerçek ana kıvrımlar; yaka/dirsek/önlük yakın planları. |
| Göz | Ayrı kornea/iris geometrisi, kontrollü yansıma ve göz kapağı teması. |
| Saç | Eğri tutamları, tangent yönü, yönlü parlama ve tutam gölgeleri. |
| Poşet | İnce yüzey/transmission profili, katlanmış geometri ve birden çok saydam katmanın kabulü; camla aynı kalınlık varsayımı kullanılmaz. |

Image asset/view/sampler/UV ve material slotları ortak; desteklenen shader
profili backend'e özeldir. Opacity camın yerine geçmez. Stilize fiziksel
profilin yumuşak ışık geçişleri ana görünüm; Toon ramp/outline isteğe bağlıdır.

İlk GPU kabulü doğrudan ışık, environment yansımaları, dolgu ve kontrollü
gölgeyle yapılır; GI önkoşul değildir. Ortam yansıması, sahne yansıması ve
dolaylı ışık ayrı capability'lerdir. HDRI/ışık/renk ve gerekli kamera/final
özellikleri Chorono Render'ın kendi profil/queue/CLI sözleşmelerinde geliştirilir.
Bu belge renderer kodunun tamamlandığını veya bütün backend'lerde aynı özelliğin
bulunduğunu söylemez; gereken dar bağımlılıklar renderer ana planına bağlanır.

İleri CPU malzemeleri, fiziksel SSS ve GI ayrı kabul alır. Eski CPU Toon ve
GPU Toon/PBR profilleri korunur. Kaynakta ileri alan taşımak render desteği
sayılmaz; unsupported profil erken reddedilir. Aynı destek profilinde kare
eşliği, farklı backend'lerde bildirilen anlam ve görsel kalite test edilir;
CPU/GPU piksel eşitliği varsayılmaz.

## 5. Doğrulama ve tamamlanma

- **Geometri:** manifold/sınır/winding, concave yüz, bevel/inset çakışması,
  subdivision crease, UV seam, normal/tangent, ID/provenance ve Needs Rebind.
- **Kaynak:** Undo/Redo, Apply/Cancel, clone/instance, korunan topoloji/yeni
  dal, tarif yeniden üretimi ve portable çevrimdışı round-trip.
- **Görsel:** sabit kamera/ışıkta clay, wireframe, UV checker ve beauty;
  çok açılı yakın plan ve hareket. Başlangıç modelleri/tarifler ayrıca incelenir.
- **Animasyon:** skin/morph/corrective, tutma/bırakmada world transform,
  temas, rastgele seek/reverse/loop, soğuk/sıcak cache ve kaynak invalidation.
- **İş/kaynak ömrü:** cancel/stale/context loss, eksik asset, hash uyuşmazlığı,
  bozuk/yarım cache, render kesinti/sürdürme ve uzun kullanımda kaynak bırakma.
- **Performans:** cihaz/GPU/profil kaydı, soğuk/sıcak zaman, p50/p95,
  triangle/draw call, texture/render target ve peak managed bütçeler;
  önizleme/final/CPU Toon ayrı raporlanır. Limit hatası sessiz kalite kaybına dönüşmez.
- **Uygulama kapısı:** ilgili invariant ve adapter testleri, gerçek browser
  ve render kareleri, `npm test`, `npm run mcp:build`, Next sunucu kapalıyken
  `npm run build`. Renderer değişikliklerinde o deponun gerekli kontrolleri
  ayrıca çalışır. MCP değişince canonical skill/capability belgeleri eşlenir.

Her alt aşama kendi kanıtıyla kapatılır. UI, MCP, portable kaynak ve gerçek
render birlikte çalışmadan tamamlandı işareti verilmez. Bir özelliğin veya
araç listesinin tamamlanması, referans görsel kalitesinin kabulü değildir.

## 6. Kapsam dışı ve başvuru kaynakları

Tam kumaş/sıvı veya genel rigid body solver'ı, otomatik retopology/reprojection,
bağımsız 3D belge modu ve GameEngine bu programda yoktur. Dar 3D final işi ve
2D katman bağlantısı genel 2D canonical export/çoklu format fazını kapatmaz.

Modelleme ve PBR için mevcut geliştirme dalı sözleşmeleri ile
`Chorono_Poly_Edit_5_Mod_Algoritmalari_v1` ve
`Chorono_PBR_Material_Texture_Teknik_Mimari_v1` şartnameleri uygulama öncesi
repo dokümanlarında karşılanır; özel disk yolu/sohbet geçmişi bakım için gerekli
olmaz. Onaylanmış sözleşmelerle çelişen ad/sürüm değişimleri açık migration alır.

- [OpenSubdiv — subdivision değerlendirmesi ve entegrasyon sınırı](https://opensubdiv.org/docs/intro.html)
- [xatlas — UV chart/paketleme, progress ve cancellation API](https://github.com/jpcy/xatlas)
- [Three.js MeshPhysicalMaterial — anisotropy, transmission, thickness, sheen](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
