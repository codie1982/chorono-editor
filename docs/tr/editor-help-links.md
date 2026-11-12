# Editör içinden dokümantasyon yardımı

Gerçek panel ve dialog bileşenleri kendi rehberlerini `Help` veya `?` kontrolüyle açar. Bağlantı ayrı sekmede açılır; editör sahnesini, seçimini, Undo/Redo geçmişini veya dosyalarını değiştirmez. Aynı bileşenler bağımsız dokümantasyon hostunda da çalışır.

## Giriş noktaları ve sorumluluklar

- `src/components/help/documentation.ts`: tek kanonik adres eşlemesi, okunabilir rehber adları ve sekmeye göre konu seçimi. URL tabanı `https://www.chorono.com/docs/` olur; editörün yerel portundan türetilmez. Tipli `DocumentationTopic` bilinmeyen bir yolun yanlışlıkla kullanılmasını önler. Rota otoritesi ayrı `chorono-web` deposunun `lib/documentation` manifestidir.
- `src/components/help/DocumentationHelp.tsx`: durum tutmayan ortak bağlantı. Yerel `<a>` davranışı, klavye odağı ve yeni sekme korunur. `noopener noreferrer` kullanır. Erişilebilir ad rehber konusunu ve yeni sekme bilgisini içerir. Yoğun araç çubuklarında `compact` yalnız simge gösterir; fare için en az 28, kaba işaretçi için 44 CSS piksel hedef alanı vardır.
- Panel bileşeni aktif konuyu seçer. Yardım kontrolü bir editör komutu çalıştırmaz. Olay yayılımı canvas sürüklemesine ve kabarcıklanan klavye kısayollarına ulaşmadan durur; bağlantının varsayılan gezinmesi engellenmez.
- `BaseExportDialog` üç mevcut çağrısından zorunlu `helpTopic` alır: raster, SVG ve image sequence. Diğer üretim bileşenlerinin prop sözleşmeleri değişmez.

```tsx
import { DocumentationHelp } from '@/components/help/DocumentationHelp'

<DocumentationHelp topic="editor/timeline" compact />
```

## Bağlamsal hedefler

Layers ekleme paleti kapalıyken Layers genel rehberi, açıkken Basic Shapes, Path & Vector, Text, Media, Spline Objects veya Particles rehberi açılır. Yeni ve henüz eşlenmemiş kategori Layers genel rehberine döner.

Properties başlığı aktif Properties, Effects, Motion veya Interact sekmesine gider. Transform, Appearance, Shape, Text ve Masks bölümlerinin ayrıca kendi yardımı vardır. Kaynak seçilmediğinde kompozisyon/proje rehberi açılır.

Resources içindeki Overview, Media, CPU / GPU, Surfaces ve Interaction ayrı sayfa üretmez; aynı rehberin ilgili başlığına gider. JSON penceresi Editor ve Runtime modlarına göre Project JSON veya Runtime JSON rehberini seçer.

Timeline, Curve Editor, Dope Sheet, keyframe inspector/tablo/zamanlama, modifiers, onion skin, segments, canvas araçları, Motion Keys, seçim, snapping, Scene Explorer, spline inspector, assets, particles, state machines, parameters, events, bindings, wires, preview/player, shortcuts, composition, Clone ve Array kendi konularını kullanır. Yardım üretim bileşenlerinin içinde bulunur; test hostunun eklediği bir görüntü değildir.

## Doğrulama ve yayın sınırı

Bağımsız host için [documentation-panel-host.md](documentation-panel-host.md) dosyasına bakın. `?view=properties&width=320` gerçek paneli 320 piksel dock genişliğinde açar. `width` 280–1120 arasında olabilir. `?view=json` gerçek JSON dialogunu açar.

11 Kasım 2026 kontrolünde 50 hedef yerel `chorono-web` sunucusunda HTTP 200 verdi; Resources bağlantılarının beş fragment kimliği bulundu. 31 temel görünümde yardım bağlantıları, ek olarak Array ve Wire dialogları, Layers/Properties/Resources sekme geçişleri ve 13 panelde 320 piksel yerleşim incelendi. Canlı Timeline rehberi Enter ve tıklamayla yeni sekmede açıldı; fixture geçmişi `Revision 0 · 5 layers · 7 keys` kaldı. Bu kontroller tüm editör davranışlarının uçtan uca testi değildir.

`npm test` (2.856 test), `npm run mcp:build` ve `npm run build` geçti. URL kontrol çıktısı yerel `output/docs/help-link-checks.json` dosyasındadır.

Yeni doküman sayfaları ayrı web deposunda hazırdır. Kontrol sırasında mevcut canlı `/docs/editor/timeline` HTTP 200, henüz yayımlanmamış `/docs/editor/layers/basic-shapes` HTTP 404 verdi. Editöre kalıcı adreslerin eklenmesi web sitesini yayımlamaz. Yeni bağlantıların canlıda çalışması için web sürümü de yayımlanmalıdır; mevcut indeksli URL'ler değiştirilmemiştir.

## 12 Kasım 2026: yeni editör alanları

`documentation.ts` haritasına sekiz gerçek bölüm hedefi eklendi: Properties formülleri ve Calculate once, Controllers içindeki track/expression bake, Scene Explorer subtree işlemleri, Snapping içinde ruler guide ve selection gap, Projects içinde local recovery. Paylaşılan `DocumentationHelp` kullanılır; ayrı router veya yardım sistemi yoktur.

`ExpressionDialog` çağırandan zorunlu typed `helpTopic` alır. Native dialog odak yönetimi korunur. Track bake, guide ve gap pencerelerinin Escape işlemi capture aşamasında çalışır; DOM containment kontrolü portalla açılan Calculate once penceresinin Escape olayının dış pencereyi kapatmasını önler. Track bake odak döngüsü Help bağlantısını da içerir. LocalRecoveryStatus yardımı canlı status bölgesinin dışındadır.

Web içerikleri mevcut 21 rehbere eklenir; URL, title, description, eski başlıklar ve sitemap uygunluğu korunur. Ayrıntılı araştırma ve sayfa/kelime eşlemesi chorono-web `docs/plans/pre3d-content-review-2026-11-12.md` ve yanındaki CSV'dedir. Editor kaynak sözleşmeleri değiştirilmedi.
