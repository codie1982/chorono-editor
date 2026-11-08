# E−1 — İnsan–ajan ortak düzenleme, Timeline ve Viewport kullanılabilirliği

**8 Kasım sıra güncellemesi:** V4 native clone tamamlandı; sırada V5 viewport işi, ardından
kalan ortak düzenleme ve birleşik araç kabulü tamamlanır. Sonraki ürün sırası
[onaylanan 3D/Poly planındadır](geometry-material-boxed3d-sequence.md).
Tam export ve ikinci genel optimizasyon sonraya taşındı; mevcut teknik kabul
koşulları ve tamamlanan viewport V1/V2/V3 korunur.

Tarih: 8 Kasım 2026. Durum: kaynak kod incelemesi tamamlandı; aşağıdaki runtime,
veri modeli ve UI değişiklikleri, ayrıca tamamlandığı belirtilmedikçe **öneridir**.
İlk viewport doğruluk dilimi E−1.6'da uygulanmıştır; bu, MCP/provenance API'lerinin
tamamlandığı anlamına gelmez. Canonical
Chorono skill'indeki takip düzenlemesi kuralı ve prosedürel animasyon örneği bu
inceleme kapsamında güncellendi. Bu blok kullanıcının isteğiyle **Export E0'ın
önüne** alınmıştır. Tamamlanmış optimizasyon kabulü yeniden açılmaz.

## 1. Amaç ve sınırlar

Ajan bir sahneyi oluşturduktan sonra kullanıcı o sahneyi elle geliştirebilir.
Sonraki ajan düzenlemesi mevcut sahneyi kaynak kabul etmeli, yalnız istenen
değişikliği yapmalı ve insanın düzenleyebileceği bir yapı bırakmalıdır. Bu hedef
yalnız prompt tavsiyesiyle değil; MCP mutasyon sözleşmesi, key/property kimlikleri,
komut/undo akışı ve editör araçlarıyla desteklenir. Viewport'ta seçim, pivot,
doğrudan key/trajectory düzenleme ve subtree çoğaltma da insanın sahneden devam
edebilmesinin parçasıdır; yalnız Timeline araçlarıyla sınırlı değildir.

Aktif kapsam 2D/2.5D'dir. Yeni bir 3D çalışma alanı, genel amaçlı ajan framework'ü,
otomatik sahne yeniden gruplama veya bütün editörün yeniden yazılması gerekmez.
Export, bileşen ve çoklu format sırası bu bloktan sonra korunur. Aşağıdaki yeni
isimler/sözleşmeler capability ve şema yayımlanana kadar çağrılabilir API sayılmaz.

## 2. Kaynak kodda doğrulanan durum

| Alan | Mevcut davranış | Yapılacak geliştirme |
| --- | --- | --- |
| Sahneyi okuma | Skill ve tool açıklaması `get_scene` ister. `expectedRevision` isteğe bağlıdır; çağıranın yeni turda gerçekten okuduğu zorunlu tutulmaz. | Her bağımsız düzenleme turunda taze okuma; source mutasyonunda zorunlu revision ve okumaya bağlı yetkilendirme. |
| Eşzamanlı düzenleme | Aktif drag engeli, hazırlık başı/commit revision kontrolü, atomic batch, script snapshot ve stale plan reddi vardır. | Bu korumaları kullan; ikinci bir sahne/undo motoru kurma. |
| Patch | `Layer.set` ve `patch_object` shallow replacement yapar. `Layer.patch` nested object merge yapar; array'ler yine değişir. | İstenen leaf/domain öğesini değiştir; mevcut semantiği sessizce değiştirmeden güvenli native deep patch ve kimlikle güncelleme ekle. |
| Yazarlık | Layer/key/property için insan–ajan kökeni veya son değiştiren kaydı yoktur. MCP `clientName` tek başına doğrulanmış aktör kimliği değildir. | Küçük, sürümlü authoring metadata; eksik kayıt `unknown` kabul edilir. |
| Key güncelleme | Script/native upsert yakın zamandaki key'i yeni ID ile değiştirebilir. Snapshot komutu authored layer değerini kullanır; varsayılan altı numeric kanal ekler. | Var olan key'in kimliğini ve belirtilmeyen easing/tangent/modifier alanlarını koru; interpolated source değerini örnekle. |
| Set Key / kısayol | Küçük Keyframe menüsü vardır. K tuşu gerçekte sonraki key'e gider; bazı açıklamalar K ile key eklemeyi söyler. | Büyük, doğrudan Set Key eylemi; tek shortcut registry ve uyumlu açıklamalar. |
| Toplu key | Çoklu seçim, sürükleme, easing, slide, stagger, scale ve spreadsheet vardır. Bazı yollar sınırları farklı uygular; çoklu snapshot ayrı undo'lar oluşturabilir. | Ortak zaman/çakışma politikası; tek transaction/undo; gruplu hareketin aralıklarını koruma. |
| Sahne düzeni | Scene Explorer query/bulk/subtree ve indexed hierarchy vardır. Ana Timeline düz layer listesi kullanır. | Mevcut hiyerarşiyi ve sanallaştırmayı Timeline'a taşı; yeni paralel ağaç üretme. |
| Prosedürel eğri | Script ile key örnekleme, waveform controller ve numeric bake vardır. Serbest zaman ifadesi controller'ı yoktur. Sıfır key'li controller eğrisi Curve Editor'da görünmeyebilir. | Önce mevcut yolları güvenilir ve görünür yap; genel expression controller ayrı, sınırlı bir genişletmedir. |
| Wire ifadesi | Değişkenler `source`/`s`'dir; `time`/`t` kendiliğinden bulunmaz. Numeric tokenizer işaretleri fazla geniş kabul eder. | Whitespace'ten bağımsız grammar, finite sonuç, aynı parser/runtime doğrulaması ve açık hata. |
| Viewport araçları | Pivot, selection frame, point/key drag, clone ve array vardır; multi-transform, timeline bağlamı ve gesture/shortcut yollarında tutarsızlıklar bulundu. | Önce mevcut araçların doğruluk/etkileşim kabulü; sonra viewport'ta key çizme, ortak subtree duplicate ve etkileşimli çoklu array. [Ayrı inceleme ve plan](viewport-authoring-2d-plan.md). |

İlgili sahipler:
[MCP editor](../../../src/lib/mcp/editor.ts),
[broker](../../../src/lib/mcp/broker.ts),
[script sandbox](../../../src/lib/mcp/sandbox.ts),
[LayerHandle](../../../src/lib/script/api/LayerHandle.ts),
[keyframe komutları](../../../src/lib/editor/commands-keyframe.ts),
[keyframe işlemleri](../../../src/lib/timeline/keyframeOps.ts),
[TimelinePanel](../../../src/components/TimelinePanel.tsx),
[shortcut kayıtları](../../../src/lib/shortcuts/defaultBindings.ts),
[ExplorerAPI](../../../src/lib/script/api/ExplorerAPI.ts),
[controller sözleşmesi](../../../src/lib/animation/controllers/types.ts),
[expression parser](../../../src/lib/core/expression/expressionEvaluator.ts).

## 3. Uygulama sırası ve kabul kapıları

Her adım çalışan bir dilimdir; yeni sözleşmeler UI/MCP/script'in ilgili
adapter'ları ve testleriyle tamamlanır. Her teslimde canonical skill, API
dokümanı ve örnekler gerçek capability ile birlikte güncellenir.

| Sıra | Teslim | Tamamlanma koşulu |
| --- | --- | --- |
| E−1.0 — tamamlandı | Skill ve mevcut kabiliyetlerin açıklığı | Her takip turunda taze okuma kuralı; eski sahneyi yeniden üretmeme; QuickJS ile doğrulanmış sine/controller/bake örneği. Runtime enforcement değildir. |
| E−1.1 | Güvenli MCP düzenleme sözleşmesi | Okunmamış/stale source mutasyonu reddedilir; taze revision ile odaklı değişiklik tek undo olur; retry ve plan kimlikleri korunur. |
| E−1.2 | İnsan–ajan kökeni ve çakışma açıklığı | Creation ve last-writer ayrıdır; mixed/unknown durumları, undo/redo ve portable save/load korunur; runtime çıktısı editör metadata'sını taşımaz. |
| E−1.3 | Düzenlenebilir sahne organizasyonu | Anlamlı isim/parent yapısı; Explorer ve Timeline'da aynı alt ağaç; filtre/sanallaştırma toplu işlemin kapsamını değiştirmez. |
| E−1.4 | Güvenli Set Key, toplu key ve transport | Registry tabanlı keyset, source-channel örnekleme, kimliği koruyan güncelleme, tek undo; büyük Set Key ve tutarlı frame/key/start/end gezinmesi. |
| E−1.5 | Prosedürel eğri ve expression güvenilirliği | Parser/UI hataları düzelir; controller eğrisi görünür; örnekleme ve bake açık doğruluk toleransıyla çalışır. |
| E−1.6 — sürüyor | Viewport araçları ve doğrudan authoring | İlk pivot/seçim/drag ve ortak multi-transform dilimi uygulandı; [gerçek sözleşme](../viewport-transform-editing.md). V3 key çizimi, V4/V5 clone/array genişletmesi ve tam V6 bekler. [V0–V6](viewport-authoring-2d-plan.md). |
| E−1.7 | Birleşik kullanıcı akışı kabulü | Aşağıdaki insan–ajan devam senaryosu, gerçek viewport etkileşimi ve büyük sahne regresyonu geçer; ardından Export E0 başlar. |

### E−1.1 — Önce oku, mevcut yapı üzerinde değiştir

- Seçilen editör için her yeni düzenleme turunun ilk source işlemi `get_scene`
  olur. Oturumu bulmak/capability keşfetmek bundan önce yapılabilir. Tek bir
  atomic batch içindeki her alt işlem için yeniden okuma gerekmez.
- Source mutasyonlarında `expectedRevision` zorunlu olur. Literal “önce okudu”
  şartını sağlamak için okumadan dönen kısa ömürlü read token önerilir: gerçek
  istemci bağlantısı + editör session + document epoch + revision'a bağlıdır.
  Dahili broker snapshot'ı çağıranın okuması yerine sayılmaz.
- Read token, bir mutasyon/batch veya ona bağlı dry-run planını yetkilendirir.
  `apply_script_plan` aynı planın ürettiği ID'lerle commit eder; araya source
  değişikliği girerse reddedilir. Planı onaylamak için script yeniden çalıştırılmaz.
  Token'ın kendi dry-run'ını sebepsiz geçersiz kılmaması test edilir.
- Final compare-and-swap, aktif drag engeli ve per-editor seri yürütme korunur.
  Request dedupe ayrıca gerçek istemci bağlantısıyla ayrılır; display name
  güvenlik/kimlik anahtarı olmaz. Timeout'ta önce aynı request'in sonucu aranır;
  durumu belirsiz yeni mutasyon güncel okuma olmadan gönderilmez.
- Okuma, playback, değerlendirme, preview ve export source mutasyonu değildir.
  Source değiştiren araçlar ve undo/redo kapsamı açıkça sınıflandırılır.
- Eski istemciye anlaşılır capability/protokol sürümü ve yapılandırılmış hata
  verilir; eksik alanları sessizce kabul eden “uyumlu” yazma yolu bırakılmaz.
  Yeni hata adları ve token şeması uygulamada yayımlanacaktır.
- Mutasyon özeti eklenen/silinen nesne, yeniden parent etme ve değişen
  property/key alanlarını bounded biçimde bildirir. İç atomic snapshot taşıması
  yasaklanmaz; istenmeyen source değişikliği denetlenir.

Saat örneğinde mevcut sahne **09:05** ise “rengini değiştir” işlemi 09:05'i korur.
Bu durum rutin onay sorusu gerektirmez. İstek saat değerini de değiştiriyorsa
açık kullanıcı talebi uygulanır. Talep gerçekten iki farklı yoruma açıksa yalnız
çatışan alan sorulur; bütün sahne için genel izin kapısı eklenmez.

Kabul: eksik/stale okuma, aynı revision'lı farklı document, iki istemci, aktif
drag, undo/reset, retry, stale plan ve manuel child/key/path düzenlemesi
senaryoları. Reddedilen işlem scene/history/provenance üzerinde iz bırakmaz.

### E−1.2 — Hermes bir animasyon parametresi değil, authoring aktörüdür

`hermes: true` olmayan her şeyi insan yapımı saymak doğru değildir: eski/import
verisi veya farklı bir ajan da olabilir. Önerilen modelde aktör türü
human/agent/import/unknown, isteğe bağlı agent adı ve request/transaction kimliği
ayrıdır. “Hermes” agent adıdır; kullanıcıya ait animation parameter namespace'i
bu amaçla kullanılmaz. Bu bir güvenlik kanıtı veya içerik mülkiyeti iddiası değildir.

- **Created-by** nesne/öğenin ilk oluşumunu; **last-writer** ilgili alanın en son
  kim tarafından değiştiğini gösterir. Ajan nesnesinin rengini insan değiştirirse
  nesne mixed olabilir; bütün parent veya layer “ajanın malı” haline gelmez.
- Kimlik adresleri: layer ID + property path; timeline ID + track target;
  key ID + field; spline point/handle kimliği. Array index'i kalıcı kimlik sayılmaz.
  Legacy kimliksiz geometride topology/structure değişikliği belirsizliği açık
  gösterilir. Yeni Poly subsystem'inin tamamlanması önkoşul değildir.
- Küçük, sürümlü, seyrek bir son-yazan ledger'ı kullanılır; sınırsız işlem günlüğü,
  dense frame buffer veya kopya sahne tutulmaz. Yalnız commit edilen source
  değişiklikleri damgalanır; preview/drag'in her karesi/evaluator çıktısı değil.
- Önerilen owner `src/lib/editor/authoring/`: aktör/adres/change-set sözleşmeleri,
  attribution ve çatışma politikası. React paneli, MCP transportu ve JSON
  converter bu sözleşmelere adapter olur; domain browser handle tutmaz.
- Root'ta önerilen optional versioned authoring bölümü ayrı şema taşır; mevcut
  scene formatı/importlar bozulmaz. Eski kayıtlar `unknown` olarak açılır.
  Metadata sahneyle atomik undo/redo/save/load olur; history dışında hook map'inde
  tutulmaz. Undo özgün attribution'ı geri getirir; undo çağrısının audit'i ayrıdır.
- Portable editör projesi metadata'yı korur. Her iki runtime export yolu metadata'yı
  açıkça çıkarır. Clone/import için yeni ID eşleme ve inherited/unknown provenance
  politikası tanımlanır; yerel kullanıcı yaratmış gibi yanlış damgalanmaz.
- Varsayılan koruma istenen scope dışındaki bütün verilere uygulanır. Köken,
  yalnız olası çakışmayı açıklamaya yardım eder; explicit talebi engellemez ve
  “agent yazdı, istediğim gibi silebilirim” yetkisi oluşturmaz.

Kabul: insanın değiştirdiği ajan key'inin yalnız value'sunu güncelleme; easing ve
ID'nin korunması; insan child'ı olan agent group; legacy unknown; clone/import;
tek undo/redo, portable round-trip ve iki runtime exporter'da metadata yokluğu.

### E−1.3 — Kompleks sahnede insanın devam edebilmesi

- Yeni üretimde semantik gruplar: örneğin `Clock / Face`, `Clock / Hands`,
  `Labels`; rolü açıklayan layer/track isimleri. Her primitive için gereksiz group
  açılmaz. ID authoritative kalır; aynı isimli nesnelerde ilk eşleşme seçilmez.
- Mevcut parent/child bağları devam ettirilir. İstenen kapsam dışındaki insan
  hiyerarşisi stil amacıyla otomatik yeniden düzenlenmez. Yeni organizasyon
  gerektiğinde world transform'u koruyan mevcut Explorer operasyonu kullanılır;
  animated/locked/frozen/singular durumdaki kısıtlar bypass edilmez.
- Main Timeline'da group collapse/expand, seçili dalı aç/kapat, alt dallarıyla
  göster/gizle ve focus/reveal seçenekleri mevcut index/subtree servislerini
  kullanır. Panel collapse editör UI durumudur; source visibility/lock ayrıdır.
- Parent toplu eyleminin yalnız parent'a mı, subtree'ye mi uygulanacağı açık
  isimle görünür. Alt çocuklar filtre veya kapalı satırlar yüzünden atlanmaz.
  Visibility/lock/solo/freeze semantiği aynı eylem için Explorer ve Timeline'da
  aynıdır; hepsine tek bir sınırsız setter uygulanmaz.
- Çoklu layer/branch seçimi key filtrelerine union olarak gider; yalnız primary
  selection'a düşmez. Mevcut row virtualization korunur. Scroll/filter/collapse
  kaynak kaybı veya scene JSON'a dense UI kopyası ekleme nedeni olmaz.

Kabul: büyük iç içe sahnede search + reveal + subtree eylemi + undo; gizli/kapalı
çocukların kapsamı, preserve-world reparent kısıtları; portable ID/hiyerarşi
eşliği. İlgili belgeler: [subtree işlemleri](../editor-subtree-operations.md).

### E−1.4 — Set Key ve toplu Timeline işlemleri

**Önce ortak authoring sözleşmesi, sonra butonlar.** Mevcut property registry,
keyframe helper, batch command ve shortcut registry genişletilir.

1. **Keyset:** görünür büyük `Set Key` düğmesi seçili layer'ların etkin keyset'ini
   tek işlemde yazar. Varsayılan, layer'da gerçekten bulunan desteklenen bütün
   keyable kanallardır; Transform, mevcut animasyonlu kanallar ve seçili kanallar
   daha dar seçeneklerdir. Eksik optional effect/path payload'ı üretilmez. Şema
   metadata'sı number/boolean/string/color/Vec2 ayrımını belirler; asset ID veya
   bütün topology verisi yanlışlıkla key'lenmez. Kanallar tek tek zorunlu seçilmez.
2. **Değer kaynağı:** sıradan keyframe kanalında o andaki source interpolasyonu
   veya henüz commit edilmekte olan authored edit örneklenir; untracked alanda
   typed source değer kullanılır. Final screen/world transform tekrar input'a
   yazılmaz. Controller/modifier/timewarp/follow-path/binding tarafından sürülen
   kanal çift uygulanmaz veya etkisiz key'lerle doldurulmaz; driven/atlanan kanal
   raporlanır, desteklenen explicit Bake/Convert yolu ayrı eylem olur.
3. **Kimlik ve zaman:** aynı key güncellenirken ID, belirtilmeyen easing,
   tangents ve segment modifier'ları korunur. Collision/tolerance ve sıralama
   tek domain helper'da tanımlanır; “±1 ms içindeki bütün key'leri sil” davranışı
   sessiz veri kaybına dönüşmez. Yeni key eklemenin eğri şeklini tam koruduğu,
   curve-splitting uygulanmadan iddia edilmez.
4. **Tek transaction:** iki veya elli layer'a Set Key, active timeline membership
   dahil tek komut/undo olur. Başarısız kanal/katman diagnostics'i görünür;
   uygulanacak kapsam önceden belirlenir, sessiz yarım işlem olmaz.
5. **Zaman sözleşmesi:** authoring zamanı açık active timeline local ms'dir;
   global playhead, loop/ping-pong ve local time eşlemesi açıkça çözülür.
   Manuel gezinme `[0, durationMs]` sınırında kalır ve loop/ping-pong yapmaz.
   Playback/Record zamanı key yazılmadan local zamana çevrilir. Playback work
   area ve authoring sınırı ayrıdır. Finite değerler, fractional
   FPS, frame grid dışı key'ler ve farklı timeline süreleri desteklenir.
6. **Toplu edit:** move/slide/scale/stagger/paste/spreadsheet aynı sınır ve
   çakışma politikalarını kullanır. Varsayılan çakışmada bütün işlem açıklamalı
   reddedilir; explicit overwrite ayrı eylemdir. Bir grup sınırı aştığında her
   key ayrı clamp edilip aralıklar sıkıştırılmaz; ortak delta veya açık ret/çakışma
   çözümü vardır.
   Escape, timeline değişimi ve iptal transaction'ı tam geri alır.
7. **UI ve gezinme:** Set Key için K önerilir. Mevcut K=Next Keyframe ataması
   için shortcut migration/çatışma açıklığı gerekir; kullanıcı binding'i sessizce
   ezilmez. Visible transport: timeline başlangıcı/sonu, bir frame geri/ileri,
   önceki/sonraki key, ilk/son key ve Play/Pause. Yoğunluk küçük gruplar/menüyle
   çözülür; ana Set Key erişimi menüye saklanmaz.
8. **Tek scope:** key gezinmesi seçili layer'ların birleşiminde, seçim yoksa
   active timeline genelinde çalışır; UI kapsamı gösterir. Frame gezinmesi
   Left/Right, key gezinmesi comma/period, Home/End timeline sınırları için
   merkezi registry'de çözümlenir. Input/contenteditable/select/modal/menu,
   aktif drag ve repeat kuralları tanımlanır; hover'a özel paralel listener kalmaz.

Kabul: source x=0, ara karede x=50 iken Set Key ile 50 yazılması; driven kanalın
sessizce bozulmaması; typed keyset; 50 layer tek undo; key ID/easing korunması;
membership nedeniyle görünür track; zaman/sınır/collision edge case'leri;
klavye/focus ve gerçek Timeline/Curve Editor çıktısı.

### E−1.5 — `sin(2x)` ve prosedürel eğriler

`x` saniye cinsinden geçen zaman ise `sin(2x)` **bugün iki yolla üretilebilir**:

- Script bir kez çalışıp `timeMs / 1000` üzerinden `Math.sin(2 * tSec)` örnekler;
  explicit timeline'a linear key'ler ekler. Sonuç örnekleme aralığına bağlı
  yaklaşımdır, sürekli matematiksel eğrinin aynısı değildir.
- Native waveform controller `offset + amplitude * sin(2π * frequency * tSec +
  phase)` hesaplar. `frequency = 1 / Math.PI`, `phase = 0` seçilince `sin(2t)`
  elde edilir. Frekans Hz, phase radyan, timeline zamanı ms'dir; transform
  rotation alanı ise degree kullanır. Mevcut numeric bake editlenebilir
  örneklenmiş key'lere çevirir; controller'ı koruyan bir ikinci kopya çalıştırmaz.

Çalışan örnek ve sınırlar:
[canonical animasyon referansı](../../../skills/chorono/references/animation.md).
Script per-frame callback değildir. Wire ifadesi `sin(2 * source)` kaynak
değişkenine bağlıdır; standalone `sin(2x)` örtük çarpma/zaman değişkeni sağlamaz.
Key segment'inin localT'sini kullanan `sine` modifier, saniye tabanlı waveform
ile aynı değildir; tek key'li modifier örneği hareket garantisi vermez.

Geliştirme sırası:

1. Numeric tokenizer'ın işaret/exponent ayrımını düzelt: `2+3` ve `2 + 3` aynı
   sonucu vermeli; `1e-3`, unary eksi, precedence/power, eksik argüman, bilinmeyen
   değişken/fonksiyon ve NaN/Infinity sınırları test edilmelidir. Yeni parser
   kopyası veya `eval`/`new Function` kullanılmaz.
2. Wire UI aynı parser ve evaluator ile doğrular; yalnız parse edildi diye null
   sonuç commit edilmez. Preview actual evaluated source değerini kullanır;
   hata/çevrim/non-finite durumunda neden ve mevcut fallback açık olur.
3. Sıfır key'li controller'ın eğrisini Curve Editor'da bounded örneklemeyle göster;
   synthetic graph örneklerini scene JSON/undo'ya key diye yazma. `Timeline.track`
   membership ve prosedürel range/bounds görünümü tamamlanır.
4. Sürekli controller ile bake edilmiş eğri temsilci zamanlarda toleransla
   karşılaştırılır. Bake'in aralık, örnekleme, finite/limit/cancel, source revision,
   hangi signal alanlarını kaldırdığı ve kalan veriyi koruma sözleşmesi açıklanır.
5. Kullanıcı serbest zaman formülü isterse mevcut parser'a açık `timeMs`,
   `timeSec`, normalized time sözleşmeli controller eklenmesi ayrı alt teslimdir.
   Bounded değerlendirme, izinli fonksiyonlar, hata/fallback, bake ve player/export
   parity olmadan “expression desteklendi” denmez. Mevcut sine yolu bu genel
   dilin tamamlanmasını beklemez; E0 öncesi zorunlu ilk teslim 1–4'tür.

Kabul: sahne/script/controller numeric eşliği, whitespace ve exponent parser
testleri, UI hata testi, sıfır-key eğrisinin görünürlüğü, bake sonrası düzenleme
ve kaydet/aç. Mevcut English/Turkish scripting örnekleri ve skill tek gerçek API
ile senkron tutulur; eşzamanlı doküman çalışması üzerine yazılmaz.

### E−1.6 — Viewport araçlarının kontrolü ve yeni özellikler

[Viewport planı](viewport-authoring-2d-plan.md) kullanıcının 8 Kasım ek isteğini
ve kod incelemesini içerir. İlk teslim yeni özellikten önce mevcut araçların
doğruluğudur: görünen pivot etrafında dönüş, net seçim, parent/child ve bağlı
point/handle'larda kaymayan hareket; ortak world/local ve gesture lifecycle.

Bu ilk onarım ve çoklu seçimde ortak bounding kutusu/rotate/scale/keyboard nudge
uygulandı. [Uygulama sözleşmesi, modül sahipleri ve test tekrarı](../viewport-transform-editing.md)
gerçek destek sınırlarını kaydeder; bütün E−1.6 backlog'u tamamlanmış sayılmaz.

Ardından position key'lerini viewport'ta seçme/ekleme/sürükleme/silme ve rota
çizme; path source ile progress timing ayrımı; modifier drag ve Duplicate'in
aynı subtree clone akışına bağlanması; Linear/Grid/Radial/Path array'nin canvas
preview/gizmo ile çoklu köklere uygulanması tamamlanır. Copy/Instance, animation
yerleşimi, internal referanslar, tek undo/cancel ve kaynak bütçesi kabul kapsamıdır.

Bu işlevlerin bir bölümü zaten vardır; kullanıcıdaki belirtilerin o sahnede
pointer ile yeniden üretimi V0'da yapılır. Kullanıcı raporu ile doğrulanmış kod
tutarsızlıkları ayrı kaydedilmiştir. V1/V2 transform/seçim onarımları ilk
hazırlanabilir işlerdir; V3 key edit ortak E−1.4/5 sözleşmelerini kullanır.
Soft selection/connected-loop bu aşamada uygulanacak diye varsayılmaz.

### E−1.7 — Birleşik kabul ve Export'a geçiş

Örnek akış: ajan saat sahnesini anlamlı gruplarla oluşturur → kullanıcı saati
09:05'e, bir path handle'ını ve bir key easing'ini değiştirir → ajan taze okur →
yalnız istenen rengi/hareketi değiştirir → manuel alanlar/ID'ler korunur → bir
undo/redo ve portable save/load doğrulanır → insan Timeline'da grubu açıp çoklu
Set Key kullanır → sine controller'ını görüp bake eder ve key'lerini düzenler →
viewport'ta pivot/selection doğru görünür, hareket key'ini sürükler/yenisini çizer →
grubu çocukları ve animasyonuyla kopyalar, array üretir → tek undo/cancel ve
save/load akışları doğrulanır.

Test katmanları: domain invariants; native komut ve MCP adapter; gerçek UI
kısayol/focus/undo; temsilci rendered kare; portable ve desteklenen player yolu.
Yeni source/provenance sözleşmesinin export'a temel sızma kontrolleri bu blokta,
genel viewport/preview/export fixture matrisi sonraki **Export E0**'dadır.

İlgili uygulama değişikliklerinde `npm test`, `npm run mcp:build`, `npm run build`
çalıştırılır; build öncesi Next durdurulur. Canonical skill'den CLI kopyaları
`npm run cli:build` ile üretilir. Kurulum/paketleme değişirse CLI test/tarball
kabulü de çalışır. Büyük sahnede aynı Four Seasons kaynağı ve **512 MiB managed
bütçe** kullanılır; önceki §12.37 kabulündeki managed/heap/process ayrımı korunur.
Seyrek metadata ve yeni graph/row örnekleri sınırsız bellek büyümesine yol açmaz.

E−1.0 incelemesinin doğrulaması: o çalışma ağacında **267 dosya / 2105 test**
ve **16/16 CLI testi** geçti. Canonical skill validation ve yeni doküman
bağlantıları doğrulandı. CLI skill bundle'ı ayrı geçici dizinde gerçek build
script'iyle üretildi; 10 dosyanın source byte'ları/manifest hash'leri ve yeni
reference'ın pakete girmesi doğrulandı. Çalışan editöre veya kurulu skill
kopyalarına müdahale edilmedi. QuickJS regresyonu gerçek referans script'lerini çalıştırır;
waveform değerlerini, membership'i, bake sonrası linear key'leri ve örneklenen
zamanlarda `<0,02 px` hatayı denetler. Bu kabul E−1.0 içindir; henüz yazılmamış
runtime/UI korumalarının kabulü değildir. MCP/Next runtime build'i bu yalnız
doküman/skill/test değişikliğinde çalıştırılmadı.

Parser sorunu ayrıca mevcut kaynak üzerinde tekrarlandı: `2+3 → 2`,
`2 + 3 → 5`, `1e-3+2 → 0,001`. Bunlar açık hata kanıtıdır; bu tur parser
düzeltilmedi. E−1.5'te bu örnekler doğru sonuç bekleyen regresyonlara dönüşür.

### Uygulama notu — viewport V3

Kullanıcının sonraki yönlendirmesiyle V1/V2 ardından V3 native position motion
key düzenleme uygulandı. [Gerçek UI/source sözleşmesi](../viewport-motion-keys.md)
explicit Timeline, ortak seçim/yerel zaman, parent inverse, source koruması ve
rota preview/Apply kurallarını kaydeder. Bu teslim E−1.1–5 güvenli MCP/provenance,
Set Key ve prosedürel eğri işleri veya V4/V5 clone/array teslimi sayılmaz.

## 4. En son tartışılacak: soft selection ve bağlantılı seçim

Kullanıcının “öncekiler/sonrakiler” açıklaması ripple veya önceki/sonraki bütün
key'leri aynı değere eşitlemek değildir. İstenen; seçilen öğeden uzaklığa göre
azalan **ağırlıklı seçim/etki** sistemidir. Key'lerde zaman/track mesafesi,
shape'lerde geometrik/topolojik mesafe; bağlı öğe veya edge loop seçimi ayrı
kapsamlardır.

Bu başlık, kullanıcının isteğiyle **en son tartışılacak** olarak tutulur; şimdiden
algoritma/UI/varsayılan davranış kararı verilmez ve E0'a yeni zorunlu önkoşul
yapılmaz. Tartışmada influence radius, falloff, selected/unselected key sınırları,
hangi property'lerin etkilendiği, connected/loop topolojisi, preview/commit ve
undo birlikte netleştirilir. Mevcut spline ve gelecekteki Poly selection
sözleşmeleri kullanılabilir; ikisinin hazır olduğu varsayılmaz.
