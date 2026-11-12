# Dokümantasyon için bağımsız bileşen test sayfası

Bu host, web sitesindeki Editor rehberlerinin gerçek panel görüntülerini üretmek ve temel etkileşimleri kontrol etmek için vardır. Ana uygulamanın `page.tsx` dosyasını veya MCP köprüsünü açmaz. Üretim bileşenlerini doğrudan import eder; bileşenlerin görünümünü kopyalamaz.

## Başlatma

```sh
node scripts/docs/prepare-panels.mjs
node scripts/perf/serve.mjs /private/tmp/chorono-doc-panels 4322
```

`http://127.0.0.1:4322/?view=timeline` adresini açın. Çıktı uygulamanın kaynak ve Next derleme dizinlerinin dışındadır. Paket kurulumuna veya çalışan ana editörü kapatmaya gerek yoktur. Sunucu yalnız loopback üzerinde dinler. İş bitince bu `serve.mjs` sürecini durdurun.

## Sorumluluklar ve veri akışı

- `src/components/documentation-tests/fixture.ts`: üretim varsayılanlarıyla yeni, yapay bir sahne üretir. Katman ve keyframe kimlikleri sabittir; her çağrı kendi dizilerini ve nesnelerini oluşturur. Zamanlar milisaniyedir, kompozisyon 640×400 pikseldir.
- `useDocumentationState.ts`: gerçek `useEditorState`, komutlar, Undo/Redo, asset cache, snap/ghost tercihleri ve interactive runtime. Seçim, araç, hız ve oynatma bu hostun React state'idir. RAF döngüsü unmount sırasında iptal edilir.
- `PanelHost.tsx`: uygulamadaki Layers, Properties, Timeline, Curve Editor, Dope Sheet, parametre ve diğer panelleri aynı sözleşmeleriyle birleştirir.
- `DialogHost.tsx`: gerçek composition, Clone, Array ve export dialoglarını kullanır. Array gerçek önizleme planını ve komutlarını çalıştırır.
- `browser.tsx`: mount noktası ve `#doc-capture` görüntü sınırı. Undo, Redo, revizyon göstergesi ve okunabilir sahne JSON'u bu sınırın dışındadır.
- `scripts/docs/prepare-panels.mjs`: esbuild + uygulamanın Tailwind stilleri. GIF işçisi aynı üretim kaynağından ayrı paketlenir; yalnız Next'in worker URL çözümlemesi için yerel çıktı yolu uyarlanır.

Host ana editörün açık sahnesini, dosya kurtarmasını, otomatik kaydını veya MCP oturumunu kullanmaz. Tercihler ayrı portun origin'ine aittir. Dosya içe aktarma ve export gerçek işlemlerdir; yalnız test dosyalarıyla kullanılmalıdır. Kaynak izleyicisindeki ses adaptörü boş test sahnesinde idle/0 döndürür. Panel ölçümleri üretim performans kıyaslaması olarak yorumlanmamalıdır.

## Görünümler

`view` seçenekleri: `layers`, `explorer`, `properties`, `text`, `path`, `spline`, `timeline`, `curves`, `dope-sheet`, `keyframe`, `modifiers`, `selection`, `snap`, `assets`, `state-machine`, `parameters`, `events`, `bindings`, `wires`, `preview`, `player`, `shortcuts`, `particles`, `resources`, `tools`, `canvas`, `composition`, `clone`, `array`, `export-image`, `export-svg`, `export-sequence`.

`text`, `path`, `particles` ve `spline` uygun örnek katmanı seçer. Gerekirse `&layer=card` gibi sabit bir katman kimliği verilebilir. Sayfayı yenilemek yeni bir sahne ve yeni history oluşturur.

`json` gerçek JSON penceresini açar. `&width=320` gibi 280–1120 aralığındaki bir değer, bileşenin CSS'ini değiştirmeden dock genişliğini sınar. Editör içindeki yardım bağlantılarının sahipliği ve kontrol notları [editor-help-links.md](editor-help-links.md) dosyasındadır.

## Görüntü alma

Bileşenin kendi kontrolleriyle sekmeyi veya dialogu açın. Gerçek tarayıcı görüntüsünü alın; `#doc-capture` veya dialogun DOM sınırlarına göre kırpın. Görüntüye yapay kontrol, yazı veya sonuç eklemeyin. Uzun panellerde ilgili alanı kaydırın; mevcut olmayan bir özelliği görünür göstermek için CSS değiştirmeyin.

Web sitesi `public/docs/screenshots` altındaki dosyaları `lib/documentation/screenshots.ts` üzerinden açıkça izin verilen yollar ve gerçek piksel boyutlarıyla gösterir. Rehber kaynağı, görsel, boyut kaydı ve yakalama notu birlikte güncellenmelidir. Bu değişiklikler ayrı `chorono-web` deposundadır.

## 11 Kasım 2026 tarayıcı kontrolleri

- Layers ekleme sekmelerinin gerçek içerikleri görüntülendi.
- Keyframe Spreadsheet: değer 300 → 320; Undo 300, Redo 320.
- Timeline: ileri kare düğmesine basma sonucu 600 → yaklaşık 616.67 ms; keyframe sürükleme sonucu 1200 → yaklaşık 1408.22 ms; tek Undo ile 1200 ms geri geldi.
- Radial Array: 5 katman/7 keyframe → 12 katman/42 keyframe; tek Undo ile 5/7.
- Particle preset: Confetti → Rain; Undo ile Confetti ayarları döndü. Bu kontrolde preset listesinin boş görünmesine neden olan Proxy iterasyonu, registry'nin gerçek snapshot API'si kullanılarak düzeltildi.
- Assets: repository içindeki örnek PNG gerçek import ile yüklendi, panelde 1 asset ve ölçüleri göründü.

Bunlar gözlenen örnek kontrollerdir; tüm export formatlarının veya her panel kontrolünün uçtan uca testi oldukları iddia edilmez. Birim testleri ayrı çalışır. Ana depoda gerekli kontroller `npm test`, `npm run mcp:build`, `npm run build` komutlarıdır; Next build öncesinde ana Next sunucusu durdurulur.

## 12 Kasım 2026 formül, bake ve guide çekimleri

`view=bake` gerçek `TrackBakeDialog` bileşenini fixture'ın `intro` timeline'ındaki `layers.card.transform.x` kanalıyla açar. `view=properties` içindeki Y alanının fx kontrolü gerçek formül penceresini açar. `view=canvas` içindeki Manage guides kontrolü gerçek guide hook/inspector kullanır. Her biri aynı bağımsız `useEditorState` sahnesine bağlıdır.

Üç yeni görsel: `property-expression-v1.jpg` (520×489), `track-bake-v1.jpg` (560×516), `ruler-guides-v1.jpg` (256×245). Gerçek tarayıcı görüntüleri bileşen DOM sınırlarıyla kırpıldı; görünüş veya kontroller yeniden çizilmedi. Bake görseli fixture'ın mevcut eğrisinin örneklemesini gösterir; evrensel performans/kalite ölçümü değildir.

Tarayıcıda gözlenen kontroller: bake preview 145 sample → 31 key; Apply sahneyi 7 → 35 key yaptı; tek Undo ile 7 key geri geldi. İç içe Calculate once penceresinde Help odağından Escape yalnız iç pencereyi kapattı. Formül Help odağından Escape kaynakta değişiklik yaratmadan kapandı. Guide 320 px olarak eklendi; iç hesaplama Escape ile kapanınca Guide açık kaldı, Guide Help odağından Escape dış pencereyi kapattı.
