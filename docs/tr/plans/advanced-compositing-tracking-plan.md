# CFX — İleri katman araçları, compositing ve yerel motion tracking

Tarih: 11 Kasım 2026. Durum: kullanıcı tarafından **sonraki faz için plana
alındı**; uygulama başlatılmadı. Buradaki özellikler, servis adları ve veri
sözleşmeleri öneridir; bugün kullanılabilir MCP/script API'si değildir.

## 1. Kuyruktaki yeri ve kapsam

[Ana yol haritası](../production-2d-roadmap.md) ve [onaylı uygulama sırası](geometry-material-boxed3d-sequence.md)
aynen korunur. Sıradaki iş E−1.5A input expression; ardından kalan V6/E−1.7
kabulü, dar entegrasyon, kutulu 3D/Poly/UV, karakter/bileşen, simülasyonlar,
export/final kalite, çoklu format/otomasyon ve mevcut serinin ikinci genel
optimizasyon/birleşik kabulü gelir. **CFX bu seri tamamlandıktan sonraki ayrı
ürün fazıdır; mevcut işleri bekleten yeni bir önkoşul değildir.**

CFX teslimlerinin kendi kaynak bütçesi, doğru zaman değerlendirmesi, görüntü
eşliği, export capability ve regresyon kabulü yine zorunludur. Önceki genel
optimizasyon kabulü yeni alanların otomatik kabulü sayılmaz. Üretimde doğrulanan
bir mevcut hata, olağan hata düzeltme önceliğiyle ayrıca ele alınabilir; burada
kaydedilen inceleme bulgusu tek başına mevcut kuyruğa ara iş eklemez.

Aktif kullanıcı ortamı 2D/2.5D kalır. Tam bağımsız 3D Modeling/Game Engine
çalışma alanı açılmaz. Temel video kurgu, kaynak videoya bağlı analiz ve 2D
içinde 3D compositing planlanır; ayrı Video Editor modu bu belgeyle açılmaz.

## 2. Sonraki fazın teslim sırası

| Kod | Teslim | Bağımlılık ve tamamlanma koşulu |
| --- | --- | --- |
| CFX1 | Maske doğruluğu | Add/Subtract/Intersect, invert, opacity, feather ve işlem sırasının bağımsız beklenen piksellerle doğrulanması; eski dosyaların değişen görünümü için açık uyumluluk/geçiş kararı. |
| CFX2 | Ortak Layers/Timeline kontrol sütunları | Mevcut hiyerarşi, seçim, komutlar ve sanallaştırma kullanılır. Görünürlük/kilit/solo, fx, maske kaynağı, parent, blend, renk etiketi ve uygun katmanlarda ses/motion blur; özelleştirilebilir sütunlar ve tek undo ile çoklu işlem. |
| CFX3 | Ayrıntılı kompozisyon penceresi | Yeni proje ve mevcut kompozisyon aynı ayar/validasyon sahibi üzerinden çalışır. Preset seçimi Apply'a kadar kaynak değiştirmez; Cancel kaynak ve animasyonu korur. |
| CFX4 | Effects & Presets ve efekt blokları | Mevcut EffectRegistry/effectsChain genişletilir. Arama/kategori/önizleme, enable/bypass, sıralama, reset, kopyalama, preset ve Timeline/input expression bağlantısı. |
| CFX5 | Gelişmiş maske authoring | CFX1–2 üzerinde viewport'ta maske çiz/düzenle, maskeyi tek göster, expansion, Alpha/Luma ve ters matte, maskeye özel animasyon kontrolleri. |
| CFX6 | Adjustment Layer | CFX4–5 üzerinde altındaki tanımlı kompoziti etkileyen katman; grup sınırı, alpha, maske, efekt sırası ve tampon sahipliği açık olur. Normal group efektinin kopyası sayılmaz. |
| CFX7 | Çoklu video, bütçeli kare cache ve temel kurgu | Bağımsız clip saatleriyle aynı viewport/composite içinde çoklu video; bayt bütçeli decode/kare/texture cache, proxy ve kaynak zaman doğruluğu; split/trim/ripple, görüntü–ses bağlantısı ve desteklenen çıktıda doğrulama. |
| CFX7K | Chroma key, kenar temizleme ve despill | CFX4–5 ve CFX7 üzerinde renk seçimi/tolerance/softness, matte black/white, grow/shrink/feather, koruma maskesi ve spill bastırma. Kaynak/matte/composite preview; ortak renk/alpha ve GPU/CPU çıktı kabulü. |
| CFX8 | Yerel tek/çift nokta takibi, düzeltme ve stabilizasyon | CFX7'nin kaynak/kare saatini kullanır. CPU worker analizi, güvenilirlik/kayıp işareti, ileri/geri/tek kare, elle sabitleme, hedef bağlama ve bake. |
| CFX9 | Düzlemsel tracking ve Corner Pin | CFX8'in iş/medya sahipliği üzerinde homography/perspektif dönüşümü; yeterli güvenilir eşleşme, düzlem sınırı, dört köşe düzenleme ve perspektifli render adapter'ı. |
| CFX10 | Katmanlı 3D compositing | Daha önce tamamlanan kutulu 3D çekirdeğini yeniden kullanır. Aynı grupta ortak kamera/derinlik; 2D düzlemler ve modeller, Timeline, mask/holdout ve 2D kompozitleme. Yeni bağımsız 3D motor oluşturulmaz. |
| CFX11 | 3D kamera çözümü | CFX8'in özellik izleri + CFX10 kamera adapter'ı; kamera hareketi, yerleştirme düzlemi/ölçek, hatalı iz eleme ve çözüm kalite raporu. Önce temsilî çekimlerle araştırma/prototip kapısı, sonra ürünleştirme. |

Sıra bir teslim tercihidir; her ardışık satır diğerinin matematiksel önkoşulu
değildir. Örneğin CFX10 elle animasyonlu kamerayla çalışabilir; CFX11 beklenmez.
Nokta takibi için tam bir video kurgu ürünü gerekmez; bu fazda CFX7'nin dar
kaynak/clip/kare-zaman hazırlığı paylaşılır.

## 3. Katman, kompozisyon ve efekt ayrıntıları

Layers kompakt görünür; Timeline katman sütunları ayrıntılı düzenlemeyi sunar.
İkisi aynı source ID ve native komutu kullanır. fx hücresi efekt paneline erişim
ve açık bypass işlemi sağlar. Parent seçimi çevrim/bozuk referansı reddeder;
world konum ve mevcut animasyonları koruyan reparent sözleşmesine bağlanır.
Çoklu seçim farklı değerleri açık gösterir; üst ağacın görünürlük etkisi ile
çocukların kendi hidden/locked değerleri ayrıdır. Toplu alt ağaç işlemi kapsamı
belirtir; görünmeyen/sanallaştırılmış satırlar seçim kapsamını değiştirmez.

Kompozisyonda temel alanlar: ad, preset/custom genişlik-yükseklik, oran kilidi,
süre, FPS ve arka plan. Gelişmiş alanlar: başlangıç kare/timecode gösterimi,
önizleme çözünürlüğü/kalitesi, tampon belleği tahmini ve kişisel preset'ler.
Boyut değişiminde tuvali değiştirme ile içeriği ölçekleme ayrı seçenektir.
Saydamlık desteği, checkerboard görünümü ve çıktı alpha profili ayrıştırılır.
23.976/29.97 gibi oranlar yalnız ondalıklı input değildir; rasyonel frame saati,
timeline, video kaynak zaman damgası ve export birlikte doğrulanmadan açılmaz.
Henüz çalışan backend'i olmayan FP16/renk/3D renderer seçenekleri UI'a eklenmez.

Efekt parametreleri için kimlik, typed değer, birim, aralık, varsayılan ve
animasyon/expression capability'si ortak tanımdan gelir. Mevcut yedi efekt
(blur, glow, shadow, inner shadow, inner glow, tint, vignette) başlangıçtır;
yeni katalog için ikinci efekt zinciri veya dev bir PropertiesPanel switch'i
üretilmez. Sıralama, key/reference kimliklerini bozmamalıdır. Mevcut array-index
tabanlı kanallar varsa stable ID adapter/migration kararı açık yazılır.
Desteksiz efekt/çıktı görünür uyarı veya açık bake/fallback ister.

AE/FxFactory örnekleri etkileşim referansıdır. Bu plan native AE eklentilerini
yükleme, FxFactory uyumluluğu veya üçüncü taraf plugin pazarı sözü vermez.

## 4. Yerel analiz, kaynak yönetimi ve bake

Hedef akış: **Kaynak video → aralık/bölge seç → analiz → güvenilirlik ve elle
düzeltme → hedefe bağla veya bake et.** Oynatım sırasında her karede tekrar
tracking çözülmez; kaynak/ayar değişimi ilgili sonucu stale yapar.

- İlk backend adayı Web Worker + WebAssembly CPU'dur. OpenCV'nin nokta takibi
  ve homography algoritmaları değerlendirilir; dağıtılacak WASM build'inde
  gerekli modüllerin gerçekten bulunması ve sahiplik/performansı doğrulanır.
  OpenCV kullanımını her backend'in zorunlu bağımlılığına dönüştürmeyen dar
  frame-source / solver / result-storage sözleşmeleri kullanılır.
- Video demux/decode, takip hesabı, veri dönüşümü ve UI job orchestration
  ayrı sorumluluklardır. WebCodecs bir adaydır; codec/platform capability ve
  fallback açık olur. Yaklaşık HTMLVideoElement seek'i kesin kare decoder'ı
  sayılmaz. Kaynak PTS, trim başlangıcı, VFR ve composition zamanı eşleştirilir.
- Kullanıcının tüm videosu RAM'e decode edilmez. Kare akışı, sınırlı kuyruk,
  yeniden kullanılan çalışma tamponları, analiz proxy/ROI ve sınırlı cache
  kullanılır. Proxy/ROI koordinatları kaynak pikseline ve hedef parent-local
  uzaya açık dönüşümle taşınır; pan/zoom analizi değiştirmez.
- Progress/cancel, kaynak lease'leri, gerçek iş bitimine kadar bellek sahipliği
  ve stale sonuç reddi mevcut job/resource yaklaşımına bağlanır. İlk backend
  yereldir; uzak servise video gönderimi veya yeni telemetry bu planın parçası
  değildir. Native yardımcı süreç ancak ölçümle ihtiyaç doğrulanırsa ayrı
  platform adapter'ı olarak değerlendirilir; şimdi kurulum yapılmaz.
- Analiz sonucu kaynak asset kimliği/hash'i, kaynak zaman aralığı/PTS, analiz
  çözünürlüğü/ROI, solver sürümü/ayarları ve bağımlılık manifestiyle saklanır.
  Yoğun iz/kare verisi olağan scene JSON/Undo snapshot'larına konmaz; bütçeli
  sonuç asset/cache'i ve küçük sürümlü referanslar kullanılır.
- Ham izler, manuel düzeltme/sabit kareler ve smoothing ayrı tutulur. Re-run
  insan düzeltmelerini sessizce silmez. Takip kaybı görünürdür; görünmeyen bir
  noktayı güvenilir sonuç gibi aralıksız uydurma politikası uygulanmaz.
- Hedef bağlama ve key bake ayrı seçeneklerdir. Konum için kontrol/parent
  katmanı, dönüş/ölçek için uygun transform adapter'ı; Corner Pin için
  perspektif/geometri adapter'ı kullanılır. Mevcut key'ler varsayılan olarak
  ezilmez; Preview/Apply/Cancel, revision kontrolü ve tek undo gerekir.
- Source ve bake korunur. Taşınabilir kaydet/aç, clone/instance, sessionId,
  Undo/Redo kurtarma ve kaynak değişiminde stale bildirimi uçtan uca çalışır.
  Raster/video çıktısı bake edilmiş sonucu aynı zamanlardan değerlendirir;
  desteklenmeyen SVG/Lottie/runtime yolunda sessiz kayıp olmaz.

### 4.1. Çoklu video ve keying — 11 Kasım ek kullanıcı onayı

Bu genişleme CFX7/CFX7K kapsamındadır; E−1.5A, ilk kutulu 3D obje ve mevcut
seri öncelikleri değişmez. CFX7K'den sonraki tracking/compositing kimlikleri
korunur. Aynı dosyadan farklı zamanları oynatan klipler bağımsız saat kullanır;
kliplerden birini seek etmek diğerini değiştirmez. Katman sırası/transform/
opacity/blend ve maskelerle üst üste video birleştirilir.

Cache kaynak kimliği/sürümü, PTS, çözünürlük ve gerekiyorsa işlem ayarlarıyla
anahtarlanır. Decode kuyruğu ve playhead çevresi prefetch bayt bütçesiyle
sınırlıdır. Zaman/görünürlük bağımlılıklarına göre gerek duymayan akış durur;
sesi veya maske kaynağı gereken bir video yalnız ekran dışında diye atılmaz.
Kullanılmayan VideoFrame/decoder/texture gerçek tüketicisi bırakınca kapatılır;
scrub/iptal/source değişimi geç sonuçları reddeder. Tüm video decode edilip
RAM'e alınmaz. Native decoder/sürücü belleği managed toplamıyla karıştırılmaz.

Keyer yerel GPU shader adayıdır; CPU fallback capability ve performansı ayrı
doğrulanır. Tolerance ve softness ile alpha çıkarma, matte düzeltme, kenar
işleme ve despill ayrı tanımlanır. Efekt sırası, premultiplied alpha ve renk
uzayı açık olur; parametre değişimi ilgili cache'i invalid eder. Kaynak dosya
yıkıcı değiştirilmez. Keylight benzeri kullanım hedeflenir; native Keylight
eklentisi veya aynı algoritma/kaliteye otomatik uyumluluk iddiası yoktur.

Kabul: 2/4 eşzamanlı klip, aynı kaynaktan farklı trim/seek, maskeli ve sesli
ekran dışı klip, uzun scrub/loop ve tekrar aç/kapatta bounded bellek; keyer
için yeşil/mavi perde, benzer foreground renkleri, kısmi alpha/saç/motion blur,
koruma maskesi, koyu/açık arka planda kenar ve despill karşılaştırması.
Viewport/final raster/video zaman ve görüntü eşliği, keyframe/preset/undo,
portable/session ve açık fallback kontrolleri bu teslimin parçasıdır.

## 5. 3D compositing ve kamera çözümü sınırları

Mevcut 2D affine dönüşüme gelişigüzel z eklenmez. Kutulu 3D'nin ayrı TRS/matrix,
kamera/projection ve yerel saat sözleşmeleri kullanılır. Aynı compositing
grubundaki 3D düzlemler ve modeller ortak depth/kamerayı paylaşır; grup şeffaf
yüzey olarak 2D compositor'a girer. Ayrı kutular arasında otomatik ortak depth,
ışık veya gölge yoktur. Her gruba sınırsız WebGL context/tampon açılmaz.

Kamera takibi, videodaki hareketli bir nesnenin bağımsız 3D pose takibi değildir.
Kamera çözümü tam ortam mesh'i veya otomatik occlusion üretmez. Gerçek görüntü
içindeki ön nesnenin arkasına yerleştirme için maske/holdout veya açık depth
girdisi gerekir. Ölçek, zemin/düzlem, lens varsayımları ve yetersiz parallax gibi
çözüm sınırları kullanıcıya gösterilir. Tek düzlem/pure rotation/zayıf dokulu
çekim için başarısızlık veya daha sınırlı çözüm açıklanır; her video çözülebilir
diye sunulmaz. Ağır CPU analizinin yerel olması, 3D çizimin GPU kullanmasını
engellemez; hız iddiası hedef donanımdaki ölçümden sonra yapılır.

## 6. Doğrulama, inceleme bulgusu ve iş yükü

11 Kasım incelemesinde `MaskRenderer.ts` içinde Add/Intersect'in aynı
`destination-in` yoluna gittiği görüldü. Bu kod bulgusudur; yeni görsel kabul
çalıştırılmış veya hata bu belgeyle düzeltilmiş değildir. CFX1'de ayrık/örtüşen
maskeler, kısmi alpha, invert ve feather için bağımsız beklenen sonuç hazırlanır;
mevcut implementasyonun çıktısını referans olarak kopyalamak yeterli değildir.

Her teslimde anlamlı birim/adapter testleri, gerçek Chrome etkileşimi ve
representative rendered output incelenir. Tracking kabulü bilinen hareketli
sentetik klip ve gerçek çekimleri; rotasyon/ölçek, örtülme, blur, kadrajdan çıkma,
VFR/trim, iptal, stale source ve manuel yeniden başlatmayı kapsar. Hata piksel
uzayında, güvenilir iz oranı ve yeniden başlatma ihtiyacıyla raporlanır. Kamera
çözümünde reprojection error tek başına yeterli değildir; eklenen test nesnesinin
videoya oturması da karelerde incelenir.

Kaynak tüketimi 8 GB sınıfı makinede ve mevcut 512 MiB uygulama bütçesi profiliyle
ölçülür; bu bütçe toplam işlem/sürücü RAM'i garantisi değildir. Kare başına
bellek büyümesi yerine bounded plateau, cancel/dispose sonrası kaynak bırakma ve
aynı çıktı karşılaştırması aranır. Eşikler prototip ölçümünden sonra belirlenir.

Ön değerlendirmedeki emek aralıkları: sütunlar 5–8, kompozisyon 3–5, mevcut
efektler için katalog/blok 8–12, maske doğruluğu + authoring toplam 10–18,
Adjustment Layer 8–15, temel video kurgu 30–50 kişi-gün. Bunlar takvim/teslim
taahhüdü veya tamamlanmış benchmark değildir; entegrasyon kapsamıyla yeniden
tahmin edilir. Tracking ve özellikle CFX11 için araştırma/prototip sonrası
ayrı tahmin gerekir; önceki UI tahminleri kamera solver'ını kapsamaz.

## 7. Dayanaklar

- [Ana sıra ve 3D/Poly sınırları](geometry-material-boxed3d-sequence.md)
- [Input expression planı](input-expression-plan.md)
- [Mevcut maske renderer'ı](../../../src/lib/mask/MaskRenderer.ts)
- [Mevcut efekt registry'si](../../../src/lib/effects/EffectRegistry.ts)
- [Oturum/geçmiş kaynak sahipliği](../session-recovery.md)
- [Adobe efekt sırası ve Adjustment Layer](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/effects-and-animation-presets/effects-animation-presets-overview.html)
- [Adobe Track Matte](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html)
- [Adobe kompozisyon ayarları](https://helpx.adobe.com/after-effects/desktop/work-with-compositions/composition-settings/composition-basics.html)
- [OpenCV Lucas–Kanade noktaları](https://github.com/opencv/opencv/blob/5.x/doc/js_tutorials/js_video/js_lucas_kanade/js_lucas_kanade.markdown)
- [OpenCV homography/pose sözleşmeleri](https://docs.opencv.org/4.10.0/d9/d0c/group__calib3d.html)
- [WebCodecs ve worker veri akışı](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)
- [Adobe 3D kamera tracking](https://helpx.adobe.com/after-effects/desktop/work-with-3d-composition/3d-camera-tracker-effect/tracking-3d-camera-movement.html)
