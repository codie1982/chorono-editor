# 2D IK için etkileşim ve hesaplama planı

25 Kasım 2026 · Önerilen geliştirme sırası

**İlk teslimin amacı:** Kullanıcı mevcut katmanlardan bir kol veya bacak kurar, hedefi viewport’ta taşır ve uç hedefe ulaşamadığında hangi eklemin hareketi sınırladığını görür. Aynı araç mekanik kol için de kullanılabilir. Kurulum ve pozlama mevcut **Properties → Link & IK** sekmesini, Scene Explorer’ı ve Timeline’ı kullanır.

Teknik referans *Chorono 2D Ters Kinematik ve Rig Sistemi*, v1.0, 25 Kasım 2026, 39 sayfadır. Aşağıdaki sayfa numaraları bu baskıya aittir. Rapordaki Rig, Bone ve Controller rollerini ilk teslimde normal katman kimlikleri, pivot bağlantıları ve hedef referansları karşılar. Özel karakter oluşturma ekranı veya ikinci bir sahne ağacı gerekmiyor.

## Bugünkü başlangıç noktası

| Var olan davranış | Geliştirilecek taraf |
|---|---|
| Aynı üst gruptaki katmanlar pivotlarından bağlanır. Bağlama anındaki görünüm korunur. Unlink alttaki kaynak poza döndürür. Pozu koruyarak ayır geçerli karede konumu ve açıyı korur. | Statik pivot bağlantısı, sahne hiyerarşisinde parent değiştirme ve zamanla referans değiştirme ayrı işlemlerdir. |
| İki parçalı analitik çözüm hedefi erişim halkasına sınırlar. Bükülme yönü değiştirilebilir. | Omuz ve dirsek açı limitleri. Bugünkü uzunluklar o karenin FK geometrisinden gelir. |
| Link & IK sekmesi sürücüyü, alt parçayı ve hedefi viewport’ta tıklatarak seçer. Ok sürücüyü, nişangâh hedefi, halka gerçek ucu gösterir. Erişim farkı seçili zincirin panelinde ölçülür. | Eklem limit yayları ve etkin açı sınırları. |
| Ortak kare değerlendirmesi Timeline’dan ve ifadelerden sonra bağlantıları çözer. Komutlar Undo kullanır, kimlik ve bağlama verisi sahneyle kaydedilir. | Editör, player ve MCP aynı kare çözümündeki uç ve hedef ölçümlerini kullanır. |

Kodda başlangıç noktaları [kaynak kayıtları](../../../src/lib/rig2d/types.ts), [poz hesabı](../../../src/lib/rig2d/pose.ts), [bağımlılık sırası](../../../src/lib/rig2d/frame.ts), [editör komutları](../../../src/lib/rig2d/commands.ts) ve [ortak kare değerlendirmesidir](../../../src/lib/runtime/evaluateSceneFrame.ts).

## Faz 1 — İki parçalı kol ve bacak

| Sıra | Kullanıcı deneyimi | Hesap ve teslim ölçütü |
|---|---|---|
| **1. Hedef ve gerçek uç · uygulandı** | Hedefte nişangâh, çözülen bilekte küçük halka göster. Fark toleransı aştığında ikisini ince bir çizgiyle birleştir. Sekmede örneğin “Hedef 40 px uzakta · kol tam açık” yaz. Normal pozda hata etiketini gizle. | Mevcut çözümden omuz, dirsek, gerçek uç, istenen hedef, hata, durum ve etkin sınırları türet. Önce ortak grup uzayındaki, ardından kompozisyondaki mesafeyi hesapla. Tanılar ve işaretler yalnız değerlendirme sonucunda yaşar. Rapor s. 10–14, 24, 29. |
| **2. Bükülme ve koordinatlar · uygulandı** | Flip bend dirsek tarafını seçer. Prefer this pose geçerli karedeki omuz yönünü kaydeder. Clear preferred pose tercihi kaldırır. Tam katlanma ve açılmadan sonra zincir seçilen tarafa bükülür. | Eşit uzunluk ve kökte hedef için omuz yönünü kayıtlı tercihten, eski sahnede FK’dan al. Tam açılma geçerli sonuçtur. Hedef, kılavuz ve referans yönü aynı zincir uzayında çözülür. Aynalı üst grup ve çok turlu açı testlerini geçir. Rapor s. 6–7, 11–13. |
| **3. Omuz ve dirsek limitleri · uygulandı** | İki eklem için ayrı Min/Max, kilit ve sıfırlama sun. Aktif eklemde yerel limit yayı ve hangi sınıra dayandığını göster. Eski sahnelerde limitler kapalıdır. | Sabit kök, iki pozitif uzunluk ve yerel açı aralıklarında her aday için ileri kinematikle uç hatasını ölç. İki analitik dal, dört aralık sınırı, köşeler, geçerli tam tur eşdeğerleri ve aralık içindeki düz/katlanmış konumlar adaydır. En küçük hatada eşitlik varsa kayıtlı tarafa ve tercih açılarına göre kararlı seçim yap. Rapor s. 13–14, 36. |
| **4. Kurulum, animasyon ve ortak API · editör ve MCP uygulandı** | Hedef sürükleme tek Undo üretir, Esc iptal eder. Auto Key hedefin kanalını kullanır. Zincir ve hedef adları salt okunur görünür. **Pozu koruyarak ayır** geçerli kareyi korur. | MCP, editörün komutlarını ve görünen kareyi kullanır. Bağlı editör kabul sonuçları aşağıdadır. Rapor s. 5, 8, 24–29. |

### MCP teslimi

**Faz 1, adım 4 · 26 Kasım 2026.** İlk teslimin yedi aracına IK/FK ağırlığı ve Match eklendi. Hedef katmanın X/Y animasyonu mevcut `upsert_keyframes` aracını kullanır.

| MCP aracı | Davranış |
|---|---|
| `link_layer_pivots_2d` / `unlink_layer_pivots_2d` | İzleyen katmanı ve sürücüyü kimlikle bağlar. Ayırırken kaynak poza dönme veya **Pozu koruyarak ayır** seçilir. Poz koruma editörle aynı kareyi ve hedef timeline’ın yerel zamanını kullanır. |
| `bind_two_bone_ik_2d` / `remove_two_bone_ik_2d` | Üst parça, bağlı alt parça ve hedef kimlikleriyle zinciri kurar. Remove IK, alt parçanın pivot bağlantısını korur. |
| `set_ik2d_weight` / `match_ik2d_pose` | Ağırlığı 0–1 aralığında değiştirir veya iki yönlü geçişte o karedeki pozu korur. Script karşılıkları `layer.rig2d({kind:'setWeight', weight:0.4})`, `matchFK` ve `matchIK` eylemleridir. |
| `set_ik2d_joint_limits` / `set_ik2d_bend` | Omuz ve dirsek için Min/Max, kilit ve sıfırlama işlemlerini açar. Editördeki bükülme yönünü çevirme, mevcut pozu tercih etme ve tercihi temizleme işlemlerine de MCP’den erişilir. |
| `get_ik2d_diagnostics` | İstenen karede zincir ve hedef kimliklerini, hedefi, çözülen ucu, aralarındaki mesafeyi ve etkin eklem sınırını salt okunur döndürür. Mesafenin ortak grup veya kompozisyon pikseli olduğu belirtilir. |

Editör adaptörü `makePivotCommand` ve `makeUnlinkKeepPoseCommand` üzerinden bir Undo adımı oluşturur. Canlı tanı aynı karedeki `ikDiagnostics` sonucudur. Açık zamanla sorgu, kayıtlı girdileri `evaluateSceneFrame` ile örnekler. Sekiz yazma aracının her biri için önce `get_scene` çağrılır. Dönen revizyon ve tek kullanımlık okuma belirteciyle araç doğrudan çağrılır. [MCP kullanım rehberi](../mcp.md#2d-pivot-bağlantıları-ve-iki-parçalı-ik)

**Bağlı editörde kabul senaryosu**

1. MCP ile ön kolu üst kola bağla ve IK hedefini ata. Hedefe iki konum anahtarı yaz. İki karede de MCP’nin bildirdiği uç konumunu ve hedef uzaklığını Link & IK paneliyle karşılaştır.
2. Dirseğe ulaşmayı engelleyen bir limit ver. Sorgu etkin sınırı ve kalan mesafeyi döndürmeli. Limiti sıfırlayınca uç erişilebilir hedefe yeniden ulaşmalı.
3. İki anahtar arasındaki karede ön kolu **Pozu koruyarak ayır** ile ayır. Konum ve açı korunmalı. Tek Undo önceki pivot bağlantısını, IK zincirini ve değişen anahtarları birlikte geri getirmeli.
4. Döngü yaratacak bir bağlantıyı ve eski revizyonla bir yazmayı dene. Her denemede hata nedeni bildirilmeli, sahne ve Undo geçmişi korunmalı. Geçerli zinciri kaydedip yeniden açınca aynı karede aynı tanılar alınmalı.

**26 Kasım 2026 kabul sonucu.** 2001 portunda ayrı bir tarayıcı oturumu gerçek MCP istemcisine bağlandı. Üst kol, ön kol ve hedefle şu sonuçlar alındı.

| Kontrol | Gözlem |
|---|---|
| 0 ve 600 ms’de hedef ve gerçek uç | Panelin erişim durumu, viewport işaretlerinin koordinatları ve MCP tanısı örtüştü. 600 ms’de uç ve hedef kompozisyonda X = 345 px, Y = 207,5 px konumunda buluştu. |
| Dirsek 0°’de kilitli | MCP 32,85246 px hata ve kilitli dirsek bildirdi. Panel aynı uzaklığı yuvarlayarak gösterdi. Limit sıfırlandığında uç hedefe döndü. |
| Ön kolu 600 ms’de pozu koruyarak ayır | MCP ve panel aynı katman verisini, seçim çerçevesini ve anahtar değerlerini verdi. X kanalına 266,438998 px anahtar yazıldı. Dönüş −29,202590° olarak korundu. Her iki yöntemde de tek Undo pivot bağlantısını, IK’yi ve özgün anahtarları geri getirdi. |
| Hata ve kayıt | Döngü ve eski revizyon denemeleri sahnenin revizyonunu veya geçmişini değiştirmedi. Kaydedilen proje yeniden açılarak aynı 600 ms tanısı doğrulandı. |

**Koordinat sözleşmesi.** Mevcut dosyalarda +Y aşağı, pozitif dönüş saat yönünde ve açı birimi derecedir. Raporun +Y yukarı ve radyan kullanan sayısal örnekleri tek bir sınır adaptörüyle çevrilir. Çizimin yerel dönüşü ile segment doğrultusu arasındaki bağlama ofseti korunur. Omuz açısı zincirin üst referansına, dirsek açısı üst segmente göre ölçülür. Min/Max bu toplam yerel açılara uygulanır. Örneğin 170°…190° geçerli bir aralıktır. 720° yazılmış kaynak dönüşü korunur.

**Mesafe ve başarısızlık.** Limitsiz erişim yarıçapı `[|L1−L2|, L1+L2]`. Kullanıcının istediği hedef saklanır. Hata, çözülen uçtan bu özgün hedefe ölçülür. Döndürülmüş veya farklı X/Y ölçekli bir üst grupta yerel hata ile kompozisyondaki hata farklı olabilir. Limitli çözümün en yakınlık ölçütü yerel Öklid uzaklığıdır. Başlangıç için konum toleransı `max(0.0001 × (L1+L2), 0.001)` yerel px önerilir. Sayısal sıfır denetimi ve açı toleransı ayrıdır. Tekil dönüşüm veya geçersiz zincirde katman geçerli FK pozunda kalır. Zoom bu kararları değiştirmez.

**Uyumluluk.** Yeni ayarlar isteğe bağlıdır. Kayıtlı `bend` dirseğin hedef doğrusuna göre tarafını ifade eder. Rapordaki dirsek açısının sinüs işaretiyle bire bir kopyalanmamalıdır. Yeni çözüm politikası eski dosyanın görünümünü değiştiriyorsa eski politika varsayılan olarak okunur ve geçiş açık bir komut olur. Geçerli karede Keep World yalnız o örnekteki konum ve yönü korur. Sayısal açı veya kaynak key yazılması gerekiyorsa etkilenen kanallar işlemden önce gösterilir.

### Faz 1 kabul sahneleri

| Deneme | Beklenen sonuç |
|---|---|
| Uzunluklar 120 ve 90 px, rapor koordinatlarında hedef (140, 80) | Her iki dal aynı uca ulaşır. Rapor ekseninde örnek açı çiftleri (−3.675666°, 80.674847°) ve (63.165428°, −80.674847°). Editör karşılaştırması eksen dönüşümünden sonra yapılır. |
| Aynı kol için hedef (250, 0), ardından (10, 0) | Uç sırasıyla (210, 0) ve (30, 0). Gösterilen sapma 40 ve 20 px. Hedef katmanı yerinde kalır. |
| Omuz 0–90°, dirsek 0–60°, aynı (140, 80) hedefi | Rapor ekseninde en iyi aday (4.459885°, 60°), uç (158.439506, 90.536860), hata 21.237721 px. Yalnız açı kırpma 25.084541 px hata bırakır. |
| Eşit uzunlukta kök üzerindeki hedef, ters yön, 90° döndürülmüş veya aynalı üst grup | Sonlu poz, kararlı taraf ve doğru yerel limit. Eşit olmayan uzunlukta kök hedefinin hatası uzunluk farkıdır. |
| Hedefin kendi zincirinden sürülmesi, aynı ekleme iki çözücü, sıfır uzunluk | Açıklayıcı tanı, yarım bağlantı veya yeni key oluşmaması. Hedef silme ve Undo bugünkü referans temizleme/geri getirme davranışını korur. |
| 1200 ms süreli döngülü timeline’da son kareyi seç. Auto açıkken IK hedefini iki eksende sürükle, Esc’ye bas. Tekrar sürükleyip bırak ve bir kez Undo, ardından Redo yap. | Esc hedefi ve bileği başlangıç pozuna getirir, anahtar ve geçmiş eklemez. Bırakma yalnız hedefin değişen konum kanallarını 1200 ms’ye yazar. 0 ms anahtarı korunur. Undo ve Redo konumu ve iki kanalı birlikte geri alır ve uygular. |
| 14 px genişliğinde seçili hedefi nişangâhın merkezinden sürükle. Aynı hareketi hedef olarak atanmış boş grupla dene. | Hedef iki eksende taşınır ve şeklin boyutu korunur. Anahtarlar yalnız hedefin değişen konum kanallarına eklenir. |
| İlk timeline öncesinde Auto açıkken hedefi sürükle. | İlk timeline ve hedefin konum anahtarları hareketle aynı Undo adımında oluşur. Esc sahneyi ve geçmişi korur. |
| Fareyle hedef taşıma, Esc, Undo/Redo, kaydet/aç, karışık sırayla kare ve alt kare değerlendirme | Aynı sahne, zaman ve girdiler aynı pozu üretir. UI–MCP komutları eşdeğer kaynak ve tanı verir. Editör ve player örnekleri tolerans içinde örtüşür. Dışa aktarılan görsel yalnız eseri içerir. |

Raporun sınırlı ve sınırsız kol örneğindeki sayılar plan hazırlanırken bağımsız trigonometrik hesapla kontrol edildi. Bunlar kabul verileridir. Erişim ölçümleri ortak kare sonucunda kullanılabilir. Ortak kare sonucu etkin omuz ve dirsek sınırlarını, çözülen açıları ve ters dal kullanıldığında bu bilgiyi de içerir.

## Faz 2 — İleri özellikler ve bağımlılıklar

| Dilim | İçerik | Açılma koşulu |
|---|---|---|
| **Animatör kontrolleri** | IK/FK ağırlığı ve her iki yönde poz eşleme uygulandı. Bend guide ve FK/IK ghost sonraki dilimdedir. | Ağırlık 0 FK, 1 IK. Omuz ve göreli dirsek açıları en yakın tur üzerinden karıştırılır. İleri kinematik her iki segmentin uzunluğunu korur. |
| **Hedef uzayları ve el yönü** | Dünya, grup ve başka nesne/soket referansı. Nesneyi elden ele geçirme, geçiş anında Keep World, ayrı el dönüşü ve kavrama ofseti. | Zamanla değişen graf doğrulaması. Geçiş ofseti bağlama anında bir kez hesaplanır. Bilek konumu ve avuç yönü ayrı denetlenir. |
| **Soft IK ve stretch** | Yumuşak erişim, uzama üst sınırı ve isteğe bağlı görsel squash. İstenen hedef, etkin hedef ve gerçek uç ayırt edilir. | Sabit uzunluklu temel geçmeli. Etkin uzunluk her kare kaynak uzunluktan türetilir. Softness sıfırda eski poz geri gelir. |
| **2D mesh skin** | Ters bind matrisleri, vertex ağırlıkları, etki düzenleme ve deforme seçim sınırları. Mevcut Mesh2D/modifier altyapısıyla bütünleştirilir. | Bind karesinde aynı geometri, UV ve vertex kimlikleri. Ortak üst grup hareketi bir kez uygulanır. |
| **Uzun ve ortak zincirler** | Önce tek hedefli CCD/kısıtlı FABRIK. Ardından somut kullanım gerektirirse Spline IK, ortak eklemler için DLS, çoklu pin, kayan eklem ve kapalı mekanizma. | 16/32 segmentli referans sahne, deterministik iterasyon bütçesi, hata ve takılma tanısı. İterasyon sınırına ulaşmak geometrik erişilemezlik kanıtı sayılmaz. |
| **Bake ve dağıtım** | Ortak BakeService üzerinden açı/hedef kanalları ve dışa aktarım seçenekleri. Çözücü politikası ve desteklenen yetenekler runtime manifestinde belirtilir. | Faz 1’den itibaren sürümlü save/load ve player eşliği. Bake sonrası key azaltma, uç hatası ve varsa mesh hatasıyla ara zamanlarda doğrulanır. |

Raporun ileri bölümleri s. 15–23 ve 30–37 bu dilimlerin teknik referansıdır. Performans hedefleri gerçek sahne ve cihazda ölçülecek.

### IK/FK ağırlığı ve poz eşleme

Zincirin üst parçasını seçip **Properties → Link & IK** sekmesini aç. **IK weight (%)** alanına 0–100 arasında bir değer gir. Eski kayıtlar %100 IK ile açılır. Ara değerlerde hedef ile gerçek uç arasındaki mesafeyi viewport ve panelde görebilirsin.

- **Match to FK** görünen omuz ve ön kol pozunu bağlantıların bağlama uzayına geri taşır ve ağırlığı %0 yapar. Hedef bundan sonra bağımsız hareket edebilir.
- **Match to IK** hedef pivotunu görünen uca taşır, mevcut dirsek tarafını bulur ve ağırlığı %100 yapar. Tam katlanmada omuz yönünü korur. Bir limit ya da başka bir sürücü aynı pozu engelliyorsa editör nedeni gösterir ve işlemi iptal eder.
- Her eşleme tek Undo adımıdır. Manual modda anahtarlı bir kanal aktif timeline’ın yerel karesine yazılır. Anahtarsız kanalda kaynak değer güncellenir. Auto Key ile yeni kanallar açılır. İlk eşleme sıfırdan sonraysa yeni kanallar önceki değerlerini başlangıçtan geçiş karesine kadar tutar.

Kaydedilen ağırlık üst katmandaki `twoBoneIK2d.weight` alanıdır. Timeline bu sayıyı 0–1 arasında örnekler. [Poz eşleme komutu](../../../src/lib/rig2d/matchPose.ts) ve [kabul testleri](../../../src/lib/rig2d/matchPose.test.ts).

**Bağlı editör kontrolü (26 Kasım 2026).** 600 ms’de %40 IK ile bükülmüş kol, iki Match düğmesiyle ayrı ayrı eşlendi. Omuz (170; 180), dirsek (286,121; 210,264), uç (374,257; 192,042) kompozisyon pikselinde korundu. FK eşlemesinde PNG kareleri aynıydı. IK eşlemesinde değişen pikseller hedef işaretinin eski ve yeni konumlarıyla sınırlıydı. FK ve IK uçları arasında çift yönlü geçiş, Undo/Redo ve dosyayı yeniden açma aynı pozu verdi.
