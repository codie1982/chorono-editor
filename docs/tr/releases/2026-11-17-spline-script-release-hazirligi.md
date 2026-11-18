# Spline ve script geliştirmeleri: main karşılaştırması — 17 Kasım 2026

## Dal ve sürüm durumu

Release hazırlığı başında GitHub `main`, yerel `main` ve `origin/main` aynı commit'teydi: `a4e123f2` (**0 ileri / 0 geri**). Son yayımlanan etiket `v0.3.0` (`7305ba8`, 12 Kasım 2026) idi; hazırlık dalında `package.json` sürümü `0.4.0`'a çıkarıldı. İlk inceleme sırasında uzak `main` `a4d4e64f` idi. Modelleme, Agent Handoff ve precision değişiklikleri [PR #13](https://github.com/codie1982/chorono-editor/pull/13) ile `2c135949` commit'ine; devamındaki 2D Snap/rotate düzeltmeleri [PR #14](https://github.com/codie1982/chorono-editor/pull/14) ile `a4e123f2` commit'ine alındı. Her iki PR'ın zorunlu “Tests and builds” kontrolü geçti. Bu rapor bir hazırlık anını kaydeder; güncel yayın durumu için GitHub release sayfası esas alınır.

## Kullanıcının bildirdiği spline paketi

İlk incelenen `a4d4e64` commit'inde aşağıdaki durum doğrulandı. PR #13/#14'ün içerdiği değişiklikler sonraki bölümlerde ayrıca anlatılır; tablo **tamamlanmış v0.4.0 sürümü** anlamına gelmez.

| İşlem | `main` HEAD durumu | Sürüm için yapılacak |
| --- | --- | --- |
| Point / Edge / Object | Nokta düzenleme var; tam üç mod yok. | Üç modun kaynak değişikliklerini bulup entegre etmek ve etkileşimi doğrulamak. |
| Ayrı Spline & Boolean paneli | Fill/stroke Properties'te; Boolean akışı yok. | Panel, Boolean komutları ve önizleme. |
| Bir spline'da çoklu kontur | `addContour`/`appendPrimitive` mevcut. | UI davranışı ve animasyon uyumu kabulü. |
| Continue | Açık uçtan devam etme mevcut. | Yeni UX kabulü. |
| Auto Close | Sağ tık çizimi açık bitiriyor; ayrı ayar yok. | Sağ tık ve kapatma seçeneğini entegre etmek. |
| Connect, Weld, Refine, Divide, kenar silme, kopyalama, Attach/Detach | Bazı temel mutasyonlar var; tam araç seti yok. | Topoloji, tek Undo, ID ve animasyon koruması. |
| Bağımsız Fill / Stroke | Stil alanları var; tarif edilen çizim seçenekleri eksik. | Oluşturma akışı ve render/export kontrolü. |
| Boolean preview / Apply / Cancel / re-edit | Yok. | Geometri, kaynak ilişkisi ve edit akışı. |
| Spline Vertex Snap | `vertex` hedefi tanımlı; gerçek spline noktaları çizim snap adaylarında yok. | Zoom bağımsız ekran toleransı ve aday toplama. |
| Çizerek iki açık ucu birleştirme | Continue var; ikinci açık uca bağlama yok. | Ara nokta ve kontur bağlama. |
| Güvenli geçmiş ve animasyon | Bazı eski komutlarda kısmi koruma var. | Yeni topoloji işlemlerinin her biri için çatışma/Undo kabulü. |
| Snap tek menüde, Shortcuts ayrı pencere | Eski Snap paneli ve Shortcuts dock paneli duruyor. | Yeni UI akışını entegre edip doğrulamak. |

Bu özelliklerin bir bölümü `artifacts/recovery-20261117/original-snapshot` adlı kurtarılmış kaynak kopyasında görünüyor. Kopya bir commit/dal değil; mevcut `main`e uygulandığı veya release'e hazır olduğu varsayılmamalı. Kaynak farkı, testler ve etkilenen kullanıcı akışları ayrı bir entegrasyon çalışması olarak incelenmeli.

## Aynı yerel commit'teki diğer işler

PR #13 yalnız spline modellemesini içermiyor. Kod ve testlerde ayrıca şu alanlar değişti: seçimden MCP odak bağlamı alan **Send to Agent** akışı (`get_handoff_context`, panoya prompt kopyalama); Snap hedeflerini tek menüde düzenleme, görünür grid/parent hizalaması ve ayrı transform snap denetimleri; Shortcuts penceresi; Motion Keys dock paneli ve viewport önizleme düzenlemeleri. PR #14, 2D hareket/resize snap hedeflerini ve rotate geri bildirimini düzeltti. Bunlar yeni spline geometri script API'sinden ayrı geliştirmeler. Release metnine alınmadan önce görsel akışları ve kapsamları incelenmeli.

## Bu çalışma ağacına eklenen modelleme paketi

Kullanıcının son isteği üzerine **Offset / Outline, Chamfer ve Fillet** PR #13 ile GitHub `main`e eklendi:

| Araç | Uygulama ve davranış | Sınır |
| --- | --- | --- |
| Offset | Kapalı konturda outward/inward, açık konturda left/right; pozitif yerel piksel mesafesiyle yeni kardeş spline katmanı. | Eğriler 0,25 yerel piksel toleransla örneklenir; kesişen veya çöken sonuç reddedilir. |
| Outline | Kapalı konturda eşit mesafeli iç/dış bant ve even-odd dolgu; açık konturda iki taraftan kapatılmış bant. | Aynı örnekleme sınırı; kaynak spline korunur. |
| Chamfer | Seçili köşelerin komşu kenarlarını kesip düz bağlar; seçili konturu tek komutla günceller. | Eğrisel kenar kesimi örneklenmiş yay uzunluğuna göre yapılır. |
| Fillet | Seçili köşelerde yarıçap kontrollü teğet kübik geçiş; iki düz kenarda dairesel yarıçap tamdır. | Eğrisel komşu kenarlarda G1 kübik yaklaşım kullanılır. |

`Spline Modeling` dock paneli kontur, yön, mesafe/yarıçap, köşe seçimi, Preview, Apply ve Cancel sunar. Önizleme sahneye ve geçmişe yazılmaz. Apply öncesi kaynak revision/document/işlem durumu tekrar kontrol edilir; köşe işlemleri hedef konturdaki animasyon track'leri varsa reddedilir. Offset/Outline kaynak spline'ı korur. Uygulama bir Undo adımıdır.

Script/QuickJS/MCP yüzeyine `offsetContour`, `outlineContour`, `chamferCorners` ve `filletCorners` eklendi. UI ve script aynı `src/lib/spline/modeling` geometri işlevlerini kullanır. Offset/Outline yeni katman ID'si döndürür. Geometri algoritması, panel ve script sözleşmesi [Türkçe teknik belgede](../spline-modeling.md) açıklanır.

## Doğrulama ve release kararı

- Son kaynakta `npm test`: 381 dosya, 3028 test geçti. PR #13 ve #14'ün GitHub CI “Tests and builds” işleri başarılı.
- `npm run mcp:build`: geçti. Paylaşılan `.next` çıktısına eşzamanlı build yazıldığı için normal dizindeki iki deneme son dosya toplama aşamasında `ENOENT` ile kesildi. Aynı güncel kaynak `/private/tmp/chorono-isolated-build-20261117` dizinine kopyalanıp `npm run build` tek başına çalıştırıldı ve geçti. Geçici kopyaya `.env.local` alınmadı.
- Tarayıcıda Offset önizlemesi ve Apply ile ikinci katmanın oluşması görüldü; tek Undo ile katman sayısı 2'den 1'e döndü.
- Kaynak değişiklikleri GitHub `main`e alındı; ancak `v0.4.0` tag/release yok. Modelleme dışındaki işler ve kullanıcı tarafından bildirilen diğer spline araçları release kapsamı için ayrı değerlendirilmeli.

`v0.4.0` için hazırlanan [sürüm notları](../../releases/v0.4.0.md), doğrulanan modelleme araçlarını listeler; kullanıcının bildirdiği diğer özellikleri tamamlanmış özellik olarak sunmaz. Bu karşılaştırma raporu, ilk inceleme ve PR entegrasyonu sırasındaki kararları kaydeder. Release yayımlama durumu için sürüm notları ve GitHub release sayfası esas alınmalıdır.
