# A5 ve ortak araç kabulü — 12 Kasım 2026

Kapsam: input expression A1–A4 sonrası A5, V6/E−1.7 ve
[dar kare entegrasyonu](pre3d-frame-contract.md). 3D geliştirmesi başlatılmadı.
Kullanıcının açık 2000 portundaki belgesi değiştirilmedi. Kabul kaynakları ve
üretilen JSON/PNG kanıtları `artifacts/validation/pre3d-*-20261112/` altındadır.

## Four Seasons — aynı kaynak ve 512 MiB

Kaynak SHA-256:
`d2c48a21c9ac6c96a77552461d29b9b8a4a931582e775659bb8bff31e5739149`.
4079 layer, 42512 key, 7863 track, iki timeline; 48 s timeline seçildi.
Build/source manifest'leri kanıtta tutulur; eksik birkaç dosyanın yerine geçmesi
yerine A3 `da5b110` ve A4 `120206c` tam kaynak ağaçları karşılaştırıldı.

| Ölçüm | Sonuç |
| --- | --- |
| Production EditorPage, görünür 10 tam oynatma | 10/10, 490,1 s; gizli örnek 0 |
| Managed kaynak tepe değeri | 46,25 MiB / 512 MiB |
| Gözlenen JS heap | 44,30–126,60 MiB / 768 MiB gözlem sınırı |
| Canvas registration | 21 → 21 |
| Viewport CPU p50 / p95 | 183,6 / 251,0 ms |
| Evaluation p50 / p95 | 13,1 / 23,1 ms |

Editor warmup iki başlangıç oynatması ve ardından Fit görünümünde bir oynatma
içerir; süre/ölçek geçişleri ham warmup kayıtlarında ayrı tutulmuştur. On tam
oynatma Fit (~54%) ile yapıldı. Fixture yükleyici gerçek production Open Scene
JSON akışına hash doğrulanmış File verir; native dosya seçici testi değildir.
QA transport pointer çiftleriyle playback'i başlatır; wall-clock/scene zamanı
yazılmaz, forced GC kullanılmaz.

Tarihsel OPT32'de managed tepe 46,15 MiB, heap 39,66–107,61 MiB idi. Yeni managed
farkı yaklaşık 0,10 MiB; canvas kaydı büyümüyor. Bu değerler bütün JS nesneleri,
OS RSS, decoder/sürücü veya gerçek toplam proje RAM'i değildir ve toplanamaz.

CPU sonucu tarihsel OPT32 (30,7 / 47,5 ms) kadar hızlı değildir. Bu fark gizlenmedi.
Aynı cihazdaki güncel A3 production kontrolü de 180 / 293,3 ms verdi; 48 s tek
oynatma, cold başlangıç ve 56 px farklı pencere yüksekliği nedeniyle bu kontrol
mutlak eşdeğer benchmark sayılmaz. İki realm yerleşimi de ters çevrilerek yapılan
120 eşlenik seyrek karede toplam CPU p50 A3 **102,2**, A4 **103,5 ms**; p95 A3
239,7, A4 200,4 ms. On iki RGBA checkpoint'i birebir eşleşti, managed byte'lar ve
layer visit'leri aynıydı. Kaynak değişikliğine ait büyük bir CPU gerilemesi
görülmedi; küçük süre farklarına hız iddiası yüklenmez. Ortam yüküne duyarlı eski
ölçümle mutlak fark, onaylı son genel optimizasyon turunda yeniden ele alınacak.

Bu kabul bellek sınırı/plateau ve mevcut değişikliğin karşılaştırmasıdır; bütün
ürünün performansını son kez optimize etme teslimi değildir. Yeni expression
grafiği ayrıca gerçek 512-driver / beş typed sonuç ile 60 kare, 513-driver atomik
ret ve 1500 parser draft'ında en fazla 512 cache kaydı invariants'ından geçti.

## V6 / E−1.7

Mevcut production bileşenleriyle ayrı inline belgelerde:

| Fixture | Sonuç | Kapsam |
| --- | --- | --- |
| Viewport | 13/13 | Pivot, reflected/nested parent, çoklu seçim, key'li taşıma, nudge, Escape/cancel, tek Undo |
| Motion | 12/12 | Timeline/Curve senkron key seçimi, sparse x/y drag, rota çiz/Apply/Cancel, endpoint, duplicate/delete, stale ret |
| Clone | 14/14 | İlk seçimde sürükleme, subtree/reference/animation, Cmd/Ctrl+D, Alt/Cmd release ve cancel |
| Array | 15/15 | Çoklu kök, Linear/Grid/Radial/Path, preview, time offset, bütçeli outlines, tek Undo, Cancel ve unsupported shear |

Bu 54 otomatik browser kontrolü gerçek bileşenlere DOM olayları gönderir; fiziksel
fare veya OS input'u taklit ettiği iddia edilmez. Native input kanıtı ayrıca
Cua üzerinden alındı: tam production editöründe saat 09:05 yapıldı, Bézier
out-handle (190,280) → (226,244) sürüklendi ve özgün key'in easing'i easeOut →
easeInOut değiştirildi. Sonra gerçek MCP 2.1 STDIO/QuickJS akışında eski revision
reddedildi; fresh read sonrası yalnız text color değişti. **Diğer tüm source
alanları**, insan writer kayıtları, key ID/zaman/easing ve path aynen kaldı.
Undo/Redo exact source+ledger karşılaştırmasından, portable save/load ise tam JSON
eşliğinden geçti. Runtime paketi authoring ledger'ını çıkardı; preview PNG incelendi.

Native Timeline Find/subtree ve iki katmanlı Set Key özgün key ID/easing/değerlerini
korudu. Gerçek QuickJS'de sıfır-key sine controller eklendi; UI Preview/Apply bake
181 sample → 25 normal key üretti. Spreadsheet'te ilk key 100 → 102 düzenlendi.
Sayfa yenilemesi aynı session ID ve 12 Undo adımını korudu; yeniden bağlantıdan
sonra exact source/Redo ve yalnız bu key'i 102 → 100 geri alan Undo doğrulandı.
MCP bağlantısı sayfa yenilemesinde tekrar açılır; persistence ile aynı şey değildir.

Gerçek native Array UI'da 6 layer/7 key → Apply ile 12/17 → tek Undo ile 6/7
görüldü; valid preview Cancel source'u değiştirmedi. Component fixture Undo'da
UI selection'ını otomatik prunelamaz; eski clone ID'leriyle yeniden açılan Array
açık diagnostic ve disabled Apply verir. Production seçim host'u ayrı sorumludur.

Eski motion QA'nın duplicate→delete sonrası bütün JSON'u değişmez sayan assertion'ı
authoring v1'e uyarlandı. Visual source **bütün alanlarda** exact karşılaştırılır;
başarılı işlem köken kaydı ayrı validate edilir. İki Undo/Redo bütün source ve
ledger snapshot'larını exact geri getirmek zorundadır. Kaynak hatasını gizlemek
için key veya layer verisi karşılaştırmadan çıkarılmadı.

## Dar entegrasyon ve sınır

Raster/MCP preview aynı caller-parameter frame'ini resource readiness ve draw'da
kullanır. Renderer eksikse final çıktı açık hata verir; temel SVG mask/etkin
efekt/blend kaybını warning ile belirtir. Native kare fixture'ı PNG 1×/2× target,
gerçek alpha pikselleri, parametre/default ayrımı, JPEG fallback ve ownership
cleanup için 8/8 geçti. Ayrıntı ve yeniden çalıştırma girişleri
[kare sözleşmesinde](pre3d-frame-contract.md).

Tam Export E0, yüksek kaliteli final render, CFX, Poly ve ilk kutulu 3D bu kabulün
teslimi değildir; onaylı sırada kalırlar. Bu kapılar yeni türlerin ortak araç,
kaynak ve output sözleşmesine bağlanabileceği mevcut 2D temeli doğrular.

## Son kaynak ve build kontrolleri

Çalışma alanında `npm test`: **370 dosya / 2988 test**. Yalnız bu görevin staged
kaynak kopyasında **370 / 2987**, TypeScript, `npm run mcp:build` ve
`npm run build` geçti. Bir test farkı önceden var olan çalışma değişikliğindedir.
Ana checkout'ta da Next durdurularak MCP/production build başarıyla tekrarlandı
ve uygulama aynı 2000 portunda başlatıldı. Build'de mevcut package-version named
import uyarısı sürer; derleme hatası değildir ve bu değişikliğin kapsamına alınmadı.
47 eski tracked çalışma dosyası byte düzeyinde korundu; ayrı test sunucuları kapatıldı.

Gerçek E17 kaynak receipt'lerini yeniden karşılaştırmak için:
`node scripts/mcp/check-pre3d-receipts.mjs artifacts/validation/pre3d-e17-20261112`.
Bu salt okunur doğrulama 8 birleşik invariant'ı kontrol eder; tarayıcıya yazmaz.
`scripts/mcp/acceptance-client.mjs` yeni bir izole test editörüne gerçek SDK
transport'u sağlar; SceneAPI kodunu yalnız QuickJS `run_script` çalıştırır.
