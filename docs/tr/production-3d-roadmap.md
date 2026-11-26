# Chorono 3D — geliştirme yol haritası

Tarih: 17 Kasım 2026. Durum: plan; bu belge yeni bir uygulama teslimi değildir.
Bu plan, eski [birleşik 2D/3D sırasındaki](plans/geometry-material-boxed3d-sequence.md)
3D işleri ile [3D entegrasyon mimarisini](multi-mode-architecture.md) ve
önceden CFX10–CFX11 olarak kaydedilen compositing/kamera kapsamını tek yerde
izler. [2D ana planı](production-2d-roadmap.md) yalnız 2D üretim işlerini izler.
Game Mode eş düzey ana mod olarak
[kendi ana planında](game-engine-mode-roadmap.md); 2D, 3D, Game ve Render
modlarının ortak sırası ise [dört ana mod planında](product-mode-master-plan.md) izlenir. İki belgeye
ayırmak onaylanmış planlar arası uygulama önceliğini veya bir
özelliğin tamamlanma durumunu kendiliğinden değiştirmez.
Bu teknik 3D planındaki geometri/UV/material/rig-ready asset işleri
[3D Mode'a](3d-modeling-roadmap.md), clip/pose/camera/hareket işleri
[Render Mode'a](render-mode-roadmap.md) ürün olarak açılır.

**17 Kasım 2026 kullanıcı kararı:** Ayrıntılı yerel model ve pozlanabilir
karakter üretimi, **3D4'ün genişletilmiş geliştirme aşaması** olarak bu ana
plana eklendi. 3D hattındaki sıradaki ana çalışma budur; gereken mevcut temel
açıkları önce 3D4/Q0'da doğrulanır. [3D4 alt planı](plans/model-production-quality-plan.md)
araçları, üretim tariflerini, GPU kalite kabulünü ve teslim kapılarını tanımlar.
Bu kayıt bir uygulama veya görsel kalite kabulü değildir.

## 1. Ürün kapsamı ve sınırlar

İlk 3D ürün, **2D kompozisyon içindeki düzenlenebilir kutulu 3D katmandır**.
Model ve kamera kendi 3D uzayında değerlendirilir, şeffaf yüzeye çizilir ve
mevcut 2D katman yığınına kompozitlenir. 2D sahnenin saati, timeline'ı, kaynak
kimlikleri, komut/undo, asset ve export sözleşmeleri yeniden kullanılır. Eski
2D projeleri, 3D bağımlılığı yüklemeden açılabilmelidir.

Bu planın aktif işleri dört mode kararındaki 3D Mode'un bütün bağımsız kabuğunu veya Game Mode'u,
serbest 3D rigid body/kumaş/sıvı solver'ını ve 2D sahnedeki bütün nesnelerin
ortak bir 3D dünyaya dönüştürülmesini içermez. 3D Mode ürün kararı kesindir;
ilk implementation mevcut kutulu 3D detay editörü ve ortak 3D çekirdek üzerinde
başlayabilir. Bağımsız descriptor/kabuk, serializer ve lifecycle ihtiyacı
[mimari belgede](multi-mode-architecture.md) tanımlanan kabul kapısıyla eklenir.
2D kumaşın yerel derinlikli dalgalanması ve düzlemsel sıvı/fizik işleri
[2D planında](production-2d-roadmap.md) kalır.

3D4; mevcut kutulu 3D detay editörünün Modeling, Animation, Texture/Material
ve Render alanlarında yerel üretimi genişletir. Düzenlenebilir model,
subdivision/sculpt, UV/malzeme, skin/rig/IK, corrective morph ve üretim tarifleri
bu aşamanın açık kapsamıdır. UI ve MCP aynı doğrulanmış komutları kullanır.
İlk kalite profili GPU'da stilize fiziksel görünümdür; hafif önizleme ve
ayrıntılı final aynı kaynaktan türetilir. CPU Toon korunur; ileri CPU
malzemeleri ve GI ayrı kabul alır.

## 2. Güncel durum ve planlar arası sıra

12 Kasım [3D öncesi kapı kabulünde](plans/pre3d-completion-audit.md) input
expression A1–A5, V6/E−1.7 ve dar source/frame/resource/capability sözleşmeleri
tamamlandı. Bu kabul **3D katmanı uygulamadı**. Bu tarihsel başlangıç,
sonraki geliştirme dalının tamamlanma durumu olarak kullanılmaz. 17 Kasım
incelemesinde 3D geliştirme dalında primitive/topoloji/seçim, temel PBR,
kamera/ışık ve özel 3D timeline altyapıları bulundu; bu ana plana eklenmeleri
tam ürün kabulü sayılmaz. 3D4/Q0, kod ve tarihli test/görsel kanıtlarını
eşleyerek 3D0–3D3'ün durumunu ve gereken açıkları kaydeder; var olan
uygulamalar yeniden yazılmaz.

Önceden onaylanan birleşik sırada ilk kutulu 3D dilimi, o günkü 2D geometri/UV
işinden önce; ileri kutulu 3D ise ondan sonra yer alıyordu. Bu ifade yalnız
tarihsel planlar arası sıradır. Güncel 2D geometri ürünü genel Poly editor değil,
`Mesh2D/spline-to-mesh` altyapısıdır ve 3D Edit Poly kapsamına dönüşmez.
Planlar arası sıra değişirse iki ana planın teslim durumu ve bağımlılıkları
birlikte güncellenir.
CFX10–CFX11, 2D CFX1–CFX9'un ilgili video/tracking/kompozisyon temeli ve
mevcut serinin birleşik kabulünden sonraki ayrı ileri fazdır.

17 Kasım kullanıcı kararı, **3D hattında** 3D4'ü sıradaki ana çalışma olarak
önceliklendirir. 3D4/Q0'da saptanan zorunlu kaynak/komut/zaman/render açıkları
kapatıldıktan sonra modelleme → ilk birleşik kalite kabulü → karakter →
hareket → üretim paketi sırası izlenir. 21 Kasım dört mode kararı Game Mode'u
ürün düzeyinde öne alır; minimum ortak proje çekirdeği ve Game teknik dikeyi
3D4 ile paralel ilerleyebilir, fakat 3D hattının kendi Q0–Q5 sırasını yeniden
düzenlemez. Bu karar, 2D işlerinin güncel Mesh2D → BakeService → fizik ve
sonraki sırasını değiştirmez; Character Motion kendi karar kapılı backlog'unda
kalır. 3D4'ün dar final
render/2D katman bağlantısı, genel 2D canonical export fazının kabulü sayılmaz.

## 3. Teslim aşamaları

| Aşama | Teslim | Kabul kapısı |
| --- | --- | --- |
| 3D0 — teknik deneme | Primitive ve transparent WebGL yüzeyini mevcut 2D compositor'a bağla; alpha, renk, katman sırası, maske/efekt ve kaynak maliyetini ölç. | 2D yazının altında/üstünde ve grup/maske içinde beklenen piksel; başarısız capability açık tanı. |
| 3D1 — ilk kutulu 3D katman | GLB/glTF import, ilk primitive, model hiyerarşisi, kamera/ışık/basit material, 2D kutu ve iç model dönüşü, selection/bounds, UI/MCP komutları. | Ekle/düzenle/sil, tek undo, clone/instance, portable save/load ve desteklenen raster karede gerçek görünüm; eski 2D projede regresyon yok. |
| 3D2 — zaman ve bake | Dış 2D Timeline'da kutu; özel 3D timeline'da iç model/clip kontrolleri, sabit zamanda GLB clip örnekleme, alpha görüntü dizisi bake ve stale/cancel/re-bake. | Seek, reverse ve sıra dışı kareler aynı pozu verir; kaynak ve kullanıcı düzeltmeleri korunur; editor/export aynı destek profilinde aynı kareyi üretir. |
| 3D3 — ileri kutulu sahne | Tek kutuda çoklu model, kamera animasyonu, malzeme kontrolleri, imported skeleton/clip/morph oynatma ve elle pose düzeltme. | Ortak kamera/ışık/depth, model hiyerarşisi, iki instance bağımsızlığı ve resource bütçesi gerçek sahnede doğrulanır. Yeni rig/skin ağırlığı/IK, 3D4'ün Q1-O/Q2/Q4 dilimlerinde geliştirilir. |
| 3D4 — ayrıntılı model ve karakter üretimi | [Q0–Q5 programı](plans/model-production-quality-plan.md): düzenlenebilir geometri/modifier, UV/doku, stilize fiziksel GPU malzemeleri, organik model/sculpt, rig/corrective/IK, UI–MCP üretim tarifleri ve final çıktı. | Önce amber kavanoz + fırçalanmış metal kap + kavrayan el; sonra çok açılı karakter ve hareketli üretim sahnesi. Kaynak/Undo/portable, render ve cihaz maliyeti birlikte kabul edilir. |
| 3D5 — katmanlı 3D compositing (CFX10) | Kutulu 3D çekirdeğini ortak kamera/depth kullanan 2D düzlemler ve modeller, mask/holdout ile genişlet. | Önceki 2D CFX kompozisyon/efekt temeli üzerinde timeline ve raster çıktı eşliği; yeni bağımsız renderer motoru yok. |
| 3D6 — 3D kamera çözümü (CFX11) | Kaynak video feature izlerinden kamera hareketi ve yerleştirme düzlemi/ölçek çöz; güven ve hata raporu ver. | Önce temsilî çekimlerde araştırma/prototip; sonra CFX8 izleri ve 3D5 kamera adapter'ıyla native authoring, elle düzeltme, bake ve çıktı kabulü. |

3D0 iç deneme, 3D1 ise ilk kullanıcı teslimidir. 3D3/3D4 kendi aralarında
alt dilimlere bölünebilir; bir registry kaydı veya Three.js sınıfı tamamlanmış
katman sayılmaz. 3D5 için 3D6 beklenmez. 3D6'daki tracking, 2D CFX8 kaynak
video ve iz sonuçlarını kullanır; tracking algoritması burada kopyalanmaz.

### 3.1. 3D4 — onaylanan geliştirme programı

Durum: **plan kaydı; uygulama/kabul bekliyor**. Ayrıntılı sözleşmenin sahibi
[model ve karakter üretim alt planıdır](plans/model-production-quality-plan.md).
Aşağıdaki Q kimlikleri yalnız 3D4 içinde kullanılır; başka belgelerdeki eski
3D0–3D6 paket adlarıyla aynı teslimler değildir.

| Alt aşama | Teslim | Kabul kapısı |
| --- | --- | --- |
| 3D4/Q0 — temel ve ölçüm | Mevcut kod/kanıt denetimi, ortak UI–MCP komutları, worker/asset aktarımı ve kalite profilleri. | Oluştur/düzenle/Undo/kaydet-aç/render aynı kaynakla çalışır; mevcut açıklar ve cihaz bütçeleri kayda geçer. |
| 3D4/Q1 — geometri | Lathe/extrude/sweep, temel Edit Poly, Mirror/Shell/Bevel/Subdivision, crease, snapping ve instance/array. | Gerçek kalınlık/ağız/taban taşıyan kavanoz ve ayrıntılı metal kap farklı açılarda düzenlenebilir. |
| 3D4/Q1-O — organik risk kapısı | Baş kontrol kafesi, bükülen parmak, sınırlı skin/morph/corrective denemesi. | Ortak topoloji, UV, subdivision ve deformasyon birlikte çalışır; organik risk Q3'e bırakılmaz. |
| 3D4/Q2 — ilk birleşik kalite | UV/doku, amber cam, anisotropic metal, ten, minimal el rig'i ve GPU kalite profili. | Kavanoz + kap + bileği bükülmüş kavrayan el; çok açılı yakın plan ve 6 saniyelik hareketle kabul edilir. |
| 3D4/Q3 — karakter üretimi | Multires sculpt, kaliteli yüz/el başlangıç modelleri, saç tutamları, kıyafet/dikiş/kıvrımlar. | Aynı karakter önden, profilden, üç çeyrek ve yakın planda tutarlı ve düzenlenebilirdir. |
| 3D4/Q4 — poz ve hareket | Gövde/el rig'i, IK/bakış, yüz morph'ları, corrective, tutma-bırakma ve deterministik instance/cache hareketi. | Ekipman kullanımı boyunca yüz/el/kıyafet deformasyonu ve temas korunur; seek/cache eşliği geçer. |
| 3D4/Q5 — üretim paketi | Sürümlü tarifler, kamera/atölye, sürdürülebilir final render ve 2D katman bağlantısı. | 1080×1920, 30 FPS, 10 saniye/300 kare kaynak ve final çıktı; kesinti sonrası sürdürme, stale/re-bake ve portable kabulü. |

Sıra: **Q0 → Q1 ve onun içindeki erken Q1-O → Q2 → Q3 → Q4 → Q5**.
Her alt aşamada UI, MCP, Undo/Apply/Cancel, portable kaynak ve gerçek render
birlikte tamamlanır. Araç listesi, registry veya shader alanı tek başına kalite
kabulü değildir. Modelleme altyapısı, kaliteli başlangıç modelleri/tarifler ve
render profili ayrı ayrı doğrulanır.

### 3.2. İleri compositing ve kamera çözümü sınırları

3D5'te mevcut 2D affine transform'a z eklenmez. Kutulu 3D'nin ayrı
TRS/matrix, kamera/projection ve yerel saat sözleşmeleri kullanılır. Aynı
compositing grubundaki 3D düzlemler ve modeller ortak depth/kamerayı paylaşır;
grup şeffaf yüzey olarak 2D compositor'a girer. Ayrı kutular arasında otomatik
ortak depth, ışık veya gölge yoktur. Her gruba sınırsız WebGL context/tampon
açılmaz.

3D6 kamera takibi, videodaki hareketli bir nesnenin bağımsız 3D pose takibi
değildir; tam ortam mesh'i veya otomatik occlusion üretmez. Ön nesnenin
arkasına yerleştirme için maske/holdout veya açık depth girdisi gerekir.
Ölçek, zemin/düzlem, lens varsayımları, yetersiz parallax ve hatalı iz eleme
sonuçla birlikte gösterilir. Tek düzlem, yalnız dönüş veya zayıf dokulu
çekimde sınırlı çözüm ya da açık başarısızlık beklenir. Reprojection error
yanında eklenen nesnenin çekime oturması gerçek karelerde incelenir.

## 4. Ortak veri, zaman ve sahiplik sözleşmeleri

Kaynak/kimlik, explicit zaman, command/undo, job/bake yaşam döngüsü, asset
manifest'i, topology connectivity doğrulaması, kaynak yönetimi ve çıktı
capability temelleri [2D–3D ortak temel sözleşmesine](shared-2d-3d-foundations.md)
bağlıdır. Aşağıdaki maddeler bu sözleşmenin 3D adapter ve veri anlamlarını
tanımlar; 2D transform, Mesh2D, Character Motion solver'ı veya renderer'ı
yeniden kullanılabilir 3D implementation sayılmaz.

- **Kaynak:** Sürümlü/serializable 3D asset, sabit node ID'leri, geometri,
  material ve texture/environment bağımlılıkları, içerik hash'i ve açık import
  scale/up-axis bilgisi taşır. GPU/DOM/Three.js runtime nesneleri scene JSON,
  undo snapshot veya taşınabilir kayda yazılmaz. Birden çok instance geometri
  paylaşabilir; local saat, transform ve override'lar instance'a aittir.
- **Koordinat:** 2D kutu kompozisyon pikselinde width/height ve affine
  transform kullanır. İç model position xyz/quaternion/scale xyz ve kamera
  ayrı 3D uzaydadır. Piksel ile dünya birimi otomatik eşitlenmez. Kutuyu
  taşımak iç modeli döndürmez; modeli döndürmek kutuyu taşımaz.
- **Zaman:** Chorono'nun explicit frame/timeline-local milisaniyesi tek
  otoritedir. Three.js clip saniyesine adapter'da çevrilir. Renderer geçen
  gerçek süreyle kendiliğinden ilerlemez; reverse ve random seek aynı sonucu
  verir. Playback, export ve bake aynı evaluate-frame girdisini kullanır.
  Geçmişe bağlı süreçler aynı kareye sabit adım/seed/checkpoint/bake üzerinden
  ulaşabilir; her kareyi bağımsız hesaplama şartı konmaz. Cache kaynak/ayar
  revision'ına bağlıdır ve kaynak değişince stale olur.
- **Renderer ve kaynak:** Tek kutunun 3D dünyası ortak kamera/ışık/depth ile
  çizilir; kutular arası ortak 3D gölge/depth ilk sürümün davranışı değildir.
  Renderer/decoder gerektiğinde yüklenir; GPU context, texture, render target,
  decoded asset ve staging tamponları mevcut admission/lease/bütçe ve
  dispose/cancellation ilkelerine bağlanır. Context loss ve stale sonuçlar
  görünür tanıyla ele alınır.
- **Çıktı:** Portable authoring proje ile raster/video/runtime/vektör çıktı
  farklı capability'lerdir. 3D katman desteklenmeyen hedefte sessizce
  düşürülmez; açık unsupported veya seçilmiş raster/bake fallback gerekir.
  Genel 3D sahnenin SVG/Lottie ya da bütün 2D filmin GLB karşılığı vaat
  edilmez. Her yeni 3D dilim kendi asgari raster çıktısını doğrular; geniş
  canonical export/final kalite işi [2D planındaki](production-2d-roadmap.md)
  ayrı teslimde yapılır.

3D4'te multires/skin/morph bağlanan topoloji ve bind/rest kaynak korunur.
Kararlı ID'ye ek olarak topoloji parmak izi, rest revision'ı ve üretici sürümü
doğrulanır. Yeni dal, yeniden bağlama ve tarifin üstündeki elle düzenleme
kuralları alt plandadır; güvenli eşleme yokken bağlı veri sessizce aktarılmaz.

Bu sözleşmelerin ayrıntılı veri akışı, editor davranışı, import uzantıları,
bake manifest'i ve exporter hedefleri [3D entegrasyon mimarisindedir](multi-mode-architecture.md).
Önerilen sınıf ve API adları uygulanmış public API sayılmaz.

## 5. Kullanıcı akışı ve kabul örneği

İlk akış: **3D Nesne ekle → GLB/primitive seç → kutu içinde modeli çevir,
kamera ve ışığı ayarla → 2D sahnede yerleştir → açık timeline'da canlandır →
birleşik raster çıktı al.** Model dönüşü, render kamerası ve yalnız inceleme
amacıyla kullanılan çalışma görünümü ayrı kontrollerdir. Sabit açı seçimi
kendiliğinden dönüş animasyonu başlatmaz. Gizmo sürüklemesi tek undo'dur;
viewport gizmosu ve seçim çerçevesi çıktıya girmez.

İlk temsilî sahne; tek 3D kutusunda birkaç model, önünde/arkasında 2D yazı,
ses ve kısa bir GLB clip'i içerir. Opak ve saydam malzeme ayrı değerlendirilir.
Başlangıç, ara ve son geçerli kareler gerçek render preview ile incelenir;
selection/bounds, kaydet/aç, clone, mask/effect, context loss, eksik asset,
Undo/Redo, runtime capability ve raster export test edilir. Cihaz/tarayıcı/GPU,
soğuk hazırlık, sıcak kare p50/p95, triangle/draw call, texture/render target
bütçesi ve çıktı süresi raporlanır. Ölçmeden sabit FPS veya cam kalitesi
garantisi verilmez.

Uygulama değişikliklerinde `npm test`, `npm run mcp:build` ve `npm run build`
çalıştırılır; build öncesi Next server durdurulur. MCP/script API değişirse
`skills/chorono/` ve ilgili public dokümanlar birlikte güncellenir. Görsel
değişiklikler gerçek render kareleriyle doğrulanır.

## 6. Ayrı karar gerektiren genişlemeler

3D Mode, kaynak asset'i aynı 3D çekirdek üzerinde düzenleyen dört ana moddan
biridir. Bağımsız descriptor/kabuk teslimi aktif 3D0–3D6 teknik sırasını
kendiliğinden yeniden sıralamaz; ilk kutulu 3D ve 3D4 çekirdeği aşamalı besler.
3D4'te tanımlanan rig, skin ağırlığı, IK, corrective morph ve üretim
tarifleri bu programın kabul kapılarıyla geliştirilir. Tam kumaş/sıvı veya
genel rigid body simülasyonu, otomatik retopology/reprojection, genel 3D oyun
motoru, otomatik lightmap ve 3D4 dışındaki ileri material kapsamı ayrı karar
gerektirir. [Eski game-engine planı](../../plan/GAME_ENGINE_ROADMAP.md)
bu yol haritasının uygulama talimatı değildir.
