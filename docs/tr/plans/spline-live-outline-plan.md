# Canlı Spline Outline — kaynak çizgiye bağlı bant

Durum: **incelendi / uygulama planı**. 23 Kasım 2026.
Bu belge son kullanıcı düzeltmesini tanımlar: Outline, ana çizgiyi düzenlenebilir
kaynak olarak korur; kaynak vertex veya tangent değişince bant güncellenir.
Önceki [bant tesliminin](../spline-outline-band.md) Replace/Keep source davranışı
bu canlı düzenleme ihtiyacını karşılamaz. Bu plan uygulanmış API değildir.

## Kullanıcı davranışı

1. Tek spline nesnesi ve onun mevcut kaynak point/handle/segment kimlikleri kalır.
   Outline açmak yeni bir layer, bağımsız Line veya seçilebilir kaynak Object
   üretmez; kaynak kenarlarını silmez ve polyline ile değiştirmez.
2. Outline ayarları kaynağa bağlıdır. Vertex/handle taşıma ve kaynak geometri
   transformu sırasında bant yeniden hesaplanır. Katman transformu kaynak ve
   bandı birlikte taşır; Edit transformu layer TRS/origin'i değiştirmez.
3. Edit'te kaynak çizgi ve kontrol noktaları düzenlenir; bant canlı sonuç olarak
   görünür. **Kaynak çizgiyi göster** aç/kapat kontrolü yalnız editor kılavuzunu
   etkiler. Kılavuzun gizlenmesi kaynağı silmez, Outline'ı kapatmaz ve geometri
   için Undo oluşturmaz. Edit dışı görünüm/PNG/SVG'de bu kılavuz çizilmez.
4. Kaynak kılavuzu mevcut ghost'tan ayrıdır: ghost edit başlangıcının sabit
   geometrisidir; kaynak kılavuzu o anda düzenlenen güncel çizgidir.
5. **Outline etkin** ayrı kalıcı ayardır. Kapatıldığında bant devreden çıkar ve
   mevcut kaynak spline normal görünümüne döner; kaynak kaybolmaz.
6. Outline kontrol değerleri, mevcut preview/Cancel ile hazırlanıp tek Apply/Undo
   ile canlı tarifi güncelleyebilir. Sonrasında kaynak hareketleri otomatik
   değerlendirilir; her sürükleme sonunda ayrıca Execute gerekmez.
7. **Bake Outline / Stroke to Path** açık bir kalıcı dönüşümdür. Ancak kullanıcı
   bunu seçtiğinde üretilmiş bant kaynak spline konturlarına dönüşür; tek Undo
   canlı kaynak+ayar durumunu geri getirir. Mevcut Offset Path ayrı kalır.
8. Fill/Stroke/alpha/gradient/pattern Properties'te kalır. Native Edit araçları
   geometriyi ve Outline'ın üretim ayarlarını düzenler.

Örnek: iki anchor'lı açık çizgiye Center Width=20 uygulanır. Kullanıcı hâlâ aynı
iki anchor'ı seçer. Birini taşıdığında iki taraftaki 10'ar px bant yeniden oluşur.
Layers/Scene Explorer'da ikinci çizgi veya bant child'ı görünmez. Bake seçilirse
ancak o zaman bant sınırları gerçek edit vertex'leri olur.

## İnceleme bulguları

- `src/lib/spline/band/applyBand.ts`, `keepSource=false` durumunda seçili edge'leri
  `deleteSplineEdges` ile kaldırıp sonuç konturlarını yeni Object olarak ekliyor.
  `true` ise bağımsız kaynak+sonuç bırakıyor. Bu, kalıcı dönüşümdür; canlı bağlantı
  kurmaz. Fonksiyon eski çağrılar için korunmalı, canlı ayar için çağrılmamalı.
- `StrokeToPathModifier` kaynak tarifi saklıyor ve aynı band hesabını kullanıyor;
  fakat `modifierOutputReadOnly`, `editableSplineLayer` ve
  `useSplineEditSelection` generated sonuçta kaynak düzenlemesini kapatıyor.
  Sadece `preservesSourceEditing=true` yapmak doğru değildir: üretilmiş bant
  noktalarının kimlikleri kaynak noktalarıyla aynı değildir.
- Mevcut `useSplineOperationPreview` iptal/stale-result ve tek Apply komutunu;
  modifier source komutları sıralı yeniden değerlendirmeyi zaten sağlıyor.
- `SplineBandBackend`, `SplineArcSampler`, `offsetJoin` ve
  `PolygonClippingBackend` genişlik/cap/join/dash/delik hesapları için korunur.
  Sorun yeni bir offset çözücüsünden önce kaynak/sonuç sahipliğindedir.

## Kaynak düzenleme ve değerlendirme sınırı

Kullanıcıya Outline bir spline'ın canlı ayarı olarak sunulur; hesap sırası mevcut
modifier registry/stack altyapısında yürütülür. Yeni genel runner veya solver
kurulmaz. Kalıcı `strokeToPath`/legacy `outline` kayıtlarının anlamı dosya açarken
sessizce değiştirilmez. Canlı davranış açık, sürümlü bir tarif/capability ile
ayrılır; mevcut Bake/Convert çağrıları kendi sözleşmesini korur.

Akış: **kaynak spline → canlı Outline hesabı → çizim/bounds/hit-test/çıktı için
üretilmiş bant**. Edit point/edge picking ve native komutları kaynak spline'ı
okur/yazar. Viewport ile export değerlendirilmiş bandı kullanır. Bant vertex'leri
kaynak edit kontrolleri olarak sunulmaz; kaynak ve sonuç kimlikleri karışmaz.

Bir source-edit adapter'ı mevcut stack'in sakladığı base Spline'ı veya uygun
Convert Spline authored override'ını açıkça seçmelidir. Kaynak değişimi native
komutla bu sahibi günceller ve downstream sonucu yeniden hesaplar. Genel
readonly guard kaldırılmaz. Upstream modifier'ın ürettiği ve kaynak kimliğine
izlenemeyen bir arageometri doğrudan düzenlenebilir ilan edilmez; uygun kaynak
seçimi gösterilir veya neden belirtilerek işlem reddedilir.

İlk canlı hedef sözleşmesi Object/tam contour kimliklerini izler. Anchor/tangent
hareketleri ve aynı Object'e Refine/Add Vertex sonrası yeni topoloji bu hedefte
kalır. Kısmi Edge zinciri için split/delete sonrası hedef aktarımı ayrıca açık
native topoloji remap sözleşmesi ister; tamamlanana kadar canlı kısmi zincir
kullanımı nedeniyle devre dışı olur. Seçilmemiş kontura sessiz genişletme yoktur.

Kaynak revision'u, etkin ayarlar ve açık hesap kalitesi cache anahtarıdır.
Güncel olmayan worker sonucu atılır; drag sırasında iptal/birleştirme mevcut
bounded job altyapısını kullanır. Pointer-up/Apply sonrası final sonuç güncel
kaynağa aittir. Geçersiz kaynakta eski bandı yeni geometriye aitmiş gibi çizme;
tanı göster, kaynağı düzenlenebilir tut. Geçici tessellation/worker sınıfları
scene/Undo'ya per-frame buffer olarak girmez. Her kaynak hareketi tek Undo olur;
Undo/Redo kaynak ve yeniden hesaplanan bandı birlikte geri getirir.

## Matematik ve ekli planın uyarlanması

- Kaynak Bézier korunur; toleransa göre adaptif örneklenmiş geçici bant yeterlidir.
  Gerçek cubic offset/curve fitting bu kaynak takip düzeltmesinin ön koşulu değil.
- Center Width=20, yerel px uzayında ±10'dur. One Side için Left/Right veya
  kapalı material sınırında Inside/Outside kullanılır. Y-down normal yönü mevcut
  offset sözleşmesidir; ekli formülün işareti doğrudan kopyalanmaz.
- Cap Square ve Join Square farklı işlemlerdir. Mevcut Butt/Round/Square caps
  ve Miter/Round/Bevel joins kullanılır; gerçek Square join ayrı genişletmedir.
- Mevcut cleanup/Boolean motoru yeniden kullanılır. Clipper2 bağımlılığı eklemek
  kaynak takip sorununu çözmez ve bu teslim için gerekli değildir.
- Mesafe animasyonu önceki kullanıcı kararı gereği sonraki fazdadır. Öncelik
  kaynak düzenleme, canlı güncelleme, açık/kapalı yollar ve doğru çıktı eşliğidir.

Ekli metnin 1–3. bölümleri kalıcı offset/outline geometri üretimini anlatırken,
10. bölümü kaynağı koruyan değerlendirilmiş sonucu öneriyor. Bu plan kullanıcı
isteği için 10. bölümün kaynak/sonuç ayrımını esas alır. Autodesk'in belgesi
Outline'ın offset kopya ve açık spline'da kapalı sonuç davranışını açıklar;
Chorono'nun canlı kaynak düzenleme/UI sözleşmesi ayrıca tasarlanmalıdır:
[Autodesk Editable Spline — Outline](https://help.autodesk.com/cloudhelp/2022/ENU/3DSMax-Modeling/files/GUID-EC9BB02A-FDE3-4B50-824E-07BE9E5ACE3C.htm).

## Uygulama sırası ve kabul

1. Kaynak/sonuç adapter'ı, açık capability ve guarded source komutları; eski
   kayıt/caller uyumluluğu. Basit açık çizgide aynı kaynak ID'leriyle canlı bant.
2. Edit picking/overlay/transform kaynak geometrisine bağlanır. Kılavuz toggle,
   Outline etkinliği ve mevcut ghost birbirinden bağımsız doğrulanır.
3. Native panel/sağ tık canlı ayarı günceller; kalıcı Stroke to Path/Bake açıkça
   ayrı komut olur. Properties boya sahipliği korunur.
4. Bent/Bezier, çoklu Object, delikler, refines, kaynak kilit/driver, Undo/Redo,
   save/load, clone/instance ve PNG/SVG/runtime eşliği doğrulanır. Stale/cancel
   testi eski bandın yeni kaynağa yazılmadığını kontrol eder.
5. Temel kabul: Outline aç/kapat/vertex taşıma boyunca kaynak point/handle/edge
   kimlikleri korunur; artan bağımsız Object/layer oluşmaz; yerel genişlik aynı
   kalır; kılavuz export edilmez; geometri Bake yalnız açık komutla gerçekleşir.
