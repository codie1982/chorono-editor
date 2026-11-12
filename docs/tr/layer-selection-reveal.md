# Seçilen katmanı listede gösterme

Tuvalin paylaşılan seçim durumu değiştiğinde hem Layers hem Scene Explorer,
birincil seçimin satırını görünür alana kaydırır. Kapalı üst gruplar önce açılır.
Aynı nesneye yeniden tıklamak da yeni bir seçim isteğidir. Kullanıcının sonraki
manuel kaydırması veya grup kapatması oynatma/kare güncellemeleriyle geri alınmaz.

`useSelectedLayerReveal` iki panelin ortak React adaptörüdür. Hiyerarşi için
`LayerIndex`, kaydırma ve sanallaştırma için mevcut `useRowWindow.reveal` kullanılır.
`reveal` görünür bir liste ve geçerli satır varsa `true`, aksi durumda `false`
döndürür. Filtreyle dışlanan satır, filtre kaldırılana kadar bekler; kullanıcı
filtreleri ve sahne verisi değiştirilmez. Klavye odağı taşınmaz.

Next sunucusu durdurulmuşken tarayıcı kabul kontrolünü hazırlayın:

```sh
node scripts/perf/selection-reveal.mjs artifacts/selection-reveal
node scripts/perf/serve.mjs artifacts/selection-reveal 2011
```

Yerel kontrol sayfasında **Run selection checks** düğmesini kullanın. İki panelde
ekran dışı seçim, iç içe gruplar, tekrar seçim, odak, serbest kaydırma ve sınırlı
DOM satırı sayısı denetlenir. Bu sayfa gerçek düzenleyici belgesini kullanmaz.

## Taşıma ve yakınlaştırma

`useToolMode`, üst araç çubuğu, alt el düğmesi ve klavyenin paylaştığı önceki
araç bilgisini tutar. M/H taşıma modunu açıp kapatır; yeniden basıldığında önceki
araca dönülür. Registry keydown düzeni korunur; key-repeat aç/kapat yapmaz.
Sahne nesnesini taşıyan G kısayolu ve Cmd+Shift+M aynı kalır.

Alt görünüm kontrolleri pointer olaylarını kendileri işler. Pan yakalaması zoom,
yüzde sıfırlama ve Fit düğmelerini engellemez. Alt çubuğun zemini opaktır; Pan
sırasında dekoratif cursor point/crosshair ve cetvel cursor işaretleri gizlenir.
`node scripts/perf/pointer-release.mjs <output>` ile hazırlanan tarayıcı kontrolü
bu davranışları gerçek SceneCanvas ve merkezi kısayol adaptörüyle doğrular.
