# Liquid & Fluids — sıvı/akışkan simülasyonu ve bake

Tarih: 4 Kasım 2026. Durum: mimari ve geliştirme planı; uygulama yapılmadı. Güncel kapsam: **yalnızca `2danimation` modu**. 3D mod, hacimsel solver, scene adapter, renderer ve export işleri aktif geliştirme planında yer almaz.

Genel uygulama kuyruğu [2D üretim yol haritasını](../production-2d-roadmap.md) izler: export → bileşen → çoklu format önceliklidir. Bu sıvı/akış planı korunur; bu teslimlerin önkoşulu değildir.

## 1. Ürün kararı

Physics Simulations alanına **Liquids & Flow** eklenir. Gravity, kuvvet alanları, collision nesneleri ve etkilenen nesne listeleriyle sıvı/akış hesaplanır; önizleme ve scrub için kaydedilir, timeline'da solver olmadan oynatılacak bir klibe bake edilir.

İki farklı kullanım açıkça ayrılır:

| Tür | İlk hedefler | Hesap ve görünüm |
| --- | --- | --- |
| Liquid | Su benzeri dökülme, kap dolması, dalga/sıçrama ve damlalar | Particle tabanlı yoğunluk çözümü; 2D sıvı yüzeyi/contour veya particle görünümü |
| Grid Flow / Smoke | Renkli akış, duman/yoğunluk taşınımı, engel etrafında akış | Grid hız/basınç ve scalar taşıma; 2D density/dye texture |

Liquid ilk uygulama sırasıdır; grid flow ikinci solver dilimidir. Tek bir particle emitter'ı su/duman fiziği diye sunulmaz. İlk sürüm kimyasal yanma, çok fazlı hava-su etkileşimi veya yüksek doğrulukta mühendislik akış analizi hedeflemez.

Ortak mimari: [Simulation Core 2D](simulation-core-2d-architecture.md). Diğer alanlar: [Rigid Body & Fracture](physics-fracture-bake-plan.md), [Cloth / Fabric](cloth-fabric-simulation-bake-plan.md). Paylaşılan sınıflar mevcut 2D sistemlerinin ihtiyaçlarına göre kurulur; olası 3D için ek soyutlama veya dependency geliştirilmez.

## 2. Mevcut durum

Repoda liquid/SPH/PBF/FLIP veya grid tabanlı akış solver'ı bulunmadı. Particle sistemi prosedürel görsel hareket, spring/bounce sistemi track eğrileri üretir. Bunlar yoğunluk/basınç çözümü ve akışkan sınır koşulları sağlamaz.

Planlanan physics job, clock, field selection, collider source, cache ve bake ownership altyapısı kullanılacak. Fluid için particle/grid durumları, density/pressure tanıları, yeni cache payload'ları ve çizim yolu eklenecek. Bu tur kod veya bağımlılık kurulumu yapılmaz.

## 3. Liquid solver kararı

İlk aday **Position Based Fluids (PBF)** tabanlı 2D çözümdür. PBF, particle yoğunluk kısıtlarını iteratif olarak çözen bir yöntemdir; cloth tarafındaki particle buffer, komşuluk ve constraint yaklaşımıyla bazı yardımcıları paylaşmaya uygundur. Liquid yoğunluk kısıtı, kumaşın kenar/bükülme kısıtıyla aynı hesap değildir. [PBF makalesi](https://mmacklin.com/pbf_sig_preprint.pdf)

İlk dilimde sabit particle kütleleri, support radius, hedef yoğunluk, spatial hash komşuluğu, density correction, hız güncelleme ve sınır çözümü bulunur. Düşük düzey viskozite/sönüm görsel kontrol olarak eklenebilir; gerçek birimle kalibre edilmeden ölçülmüş fiziksel viskozite diye etiketlenmez. Surface tension ve vorticity kontrolü ayrı doğrulama aşamalarıdır.

Başlangıç particle dizilimi ve kernel/gradient normalizasyonu **2D** için tanımlanır. Kütle/alan veya eşdeğer slab thickness sözleşmesi kullanılır. 3D yoğunluk değerini aynı sabitle kopyalamak doğru bir boyut dönüşümü değildir.

PBF'nin ilk teknik doğrulaması yetersiz sonuç verirse grid/particle hibrit PIC-FLIP ayrı bir karar adayıdır. İki liquid backend aynı ilk teslimde geliştirilmez. PIC/FLIP yaklaşımı grid basınç çözümü ve particle-grid transferi gerektirir; basit bir ayar seçeneği değildir. [PIC/FLIP referansı](https://matthias-research.github.io/pages/tenMinutePhysics/18-flip.pdf)

## 4. Grid flow ve duman

İkinci dilim, 2D staggered hız grid'i üzerinde kuvvet ekleme, advection ve incompressibility/pressure projection akışını kullanır. Scalar density/dye bu hızla taşınır. Smoke için temperature/buoyancy ve dissipation ayrı kanal/parametrelerdir. [Eulerian akış referansı](https://matthias-research.github.io/pages/tenMinutePhysics/17-fluidSim.pdf)

Gravity ayarı gazı su damlası gibi doğrudan aşağı taşıyan bir preset'e indirgenmez. Ortam, smoke yoğunluğu/temperature ve buoyancy modeli açıkça tanımlanır. Renkli dye taşınımı görsel bir scalar kanaldır; gerçek iki sıvının kimyasal karışımı veya çok fazlı çözüm değildir.

Pressure residual/divergence ve boundary hatası izlenir. Projection yakınsamazsa, kapalı domain'e kontrolsüz giriş uygulanırsa veya tolerans aşılırsa tanı üretilir. Advection'ın sayısal sönümü ile sanatçı dissipation ayarı aynı parametre sayılmaz.

Gaz ve liquid birbiriyle etkileşen birleşik iki fazlı solver olarak ilk sürüme eklenmez. Aynı sahnede iki ayrı bake klibi bulunabilir; bu kliplerin fiziksel coupling yaptığı anlamına gelmez.

## 5. Domain, kaynak ve sınırlar

Kullanıcı 2D domain alanını, başlangıç dolu bölgeyi veya emitter kaynağını, başlangıç hızını ve süreyi seçer. İlk liquid dilimi önceden doldurulmuş sabit particle kümesiyle başlar; emitter/drain ikinci adımdır.

Domain kenarları explicit `closed` veya `open/outflow` davranışı taşır. Kaynak alan, kuvvet alanı ve collider birbirinden ayrıdır. Açık sınırdan çıkan sıvı silinebilir; bunun kütle kaydı tutulur. Kapalı, dolu domain'e sürekli sıvı eklemek sınırsız sıkıştırma/particle üretimine dönüşmez; kapasite ve taşma politikası önceden belirlenir.

Particle kaynakları rate/başlangıç-bitiş/velocity ve stable id yaşam döngüsü taşır. Doğum/ölüm anları cache'te saklanır; farklı karelerde particle indislerinin tesadüfen aynı görünmesiyle interpolasyon yapılmaz. Seed ve gerçekleşen başlangıç durumları recipe'ye girer.

## 6. Gravity ve kuvvet alanları

Ortak FieldSystem şu kontrolleri sunar: gravity, yönlü kuvvet/akış, bölgesel wind/drag, vortex, attraction/repulsion ve seed'li turbulence. Hangi türlerin ilgili solver'da uygulandığı capability listesinde görünür.

Her alanın uzayı, kapsama bölgesi, yön/şiddeti, zaman eğrisi ve falloff'u vardır. Gravity ivme, itki tek seferlik olay, sürekli kuvvet zaman boyunca uygulanan girdidir. Rüzgârın cloth yüzey basıncı formülü fluid particle/grid'ine doğrudan uygulanmaz; alan tanımı ortak, solver etki kuralı ayrıdır.

Alanlar simülasyon alt adımlarında örneklenir. Liquid density çözümü ve grid pressure projection alan etkisinden sonra kendi kararlılık sözleşmesini uygular. Şiddet sınırı, hız/CFL benzeri adım koşulları ve maksimum alt-adım bütçesi görünür olur. Render FPS'i kuvvet sayısını değiştirmez.

## 7. Etkilenen nesneler ve collision

| İlişki | Seçim ve davranış |
| --- | --- |
| Field → fluid targets | Bir veya birden fazla liquid/domain; include/exclude ve koleksiyonlar |
| Fluid → collision objects | Kap/zemin/engel katmanları; collision groups ve ignore çiftleri |
| Emitter → kaynak nesne | Sıvı/yoğunluk eklenen bölge ve başlangıç hızının kaynağı |
| Fluid → diğer dinamik nesneler | Ayrı coupling modu; ilk dilimde görünür ama desteklenmeyen seçim açık tanı verir |

Görsel katman otomatik collider sayılmaz. İlk 2D engeller plane/segment, circle, rectangle ve doğrulanmış convex polygon'dur. Collider'ın kalınlık/malzeme ve transform'u physics snapshot'ta tutulur; image alpha'sını kendiliğinden kapalı kap geometrisi saymaz.

Liquid'de particle penetration düzeltmesi yanında duvar yakınındaki yoğunluk eksikliğini ele alan boundary örnekleri/yoğunluk düzeltmesi gerekir. Sadece particle'ı duvar dışına itmek sızıntı, yapışma ve yoğunluk bozulmasını bütünüyle çözmez. İnce duvar, köşe, dar geçit ve hızlı akış ayrı kabul sahneleridir.

Grid akışta obstacle hücre/face işaretleri ve normal boundary velocity basınç/advection işlemine girer; çizimde maskeyle kesmek fiziksel collision değildir. Hareketli collider girişi bake edilmiş trajectory'den her alt adımda örneklenir.

İlk etkileşim **one-way**: engeller sıvıyı yönlendirir, sıvı engelleri hareket ettirmez. Yüzen cisim, sıvının nesneyi sürüklemesi veya kumaşı ıslatıp ağırlaştırması sonraki coupling kapsamıdır. Bu aşama basınç/itki, buoyancy, kütle/atalet ve ortak alt-adım değişimini gerektirir; yalnız collision listesine eklemek yeterli değildir.

## 8. Zaman ve simülasyon işi

Ortak SimulationClock ve worker job kullanılır. Recipe; seçili timeline/domain, başlangıç snapshot'ı, birimler, seed, çözünürlük/particle aralığı, support radius, sabit adım ve solver toleranslarını taşır.

Başlangıç hedefi 120 Hz sabit base tick'tir. İç alt-adım ihtiyacı hız/domain koşullarından kararlı ve sınırlandırılmış kuralla türetilir; recipe ve tanılarda kayıtlıdır. Gerekli adım sayısı bütçeyi aşarsa işi durdur veya daha düşük kalite profili için yeniden iş başlat; kareye göre kendiliğinden fizik profili değiştirme.

Liquid döngüsü: alan/kaynak/collider girdilerini örnekle → kuvvet ve poz tahmini → komşuluk/density/boundary çözümü → hız/viskozite güncelle → tanı ve kayıt. Grid akış döngüsü kendi velocity/advection/projection ve scalar taşıma adımlarını uygular. İki solver tek numerical loop'a zorlanmaz.

Scrub cache okur; render/evaluate çağrısı solver'ı ilerletmez. Cancel, failed, stale, revision/requestId ve source hash kuralları diğer physics işleriyle aynıdır. Kaydedilmiş bake, motor sürümü değişince kendiliğinden yeniden hesaplanmaz.

## 9. 2D çizim

Liquid preview önce particle ve density görünümüyle doğrulanır. Son görünüm, particle yoğunluk alanından üretilen dolu yüzey/contour, kenar ve renk/transparanlık kontrolü olabilir. Contour çıkarımı görsel postprocess'tir; çizimdeki güzel bir yüzey solver'ın kütle hatasını gizlememeli.

6 Kasım 2026 eklemesi: [Blob Surface 2D / Metaballs](../production-2d-roadmap.md#94-blob-surface-2d--metaballs) ayrı bir native yüzey altyapısıdır. Elle oluşturulan “+” etki noktaları radius/weight ve ortak threshold ile bir yüzey üretir; aynı owner/grupta yaklaşınca birleşme, uzaklaşınca ayrılma gerçekleşir. Mevcut seed'li `blob` shape bu davranışa dönüştürülmez. Farklı katman/domain'ler sırf yakın oldukları için global olarak birleşmez.

Liquid adapter, aynı contour builder'a solver particle'larından scalar alan verir. Manual blob ağırlıkları fizik yoğunluğu değildir; 2D normalize render kernel'i, particle mass/reference density ve support radius ile çözünürlüğe göre yüzey alanı kalibre edilir. PBF gravity, kuvvet ve collision hareketini hesaplar; alanın görsel birleşmesi basınç/çekim/yüzey gerilimi veya iki domain arasında fiziksel kütle aktarımı sayılmaz.

Sıvı ayrılabilir, birleşebilir ve delik oluşturabilir. Bu nedenle contour/topoloji kareler arasında değişebilir. Normal spline'ın sabit point id'lerini her karede zorla eşleyerek morph etmek varsayılan bake değildir. Marching-squares benzeri yüzey çıkarımının threshold/resolution ayarı bake appearance sürümüne girer.

Native contour algoritması **Marching Squares** olarak adlandırılır; `d3-contour` MultiPolygon çıktısı başlangıç adayıdır. Bu işlem quad mesh üretmez. Compound path yüzeyi doğrudan çizebilir; mesh gerektiğinde sınır/delikler ayrıca triangulate edilir. Grid origin/spacing, influence bounds ve kalite profili sabittir; kareden kareye bbox merkezine taşınarak jitter üretilmez. Seçili kareyi Editable Poly'ye dönüştürmek yeni sabit vertex/triangle kimlikleri oluşturur ve kaynak klibi korur; değişken topolojiyi cloth cache'ine zorla eşlemez.

Grid smoke/dye, scalar kanalları texture/renk haritasıyla çizer. Bütün sonuç tek fluid/domain katmanında çizilir; her damla/particle ayrı sahne katmanı yapılmaz. WebGL offscreen pass mevcut Canvas kompozisyonuna adapter ile bağlanabilir. Parent, opacity, mask/effect, zoom ve export resolution test edilir.

İlk çizim fiziksel refraction/reflection veya gerçek 3D su shader'ı hedeflemez. Kullanıcının seçtiği stil fizik recipe'sinden ayrı kaydedilir; stil değişimi mümkünse solver'ı yeniden çalıştırmadan appearance bake'i yeniler.

Particle hareket cache'i ile surface appearance hash'i ayrıdır. Yalnız threshold, görsel radius, renk veya yüzey grid kalitesi değişirse cache'den contour yeniden üretilir. Hesabı etkileyen emitter/collider/particle mass gibi değişimler resimülasyon ister. Field buffer ve contour cache, ana plandaki ortak resource budget/ledger'a tabidir; her noktaya ayrı layer/texture veya sınırsız tam sahne grid'i açılmaz. İnce akışın render çözünürlüğüyle kaybolması kalite tanısıdır; collider sızıntısı olarak gizlenmez.

## 10. Bake ve cache formatı

Liquid ana sonucu `particleFluid` clip'idir: stable id/life interval, örnek zamanları, x/y pozlar ve gerekli radius/color gibi kanallar. Resimülasyon/checkpoint için hız ve solver state gerekebilir; bunlar solver-free playback payload'ıyla aynı zorunlu veri değildir.

Grid ana sonucu `gridField` clip'idir: domain/grid metadata, time samples ve playback için density/dye gibi kanallar. Yeniden hesaplama için velocity/pressure/temperature gibi state ayrı tutulabilir. Yalnız görünüm için gerekli olmayan bütün çalışma buffer'larını her kareye export etmek varsayılan olmaz.

Çıktı seçenekleri:

- **Native simulation clip:** particle veya grid cache ve timeline playback; yeniden çizilebilir veri.
- **Surface sequence:** her örnekte contour/mesh; değişen topolojiye uygun decoder gerekir.
- **PNG sequence / sprite / video:** sabit görünümden raster bake; solver ve native cache renderer'ı olmayan hedeflere uygun teslim.

Kumaşın sabit-topoloji `meshDeformation` clip'i sıvı yüzeyine otomatik yeniden kullanılmaz. Ortak storage/header/hash/job paylaşılır; decoder ve interpolasyon türe özeldir.

Örnek bütçe: 1.000 particle, 3 saniye, 30 FPS ve 91 örnek için yalnız Float32 x/y pozlar 728.000 byte; normal x/y track olarak yazılsa 182.000 keyframe olur. Bu nedenle mevcut 50.000 keyframe sınırı yüzünden particle başına track varsayılan değildir.

128×128 grid'in 91 örnekte tek Float32 scalar alanı 5.963.776 byte'tır. Hız, temperature, renk ve kodlama ek yükü ayrı hesaplanır. Scene/request/binary asset bütçesi preflight'a girer; uzun işler chunk/paket formatı gerektirebilir. Sınırsız base64 JSON veya limitsiz GPU belleği varsayılmaz.

Ara karede doğum/ölüm, hızlı hareket ve duvar geçişi interpolasyonla bozulmamalı. Grid yeniden örneklemesi negatife düşen density veya taşan dye üretmemeli. Temas/kaynak açılış-kapanış anları korunur; appearance örneklemesi ile fizik sample rate'i açıkça ayrılır.

## 11. Editör, kayıt ve MCP

Physics Simulations panelinde Liquids/Flow; domain/emitter, material, fields, affected objects, collision objects, diagnostics ve bake seçenekleri bulunur. Particle/grid çözünürlüğü, süre, beklenen clip boyutu ve simülasyon adımları görünür olur.

Preview kalıcı katmanları değiştirmez. Bake sonucu katman, cache asset'i, playback track'i ve BakeRecord ile tek undo transaction'ında eklenir. Kullanıcı ayarları değişince ilgili sonuç stale olur. Re-bake yalnız sahip olduğu üretilmiş verilere dokunur; manuel düzenlenen sonuç için yeni sürüm/explicit replace politikası kullanılır.

Portable proje kaynaklar, recipe, koordinat/ölçek, collider/field bağlantıları ve baked clip'i korur. Runtime native fluid decoder/renderer capability'si yoksa raster fallback veya açık destek tanısı verir. Solver-free playback yeni clip türünü okuyabilen runtime gerektirir.

MCP: configure/validate → simulate job → status/cancel → deterministic preview → bake commit. Synchronous QuickJS uzun çözümü yürütmez. Source/target id ve gerçek property şemaları capabilities/catalog'a eklenir; class/job lifecycle ve bake olayları mevcut script/host yoluna açılır. Her particle temasını sınırsız event akışına dönüştürmek yerine sınırlı özet/olay politikası kullanılır.

## 12. 2D sistemleri arasında ortak sınıflar

Planlanan ortak sınıflar [Simulation Core 2D belgesinde](simulation-core-2d-architecture.md) tanımlıdır. Liquid, grid flow, rigid ve cloth; aynı job, saat, alan hedefleri, cache store ve bake ownership sistemini kullanır. Komşuluk/numeric yardımcıları gerçek ihtiyaçta ortaklaştırılır; liquid density ve cloth constraints ayrı kalır.

Çıktı mevcut 2D scene, timeline, canvas/mesh compositing ve exporter üzerinden teslim edilir. 3D uyarlama bir sonraki aşama veya kabul ölçütü değildir; yeni kullanıcı talebi olmadan bu kapsam açılmaz.

## 13. Geliştirme sırası ve kabul

| Aşama | Teslim | Kabul ölçütü |
| --- | --- | --- |
| 0 — Ortak core | Recipe, units, domain, particle cache fixture ve decoder | Solver olmadan bilinen particle klibi scene/player/export'ta aynı oynar. |
| 0 — Yüzey altyapısı | Ana plandaki BLOB0/BLOB1: native etki noktaları, alan, Marching Squares ve merge owner | İki küme birleşir/ayrılır; delik ve boş yüzey geçerlidir; elle edit, undo ve seçili kareyi Poly'ye dönüştürme çalışır. PBF doğruluk prototipi bunu beklemek zorunda değildir. |
| 1 — Liquid 2D | PBF, gravity, sabit kap/collider ve dolu başlangıç bölgesi | Kapta sıvı durulur, engel etrafında akar; density/kütle/duvar sızıntısı bütçesi ölçülür. |
| 2 — Kontrol ve bake | Fields, affected objects, emitter/drain, BLOB2 fluid yüzey adapter'ı, atomik bake | Vortex yalnız seçili sıvıyı etkiler; kaynak kütle bütçesi kaydedilir; birleşme/ayrılma contour'u, görünüm için cache reuse, solver kapalı playback ve undo geçer. |
| 3 — Grid Flow 2D | Advection/projection, smoke/dye, boundary ve grid bake | Engel etrafında renkli akış; divergence ve boundary residual tanıları; texture bake parity. |
| 4 — Ürün teslimi | Moving baked collider, cache bütçesi/format, MCP, re-bake ve portable | Cancel/stale, kayıt/yükleme, korunmuş kullanıcı düzenlemesi ve supported runtime export çalışır. |

**İlk dikey dilim:** 2D kap, yaklaşık 1.000 particle, gravity ve tek engel → 3 saniye hesap → particle/contour önizleme → native clip bake → solver kapalı playback → undo/kayıt-yükleme. Sonraki adım vortex alanı ve etkilenen nesne listesidir.

## 14. Doğrulama ve uygulama sınırları

Testler: kapalı domain kütle/alan ve density hatası; emitter/drain muhasebesi; boundary kaçak/köşe/dar geçit; alan maskeleri; fixed-step tekrar ve bütçe; grid divergence/pressure residual; collision velocity; stable particle id ve doğum/ölüm; değişen surface topology; clip decode/interpolasyon; birim/eksen; stale/cancel; tek undo; güvenli re-bake; portable ve renderer parity.

Görsel sahneler: dam-break/kapta dalga, dökülme ve dolan kap, circle engel etrafında akış, vortex ile seçili domain, smoke/dye engel sahnesi. Başlangıç, ilk temas, en büyük sıçrama/akış, orta ve durulma anları gerçek render ile incelenir; yalnız particle debug görüntüsü son görünüm kabulü değildir.

Önerilen modüller ortak `src/lib/physics/` altında liquid, grid flow, fields, spatial query ve cache bileşenleridir. Önce mevcut numeric/geometry/job yardımcıları değerlendirilir. Exact API ve dosya sınırları ilk teknik dilimde kesinleşir.

İlk teslimin dışında: fiziksel yüksek viskozite/honey coiling, yüzey gerilimiyle ayrıntılı damla fiziği, tam hava-su coupling, köpük/whitewater, yanma, ıslanma/absorpsiyon ve iki yönlü cloth/rigid coupling. Olası genişletmeler ayrı 2D ölçütlerle ele alınır. Bütün 3D geliştirmeler güncel kapsam dışındadır ve bu planın sonraki aşaması değildir.

Bu tur yalnız plan yazar. Uygulama değişikliklerinde canonical skill/MCP güncellemeleri ve repo kontrolleri (`npm test`, `npm run mcp:build`, `npm run build`) yapılır; build öncesinde Next sunucusu durdurulur. Bu yerel belge `plan/` konvansiyonunu izler.
