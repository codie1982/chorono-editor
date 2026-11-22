# Spline Outline v2 — geometrik bant ve paylaşılan çizgi stili

Durum: **tasarım önerisi; v2 uygulaması başlamadı**. 22 Kasım 2026.

## Amaç ve yorum

Outline, kaynak çizgiyi sınırları, iç/dış konturları ve vertex'leri olan gerçek
bir alana dönüştürür. Canvas stroke kalınlığına dayanmaz. Genişlik bant geometrisini
değiştirir; dolgu ve desen bu alanı boyar. Önizleme kaynağı değiştirmez. Apply seçili çizgiyi gerçek, düzenlenebilir bantla
değiştirir; Keep source seçilirse bant aynı spline içine yeni Object olarak eklenir.
Her Apply ayrı Undo olur; yeni modifier satırı oluşturulmaz.

Kesinleşen kullanıcı kararı: “Köşelerde ağırlığı artar” ifadesi **vertex yoğunluğu** anlamındadır.
Gövdenin geometrik kalınlığı sabit kalır; köşelerde fazladan kalınlaşma/width
profile bu önerinin parçası değildir. Düz alanlarda eşit yay-uzunluğu aralığı,
eğri/köşelerde daha küçük aralık kullanılır; tüm aralıkların aynı olmasıyla
köşelerde sıklaştırma aynı anda vaat edilmez.

## Mevcut altyapı ve eksikler

- `src/lib/modifiers/spline/OutlineModifier.ts`: gerçek simetrik bant üretiyor;
  kaynak contour'ları sonuçla değiştiriyor. Genişlik toplam bant kalınlığıdır.
- `src/lib/spline/modeling/offsetOutline.ts`: mevcut bant oluşturucu; eğrileri
  0.25 yerel px toleransla örnekliyor, açık uçlarda Butt kullanıyor.
- `src/lib/spline/outline/PlanarOutlineBackend.ts` ve `parallelPolyline.ts`:
  adaptif örnekleme, paralel kontur, Miter/Round/Bevel ve miter-limit altyapısı.
  Topoloji belirsizliği/çökme durumunda tüm işi tanıyla reddediyor.
- `flattenPathContours`, `PathSampler`, planar sınır sınıflandırıcısı ve
  `PolygonClippingBackend`: ikinci bir Boolean/offset motoru yazılmayacak.
- Native spline operasyonları, komut/Undo ve worker yaşam döngüsü kullanılacak.
  Mevcut modifier sınıfları yalnız eski kayıtların uyumluluk yolunda korunacak. Paint, gradient, pattern, dash ve preset davranışı ortak
  Stroke ayarlarıyla paylaşılacak.

Eksikler: tam hizalama/cap/dash bandı, ayarlanabilir dağılım, eğri-fit çıktısı,
çıktı bandına bağımsız boya ataması ve ortak preset/clipboard yönetimi.

## Önerilen sözleşme

Outline v2 ayarları: `widthPx`, `alignment: inside|center|outside`, `cap:
butt|round|square`, `join: miter|round|bevel`, `miterLimit`, `dashEnabled`,
`dashArray`, `dashOffset`, `spacingPx`, `minSpacingPx`, `cornerWeight`,
`curvatureWeight`, `tolerancePx`, `output: bezier|polyline`, hedef contour/edge ID'leri.

Boya: None/Solid/Gradient/Pattern ve alpha; ortak paint kaydı. Kaynak ve bant
ayrı görünüm alabilir. Geometri hesabı paint/React/Canvas'tan bağımsız kalır.
Gerekli yeni çıktı sözleşmesi, **üretilen geometri referansı + ayrı boya ataması**
taşır; katmanın mevcut `style` alanı keyfi biçimde değiştirilmez. Bu v2 ön koşulu,
renderer/SVG/runtime/asset index/portable schema ile birlikte tamamlanmalıdır.

Mesafeler kaynak-layer yerel px, açılar derece, toleranslar aynı uzaydadır.
Zoom örnekleme/topolojiyi değiştirmez; layer TRS ve animasyon dışarıda kalır.
Eski v1 kaydı mevcut Center/Butt/örnekleme davranışını korur; açık sürüm adapter'ı
olmadan eski sahnenin geometri sonucu değiştirilmeyecek.

## Geometri akışı

1. Seçili edge/contour'ları sıralı yönlü path'lere çöz. Kopuk parçaları ayır;
   delikleri planar sınıflandırıcıyla tut. Sıfır uzunluk/cusp/bozuk topolojiyi tanıla.
2. Q/C Bézier'leri adaptif olarak yay-uzunluğu tablosuna dönüştür. Örnekleme,
   hem kiriş sapması hem offset-normal hatası ve maksimum adımla sınırlandırılır.
3. Düz kısımlarda `spacingPx` aralığıyla örnekle. Eğrilik ve köşe yakınlığı
   adımı `minSpacingPx` yönünde küçültür. Özgün köşe ve dash-kesim parametreleri
   sabit tutulur; köşe vertex'i örnekleme sırasında kaybolmaz.
4. Dash açıkken merkez path'i **yay uzunluğunda** parçala; her parçaya cap uygula.
   Kapalı seam fazını deterministik tut. Dotted, yuvarlak kapaklı nokta alanları
   üretir; görünmez sıfır uzunluklu açık path'e dayanmaz.
5. Center için iki tarafa w/2; Inside/Outside için materyal sınırının doğru
   tarafına w üret. Deliklerde yön rolü terslenir. Açık çizgide Inside/Outside
   belirsizdir: UI Left/Right karşılığını açıkça sunar veya Center ister.
6. Butt uçta biter; Square w/2 uzar; Round yarıçap w/2 yay üretir. Miter gerçek
   kenar kesişimidir; limit aşılınca tanılı Bevel fallback. Round/Bevel köşeleri
   kendi geometrileriyle kurulur, yalnız paint join parametresi değiştirilmez.
7. Bant çakışmalarını ortak Boolean ile çöz. Gerçek boşluklar delik, kopuk
   parçalar ayrı element olur. Çöken/terslenen kontur sessizce onarılmaz.
8. Bézier çıktı istendiğinde adaptif curve-fit uygula ve son sınır hatasını tekrar
   ölç. Genel Bézier offset'inin tam bir kübik olduğu varsayılmaz. Fit bütçesi
   aşılırsa tanı döndür; polyline'a sessiz geçme. Polyline ayrıca açık bir seçenektir.
9. Sonuç vertex'leri kaynak contour/segment, t ve curve/corner/cap/dash rolüyle
   ilişkilendirilir. Aynı kaynak/ayar deterministik sonuç verir; topoloji değişimi
   alt seçimleri geçersiz kılar, eski ID yeni bir köşeye sessizce bağlanmaz.

## UI, preset ve clipboard

Edit → Edge/Object → Outline; native aracın önizleme/Apply paneli:

- Geometry: width, align, caps, corners, miter limit ve dash/gap/sequence.
- Sampling: spacing, corner/curvature yoğunluğu ve tolerans; vertex sayısı/hata tanısı.
- Appearance: None/Solid/Gradient/Pattern, stop/alpha ve pattern placement.
- Stroke Preset / Save Custom Preset; Copy/Paste Stroke.

Stroke ve Outline aynı stil editörünü/preset kaydını kullanır. Copy/Paste yalnız
çizgi stilini kopyalar; transform, path, animasyon veya layer ID taşımaz. Outline'ın
örnekleme/geometri ayarları ayrıca “Outline preset” olarak açıkça ayrılır. Custom
preset sürümlü JSON'dur; pattern asset bağımlılıkları portable manifest'e girer.

## Uygulama sırası ve kabul

1. v1/v2 adapter'ı, ayar şeması, kalite/iptal/bütçe tanıları.
2. Saf sampling stratejileri ve kaynak vertex/t eşlemesi.
3. Align/cap/join/dash bant üretimi ve Boolean temizleme.
4. Geometri-boya çıktı entegrasyonu, native Edit paneli ve ortak preset/clipboard.
5. Renderer, SVG, runtime/export, clone/instance ve portable save/load.
6. Gerçek Edit viewport, worker stale-result, Undo/Redo ve görsel karşılaştırma.

Analitik testler: düz çizgi Butt alanı w×L; Square/Round uç uzaması; normal
kalınlık toleransı; Miter limit; tam yay boyunca dash ölçümü. Geometri testleri:
Q/C eğriler, C1 süreklilik/cusp, delikler/iç içe adalar, çoklu/kopuk contour,
çok dar boşluk ve kalınlık büyütürken çökme. Yoğunluk testleri: düz eşit aralık,
köşe/eğrilikte artan örnek sayısı ve sabit köşe konumu. Aynı ayarda zoomlar
arasında aynı topoloji; native Edit ve çıktı görüntüleri karşılaştırılır.

Her faz mevcut kaynakları değiştirmeden test edilir. Apply tek native komut,
her uygulama ayrı Undo; transient preview/ghost/preset clipboard sahneye yazılmaz.
