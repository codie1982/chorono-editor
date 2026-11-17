# 3D kaynak kurtarması — 17 Kasım 2026

Kurtarılan kaynak, ana reponun `codex/recovered-3d-20261117` dalında tutulur. Çalışan 2D `main` dalına birleştirilmemiştir. İnceleme ve derleme kaynağı ana repo altındaki `artifacts/3d-recovery-20261117/source` dizinidir; geçici eski çalışma ağacı üzerine yazılmamıştır.

## Kaynak ve yöntem

Kaynak tabanı `80e333a7` commitidir. 12 Kasım gecesi ile 16 Kasım son düzenlemeleri arasındaki erişilebilir oturumlarda 3.229 araç çağrısı ve 1.606 gerçek dosya değişikliği kaydı incelendi. Kaynak yazımları izole dizine zaman sırasıyla uygulandı. Shell işlerindeki sunucu başlatma, silme, Git reset, kurulum ve ağ komutları yeniden çalıştırılmadı. Dosya yazan Python bölümleri başlangıçta yol/ağ/alt süreç kısıtları altında işlendi; kalan uyuşmazlıklar açık dosya değişiklikleriyle giderildi.

Kısmi kurtarmada başlangıç dosyası bulunamayan 265 işlem vardı. Tam taramada başlangıç dosyaları bulundu; sonunda eksik başlangıç nedeniyle atlanan dosya kalmadı. Güncel çekirdek 98 `src/lib/model3d` dosyası, 30 `src/components/detail/model3d` dosyası ve render servis istemcisi/testini içerir. Önceki kısmi kurtarmadaki bu alanlara ait dosya adlarının tümü yeni kurtarmada bulunur. Bunlara ortak detail/Timeline/evaluator/import/MCP bağlantıları da dahildir.

Bu, orijinal diskin bit düzeyinde imajı değildir. Erişilebilir kaynak kayıtlarından yeniden oluşturulmuş ve aşağıdaki kontrollerle doğrulanmış kaynak ağacıdır. Kayıtlarda yer almayan harici/binary kullanıcı varlıklarının geri geldiği iddia edilmez. Ham kayıtlar, başarısız hunk dökümleri ve ara kopyalar ana reponun git dışında tutulan kurtarma alanındadır.

## Geri alınan kapsam ve sahipler

- GLB/gömülü glTF import ve boş 3D sahne: `ModelHandler`, `modelFraming`, `emptyModelSceneDocument`. Boş sahne açık bir glTF marker'ı ile geçersiz/bozuk geometri importundan ayrılır.
- Ortak detay host'u, 3D Scene Explorer, viewport, Properties, kamera/view cube, grid, seçim, izolasyon ve ölçü birimleri. `ModelDetailWorkspace` ve `ModelPanelDock` düzeni yerel UI durumudur.
- Çoklu imported instance/node, kamera/ışık kaynakları, PBR/material kontrolleri ve Box/Sphere/Cylinder/Cone/Plane primitive kaynakları. Metre kaynak birimi, derece dönüş, ID ile sahiplik ve kaynak bütçesi sözleşmeleri korunur.
- İç klipler: `ModelClipDraft`, `modelChannels`, `modelPrimitiveChannels`, `ModelContentTimeline`, `ModelContentKeys`, `ModelCurveEditor`. Primitive keyleri dizi indeksine değil kararlı nesne ID'sine bağlanır. Ana 2D kutu keyleri ana Timeline'da, içerik keyleri özel Timeline'da kalır.
- Native clip playback, scrub/loop, çıktı kamerası, parametrik/Wire köprüleri ve bounded render kaynakları. Render paneli/presetleri ve `ChoronoRenderServiceClient` geri alınmıştır.
- Apply/Cancel ve yerel Undo/Redo, mevcut detail/command sahipleri üzerinden çalışır; Apply bir ana Undo adımı oluşturur. Kaynak JSON'a UI seçimi, DOM/GPU handle'ları veya kare önbelleği eklenmez.

İlgili özgün plan: [3D Animation Timeline planı](../tr/plans/model3d-animation-timeline-plan.md). Daha ayrıntılı kaynak sözleşmeleri, dosyaların JSDoc'larında ve `docs/tr/model-detail-3d-packages.md` içindedir.

## Uzlaştırılan bağlantılar

Aynı değişikliğin hem taban committe hem sonradan oturum kaydında bulunması yinelenen mask renderer bloğu üretmişti; tek authoritative blok bırakıldı. Sırası kaymış boş sahne framing düzeltmesi ve ortak Canvas spline controller/preview bağlantıları tamamlandı. İç Curve Editor'da dış Bake eylemi kapısı korundu. Kayıtlı `8aab366f` script korumaları üç yönlü birleştirildi; özel Timeline bağlamı korunarak veri kabul ve native-adapter sınırları uzlaştırıldı. Paint validator, zaten var olan Image/None source enum'larıyla eşleştirildi.

`coverage2d-pre-guards.audit.ts.txt`, bir defalık eski denetimin değiştirilmemiş kaydıdır. Dosya commitli tabanda yoktu; eski açıkların sürmesini, örneğin kilitli/3D alana genel script yazımının kabulünü bekleyen karakterizasyon testleri içeriyordu. Aktif regresyon sözleşmesi olarak eklenmemiştir. Bunun yerine son guard sürümünün 89 testlik `ScriptSourceGuards.test.ts` paketi aktif kalır ve geçer. Test gizlemek amacıyla mevcut bir regresyon dosyası silinmemiştir.

## Doğrulama

- Tam suite: **456 test dosyası, 3.522 test geçti**.
- 3D odaklı alt küme: **29 dosya, 161 test geçti**; tam suite'e dahildir.
- TypeScript, `mcp:build`, `cli:build` ve Next üretim build başarılı.
- Özgün gerçek WebGL kabul sahneleri: çoklu model/native skin+morph için 24; özel klip/preview/render için 58 kontrol geçti. Aynı tarayıcı/GPU içinde viewport, MCP PNG ve raster PNG pikselleri eşleşti; geri seek ve portable yeniden açma aynı kareyi üretti. Bu sonuç başka GPU/platformlar arasında bit eşliği iddiası değildir.
- Ayrı UI kabulünde 11 kontrol: Box ekle, iç klip oluştur, Set Key, Timeline/Dope Sheet/Curve Editor aç, Apply öncesi ana kaynağı koru, tek Apply Undo, Undo/Redo ve Cancel. Tarayıcı çalışma zamanı hatası yoktu.
- Sonuçların makine okunur özeti: [3d-source-verification.json](3d-source-verification.json).

## Kullanım ve sınırlar

Bu dal, güncel 2D main ile yeni bir entegrasyon/release değildir. Main'e geçirilmeden önce iki dalın farkları ayrıca birleştirilmelidir. Yerel kurtarma kaynaklarını açmak için yeni bir dizine kaynak ZIP'i açılabilir; Node bağımlılıkları `npm ci`, ardından `npm test`, `npm run mcp:build`, `npm run cli:build`, `npm run build` ile hazırlanır. Kendi sunucusu çalışırken build yapılmaz.

Orijinal planın kapsam dışı maddeleri aynen geçerlidir: genel rig/weight editörü, native bone keylerinin ana Timeline'a topluca aktarılması, animasyonlu topoloji, tam modifier stack veya spline extrusion üretimi eklenmemiştir. Edit Poly/Extrusion alanlarının mevcut seçim/placeholder sınırları yeni yetenek gibi sunulmaz. Harici chorono-render servisinin gerçek ağdaki dağıtımı çalıştırılmadı; istemci sözleşme testleri ve yerel render eşliği doğrulandı. Telefonda/düşük ekran boyutunda çalışma desteği bu kurtarma ile genişletilmedi.
