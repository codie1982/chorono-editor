# Statik grup LOD — ilk sürüm

Bu özellik 2D viewport'ta bir statik alt ağacın çizim komutlarını tek raster proxy
ile temsil eder. Katman/geometri verisi, timeline, undo ve kaynak referansları
korunur. Export ve ghost çizimleri LOD kullanmaz. Yeni bir proje alanı veya MCP
komutu eklenmedi; mod kapsamı 2D/2.5D olarak kaldı.

## Gerçek davranış ve kalite

`CanvasRenderOptions.lod = { zoom }` yalnız viewport için açık opt-in'dir.
`useCanvasRenderer`, gerçek CSS zoom'u aktarır; ghost açıksa opt-in vermez.
`zoom`, CSS piksel / backing piksel oranıdır. En büyük affine stretch ile birlikte
hesaplanan ekrandaki ölçek <=0,65 iken proxy kullanılabilir; mevcut cache 0,85'e
kadar korunur. Böylece eşik etrafında sürekli girip çıkma önlenir. Yakın zoom
önbelleği bırakır ve doğrudan çizime döner.

En az **4 çizilebilir alt katman** gerekir. Şekil, Bezier ve spline renderer'ları
isteğe bağlı `paint.staticRasterSafe` yeteneğiyle katılır. Bu yetenek hem boolean
hem katmana göre karar veren predicate olabilir. Text/media/particle/repeater,
instance, paramBinding, follow-path/motion-path, belirsiz renderer/sınır, maske,
efekt ve source-over dışı blend v1'de canlı çizilir. Shape'in `outside` stroke'u
renderer içinde `destination-over` kullandığı için arka plana bağlıdır ve proxy
kapsamından özellikle çıkarılmıştır.

Alt katmanda ilan edilmiş animasyon veya runtime override varsa grup canlı kalır.
Grubun/ancestor'ın animasyonlu rotation/scale/anchor dönüşümleri de canlı kalır.
Yalnız translation animasyonunda backing yer değiştirmesi tam piksel ise cache
tekrar kullanılabilir; kesirli hareket fazları canlı çizilir. Statik döndürülmüş
ve kesirli konumlar projeksiyon sürümüyle hazırlanabilir. Seçili bir alt katman,
grubu ve parent zincirini LOD'den çıkarır. Gizli/zaman aralığı dışındaki üyeler
ve referans döngüleri muhafazakâr geri dönüş kullanır.

Tek root grubun lineer dönüşümü animasyonluysa bütün alt ağaç v1 kapsamı dışındadır.
Bu durumda frame başına sonuç vermeyecek alt ağaç analizi yapılmaz. Bu genel kısa
yol Four Seasons'ın animasyonlu kamera grubunda da kullanılır; sahne adına göre
özel davranış yoktur.

**Alpha:** outer effective alpha yalnız tam 1 iken proxy kullanılabilir. Çocukların
kendi alpha/frozen değerleri çizim sırasında ayrı ayrı uygulanır. Böylece
non-isolated grubun alpha'sını sonradan birleşik bir bitmap'e uygulayıp örtüşme
görünümünü değiştirme hatası önlenir.

Proxy, bütün kompozisyon boyutunda ayrılmaz. Native paint bounds, stroke/miter
payıyla grup içinde birleştirilir; gerçek Canvas matrisiyle backing alanına
aktarılır, iki piksel AA payıyla integer origin/extent oluşturulur. Offscreen
çizim aynı backing piksel fazını kullanır; ana canvas'a identity transform'da
integer konumla kopyalanır. Boyut/lineer matris/subpixel faz/içerik değişirse yeni
sürüm gerekir; tam piksel pan/translation aynı proxy'yi kullanabilir. Viewport
kırpması cache'in kaynak içeriğine bake edilmez. Ekran dışı aday için yeni proxy
ayrılmaz. Bu geometri ROI'sidir; genel maske/efekt halo/input-ROI işi tamamlanmış
değildir.

Viewport raster birleşimi vektörlerle her pikselde bitwise eşitlik iddiası taşımaz.
Native kalite kontrolü iki görüntüyü aynı filtreyle istenen CSS ölçeğine küçültür;
RGBA RMS farkı <=2 ve kanal farkı >32 olan piksel oranı <=%0,5 aranır. Bu sınırlar
ilk testten beri sabittir. Final export tam vektör yolunu kullanır.

## Sahiplik, bütçe ve geçerlilik

| Modül | Sorumluluk |
| --- | --- |
| `StaticGroupPlan` | Frame-local statiklik, bağımlılık, seçili ancestor ve konservatif bounds analizi. Sahne/index ödünç; kalıcı veri tutmaz. |
| `GroupLodFrame` | Eşik/hysteresis, görünür aday, projeksiyon sürümü, private bake ve proxy birleşimi. |
| `StaticGroupLodCache` | Weak source-scene kimliği; scene değişimi/edit/undo/redo'da eski cache temizliği. |
| `OffscreenCanvasCache.getOrCreate` | Mevcut cache'in genişletilmiş pre-allocation admission, LRU ve owned-store lifecycle sözleşmesi. |
| `boundedContentVersion` | Native JSON ile çakışmasız, boyutu guard'lı sürüm; hash tahmini veya source referansı saklamaz. |

Varsayılan cap **64 MiB / 256 giriş**, içerik anahtarları dahil. Anahtar/sürüm için
UTF-16 byte tahmini de kabul kararına girer. Pending creation bytes reentrant
çağrılarda da rezervasyondur. Tek entry bütçeyi aşarsa allocation yapılmaz;
LRU ile yer açılabilir. Ret veya allocation/context başarısızlığı canlı çizime
döner. Painter hatası gizlenmez; private output bırakılıp render hatası korunur.

Cold bake, renderer'ın kalan 100.000 ziyaret bütçesine sığmıyorsa allocation
öncesinde ertelenir. Geçerli sıcak isabet kullanılabilir; eksik çizilmiş bir
bitmap cache'e kaydedilmez. `allowCreate=false` bu kabul kararını mevcut cache
sözleşmesine taşır; ana render'ın kısmi sayaç durumu korunur.

Owned output eviction/invalidate/clear/context-loss sırasında width/height=0
ile bırakılır. Bir idle timer, iki saniye kullanılmayan proxy'leri bırakır;
aktif isabet yaşı yeniler. Scratch havuzunun lease'leri kalıcı cache'e taşınmaz.
Eski `OffscreenCanvasCache.set()` API'si borrowed sahipliği korur; önceden allocation
yapılmış bu eski API preflight garantisi vermez. Yeni LOD yalnız `getOrCreate`
kullanır. Dönen canvas handle'ı sadece senkron tüketilir, tutulmaz/resize edilmez.

Exact içerik sürümü her uygun adayda live/materialized alt katmanlardan kurulur;
in-place edit de eski sonucu kullanamaz. Sürüm traversal guard'ı büyük string,
dense graph, döngü ve serialization hatasında canlı çizime döner. Renderer registry
registration generation da sürüme dahildir. Text ve media v1'de cache dışı olduğu
için font/decode readiness için desteklenmeyen bir invalidate sistemi varmış gibi
varsayılmaz. İleride bu türler alınırsa readiness ve kalite anahtarları gerekir.

`CanvasMemoryTracker` owned canvases'ı identity ile sayar. LOD pixel byte'ları
Canvas2D toplamının alt kümesidir; `knownBytes`'a yeniden eklenmez. Signatures/cache
cap bilgisi panelde ayrı tahmindir; bütün process RAM'inin muhasebesi değildir.
Benchmark'ın **512 MiB known / 768 MiB heap** guard'ları değiştirilmedi. Bu cap,
uygulama geneli GPU/decoder/job admission sisteminin tamamlandığı anlamına gelmez.

## Sayaçlar ve çalıştırma

Panel bütünüyle İngilizcedir: **Resources → Overview**, cache rezervasyon/bütçe,
pixel/metadata, giriş/hit/miss, eviction/ret sayılarını gösterir. **Layer rendering**
bölümünde **Layers represented by LOD**, **Culled layers** sayısından ayrıdır.
**LOD groups / new previews** ve cold build'de
çizilen leaf sayısı ayrıca gösterilir. Private bake ana viewport traversal'ına
karışmaz; toplam CPU render süresine dahildir. Başka görünür kaynak olarak normal
dispatch edilen id, represented sayısından düşülür. Temizleme cache'i de bırakır.

Next kapalıyken:

```sh
npm test -- --maxWorkers=2
npm run mcp:build
npm run build
npm run perf:prepare -- artifacts/performance/opt4-lod-20261107/build
npm run perf:serve -- artifacts/performance/opt4-lod-20261107/build 4319
```

`/lod-check.html`: native pixel/counter/cache/fallback/idle kontrolleri.
`/paint-check.html`: mevcut LOD dışı çizim regresyonu.
`/?case=four-seasons`: tam ayrıntılı aynı protokol.
`/?case=four-seasons&lodZoom=0.5`: aynı sahne/protokol/guard, LOD opt-in.
`/?case=groups-transparent&staticGroups=1`: yalnız test kopyasında timeline'ları
kaldırılmış statik kontrol; `&lodZoom=0.5` ile karşılaştırılır. Orijinal fixture
değişmez; rapor türetilmiş olduğunu ve effective-scene hash'ini kaydeder.
Varsayılan 60 aktif saniye warmup, 6 zaman ×10 tekrar, sonrasında 6 hash ve LOD
kalite satırıdır. `lodZoom` raw raporda açıkça yazılır; eski tam kare hash'lerinin
LOD bitmap'iyle eşit olacağı varsayılmaz. LOD kapalı yol eski hash'lerle karşılaştırılır.

Son kabul: 20 native LOD ve 19 önceki paint kontrolü geçti. Statik kontrolde 300
alt katman 10 proxy ile temsil edildi; p50/p95 15,1/23,4 → 8,5/11,3 ms. Cache
588.196 byte tepeyle bütçe içinde kaldı ve 2,25 sn idle sonunda sıfırlandı.
Four Seasons animasyonlu root dönüşümü nedeniyle canlı kaldı: 0 proxy, 49,79 MiB
bilinen kaynak; p50/p95 178,2/244,8 ms. Önceki OPT3 164,5/225,6 ms idi; bu sahnede
hızlanma kanıtlanmadı. Süreler renderer-only seyrek ölçümlerdir, tam editör/RSS
ve uzun oynatma kabulü değildir.

Ham rapor ve sınırlamalar: [OPT4](../../artifacts/performance/opt4-lod-20261107/README.md).
