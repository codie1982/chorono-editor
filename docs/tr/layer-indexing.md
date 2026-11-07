# Kare başına katman indeksleme

Bu ilk OPT2 dilimi, renderer'ın aynı düz `Layer[]` üzerinde tekrarlanan id ve çocuk aramalarını ortak bir indeks üzerinden yürütür. Paint culling, alpha erken çıkışı, transform memoization, UI sanallaştırma ve medya residency ayrı işlerdir. Kaynak tüketimini azaltma iddiası gerçek önce/sonra ölçümüyle değerlendirilir.

## Sahiplik ve sözleşme

`src/lib/scene/LayerIndex.ts` yalnız düz scene ilişkilerini bilir. Renderer, React, DOM, GPU, disk veya evaluator bağımlılığı yoktur. `LayerLookup.get(id)` küçük id arama sözleşmesi; `LayerRelations` buna sıralı `roots` ve `childrenOf(parentId)` ekler. `LayerIndex` bunların somut uygulamasıdır.

- Kurulum O(n), id/parent bucket erişimi beklenen O(1), çocukları dolaşma O(k). Katmanlar ve geometri kopyalanmaz; map ve ilişki dizileri katman referansları tutar.
- Root ve kardeşler girişteki stacking sırasını korur. Yalnız falsy `parentId` root sayılır; kayıp parent'ın çocuğu root'a taşınmaz. Hidden, solo, zaman aralığı, mask ve opacity politikası indekste uygulanmaz.
- İlişki dizileri readonly/frozen; kaynak `Layer` nesneleri freeze veya mutate edilmez. Girdi, indeksin kullanıldığı işlem boyunca sabit olmalıdır. Id/parent/üyelik/sıra veya katman nesnesi değiştiğinde yeni indeks gerekir; aynı dizinin yerinde düzenlenmesi de buna dahildir.
- Valid scene id'leri tekildir. Hatalı duplicate id'de `get` ilk eşleşmeyi döndürür (`Array.find` gibi); ilişki listeleri tüm girişleri tutar. Eski bounds helper'ının yerel Map'i duplicate id'de son eşleşmeyi seçiyordu; invalid duplicate projeler için bounds eşdeğerliği vaat edilmez. Döngüler genişletilmez veya düzeltilmez; mevcut traversal/instance hop korumaları sürer.
- İndeks bir render çağrısının yerel değişkenidir. Singleton/WeakMap cache yoktur; eski kare, scene veya undo snapshot'ı saklanmaz. Aynı renderer'ın iç içe temporal çizimi outer indeksini değiştiremez.

`SceneTraversal.buildTree` aynı domainde bulunur; kalıcı seçim ağacı için node/depth ve WeakMap cache üretir, orphan'ları root'a taşır. Bu renderer semantiğiyle aynı değildir. Yeni indeks aynı `scene/` sahibinde tutulur; farklı root/cache davranışı olan ağacı zorla renderer'a uyarlamaz. Bounds'taki önceki yerel id/child haritaları yeni ortak uygulamaya yönlendirilmiştir. Audio, MCP ve UI'ın bağımsız sözlükleri bu dar render tesliminde taşınmaz.

## Veri akışı ve adapter'lar

1. `materializeRenderScene`: instance varsa authored kaynak dizisi için **tembel tek indeks** kurar. Instance çözümü animasyon projection'ından önce yapılır; kaynak animasyonu instance'a sızmaz. Instance yoksa bu kaynak indeksi kurulmaz.
2. `CanvasRenderer.render`: materialize edilmiş frame için yeni `LayerIndex` kurar; root sırası, child/parent/mask lookup ve plugin context aynı evaluated snapshot'ı kullanır.
3. Group/repeater plugin'leri `RenderContext.layerIndex` ile çalışır. Alan legacy standalone plugin host'ları için opsiyoneldir; eksikse önceki düz liste davranışı korunur. Uygulamanın CanvasRenderer yolu indeksi her zaman sağlar.
4. `resolveLayerWorldMatrix`, `resolveDisplayTransform` ve `resolveInstanceLayer` opsiyonel küçük `LayerLookup` alır. Verilen lookup tam olarak ilgili scene snapshot'ına ait olmalıdır. Eski çağrılar ve koordinat/override/cycle davranışları korunur; fallback tek çağrılarında yeni indeks kurup maliyet yaratılmaz.
5. `renderSingleLayer` her temporal/onion-skin zamanı için kendi materialize frame ve yerel indeksini kurar. Outer/current-frame ilişkisi veya authored kaynak temporal örneğe yanlışlıkla taşınmaz.
6. `createLayerWorldBoundsResolver` kendi evaluated snapshot'ını indeksler; önceki per-frame bounds memo ve ancestor/cycle kontrolleri korunur. Renderer'ın şema projection'ını bounds'a zorla taşıyan ek bir değişiklik yapılmaz.

```ts
const relations = new LayerIndex(evaluatedScene.layers)
const parent = relations.get(parentId)
for (const child of relations.childrenOf(groupId)) {
  // Aynı karede; visibility/render politikası çağıranda kalır.
  drawChild(child)
}
// Sonraki zaman veya scene düzenlemesinde yeni bir indeks oluştur.
```

Yeni sınıf 60 satırın altındadır; hesaplama, conversion ve platform sahiplikleri karıştırılmaz. Public MCP/script/proje formatı değişmez; yeni serialized alan yoktur.

## Doğrulama ve önce/sonra protokolü

Testler sıralama, orphan/missing/duplicate/cycle, borrowed model/readonly ilişkiler; aynı dizide reparent/reorder/replace, scene switch; nested temporal frame; kaynak animasyonundan bağımsız transitive instance; parent/follow-path dönüşümleri ve maske/selection/SDK adapter'larını kapsar. Renderer entegrasyonunda source array `find/filter` çağrıları hata verecek şekilde engellenir; grup/repeater sahnesinin doğru çizilmeye devam etmesi doğrulanır.

**166 dosya / 1.552 test**, TypeScript, MCP ve Next production build kontrolleri geçti. Son test tekrarlarından birinde mevcut kaynak paneli timer-cleanup hook'u timeout oldu; log korundu ve temiz son tam tekrar geçti. Gerçek tarayıcı karşılaştırması [OPT0 protokolünü](performance-baseline.md) değiştirmeden kullanır: aynı portable fixture byte'ları, 60 aktif saniye ısınma + 6 zaman × 10 tekrar, ayrı süre sonrası RGBA hash'leri. Önceki raporlar değiştirilmez. Yeni ham raporlar ve [sonuç raporu](../../artifacts/performance/opt1-index-20261107/README.md) korunur. Bu dizindeki `opt1-index` adı ilk indeksleme denemesini ifade eder; yol haritasındaki OPT1 collector kabulünün tamamlandığı anlamına gelmez.

Karşılaştırmada CPU p50/p95, katman ziyaretleri, kaynak/heap ve canvas sayaçları ayrı raporlanır. Katman indekslemesi culling yapmadığı için ziyareti azaltması beklenmez. Bellek/GC ve tarayıcı koşulları süreyi etkiler; tek tarihsel referans üzerinden bütün farkı indekse atfetmek doğru değildir. Hash farkında görsel eşdeğerlik kabulü durdurulur ve nedeni araştırılır.

## Gerçek sonuç ve açık kabul

Altı zamanlı sahne tamamlandı (360 örnek). Group fixture çizim p50 **411,7 → 108,5 ms**, p95 **534,4 → 132,8 ms**; 3.100 ziyaret korunuyor. Saf vektör/metin/image sahnelerinde belirgin genel kazanç gösterilmedi; ekran dışı sahnede p50 **102,5 → 117,5 ms** yükseldi. Bütün sayılar ve karışık/olumsuz değişimler raporda bulunur.

Four Seasons iki temiz sayfada ısınmanın 5,59/6,22 saniyesinde **524,40 MiB bilinen kaynak** ile aynı 512 MiB guard'ında durdu; 0 zamanlı örnek olduğundan yeni p50/p95 yoktur. İndeks map/dizi verisi ile eski dış effect yüzeylerinin GC yaşam döngüsü ayrı konulardır; hızlı döngüde yüzey baskısının artması bir çıkarımdır, kanıtlanmış tek neden değildir. Kaynak sınırı yükseltilmedi ve iki `incomplete` rapor korunur.

Ayrı, açık etiketli `visual-only` benchmark profili aynı byte sınırlarıyla ısınmasız altı kareyi doğruladı. Büyük projenin altı hash'i ve diğer altı sahnenin 36 hash'i ile **42/42 piksel referansı eşleşti**. Bu kısa profilin CPU süreleri baseline karşılaştırmasına girmez. Yalnız test sayfası değiştiği için ayrı `visual-build` kaynak/bundle hash'i kaydedildi; production girdileri ilk indeksli zamanlı paketle aynıdır.

Kod/görsel doğrulaması geçse de **uygulama genelinde performans/bellek kabulü açık**. Sonraki öncelik büyük sahnenin sınır içinde ölçülmesini sağlayacak dış mask/effect tampon sahipliği, açık release/reuse ve bütçedir; ardından bağımlılık güvenli paint görünürlüğü gelir. Genel kaynak yöneticisi veya 37 GB kök nedeni bu teslimle tamamlandı sayılmaz.

7 Kasım sonraki teslimde dış host/native effect/mask yüzeyleri ortak scope/havuza taşındı. Four Seasons aynı 512 MiB guard ile tam koşuyu bitirdi: 49,79 MiB sabit bilinen kaynak, 165,5/205,4 ms çizim p50/p95, yeni canvas kayıt artışı 0 ve altı aynı hash. Bu, yukarıdaki iki tarihsel indeks-only başarısızlığını silmez; [tampon karşılaştırma raporu](../../artifacts/performance/opt2-surfaces-20261107/README.md) sonraki sınırlı kabulü kaydeder. Genel OPT0–OPT4/uzun oynatma/işlem RAM'i kabulü açıktır.
