# Layers → Timeline ve geçici izolasyon

10 Kasım 2026. Layers başlığındaki **▤ Timeline**, seçili katmanı/dalları etkin
Timeline'da bulur; parent yollarını, çocukları ve uygun animasyon satırlarını açar.
Kapalı/katlanmış Timeline paneli mevcut dock üzerinden geri açılır. Katman seçimi
tek başına Timeline'ı açmaz, kaydırmaz veya filtre değiştirmez; ortak seçim vurgusu
korunur. Çoklu seçim desteklenir; birincil nesneye kaydırılır. Aynı düğmeye tekrar
basılabilir. Timeline **Find selected** aynı yolu kullanır. **Restore filters**
geçici gösterimi kaldırır; yeni seçim eski Find isteğini sona erdirir.

Etkin timeline üyeliği, başka timeline'a yönlendirilmiş audio ve normal track
eligibility kuralları korunur. Find üye yapmaz, key oluşturmaz, playhead taşımaz
ve undo/source kökenine kayıt eklemez. Aktif timeline'daki mevcut animasyonlar
gösterilir; hangi animasyonu açacağını tahmin ederek başka timeline seçilmez.

**⊡ Isolate**, seçili görsel katmanlar ve bütün kaynak çocukları için geçici bir
viewport görünümüdür. Ancestor'lar transform/compositing bağlamı olarak korunur.
İçeride elle gizlenmiş çocuklar gizli kalır; kaynak solo bayrakları izolasyon
görünümünü kısıtlamaz. Audio transport'unu susturmaz. **Exit isolate** veya Canvas
üzerindeki ayrılmış durum satırındaki **Exit isolation** tam görünümü geri getirir.
Bu sırada yapılan source düzenlemeleri ve mevcut hidden/solo ayarları aynen kalır.
İzolasyon açıkken eklenen/reparent edilen çocuklar canlı kaynak ağacına göre
kapsama girer. Belge değişimi izolasyonu temizler; silinen kökler boş görünüm
bırakmaz. View-only durum JSON, undo, export ve MCP sahnesine yazılmaz.

Scene Explorer'ın eski Isolate arayüzü aynı geçici owner'a bağlandı; izolasyonda
Show All yalnız çıkar. İzolasyon dışında eski Show All görünürlük komutu değişmedi.
Eski düşük seviyeli `makeIsolateLayersCmd` kaynak bayrağı yazan uyumluluk komutudur;
yeni geçici UI bunu çağırmaz. Böylece mevcut doğrudan komut sözleşmesi sessizce
değişmez ve ikinci bir source visibility snapshot/restore sistemi kurulmaz.

## Bakım sözleşmesi

- `useLayerIsolation` yalnız seçili kök ID'lerini ve belge yaşam döngüsünü tutar.
  `projectIsolationView` mevcut `LayerIndex` subtree/ancestor algoritmasını
  kullanır. Boş scope orijinal source referansını döndürür; aktif projection
  immutable sahneden yalnız display hidden/solo bayraklarını türetir. Zaman,
  geometri, kimlik, topology, animasyon ve attribution dönüştürülmez.
- `SceneCanvas.scene` komut/transaction baseline'ı olarak tam source kalır.
  Optional `displayScene` yalnız renderer, font/geometry hit query ve dış alan
  çizgilerine gider. İzole görünümün dışındaki katmanlar snap adayı da değildir.
  Kaynak pointer commit'leri display bayraklarını sahneye geri yazmaz. Export,
  evaluator ve ses mevcut source owner'ını kullanır.
- `TimelineRevealRequest` küçük bir typed UI kaydıdır: nonce, etkin timeline, click anındaki root ID'leri ve primary ID.
  Page bunu oluşturup mevcut `dispatchRestorePanel` çağırır. Timeline `useFindSelected`,
  `useLayerBranches` ve `useSelectedLayerReveal` üzerinden mevcut sanallaştırmaya
  ulaşır. Selection/time/source API değiştirilmez. İstek selection/belge değişince
  bırakılır; eski bir istek başka timeline'a uygulanmaz.
- `LayerFocusControls` ve `LayerIsolationBar` yalnız sunum/erişilebilir native
  düğmelerdir. Panel daraldığında header wrap eder; Canvas durum satırı resim
  üzerinde yüzen bir uyarı değildir. Timer, ağ çağrısı, GPU handle veya kalıcı
  büyük view cache eklenmez. Legacy büyük panel/page dosyaları ilgili bağlantıyla
  sınırlı güncellendi.

```ts
// Yalnız renderer/query adapter'ına verilir; save/export/editor source'u değildir.
const view = projectIsolationView(source, ['product-group'])
// <SceneCanvas scene={source} displayScene={view.scene} ... />
```

## Kabul

`scripts/perf/layer-focus.mjs <output>` izole gerçek Layers/Timeline/Canvas
sayfası üretir. 254 katmanda explicit/repeated Find, reversible text filter,
subtree/hidden/solo izolasyonu, gerçek kırmızı piksel, kaynak edit/undo, belge
değişimi ve gerçek Canvas pointer drag test edilir. Kullanıcı editörüne veya
MCP oturumuna yazmaz. Mevcut 505 katmanlı hiyerarşi kabulü de yeni explicit Find
tercihine uyarlandı. Kanıt `artifacts/validation/layer-focus-20261110/` altındadır.
Kaynak yerel koordinatlar piksel, zaman milisaniye; hiçbir yeni animasyon
formatı/MCP aracı veya export davranışı eklenmedi.
