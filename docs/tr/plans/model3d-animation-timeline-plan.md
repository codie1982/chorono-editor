# 3D Animation Timeline, Dope Sheet ve Curve Editor planı

**Durum:** ilk uygulama, 16 Kasım 2026. Özel 3D klip, kanal sahipliği,
Timeline/Dope Sheet/Curve Editor ve aşağıdaki kayıtlı kanallar çalışır. Son
bölümdeki ileri kabul maddeleri ayrıca izlenir.

**16 Kasım görünüm güncellemesi:** Animation dock, seçili 3D nesnenin kendi
özellik ve anahtarlarını gösterir; seçimsiz durumda 3D sahne özeti gösterilir.
Timeline nesne özeti, Dope Sheet nesne → özellik grubu → kanal satırları ve
Curve Editor aynı nesnenin sayısal kanallarını kullanır. Sol eğri listesinde
görünürlük seçimi yalnız UI durumudur; renk/boolean anahtarları Dope Sheet'te
kalır. `modelTrackScope.ts` kararlı primitive/node ID'lerine göre kapsamı
belirler; dış 2D `transform` yolu kabul edilmez. `ModelCurveEditor.tsx`, ortak
`CurveEditor`'ın sayısal algoritmalarını yeniden yazmadan tam hedef filtresi ve
kompakt grafik yerleşimi sağlar. Seçim veya panel düzeni sahne JSON'una girmez.
Kullanım: nesneyi Scene Explorer/viewport'ta seç, Animation'da özel klibi aç,
Properties'te bir kanalın key düğmesine veya Set Key'e bas, Dope Sheet'te
özellikleri aç ve Curve Editor'da sayısal eğrileri düzenle. Panel ayırıcıyla
timeline yüksekliği ayarlanabilir.

## Uygulanan giriş noktaları

- `src/components/detail/ModelContentTimeline.tsx` üç 3D görünümü, ortak
  playhead'i ve kapsamlı Set Key eylemini sunar. `ModelContentKeys.tsx` 3D
  nesne/özellik ağacını ortak timeline sürükleme ve key komutlarına bağlar.
  `ModelAnimationKeyContext.tsx` yalnız Animation alanında, seçili klip varken
  Properties alanının tek kanallı key düğmelerini açar.
- `src/lib/model3d/animation/modelChannels.ts` mevcut kaynak için açık kanal
  listesidir; `modelPrimitiveChannels.ts` primitive ID yolunu okur, yazar ve
  yalnız render karesinde dizi indeksine çevirir. `ModelClipDraft` bu özel
  yolları `model3d.animation.version: 2` ile kaydeder; eski v1 klipleri aynı
  anlamda okur. Scene JSON ve Undo'da UI seçimi veya örneklenmiş kare tutulmaz.
- Ana 2D Timeline `model3d` alanını dışlamayı sürdürür. 3D dock yalnız modelin
  özel klibini açar; aynı sahnede 2D transform ve 3D Z keyleri birlikte
  değerlendirilir. Box silindiğinde ona ait özel trackler aynı yerel işlemde
  kaldırılır. Mevcut geometri sahibi en çok 16 primitive tutar ve her türetilmiş
  mesh için kaynak bütçesi lease'i kullanır; geometri değişince eski mesh
  bırakılır.

**Kalan sınırlar:** Çok sayıda hareketli ölçüde frame başına mesh yeniden
üretimi için performans profili ve çoklu frame önbelleği yoktur. Imported asset
revizyonunu yeniden bağlama arayüzü ve primitive kopyasında key kopyalama eylemi
ayrı çalışmadır. Curve Editor boolean/renk keylerini sayısal eğriye dönüştürmez;
bu keyler Timeline ve Dope Sheet'te düzenlenir. Animasyonlu topoloji,
modifier parametreleri ve native glTF kemik key dönüşümü kapsam dışıdır.

## Amaç ve mevcut temel

Animation çalışma alanındaki alt panel, seçili 3D sahnenin **özel içerik klibini**
düzenleyecek. X/Y yanında **Z** konum, dönüş ve uygun node ölçek kanalları
görünür ve keylenebilir olacak. 3D sahnenin dışındaki 2D kutu transform/opacity
keyleri bu panelde görünmeyecek; onlar ana 2D Timeline'da kalacak. İki klibin
değeri aynı çıktı karesinde mevcut frame değerlendirme sırasıyla birleşecek.

Mevcut `ModelContentTimeline` özel klip, Set Key, key satırları ve Curve
görünümü sunuyor. `MODEL_CONTENT_PATHS` sahne yerleşimi ve çıktı kamerasını;
`modelContentPaths` imported instance/node için XYZ kanallarını zaten tanıyor.
`ModelClipDraft` iç klipleri ana Timeline'dan ayrı sahipleniyor. Eksikler:
authored primitive kanalları yok, key listesi düz, gerçek 3D Dope Sheet
bağlanmamış, Curve/Dope etiketleri nesne ağacını ve eksenleri göstermiyor.

## Görünüm ve etkileşim

- Animation alanının alt dock paneli **Timeline / Dope Sheet / Curve Editor**
  sekmelerini, tek klip seçimini, playhead'i ve seçili key kümesini paylaşır.
  Viewport, Scene Explorer ve Properties aynı nesne seçimini kullanır; timeline
  satırına tıklamak 3D nesneyi seçer. Panel düzeni yalnız yerel görünüm durumudur.
- Sol hiyerarşi `Scene > object/instance > node > Transform/Geometry/Camera/
  Light/Material > property > X/Y/Z` biçimindedir. Yalnız mevcut 3D kaynak
  nesneleri ve seçili özel klibin kanalları listelenir. Boş key satırı, key
  eklenebilen seçili özellik için gösterilebilir. Nesne adı değişince etiket
  değişir; key hedefi kararlı ID ile aynı kalır.
- X kırmızı, Y yeşil, Z mavi kullanılır. Dope Sheet grup satırında özet elmas,
  alt satırlarda gerçek keyler; Curve Editor'da sayısal kanalların eğrileri ve
  birimleri görünür. Farklı birimli değerlerde eksen/normalize seçeneği
  belirtilir. Boolean ve renk keyleri Dope Sheet'te görünür; eğri editöründe
  sayısal Y değerleri gibi gösterilmez. 2D ana şerit/renkler 3D dock'a taşınmaz.
- Properties'te keylenebilir alanın yanında mevcut zamanda key var/yok durumu
  ve tek kanallı **Set Key** eylemi bulunur. Üst Set Key seçili nesnenin veya
  seçili kanal grubunun uygun alanlarına uygulanır; `All` bütün 3D sahneye
  sessizce key basmaz. Seçili klip varken mevcut inspector düzenleme davranışı
  yerel zamanda key yazar; bu durum UI'da açıkça gösterilir. Klip yokken alan
  statik kaynağı düzenler. İnceleme kamerası ve viewport gezinmesi key yazmaz.
- Key sürükleme, çoklu seçim, silme, easing, numerik değer düzenleme, Undo,
  Cancel/Apply ve tek ana Undo adımı mevcut ortak Timeline komutlarıyla çalışır.
  Clip seçimi, panel açık/kapalı durumu ve seçili keyler kaynakta tutulmaz.

## Kanal sözleşmesi

Yalnız açık kayıtlı kanallar keylenir; herhangi bir `model3d.*` yolunu kabul
eden genel wildcard eklenmez. Kaynak değerleri metre (imported node yerel glTF
birimi), dönüşler XYZ Euler derece, ölçek boyutsuzdur. UI cm/in/px gösterebilir;
key değeri kaynak biriminde saklanır. Mevcut derece keyleri bileşen bazında
enterpole edilir; açı sarması otomatik değiştirilmez, tam tur için açık değer
kullanılır. Eski kliplerin anlamı korunur.

| Hedef | Planlanan keylenebilir alanlar | Değer türü / sınır |
| --- | --- | --- |
| 3D sahne ve imported instance | Position XYZ, Rotation XYZ, Scale | Sayı; mevcut güvenli aralık ve birimler |
| Imported node | Position/Rotation/Scale XYZ, Visible | Sayı veya kesikli boolean; native clip'in sahip olduğu TRS kanalı ayrıca keylenemez |
| Authored Box/Sphere/Cylinder/Cone/Plane | Position XYZ, Rotation XYZ, Scale, Visible | Kararlı `object.id` hedefi; ilk genişletme |
| Çıktı kamerası | Yaw, Pitch, Roll, Distance, FOV, Target XYZ, ortho height | Sayı; kamera sınırları; inspection kamera hariç |
| Primitive geometri | Width/Height/Depth/Radius | Topolojiyi koruyan pozitif sayı; frame başına türetilmiş mesh ve bütçe kontrolü |
| Işık ve ortam | Işık Position XYZ, ambient/key intensity, environment intensity/exposure ve renkler | Sayı veya türlenmiş renk |
| Materyal | Color, roughness, metalness, opacity | Türlenmiş renk veya [0,1] sayı; mevcut materyal/asset revizyonuna bağlı |
| Native animasyon | Desteklenen `native.timeMs` | Mevcut sayı kanalı; klip seçimi, trim, speed ve loop yapısal ayar kalır |

Nesne adı, asset/texture seçimi, primitive türü ve segment/topoloji sayısı,
freeze, editör hide/izolasyon, render-exclude ayarı, viewport/grid tercihi,
modifier sırası ve bilinmeyen PBR alanları keylenmez. İleride modifier
parametresi eklenecekse kendi kayıtlı kanal tanımı, sahiplik ve değerlendirme
adaptörüyle açılır; eksik algoritma için çalışan key düğmesi gösterilmez.

## Kimlik, sahiplik ve frame akışı

- Primitive key hedefi dizi indeksi değil **kararlı `object.id`** taşır.
  `modeling.objects[]` kaynağı değiştirilmeden, model kanalı okuma/yazma ve
  render-frame projection için ID çözümleyen ayrı adaptör kullanılır. Generic
  `readPropertyPath`/`writePropertyPath` veya ana 2D key komutları dizinin
  sırasına bağlanmaz. Silinen hedef açık tanı verir; başka primitive'e geçmez.
- `modelChannels`, validator, `modelEditBase`, `useModelClipEditor`,
  `modelContentFrame` ve render materialization aynı kayıtlı kanal tanımına
  dayanır. Inspector değişimi yalnız gerçekten düzenlenen leaf'e key yazar;
  örneklenmiş kardeş değerleri static base'e geri koyar. `sampleModelChannel`
  sayı/boolean/renk için türlenmiş doğrulama yapar; renk enterpolasyonunda
  mevcut ortak typed-value algoritması kullanılır.
- Ana 2D Timeline'ın `model3d` dışlama kuralı korunur. 3D paneli yalnız bound
  owner ve seçili iç klibi okur; 2D `transform`, opacity ve diğer katman keyleri
  çizilmez veya toplu işlemlere alınmaz. Curve Editor'ın mevcut content context'i
  korunur; Dope Sheet'e aynı context/owner/clip kapısı eklenir. Görünüm filtresi
  tek başına yetki sayılmaz; her komut kaynak tarafında tekrar doğrulanır.
- Parametre/Wire, turntable, native TRS ve dış key çakışmaları mevcut tek-yazar
  kuralıyla reddedilir. Primitive silme ilgili keyleri aynı yerel Undo adımında
  kaldırır; Undo geri getirir. Kopyalama yeni nesne ID'sine keyleri yalnız açık
  kopyalama eylemiyle yeniden hedefler. Imported asset revizyonu değişirse
  node/material hedefi isimle otomatik bağlanmaz; tanı gösterilir.
- Yeni hedef/tür kayıtları için `model3d.animation.version: 2` kullanılır;
  v1 klipleri doğrudan okunur ve ilk yeni kanal keylenene dek yeniden yazılmaz.
  `Model3DData.version: 4` ve mevcut dış sahne Timeline biçimi korunabilir.
  Runtime/GPU nesneleri, örneklenmiş frame ve UI seçimi JSON'a girmez.

## Uygulama sırası

1. **Görünüm ve mevcut XYZ:** Alt panelde üç sekme, ortak transport/key seçimi,
   3D nesne/kanal ağacı, eksen renkleri ve gerçek content-context Dope Sheet.
   Önce mevcut sahne, kamera ve imported node XYZ keyleriyle uçtan uca doğrula.
   Bu aşamada kaynak biçimi değişmez.
2. **Primitive TRS ve görünürlük:** ID tabanlı kanal adaptörü, inspector key
   göstergesi, playback/render/export, silme/kopyalama ve v2 klip validasyonu.
3. **Diğer özellikler:** Topolojiyi koruyan primitive ölçüleri, ışık/ortam ve
   materyal sayı/renk kanalları. Değişen geometri için bounded cache/lease ve
   modifier girdisi değişirse açık yeniden bağlama tanısı. Sayısal olmayan
   kanallar yalnız desteklendiği editör görünümünde açılır.

## Kabul

- Aynı sahnede dış 2D `transform.x` ve iç 3D `position.z` keyi: 2D panel yalnız
  dışı, 3D Timeline/Dope/Curve yalnız içi gösterir; çıktı ikisini birlikte
  değerlendirir. Başka 2D katman keyleri 3D seçim/toplu silmeye girmez.
- Box ve imported node için X/Y/Z ayrı key, çoklu key taşıma, tek Undo; kamera
  Target Z ve Rotation Z keyleri scrub, loop, geriye seek, iki projection ve
  kaydet/aç sonrasında aynı kareyi üretir. Eksen etiketleri ve birimler doğrudur.
- Seçili primitive silinince hayalet key kalmaz; Undo geri getirir. ID değişimi,
  asset revizyonu veya sürücü çakışması yanlış hedefe yazmak yerine tanı verir.
- Ölçü/rengi animasyonlu nesnede viewport, raster ve export aynı frame'i verir;
  CPU/GPU kaynakları seek/loop/Cancel sonrasında bırakılır. Eski v1 klip ve
  ana 2D Timeline keyleri byte/semantik olarak korunur.
- Her aşamadan sonra ilgili invariant ve adapter testleri, gerçek tarayıcıda
  Timeline/Dope/Curve görünümü, `npm test`, `npm run mcp:build` ve sunucu kapalıyken
  `npm run build` çalıştırılır.

**Kapsam sınırı:** Native glTF bone keylerini Chorono keylerine topluca dönüştürme,
rig/weight editörü, animasyonlu topoloji ve yeni 2D katman türü bu planda yoktur.
