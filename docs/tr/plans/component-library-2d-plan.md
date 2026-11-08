# 2D Bileşen Kütüphanesi — öncelik 2

Tarih: 4 Kasım 2026. Durum: plan; uygulama yapılmadı. Kapsam yalnız `2danimation`. Önkoşul: [export planı](export-consistency-2d-plan.md) E1/E2 kapısı. Üst plan: [2D üretim yol haritası](../production-2d-roadmap.md).

## 1. Teslim hedefi

Kullanıcı bir katman grubunu ve ona ait animasyonu **yeniden kullanılabilir bileşen** olarak kaydeder. Yeni kullanımda metin, renk, görsel ve dışarı açılan değerleri değiştirir. Başlık, bilgi kartı, lower-third, grafik, logo kapanışı gibi içerikler tekrar baştan kurulmaz.

İlk dikey dilim: başlık + renkli kart + logo, tek giriş/çıkış klibi → kütüphaneye kaydet → iki instance ekle → başlık ve rengi bağımsız değiştir → farklı başlangıç zamanlarında oynat → portable kaydet → canonical runtime export et.

## 2. Mevcut temel ve fark

`Layer.instanceOf`, `clone/InstanceResolver.ts` ve clone komutları kaynak katmanın görsel alanlarını paylaşan live instance sunuyor. Grup, parent, timeline ve native undo altyapısı var. Bu temel korunur.

Yeni bileşen; birden fazla katman, owned timeline, exposed controls, asset dependency, bağımsız instance saati ve sürümlü tanımı birlikte taşır. Mevcut tek katman instance'ı sessizce yeni semantics'e geçirilmez; eski projeler aynı davranır.

## 3. Önerilen model

Aşağıdaki isimler yeni model önerisidir; mevcut MCP API'si değildir.

| Kayıt | Sorumluluk |
| --- | --- |
| `ComponentDefinition` | Stable id/version, ad, local root/bounds, yerel katmanlar, owned klipler, exposed controls ve asset bağımlılıkları |
| `ComponentInstance` | Definition id + sabit sürüm, root group, control override'ları, slot içerikleri ve playback ayarları |
| `ComponentControl` | Stable control id, label, type, default, validation, hedef yerel id/property ve uygulama politikası |
| `ComponentLibraryEntry` | Yerel proje/library index'i, thumbnail ve immutable definition sürümü |

İlk veri yerleşimi `scene.componentDefinitions?` ve normal group üzerinde `componentInstance?` metadata'sı olabilir; schema/registry/validator birlikte kesinleşir. Yeni layer kind ancak mevcut group/compiler sınırı gerçekten yetersizse eklenir. Tanımın içeriği doğrudan sahne root'una kopyalanan kontrolsüz bir JSON parçası değildir.

Tanım yerel koordinatlarda ve yerel kimliklerle saklanır. Resolver, instance başına kararlı id map ve animation context üretir. Layer, mask, motion path, instance, timeline, trigger/wire ve parametre referansları string replace ile değil yapısal eşlenir. Üretilen id'ler MCP uzunluk/benzersizlik kurallarına uyar.

Definition dışında kalan referanslar açık input/slot olmalı veya tanımla birlikte alınmalıdır. Dış sahnedeki rastgele layer'a görünmez bağlı bileşen paketlenmez. Asset'ler content hash/id map ile paylaşılabilir; bir instance silinince diğerinin medyası silinmez.

## 4. Kontrol ve override politikası

İlk kontroller: string metin, renk, image asset, number, boolean ve kontrollü select. Her kontrolün gerçek property şeması, sınırı ve animasyon desteği belirlenir. Text uzunluğu değişince layout sonucu ve overflow görünür olur.

Tanım varsayılanı → instance kontrolü → varsa ilan edilmiş instance animasyonu sırası belgelenir. Bir değerin animated kanalı tamamen replace etmesi, offset eklemesi veya multiplier olması control metadata'sında açıktır. İlk dilim static text/color/image ve belirli numeric kontrol politikalarıyla sınırlıdır; keyframe'lerin gizlice ezilmesi kabul edilmez.

Instance'ın transform/opacity/başlangıcı kendine aittir. Root transform, definition local transform'una bir kez uygulanır. Properties panelinde kullanıcıya anlamlı kontrol adları gösterilir; internal layer id/path'leri ürünün ana kullanım akışına taşınmaz.

Slot ve asset replacement kaynak ölçü/objectFit/pivot politikasını taşır. Yanlış asset türü veya kayıp medya hem UI hem MCP'de aynı doğrulamadan geçer.

## 5. Klip ve zaman sahipliği

Her instance kendi local time context'ine sahiptir: başlangıç, klip, speed ve loop. Aynı definition'ı kullanan iki instance birbirinin saatini, parametresini veya oynatma durumunu değiştirmez. Root hareketi ana timeline'dan, içerik hareketi local klipten gelebilir.

Mevcut timeline evaluator kullanılır; ikinci bir animasyon motoru yazılmaz. Component-owned timeline'lar ayrıca global timeline olarak ikinci kez değerlendirilmez. `timeline.layerIds` bu sahipliğin tek kaynağı değildir. Seçim, curve/dope sheet ve keyframe düzenleme doğru instance/definition/klip bağlamını açık gösterir.

İlk animated teslim tek klip instance'ıdır. İç içe bileşen ve bileşen içi state machine ayrı C2 aşamasıdır; cycle/depth kontrolü ve bağımsız runtime state'i olmadan aktif edilmez. State-machine local clock işi [Character Motion planıyla](../character-motion-plan.md) aynı ortak değerlendirme sözleşmesine bağlanır; iki farklı clock çözümü oluşturulmaz.

## 6. Resolver, düzenleme ve sürümleme

`ComponentResolver` salt tanım + instance + evaluation context'ten türetilmiş scene/override görünümü üretir. Renderer, hit-test, bounds, MCP preview ve exporter aynı çözümü kullanır. Render sırasında source scene'e yeni katman veya keyframe yazılmaz.

`Edit Definition` yalnız seçili definition'ın authoring bağlamını açar; ayrı mod oluşturmaz. Değişiklik yeni version üretir. Instance sürümü pin'lidir; kütüphanede yeni sürüm çıkınca mevcut projeler kendiliğinden değişmez. Kullanıcı update, mevcut sürümü tutma veya detach seçebilir. Kontrol id'lerinin sürümler arası uyumu doğrulanır.

Detach, çözülmüş görünüm ve animasyonu normal katmanlara dönüştürür; ids/references/tracks bağımsız olur. Save-to-library, instantiate, update ve detach her biri tek undo transaction'ıdır. Undo'nun gerektirdiği definition/asset/cache erken temizlenmez.

Library ilk sürümde yerel/proje içidir. Cloud senkronizasyon, mağaza, ortak düzenleme ve uzaktan otomatik paket güncellemesi bu teslimin kapsamı değildir.

## 7. Export ve diğer planlarla ilişki

Portable proje tanımları, pin'li sürümleri, instance override'larını, font/medya ve klipleri korur. Native runtime component capability'si varsa tanım/instance'ı okuyabilir. İlk güvenli runtime yolu, canonical compile sırasında bileşeni id eşlemeli normal scene/timeline verisine çözmek olabilir; bağımsız local time davranışının korunduğu fixture şarttır.

Desteklenmeyen nested/interactive özellik sessizce düzleştirilmez. PNG/raster fallback yalnız kullanıcının seçtiği görünüm teslimidir. Baked physics/cloth/fluid asset'i bileşene dahil edilebilir; ilgili decoder gerekir. Bileşen kullanımı simülasyonu her instance için otomatik yeniden çalıştırmaz.

[Çoklu format planı](multiformat-production-2d-plan.md) component bounds ve control id'lerini kullanır. Bir bileşene responsive constraint eklemek kaynak tanımı değiştirmekten ayrı, açık variant override'ı olabilir. Data-driven üretim aynı exposed controls üzerinden yapılır.

## 8. Uygulama sırası ve kabul

| Aşama | Teslim | Kabul |
| --- | --- | --- |
| C0 | Definition/control modeli, statik group resolver, library kaydı | İki instance farklı text/color/image taşır; kaynak ve diğer instance etkilenmez; referans/asset haritası tutarlıdır. |
| C1 | Owned klip, instance local clock, UI/MCP ve portable/export | Farklı zamanda başlayan iki kart doğru oynar; preview/player/export eşleşir; tek undo ve reload korunur. |
| C2 | Pin'li sürüm update/detach, content slots, kontrollü nested ve state machine | Cycle reddi, bağımsız runtime state, kullanıcı override koruması ve doğru flatten doğrulanır. |

**Çoklu format aşamasına geçiş:** C1'in başlık/kart fixture'ı ve C0 control sözleşmesi tamamlanır. C2'nin bütün ileri özellikleri bu geçişi bekletmez. Sürüm pinleme ilk kayıttan itibaren modelde bulunur; gelişmiş update UI'si C2'de tamamlanır.

Testler: id/reference remap, source dışı bağımlılık, cycle/depth, local clock, animated override politikası, farklı instance kontrolü, parent/pivot/mask, seçim/bounds, asset yaşam döngüsü, undo/redo, sürüm update/detach ve portable/runtime parity. Görsel testte iki instance farklı metin/başlangıç/ölçekle bir arada çizilir.

Entegrasyon: mevcut clone/instance, registry/schema, scene/evaluator, selection/bounds, timeline ownership, asset index, export compiler ve MCP native commands. Katmanları baştan yazan yeni paralel bir editor kurulmaz. API/skill ve gerekli repo kontrolleri uygulamayla birlikte tamamlanır; 3D işi eklenmez.
