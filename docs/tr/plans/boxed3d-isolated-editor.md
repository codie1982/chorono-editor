# Kutulu model ve izole 3D içerik düzenleyicisi

12 Kasım 2026 kullanıcı kararı. İlk kutulu model diliminin sınırı güncellenir;
izole detay ekranı bu belgede **planlanır**, bugün çalışan bir ekran değildir.
Onaylı Poly → UV → ileri kutulu 3D sırası değişmez; bağımsız tam 3D Modeling
veya Game Engine çalışma alanı bu kararla etkinleşmez.

## Şimdi çalışan sınır

| Alan | Sorumluluk |
| --- | --- |
| Ana 2D sahnedeki model kutusu | Normal 2D konum, dönüş, ölçek, opaklık ve mevcut dış kompozisyon davranışları |
| 2D Timeline / Curve / Dope Sheet | Kutunun dış kanalları; iç model, kamera, ışık ve kemik keyleriyle karışmaz |
| Properties | Temel iç XYZ konumu/dönüşü/ölçek ve kamera kadrajı sabit yerleşim ayarları olarak kalır |
| GLB/glTF içeriği | Özgün dosya ve klipler korunur; ilk dilim sabit pozu gösterir |
| Önceden kaydedilmiş iç 3D track'ler | Veri kaybı olmadan save/open, clone, undo snapshot ve eski değerlendirmede korunur; 2D authoring'de görünmez ve düzenlenmez |

Registry'nin `timelineExcludedPaths` sözleşmesi kutulu model için `model3d`
alt ağacını ayırır. Aynı politika normal Set Key, explicit key/script, paste /
move / delete, authoring gezinmesi ve ortak Timeline hiyerarşisinde kullanılır.
İç property schema'ları 2D editöründe animatable değildir; temel Properties
kontrolleri kaldırılmaz. Statik Properties değişimi Auto Key açıkken iç track
üretmez. Raw source import/restore eski keyleri reddetmez veya temizlemez.

## İleri dilim — çift tıkla izole içeriği aç

1. Model kutusuna çift tıklama veya açık bir **Edit 3D content** komutu aynı
   uygulamada izole bir detay sekmesi açar. Bu giriş henüz uygulanmadı.
2. İç sahne ağacı, model/node seçimi, materyal, ışık ve çıktı kamerası bu
   belgeye aittir. Dış 2D parent, konum, pivot ve kutu boyutu değiştirilmez.
3. İç Timeline yalnız bu içeriğin model/kamera/klip animasyonlarını gösterir.
   GLB klipleri referansla oynatılır; kemik başına bütün keyler ana Timeline'a
   otomatik dağıtılmaz. Klip keylerini native düzenlemeye açma açık, isteğe bağlı
   bir dönüşüm olur; ID/easing/tangent ve dönüşüm kayıpları raporlanır.
4. **İnceleme bakışı** editör oturumuna aittir. Orbit/pan ile modeli incelemek
   çıktı kamerasını ve kameranın keylerini değiştirmez. **Çıktı kamerasını düzenle**
   açık bir eylemdir; Auto Key veya Set Key yalnız iç Timeline'da çalışır.
5. İlk detay sürümü bir draft üzerinde Apply / Cancel sağlar. Apply, belge
   revision'ını doğrular ve içeriği ana editöre tek geri alınabilir işlem olarak
   aktarır. Cancel dış sahneyi değiştirmez. Arada değişen kaynak üzerine sessiz
   overwrite yapılmaz; aynı insan/ajan kökeni ve revision kuralları uygulanır.

## Veri ve zaman sınırları

- İç kaynak sürümlü, serializable ve stable ID'li bir içerik belgesidir. Bugün
  bunun için yeni JSON alanı veya public scripting API ilan edilmedi.
- 2D affine/piksel/derece verisi ayrı kalır. İç 3D matrix/projection, camera,
  UV/normal ve rig rest verisi açık tipli kendi kaynak alanlarında tutulur.
- İç zaman ile ana sahne zamanı için açık bir local-clock adapter'ı kurulur;
  offset, süre, hız, döngü ve seek aynı evaluated frame'e bağlı olur. Duvar
  saati veya ayrı serbest oynatıcı export zamanını belirlemez.
- Kaynak klip, kullanıcı delta/key düzeltmesi ve derived render/bake cache ayrı
  sahipliklerdir. Three/GPU/decoder nesneleri JSON veya undo snapshot'a girmez.
- Mevcut bounded source lease, preparation queue, cache ve global kaynak bütçesi
  paylaşılır. Detay kapatılınca consumer pin'leri bırakılır; stale işler sonuç
  olarak yayınlanmaz. İkinci sınırsız bir model/texture cache'i kurulmaz.
- Dış compositor o andaki iç sahne yüzeyini çizer. 2D kutunun keyleri iç model
  node keylerine dönüştürülmez; iç kamera ana 2D Timeline'a taşınmaz.

## Kabul kapıları

Önce kaynak/detail yaşam döngüsü ve draft Apply/Cancel; sonra node/kamera
Properties + ayrı inceleme bakışı; sonra local Timeline/klip oynatma ve explicit
key düzenleme geliştirilir. Her dilim import, save/open, undo/redo, clone/
instance, resource cancellation ve hazırlanmış raster çıktıyla birlikte biter.

Asgari senaryolar: ana sahnede hareketli model kutusunu taşırken iç klip/kemik/
kamera keyleri aynı kalır; detayda kamerayı düzenleyince ana sahnenin 2D keyleri
aynı kalır; bakışı incelemek çıktı keyi üretmez; Apply tek Undo'dur; Cancel ve
stale revision veri değiştirmez; portable tekrar açılış aynı kadrajı ve zamanı
verir. Henüz uygulanmamış ekran için başarı veya performans iddiası yapılmaz.

Bkz. [ilk dilim](../boxed-3d-first-slice.md) ve
[ana sıra](geometry-material-boxed3d-sequence.md).
