# İç animasyon — mevcut kod ve risk incelemesi

13 Kasım 2026. Bu belge bir kod/geçmiş denetimidir; yeni bir animasyon motoru
uygulama kararı veya tamamlanmış nested playback desteği değildir. Kullanıcının
önceki denemelerde yaşadığı riski yeniden üretmeden önce mevcut güvenli sınır
korunur. Bu incelemede çalışma zamanı veya kayıt formatı değiştirilmedi.

**Sonraki kullanıcı netleştirmesi:** İç animasyon gerekli ürün yeteneğidir;
risk nedeniyle kapsamdan çıkarılmaz. [Nesneye ait iç animasyon planı](item-owned-animation-plan.md)
mevcut `Timeline[]` + owner/kanal koruması ve yerel zamanla dar ilk teslimi
tanımlar. Genel recursive içerik ile ilk çalışan nesne-içi klip aynı kapsam
değildir. Aşağıdaki erteleme genel recursive motor içindir.

## Sonuç ve plan düzeltmesi

Genel, iç içe ve bağımsız saatli alt sahneleri bugünkü düz Timeline listesine
doğrudan eklemek yüksek entegrasyon riski taşır. Ortak detay ekranının varlığı
bu sorunu çözmez. Önceki detay planında ortak iç animasyon çekirdeğini ileri
3D'nin zorunlu önkoşulu gibi yazmak fazla genişti; bu zorunluluk kaldırılır.

DET0–DET1'in statik taslak/Apply/Cancel sınırı korunur. Poly → UV → ileri 3D
→ bileşen/karakter sırası değişmez. İleri 3D'de materyal, ışık, kamera ve node
araçları genel nested motorun tamamlanmasını beklemek zorunda değildir.
Bağımsız klip ve recursive içerik ayrı kabul kapılarıdır; bu belge onları
başlatmaz. 3D film bir kullanım örneğidir, hedef veya kabul koşulu değildir.

## Önceki denemeler hakkında doğrulanabilenler

Erişilebilir Git dalları, evaluator geçmişi ve ilgili planlar incelendi.
Önceki başarısız denemeye ait belirli bir nested uygulaması/revert commit'i
bulunamadı. Bu, denemenin yapılmadığı anlamına gelmez; kesin olay nedeni veya
hangi sürümde bozulduğu mevcut kanıtla söylenemez.

[4 Kasım bileşen planı](component-library-2d-plan.md), ilk animasyonlu teslimi
tek kliple sınırlar; iç içe bileşen ve bileşen state machine'ini C2'ye ayırır.
Owned klibin ayrıca global listede değerlendirilmemesi, bağımsız instance
durumu ve cycle/depth kontrolü açıkça istenir. Bu tarihsel bir risk sınırıdır;
çalışan nested altyapının kanıtı değildir. `animationIndependence.test.ts`
testleri de düz Timeline düzenleme bağımsızlığını kontrol eder.

## Mevcut kodun sınırı

| Kod sahibi | Doğrulanan davranış | İç animasyon için risk |
| --- | --- | --- |
| `src/lib/evaluator.ts` / `evaluateTimelines` | Düz Timeline listesini aynı hedef anahtarlı overrides haritasına yazar; sonraki yazı kazanır. `ExternalTimelineTime` tek Timeline'ı sürer. | İç klibi global listeye de katmak çift değerlendirme ve hedef çakışması yaratabilir. |
| `src/lib/runtime/evaluateSceneFrame.ts` | Timeline/host tabanı → parametre binding → doğrusal binding → Wire/expression sırasını kesin composition milisaniyesiyle yürütür; source'a yazmaz. | İç değerlendirme bu sırayı veya mevcut sahnelerin zaman anlamını sessizce değiştiremez. |
| `src/app/hooks/useSMRuntime.ts`, `src/lib/player/ChronoPlayer.ts` | SM state Timeline'ları genel sahne zamanıyla değerlendirilir; segment için ayrıca dış yerel zaman yolu vardır. | Yalnız detay playhead'i eklemek editör/player/state geçişleri için bağımsız instance saati sağlamaz. |
| `src/lib/render/renderers/FrameSequenceRendererPlugin.ts` | Sprite seçimi render zamanından ve katman başlangıcından hesaplanır. | Yerel zaman keylere uygulanıp medya/sprite'a uygulanmazsa aynı içerik farklı zamanlarda görünür. |
| `src/lib/clone/InstanceResolver.ts` | Kaynağın görsel alanlarını ince instance'a taşır; beş bağlantı sınırı vardır. | Bu, bağımsız klip/pose/state runtime'ı değildir. Aynı kaynağın iki kullanımı birbirinin pozunu değiştirmemelidir. |
| `src/lib/model3d/resources/ModelAssetService.ts` | Kaynak dosya korunur; statik dilimde runtime parse öncesi animations listesi boşaltılır. Parsed kaynaklar bütçeli cache'te paylaşılır. | Klip oynatmayı açmak için mutable pose/skeleton durumunun instance sahipliği gerekir; shared asset'e tek oynatıcı eklemek yeterli değildir. |
| `src/lib/editor/detail/ItemDetailSession.ts` | Tek öğenin izinli içerik alanlarına patch üretir; Timeline/başka öğe değişimi ve stale revision reddedilir. | Mevcut Apply sözleşmesi genel alt belge/klip düzenleme sözleşmesi gibi kullanılamaz. |

Parent dönüşümü, ID/referans eşleme, authoring kökeni, Undo, hit-test/bounds,
LOD, medya hazırlığı ve çıktı aynı çözülmüş frame'i kullanmalıdır. Yeni bir
alt sahneyi yalnız viewport'ta çizmek veya renderer içinde source'a katman
eklemek bu sözleşmeleri karşılamaz. Genel export iyileştirmesi daha sonra
olsa da yeni özelliğin asgari zaman/görüntü ve save/load eşliği ertelenemez.

## Birbirinden ayrı tutulacak yetenekler

| Yetenek | Genel iç içe animasyon motoru gerekir mi? | Güvenli ilerleme sınırı |
| --- | --- | --- |
| Seçili grup/karakterin mevcut keylerini detayda göstermek | Hayır | Mevcut global zaman ve gerçek Timeline/track kimlikleriyle filtreli görünüm tasarlanabilir. Bağımsız içerik saati varmış gibi sunulmaz; henüz uygulanmadı. |
| 2D kemik grupları, rigid attachment ve FK authoring | Hayır | [Character Motion planındaki](../character-motion-plan.md) tek `parentId` ağacı ve mevcut transform keyleri kullanılabilir. IK/skin/clip state ayrı teslimdir. |
| İçe alınmış tek 3D klibi model kutusu içinde oynatmak | Genel recursive motor şart değil | Önce tek seviye, yaprak içerik ve kesin zamandan örnekleme sınırı araştırılır. Per-instance pose ve çıktı/resource kabulü yine gerekir. Klip keyleri ana 2D Timeline'a aktarılmaz. |
| Aynı animasyonlu bileşenin farklı başlangıçlı iki örneği | Açık instance/klip zamanı gerekir | C1'de owned clip ve scoped hedefler doğrulanmadan açılmaz; global listede ikinci kez çalıştırılmaz. |
| İç içe bileşenler, yerel SM/olay/ses ve alt sahneler | Evet, kapsamlı sözleşme gerekir | C2/ayrı ileri kapsamda bekler. Statik detay host'una gizlice eklenmez. |

Ortak host ve mevcut track interpolasyonu yeniden kullanılabilir. Bu, bütün
boyutları ve runtime'ları tek bir yeni motorla değiştirmek anlamına gelmez.
2D affine, 3D TRS, medya ve stateful runtime açık sahiplerinde kalır.

## Bağımsız oynatmayı açmadan önce kabul kapısı

Bu maddeler gelecekteki dar deneyin kabul koşullarıdır; bu incelemede yeni
subsystem, schema veya runtime geliştirilmez:

1. Eski sahneler değişmeden eski evaluator yolunda kalır. Otomatik sahne
   migration'ı ve load sırasında kendiliğinden klip açma yapılmaz.
2. Önce tek seviye/tek klip; nested referans ve SM/olay/ses üretimi kapsam
   dışıdır. Desteksiz içerik açıkça bildirilir. Kaynak dosya korunur.
3. Parent composition ms → içerik ms eşlemesi başlangıç/offset/hız/loop/hold
   sınırlarıyla tanımlanır. Seek, geriye scrub ve aynı zamanı tekrar örnekleme
   aynı frame'i üretir; export UI oynatma döngüsüne bağımlı olmaz.
4. Aynı asset'in farklı zamanlardaki iki örneği bağımsız poz verir. Immutable
   kaynak paylaşılır; mutable pose, skeleton ve playback state paylaşılmaz.
5. Dış kutu transform'u ve iç poz birer kez uygulanır. Preview/player/raster,
   parent transform, selection/bounds, mask ve LOD senaryoları karşılaştırılır.
   Desteksiz çıktı sessizce içerik atlayamaz.
6. Kaydet/aç, portable, clone/remap, insan düzenlemeleri, tek Undo/Redo ve
   revision/Cancel korunur. Per-frame dense veri normal JSON/history'ye girmez.
7. Hazırlama/instance/cache kaynakları mevcut bütçelere bağlanır. Kapat/aç,
   instance silme, geç async sonuç ve iptal testlerinde kaynaklar bırakılır.
   Eski sahnelerde yeni iş yükü yokken ek decode/recursive evaluation başlamaz.

Eski sahne davranışı değişiyor, iki instance birbirini etkiliyor, zaman/çıktı
eşliği veya kaynak sınırı sağlanamıyorsa entegrasyon açılmaz. Dar klip deneyi
başarısız olursa statik kutulu 3D ve mevcut düz 2D key authoring devam eder;
genel motoru yeniden yazmak bu açığı kapatmanın varsayılan yolu değildir.

## Bu incelemenin doğrulaması

Mevcut sınırı kontrol etmek için yedi test dosyası çalıştırıldı: düz Timeline
düzenleme bağımsızlığı, instance çözümü, sprite frame matematiği, statik detay
oturumu, model iç/dış Timeline sınırı, medya frame context'i ve out-of-range
evaluator entegrasyonu. **53 test geçti.** Bu sonuç mevcut regresyon sınırını
kontrol eder; henüz olmayan nested özelliğin güvenli olduğunu kanıtlamaz.
Doküman değişikliği dışında uygulama kodu, evaluator ve kayıt formatı aynı kaldı.
