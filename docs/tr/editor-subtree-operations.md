# Editör Solo kapsamı ve alt ağaç işlemleri

8 Kasım 2026, OPT31. Bu değişiklik sahne verisini azaltmaz; Solo açık bir üst
grubun düzenlenebilir alt ağacını Timeline ve Scene Explorer'da korur.

## Sorun ve ortak hesaplama

Eski paneller yalnız `layer.solo` işaretli nesneleri alıyordu. Four Seasons'ta
ana grup Solo açıkken Scene Explorer 1/4077 satır gösteriyordu. Ana grup aktif
timeline'ın açık `layerIds` listesinde bulunmadığından Timeline bu grubu da
eleyip boş kalıyordu. Renderer grubu çocuklarıyla çizmeye devam ediyordu.

`src/lib/scene/visibility/editorSoloScope.ts` iki panelin ortak saf sözleşmesidir:
Solo yoksa `null` (kısıt yok); görsel Solo varsa seçili köklerin bütün alt ağacı;
ses Solo alanı bağımsızdır. Ağaç görünümü `includeAncestors=true` ile ulaşım için
üst düğümleri de tutar. Gizlilik veya zaman aralığı anahtar kareleri düzenlenemez
hale getirmez. Açık timeline üyeliği, sesin timeline yönlendirmesi, metin/tür
filtreleri ve panelin katlama durumu ayrı kurallar olarak korunur.

Örnek: `editorSoloScope(layers, true)` ağaç adapter'ına kapsam verir.
`new LayerIndex(layers).subtreeIds(['parent'])` kaynaktaki gizli, katlanmış ve
filtre dışı çocukları da içeren, çağırana ait bir kimlik kümesi döndürür.
Tek yetkili alt ağaç yürüyüşü LayerIndex'tedir; eski `collectDescendants` API'si
bu uygulamaya delege eder. Authored kardeş sırasındaki pre-order korunur.
Yürüyüş iteratiftir; çakışan seçimleri tekilleştirir, olmayan kimlikleri atlar,
döngülerde sonlanır. Geometri, zaman, renderer, DOM veya medya sahipliği içermez.

## Kullanıcı işlemleri ve sahiplik

Scene Explorer'da tek bir katman seçildiğinde de yeni araç çubuğu açılır:

- **Expand subtree / Collapse subtree:** seçili kökleri ve bütün alt dalları
  panelde açar/kapatır. Yalnız yerel `collapsedIds` değişir; sahne revision'ı,
  görünürlük, animasyon, undo ve kayıt verisi değişmez.
- **Show subtree / Hide subtree:** seçili kökler ve bütün çocukların `hidden`
  bayraklarını bir mevcut `makeBulkToggleFlagCmd` çağrısıyla değiştirir. Bir undo
  her nesnenin önceki karma durumunu, undefined/false ayrımı dahil, geri getirir.
  Aynı değerdeki nesneler ve boş işlemler için yeni komut üretilmez.

Aynı dört eylem sağ tık menüsündeki **Subtree (selected + children)** altındadır.
Sayaç, ekranda oluşturulan DOM satırını değil kaynak kapsamını gösterir. Normal
satır bayrakları, gruplama ve silme mevcut açık seçim kapsamını korur; yeni
recursive davranış görünür biçimde bu dört eylemle sunulur.

`useSceneExplorerBranches` yalnız React adaptasyonunu ve yerel katlama durumunu
yönetir; traversalı indeks, kaynak değişikliğini editor command/history sahibi
yapar. `SubtreeOperationsToolbar` stateless görünümdür. İndeks immutable layer
snapshot'ı değişince yeniden kurulur. Timer, GPU yüzeyi, kalıcı önbellek veya
yeni JSON alanı eklenmez. Sanallaştırılmış satırlar korunur; açılan 4077 nesne
için 4077 DOM satırı oluşturulmaz. Büyük eski panel dosyalarının ilgili küçük
bağlantıları değiştirildi; yeni sorumluluklar ayrı hook ve domain modülündedir.

## Talep üzerine çizilen viewport göstergesi

Viewport sürekli çizilmediği için FPS kaldırıldı. `ViewportPerformanceOverlay`
**Last draw … ms · Heap …** gösterir. RenderWorkMonitor son viewport süresini
ve yaşam döngüsü açık bir abonelik sağlar; mevcut Resources paneli ölçümleri
değişmez. Süre senkron çizim aralığıdır ve onion skin'i içerir; sunum hızı veya
sistem CPU yüzdesi değildir. Heap son JS heap örneğidir, toplam proje RAM'i değildir.

`observeResourceMonitor` push kaynağını 500 ms boyunca birleştirir; boşta polling
veya ilave çizim döngüsü yoktur. Gizli belge ve unmount aboneliği/bekleyen timeout'u
kapatır. Var olan polling kaynakları eski davranışını korur. Gösterge DOM'dadır,
çıktı canvas'ına dahil değildir. Son çizim bilgisi idle durumda geçerli son örnek
olarak kalır; güncel RAM ölçümü gibi yorumlanmamalıdır.

## Doğrulama

262 dosya/2093 test, TypeScript, MCP ve Next production build geçti. Ortak
yürüyüş; derin 5000 düğüm, döngü, eksik kimlik, kesişen seçim, kaynak sırası,
bağımsız audio Solo, timeline üyeliği, hidden/inactive çocuklar ve atomik undo
ile sınandı. Abonelik testleri idle timer olmamasını, coalescing ve cleanup'ı
doğrular; menü testleri seçim ve capability sözleşmesini korur.

Gerçek Chrome production editöründe kullanıcının revision 8 yedeğiyle test:
Solo açıkken 4077/4077 kaynak satırı erişilebilir, o ölçüde 29 explorer DOM
satırı oluşturuluyor; Sky filtresinde 8 gerçek anahtar kare var. Kapatma 1 satır,
yeniden açma bütün dallar; görünürlük komutları 4077 hidden /0 hidden; her birinin
tek undo'su sahne JSON'unu başlangıçla birebir eşliyor. Yalnız Atmosphere dalı
64 nesneyi değiştiriyor, dışarıdaki nesneler korunuyor. Açık asıl sekme ve onun
undo geçmişi değiştirilmeden bırakıldı; güncel sürüm ayrı sekmede doğrulandı.

[Ham kanıt ve gerçek yedek receipt'i](../../artifacts/performance/opt31-timeline-visibility-20261108/README.md).
Bu UI doğrulaması uzun bütün-editör kabulünün veya CPU/RSS kıyasının yerine geçmez.
