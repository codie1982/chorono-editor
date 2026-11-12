# Input alanlarında değer ve expression düzenleme

10 Kasım 2026. Kullanıcının onayıyla **E−1.5A** olarak plana eklendi.
11 Kasım: **A1 sabit sayısal formül, A2 canlı numeric driver ve A3 boolean/koşul uygulandı**;
[A1 sözleşmesi](../input-expressions.md), [A2 sözleşmesi](../property-expressions.md).
[A3 sözleşmesi](../boolean-expressions.md). A4 typed input ve calculation adapter'ları ile A5 birleşik kabul tamamlandı. [A4 sözleşmesi](../typed-input-expressions.md), [A5 kabulü ve sınırları](../pre3d-acceptance.md). Tamamlanan
E−1.5 parser/Wire/graph/bake altyapısını genişletir.
Önce bu teslim, ardından kalan viewport ve birleşik kullanıcı kabulü V6/E−1.7,
sonra [kutulu 3D/Poly sırası](geometry-material-boxed3d-sequence.md) gelir.
Export ve ikinci genel optimizasyon son aşamalarda kalır.

## Amaç ve kullanıcı akışı

Uygun bir özellik alanı düz değer veya kalıcı formülle yönetilir. Normal
değer girişi ve sürükleyerek değiştirme korunur. Çift tıklama veya görünür,
klavyeyle erişilebilir **fx** düğmesi expression düzenleyicisini açar. Formül,
hesaplanan sonuç, beklenen tür/birim ve hata aynı yerde gösterilir.

- Örneğin genişlik `120` olabilir; expression modunda `1920 / 2` yazılıp
  uygulanınca input **fx 960** gösterir. Yeniden açıldığında formül korunur.
- Enter geçerli taslağı tek undo ile uygular; Escape iptal eder. İlk tıklama,
  çift tıklama veya Enter ardından blur fazladan commit üretmez. Geçersiz
  taslak eski değeri değiştirmez; blur davranışı bütün adapter'larda aynıdır.
- **Convert to value**, o anki geçerli sonucu düz değere dönüştürür; formül
  kaldırma, eski authored değere dönme ve bake birbirinden açıkça ayrılır.
- Kaynak değişirse eski taslak sessizce yazılmaz; kullanıcının taslağı
  korunarak güncel kaynakla yeniden değerlendirme istenir.
- Checkbox, renk seçici ve select'te çift tıklamanın normal tıklamaları önce
  değeri değiştirip sonra editor açmamalıdır. Bu türlerde label/fx üzerinden
  düzenleme girişi, klavye ve normal picker/toggle davranışı birlikte tasarlanır.

Tek seferlik hesap, yalnız sonucunu kaydeden açık bir seçenek olabilir. Kalıcı
expression modunun formülü sessizce silip yalnız sayıyı saklaması kabul edilmez.
A4 UI/API davranışı [typed input sözleşmesinde](../typed-input-expressions.md) uygulanmış alan ve sınırlarıyla kayıtlıdır; A5 kabulü [son raporda](../pre3d-acceptance.md) tamamlanmıştır.
A1 yalnız Apply anında hesaplar; A2 açık timeline saati/named numeric kaynaklarla
canlı hesaplar. Her ikisi formülü saklar; source ile runtime kareleri ayrıdır.

## Mevcut kod ve ortaklaştırılacak sahipler

İncelemede sayısal Properties ve SchemaPanel alanlarının `ScrubInput` üzerinden
geçtiği; GradientInput'ın da aynı bileşeni kullandığı doğrulandı. Üretim TSX
kaynaklarında 32 dosyada 50 doğrudan numeric input, ayrıca 11 range ve 50 checkbox
tanımı vardır. Bunlar kaynak tanımı sayılarıdır; üretilen ekran/alan sayısı değildir.

| Alan | Mevcut sahip / taşınacak adapter |
| --- | --- |
| Properties ve schema alanları | `src/components/inputs/ScrubInput.tsx`, `PropertiesPanel.tsx`, `PropertiesPanel/SchemaPanel.tsx` |
| Renk ve gradient | `src/components/inputs/ColorInput.tsx`, `GradientInput.tsx` |
| Array ve ses | `src/components/array/ArrayFields.tsx`, `src/components/audio/AudioNumberField.tsx` |
| Spline, key ve Timeline | `SplinePointInspector.tsx`, `timeline/KeyframeSpreadsheet.tsx`, key inspector ve toolbar alanları |
| Guide ve ölçü | `canvas/guides/GuideInspector.tsx`, `guidePositionInput.ts`, `canvas/layout/SelectionMeasurementsOverlay.tsx` |
| Parametre, preview, efekt ve diğer formlar | Parameters/RuntimePreview/CurveModifier panelleri, composition/export/bake diyalogları ve doğrudan input kullanan diğer sahipler |

Yeni parser kopyalanmaz. Mevcut `src/lib/core/expression/expressionEvaluator.ts`
genişletilir; Wire, alan ve controller aynı izinli dil/değerlendirmeyi kullanır.
Draft/focus/Enter/Escape ortak giriş bileşeni/hook'unda; tür/birim/sınır
doğrulaması domain adapter'ında; kalıcı yazma editor komutunda kalır.
Schema'nın field capability bilgisi hangi modların desteklendiğini bildirir.
`parseFloat('10+20') → 10` gibi kısmi kabul yolları tam doğrulamaya geçirilir.

## Teslim sırası ve kapsam

| Sıra | Geliştirme | Kabul sınırı |
| --- | --- | --- |
| A1 — uygulandı | Ortak numeric input ve sabit formül düzenleme | Kayıtlı Properties/Schema/Scrub kaynak alanları; sayı, açı, yüzde; fx/çift tıklama, preview, hata, Enter/Escape, tek undo. Formül ve finite source sonucu birlikte saklanır; per-frame driver değildir. Kalan özel input'lar A4'tür. |
| A2 — uygulandı | Kalıcı özellik expression'ı ve bağlam | Versioned source tanımı, stable hedef/kaynak referansları, adlandırılmış çoklu kaynak, açık timeline-local `timeMs`/`timeSec`/normalized time; ortak bağımlılık/çevrim/fallback, save/load/clone ve runtime/bake adapter'ları. [Kabul](pre3d-completion-audit.md). |
| A3 — uygulandı | Boolean ve koşullu ifadeler | Karşılaştırmalar, mantık ve kısa devreli koşul; text case/decoration/path closure checkbox'larında actual boolean. Eski Boolean Wire preset'leri ve v1 refs korunur. [Sözleşme ve sınırlar](../boolean-expressions.md). Kalan lifecycle/input adapter'ları A4'tür. |
| A4 — uygulandı | Diğer türler ve bütün input adapter'ları | Renk, vektör, metin ve select için typed sonuç; Array/ses/spline/key/guide/parametre/efekt ve kalan formlar aynı düzenleme sözleşmesine taşınır. Destek matrisi capability ve testlerle kapanır. |
| A5 — tamamlandı | Birleşik kabul | Klavye/pointer, eski veri, driven channel, undo/redo, portable round-trip, player/raster ve Four Seasons 512 MiB. [Kabul kaydı](../pre3d-acceptance.md); V6/E−1.7 de aynı turda tamamlandı. |

Her input aynı etkileşim ailesini kullanır; bütün alanlar aynı türde formül
sonucu kabul etmez. Numeric alan finite sayı, boolean alan gerçek boolean,
renk/vektör alanı uygun typed değer ve select yalnız ilan edilmiş seçenek kabul
eder. Dosya/asset seçimi ve stable ID alanlarında serbest formül ancak domain
sözleşmesi varsa açılır; expression metni dosya erişimi veya kod yürütme olmaz.

Array count, composition boyutu, key zamanı, export FPS ve bake ayarları gibi
işlem/konfigürasyon alanları formülü açık bağlamda uygular; kendiliğinden her
karede tekrar işlem başlatmaz. Canlı property expression ve uygulama anındaki
hesap aynı UI'yı paylaşabilir, farklı yaşam döngülerini açıkça bildirir.

## Kaynak verisi, animasyon ve değerlendirme sözleşmesi

Formül tanımı numeric/boolean alanın yerine uygunsuz string olarak yazılmaz.
Versioned serializable tanım hedef/kaynak kimlikleri ve beklenen türle saklanır;
değerlendirilmiş sonuç, AST/cache ve çalışma tamponları authored değer ve undo
verisinden ayrılır. Eski projeler düz değer davranışıyla açılır. Kesin şema ve
API adları uygulama aşamasında mevcut Wire/controller sözleşmeleriyle belirlenir.

Mevcut key'ler, controller, binding ve Wire'lar korunur. Öncelik ve aynı kanalda
driver çakışması açık seçilir; yeni fx işlemi bunları sessizce silmez. Set Key'in
authored veya driven değeri örnekleme kararı ve bake/Convert to value davranışı
birlikte tanımlanır. İç referanslar subtree duplicate/Array'de remap edilir;
dış referansların korunması ve eksik kaynağın tanısı test edilir.

Kaynak değişiklikleri bağımlılık grafiğinde değerlendirilir; zaman bağımlı
formüller açık yerel saatten hesaplanır. Her input'a ayrı timer/RAF döngüsü
açılmaz. Parser/AST/dependency/cache bütçeleri, dispose ve invalidation sahipleri
vardır; source'e dense kare dizileri yazılmaz. Çevrim veya geçersiz sonuç halinde
deterministik authored/pre-expression fallback ve görünür tanı uygulanır.

Preview/player/supported export aynı formül bağlamını kullanır. Desteklenmeyen
hedef format sessizce atlamaz; açık bake/fallback verir. MCP/script şemaları ve
canonical skill gerçek capability teslim edildiğinde güncellenir; planlanan
alanlar çalışan API olarak belgelenmez.

## Etkileşimli sahne kontrolleri

Canvas'a eklenebilen Slider, Switch/Checkbox ve Input bileşenleri de plana
dahildir; [ana sıradaki bileşen kütüphanesi aşamasında](geometry-material-boxed3d-sequence.md)
aynı parametre ve expression altyapısını kullanır. Hazır bileşenlerin klavye,
pointer/touch, focus ve değer değişim akışı ayrıca doğrulanır. Editor input'larını
genişletmek bu scene component'lerini kendiliğinden tamamlamış sayılmaz. Raster
video görünüşü taşır; etkileşim desteklenen player/SDK'da çalışır.

## Doğrulama

Literal/formül geçişi ve formülün yeniden açılması; division/domain/finite/tür
hataları; birim/sınır/integer kuralları; mouseDown/drag/mouseUp ve çift tıklama
çakışmaları; Enter+blur tek commit, Escape/iptal; stale kaynak; aynı hedefte
driver çakışması; gerçek boolean ve koşullu kısa devre; exact undo/redo; clone/
Array referansları ve eski/yeni portable save/load birlikte sınanır. UI kabulü
yalnız evaluator sayı testine indirgenmez. Bütün adapter kapsam matrisi tutulur.

Uygulama değişikliklerinde repository'nin test/MCP/build kontrolleri ve gerçek
rendered kabulü çalışır. Four Seasons kontrolü aynı **512 MiB managed bütçeyle**
karşılaştırılır; genel ikinci optimizasyon bu dar kaynak kabulünden ayrı kalır.
