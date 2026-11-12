# Ortak öğe detay düzenleyicisi — DET0–DET1

13 Kasım 2026. İlk çalışan ortak detay host'u; Shape, Bézier Path ve kutulu
modelin sabit 3D yerleşim ayarları desteklenir. İleri image/video/UV editörleri,
3D scene/rig/clip ve iç Timeline bu teslimde uygulanmış değildir.

## Kullanım ve görünen sınır

1. Tek, kilitli/donmuş olmayan, source bir Shape/Path/model katmanı seçin.
   Layers → **Edit content** veya Layers/Explorer/viewport sağ tık →
   **Edit content…** kullanın. Shape/model viewport çift tık da aynı host'u açar.
   Path'in eski çift tık → Pen akışı ve katman adı çift tık → Rename korunur.
2. Mevcut çalışma alanı içinde üst bağlam satırı, **Scene › öğe** breadcrumb'ı,
   Back, Undo/Redo, Focus view, Cancel ve Apply & return görünür. İlk host tek
   seviyedir; nested detay henüz yoktur. Dış ana toolbar inert olur, ana dock
   unmount edilmeden gizlenir; localStorage layout'u yeni detay düzeniyle yazılmaz.
3. Shape ölçü/geometri/fill/stroke, Path stil/closed ve tek noktanın local X/Y'si,
   model iç XYZ/dönüş/ölçek/kamera/ışık mevcut authoritative schema'dan düzenlenir.
   Point taşıma eski `moveAnchor` hesabını kullanır ve handle offset'lerini korur.
4. Detay viewport'u seçili içeriği ana kompozisyon koordinatlarında ve açılış
   zamanında izole gösterir. Pan/zoom açıktır; dış 2D sürükleme/resize, guide ve
   motion-key authoring kapalıdır. Model kamera aracı varsa **taslağın kayıtlı
   çıktı kamerasını** değiştirir; ayrı bir 3D inceleme kamerası henüz eklenmedi.
5. Değişiklikler yalnız taslaktadır. Apply ana kaynağa tek Undo olarak aktarır;
   no-op Apply yeni history yaratmaz. Back/breadcrumb/Cancel kirli taslakta
   Apply / Discard / Stay sunar. Escape aktif araç/menu önceliğini korur ve
   taslağı sessizce atmaz. Ana playback girişte durur, çıkışta otomatik başlamaz.
6. Ana panel DOM'u korunduğu için panel/sekme, scroll, layer/key seçimi,
   Timeline zamanı ve viewport pan/zoom yerinde kalır. Silinen kaynak veya
   değiştirilmiş belgeye geri dönülürken eski taslak uygulanmaz.

**Isolate selection** ayrı görünüm filtresidir: source hidden/solo veya
animasyon değiştirmez. Orada normal editler mevcut komutlarla doğrudan kayda
gider ve Exit ile silinmez; yeni taslak Apply/Cancel semantiği Isolate'a taşınmadı.

## Sorumluluk ve veri akışı

| Giriş noktası | Sahibi |
| --- | --- |
| `src/lib/editor/detail/ItemDetailRegistry.ts` | React/platform bağımsız capability sözleşmesi ve sıralı adapter catalog |
| `detailAdapters.ts` | Authoritative layer schema projeksiyonu, üç hazır adapter, sınır ve driver kontrolleri |
| `ItemDetailSession.ts` | Stable hedef, kaynak/revision/document baseline ve kapsamlı Apply komutu |
| `src/components/detail/useItemDetail.ts` | Tek aktif UI oturumu, source reset iptali, inert/focus yaşam döngüsü |
| `ItemDetailWorkspace.tsx`, `DetailPathPoints.tsx` | Ortak UI ve eski path yardımcısını kullanan bounded point inspector |
| `detailMenu.ts` | Canvas/Layers/Explorer için ortak tek seçim/capability menü davranışı |
| `src/app/page.tsx` | Host bileşimi, playback pause, ana keyboard/dock sahipliği |

Akış: committed source + revision/document → capability adapter → borrowed
immutable baseline → mevcut `useEditorState` ile özel taslak/history → doğrulama
→ mevcut `makeUpdateLayerCmd` → ana editor tek commit/insan kökeni → mevcut
session/portable output. React, GPU, decoder ve media buffer'ları source'a girmez.

Adapter'ın `fields` listesi içerik payload köklerini tanımlar. Dış transform,
parent/child, opacity, kimlik, source asset değişimi, başka öğeler veya Timeline
verisi buradan değiştirilemez. Modelin assetId değişimi ayrı native import işidir.
Ana editördeki insan/ajan kökeni yalnız son gerçek değişiklikte damgalanır;
taslaktaki geçici authoring ledger ana kaydın üzerine kopyalanmaz.

İçerik root'unu mevcut key/controller, expression, binding veya etkin Wire
sürüyorsa ilk statik editör onu read-only yapar. Bir alt alan sürülüyorsa tüm
ilgili payload root'u konservatif korunur; örneğin fill bağlıysa style'ın diğer
alanları da bu ilk dilimde salt okunur olabilir. Animasyonlar silinmez, bake veya
source fallback üzerine sessiz overwrite yapılmaz. İleri kanal bazlı authoring
kendi Timeline/driver araçlarında açık bir sonraki kapsamdır.

## Revision, sahiplik ve bellek

Source commit/Undo/Redo açılış revision'ını değiştirirse Apply reddedilir;
bu ilk dilim unrelated edit için dahi otomatik merge yapmaz. Mesajdan sonra
Cancel/Discard ve güncel kaynaktan yeniden açma gerekir. Kaynak reset/import
document signal'ini iptal edince detay kapanır. Prepare ve synchronous execute
sahne kimliği tekrar kontrol edilir; geç gelen iş eski snapshot'ı geri yükleyemez.

Tek aktif taslakta mevcut history altyapısı **en çok 20 adım / 16 MiB source
policy / 100.000 node** ile kullanılır. Ana editörün 50 adım/64 MiB varsayılanı
değişmez. Bunlar retained history politika sınırıdır; güncel kaynağın, JS heap'in
veya toplam süreç RAM'inin bu kadar olacağı iddiası değildir. Büyük present
source policy'yi aşarsa eski history adımları tutulmayabilir; UI retained sayısını
gösterir. Kaynak immutable referanslarla paylaşılır;
her tuşta bütün medya bytes'ı veya model buffer'ı çoğaltılmaz.

Özel medya consumer'ı mevcut managed `VisualMediaSession`, model/cache/lease
ve global bütçeleri kullanır. Sadece hedef ve bağımlılıkları demand edilir;
kapalı detay consumer pin'lerini bırakır. Taslak kurtarma/portable içine ayrı
taslak yazımı yoktur; mevcut autosave yalnız ana committed kaynağı saklar.
Close, component unmount ve document reset eski kaynak sahiplerini serbest bırakır.

## Yeni adapter için en küçük örnek

Bu actual native sözleşmedir; MCP/script metodu değildir. Ürün bootstrap'ı
kendi domain adapter'ını `ItemDetailRegistry` üzerinden kaydeder:

```ts
import { itemDetailRegistry, type ItemDetailAdapter } from '@/lib/editor/detail'

// Owning domain implements validation/groups and declares its content roots.
function registerContentDetails(adapter: ItemDetailAdapter) {
  itemDetailRegistry.register(adapter)
}
```

Yeni özel UI/renderer gerekiyorsa owning feature'ın UI adapter'ı eklenir; schema
adapter yalnız mevcut schema alanlarını çizer. Media/UV/painter/rig aracı sırf
register edildiği için var sayılmaz. Component/3D iç saat, nested belge ve oyun
runtime'ı bu ilk sözleşmeye zorunlu metot olarak eklenmez.

## Doğrulama

- Domain/menü testleri: 12 yeni test; gerçek source command, history/Undo/Redo,
  portable, key/parent-child kimliği, driver ve CAS/disposal sınırları.
- Tam suite: 376 dosya / 3.032 test. TypeScript, MCP ve Next üretim derlemeleri
  başarılı. Mevcut JSON named-import build uyarısı bu teslimde değiştirilmedi.
- Gerçek browser fixture: altı DOM akışı; açma/inert, dirty Back/Stay/Discard,
  tek Undo/Redo, araya giren manuel kaynak değişimi, model iç Z ve source reset.
  Native fareyle Layers sağ tık → Edit content, viewport Shape çift tık ve
  sayısal giriş → Enter ayrıca gözlendi. İlk fixture input testi Enter commit'ini
  göndermediği için düzeltildi; source kontrolü gevşetilmedi.
- Son üretim uygulaması kontrolü: demo sahnedeki Shape → Edit content →
  Fit preview → Back gözlendi. 39 katman, seçili öğe, 0 ms Timeline ve 0 Undo
  korunarak ana dock'a dönüldü. Bu akışta source edit veya yeni proje oluşturulmadı.

```sh
node scripts/detail/prepare-browser.mjs
node scripts/perf/serve.mjs /private/tmp/chorono-detail-browser 4332
```

Fixture gerçek üretim bileşenlerini kullanır, kullanıcı sahnesine veya recovery
deposuna bağlanmaz. Sentetik DOM suite OS mouse testi olarak sunulmaz. Bu kabul
uzun süreli büyük sahne/çok cihaz performans veya 3D film render kabulü değildir.

Bkz. [ortak detay planı](plans/shared-item-detail-editor.md),
[3D içerik ve film mimarisi](plans/boxed3d-isolated-editor.md).
