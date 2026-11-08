# Görünürlük elemesi ve katman sayaçları

Bu aşama yalnız **çizim işini** azaltır. Değerlendirilmiş sahne, animasyon,
maske/follow-path/repeater referansları ve medya sahibi servisler korunur.
Ekran dışındaki nesneyi JSON'dan silmez; decoded medya residency/eviction veya
viewport boyutuna göre tampon küçültme (ROI) yerine geçmez.

## Girişler ve veri akışı

- `CanvasRenderer.render(..., options)` her çağrıda yeni `PaintFrame` oluşturur.
  `LayerIndex` ve materialize edilmiş animasyon/instance verisini ödünç alır;
  kareler arasında geometri, canvas, sahne veya referans önbelleği saklanmaz.
- `LayerRendererPlugin.paint` isteğe bağlı bir yetenek sözleşmesidir.
  `localBounds(layer, context)` bütün boyalı alanı kapsayan yerel AABB veya
  bilinmiyorsa `null` döndürür. `alphaSafe` sıfır alpha'nın hedefi değiştirmediğini;
  `sceneChildren` normal grup traversal'ını belirtir. Yeni/custom eklentinin bu
  sözleşmeyi sağlamadan otomatik olarak eleneceği varsayılmaz.
- `nativePaintBounds` mevcut Bezier/spline dönüştürücüleri ve `computePathBounds`
  hesabının `control-hull` seçeneğini kullanır; seçim için varsayılan hassas hesap değişmez. Kesin kutu içine çizilen yerel şekil/medya türleri de desteklidir.
  Stroke genişliği, outside alignment, miter join ve Canvas'ın geçersiz/0 lineWidth
  atamasında eski genişliği koruması için muhafazakâr genişletme uygulanır.
- Gerçek `ctx.getTransform()` yerel sınırı backing pikseline taşır. Parent dönüşü,
  export ölçeği, döndürme ve aynalama bu matriste yer alır. Singüler/nonfinite matris,
  belirsiz sınır veya bilinmeyen state çizimi korur. İki backing piksel AA payı bırakılır.
- `visibleArea` backing pikselinde bir dikdörtgendir. Verilmezse tüm çıktı canvas'ı
  görünür kabul edilir. Render/export çağrısına editörün CSS viewport'u sızmaz.
- `useCanvasRenderer` gerçek canvas/viewport DOM dikdörtgenlerini
  `visibleCanvasArea` ile dönüştürür. Zoom/pan değişimi, ResizeObserver ve CSS
  transition bitiş/iptali yeniden çizer. Devam eden CSS animasyonunda geçici olarak
  tüm backing alan korunur; ikinci bir RAF döngüsü yoktur. Resize/transition
  gözlemcileri unmount sırasında bırakılır.

İç test için `optimizePaint:false`, aynı renderer'ın referans çizimini sağlar.
Kalıcı proje alanı, scripting/MCP ayarı veya kullanıcı tercihi değildir.

```ts
renderer.render(context, scene, timeMs, null, assets, {
  renderMode: 'preview',
  // Export: visibleArea verilmez, tam backing canvas değerlendirilir.
})
const counts = renderer.getLastPaintStatistics()
```

## Güvenli geri dönüşler

Gölge/glow/blur gibi sınırı genişleten plugin efektler, maskeli host, CSS blur,
motion blur ve source-over dışı blend işlemleri bu sürümde elemeden muaftır.
Mask/effect offscreen pass'lerinin çocuklarına viewport elemesi uygulanmaz.
Parent etkisinin çocuğu tekrar görünür alana taşıması böylece korunur.

Text ink/overhang, parçacık, path-stroke glow, boyutu aşabilen özel şekiller ve
`objectFit:none` image için uzamsal sınır bilinmiyor kabul edilir. Bu nesneler
geometri kutusuna göre elenmez. Yalnız alpha-safe sözleşmesi olan türlerde
sıfır alpha optimizasyonu yapılabilir. Sıfır alpha grup ancak bütün alt ağacı
aynı güvenlik koşullarını sağlarsa atlanır; custom renderer, destination işlemi,
mask, temporal/spatial efekt veya döngü varsa çizim korunur.

Bilinmeyen plugin ve repeater callback'lerinde çocuk elemesi kapalıdır. Repeater
kaynağı normal sahne yürüyüşünde elense bile kopyaları tam sahne/index üzerinden
çizilebilir. Maske kaynakları raw mask pass'inde viewport kontrolünden geçmez.
Follow-path geometri çözümü tam sahneyi kullanır. Seçili katman ve parent zinciri
editör modunda korunur. Ghost/temporal renderSingleLayer çağrıları ana karenin
sayacını değiştirmez.

## Paneldeki sayıların anlamı

`Kaynaklar → Genel` ve `CPU / GPU` kategorilerinde **Katman çizimi** bölümü vardır.
`PaintWorkMonitor` yalnız son viewport ana karesinin detached numerik sonucunu
saklar; weak scene identity guard eski proje örneğinin yeni projeye taşınmasını
engeller. Export ve ghost pass'leri global monitöre yazmaz. Panelin mevcut
500 ms / pause / document visibility politikası aynen kullanılır.

| Sayaç | Anlamı |
| --- | --- |
| Toplam katman | Projedeki bütün kalıcı katmanlar; audio ve yardımcı kaynaklar dahil. |
| Çizime giren | Plugin dispatch yapılan benzersiz id; grup ve kullanılan maske kaynakları dahil. Her dispatch'in renkli piksel üretmesi gerekmez. |
| Elenen | Görünürlük/güvenli sıfır alpha nedeniyle atlanan benzersiz id. Atlanan grubun normal çocukları dahil. Başka bir görünür kopyası dispatch edilen kaynak bu gruptan çıkarılır. |
| Ziyaret edilmeyen | Total − processed − culled. Gizli/zaman/solo/yardımcı kaynak gibi diğer durumlar. |
| Ziyaret / elenen ziyaret | Normal ana-kare recursive traversal/copy denemeleri; grup altında toplu atlanan çocuklar ziyaret sayılmaz. Maske raw dispatch'i, temporal örnekler ve ghost bu traversal sayısı değildir. |
| Kare durumu | Normal dönüşte tamamlandı; render hatasında veya traversal bütçesi aşımında kısmi sayaçlar. Henüz örnek yoksa sıfır uydurulmaz. |

Bunlar Canvas komutu, GPU draw call veya process RAM ölçümü değildir.
`getLastLayerVisitCount()` eski traversal tanımını korur; performans raporundaki
`processedLayers` ve `culledLayers` yeni benzersiz sayılardır.

## Doğrulama ve tekrarlama

Next sunucusu kapalıyken:

```sh
npm test -- --maxWorkers=2
npm run mcp:build
npm run build
npm run perf:prepare -- artifacts/performance/opt3-paint-20261107/build
npm run perf:serve -- artifacts/performance/opt3-paint-20261107/build 4319
```

`/paint-check.html`: gerçek Canvas2D'de optimizasyon açık/kapalı byte-byte RGBA
karşılaştırması. Kırpılmış CSS viewport senaryosunda yalnız gerçekten görünen
piksel bölgesi karşılaştırılır; export senaryolarında bütün kare karşılaştırılır.
Test giriş noktası `src/lib/render/visibility/__tests__/browser-check.ts` içindedir;
üretim rotası veya kullanıcının sahnesine eklenen test nesneleri yoktur.

`/?case=vector-offscreen` ve diğer altı fixture: aynı 60 aktif saniye warmup,
6 zaman × 10 tekrar, 512 MiB known / 768 MiB heap guard ve timing sonrası
6 tam kare SHA-256. Ham raporlar, kaynak/bundle kimlikleri ve karşılaştırma
`artifacts/performance/opt3-paint-20261107/` altında tutulur.

Sonraki ayrı işler: efekt halo/origin-aware paint bounds ve ROI, decoded medya
residency, uygulama geneli admission/job iptali; ardından export tutarlılığı.
Bu teslim bu sonraki işlerin tamamlandığı anlamına gelmez.

## Grup bazlı 2D LOD

İlk sürüm uygulandı: [gerçek kapsam, bütçe ve kalite sözleşmesi](static-group-lod.md). Aşağıdaki maddeler ilk tasarımın takip kapılarıdır; genel efekt ROI ve dinamik/media LOD henüz tamamlanmadı.

### İlk tasarım ve takip kapıları

Uzak zoom'da ayrıntısı birkaç piksele düşen bir grubun alt katmanları, önceden
hazırlanan tek şeffaf proxy görüntüsüyle temsil edilebilir. Bu işlem kaynak
katmanlarını veya undo verisini kaldırmaz. Yakınlaşma, grup/alt katman seçimi ve
geometri düzenleme tam ayrıntılı çizime döner. Export her zaman tam ayrıntıdadır.
Bu çizim LOD'si, layer listesi/timeline DOM sanallaştırmasından ayrı bir özelliktir.

İlk teslim yalnız statik, normal source-over gruplarını hedeflemelidir. Animasyonlu
alt ağaçlar, parçacık/video/simülasyon, destination/blend işlemleri ve bağımlılıkları
kanıtlanmamış mask/efekt grupları canlı çizimde kalır. Grup veya ancestor alpha'sını
sonradan bitmap'e uygulamak örtüşen çocukların görünümünü değiştirebildiğinden,
proxy mevcut non-isolated grup alpha semantiğini koruyacak şekilde hazırlanmalı;
koşul sağlanmıyorsa proxy kullanılmamalıdır.

Geliştirme kapıları:

1. Paint-bounds/ROI origin ve halo sözleşmesi; proxy için gerekli gerçek alan.
2. Byte bazlı sınırı ve allocation öncesi admission'ı olan ayrı kalıcı proxy sahibi.
   Scratch havuzunun lease'leri kalıcı LOD cache'ine çevrilmez. Kaynak panelinde
   double-count olmadan cache bytes/entry/eviction gösterilir. Bütçe reddinde canlı
   çizime dönülür; her grup için tam kompozisyon bitmap'i biriktirilmez.
3. Statik subtree sürümü, asset/font readiness, efektif alpha, parametre/instance
   bağımlılıkları ve kalite/ölçek anahtarlarıyla invalidate. Seek/state/undo/redo ve
   context loss eski proxy'yi görünür bırakmamalıdır. Animasyon v1'de cache dışıdır.
4. Ekrandaki boyuta göre detay seviyesi ve eşikte ileri/geri zıplamayı önleyen
   hysteresis. Seçili/düzenlenen alt ağaç anında tam ayrıntıya geçer. Playback zamanı
   değiştirilmez; sonuç dondurulmaz.
5. Proxy oluşturma maliyeti ilk-hit, cache-hit ve invalidate koşullarında ayrı
   ölçülür. Panel `LOD ile temsil edilen` katmanları görünürlük nedeniyle `elenen`
   katmanlardan ayırır. Katman sayısı ile GPU draw call karıştırılmaz.

Kabul: düşük/yüksek zoom, seçim/düzenleme, mask/blend fallback, hızlı pan/seek,
undo/redo ve budget pressure testleri; proxy kapalı referansla görünür bölge
karşılaştırması; hit/miss/yenileme ve peak bellek ölçümü. İlk kareye bütün proxy'leri
zorla üretmek yerine görünür adaylar hazırlanır. Görünürlük ve ROI/bütçe altyapısı
üzerine gelir; medya residency ve genel admission işlerinin yerine geçmez.
