# Spline ve script geliştirmeleri: main karşılaştırması — 17 Kasım 2026

## Dal ve sürüm durumu

GitHub `codie1982/chorono-editor` üzerindeki `main`, yerel `main` HEAD ve `origin/main` aynı commit'te: `a4d4e64f6c1cb7a4cd6e9e48127b5af9e007f7e1`. Commit farkı **0 ileri / 0 geri**. Son etiket `v0.3.0` (`7305ba8`, 12 Kasım 2026); etiketten sonraki tek `main` commit'i Vercel Web Analytics ekliyor. `package.json` sürümü `0.3.0`. Dolayısıyla GitHub'daki `main`, bu rapordaki yeni spline kodunu henüz içermiyor. Yerel `main` çalışma ağacında commit edilmemiş geliştirmeler var; commit farkı sıfır olması kodun eşit olduğu anlamına gelmiyor.

## Kullanıcının bildirdiği spline paketi

İncelenen `a4d4e64` commit'inde aşağıdaki durum doğrulandı. Çalışma ağacında aynı dönemde başka, bağımsız UI/MCP değişiklikleri de bulunduğu için bu tablo **gönderilmiş sürüm** değil, commit bazlı karşılaştırmadır.

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

## Bu çalışma ağacına eklenen modelleme paketi

Kullanıcının son isteği üzerine **Offset / Outline, Chamfer ve Fillet** yerel `main` çalışma ağacına eklendi:

| Araç | Uygulama ve davranış | Sınır |
| --- | --- | --- |
| Offset | Kapalı konturda outward/inward, açık konturda left/right; pozitif yerel piksel mesafesiyle yeni kardeş spline katmanı. | Eğriler 0,25 yerel piksel toleransla örneklenir; kesişen veya çöken sonuç reddedilir. |
| Outline | Kapalı konturda eşit mesafeli iç/dış bant ve even-odd dolgu; açık konturda iki taraftan kapatılmış bant. | Aynı örnekleme sınırı; kaynak spline korunur. |
| Chamfer | Seçili köşelerin komşu kenarlarını kesip düz bağlar; seçili konturu tek komutla günceller. | Eğrisel kenar kesimi örneklenmiş yay uzunluğuna göre yapılır. |
| Fillet | Seçili köşelerde yarıçap kontrollü teğet kübik geçiş; iki düz kenarda dairesel yarıçap tamdır. | Eğrisel komşu kenarlarda G1 kübik yaklaşım kullanılır. |

`Spline Modeling` dock paneli kontur, yön, mesafe/yarıçap, köşe seçimi, Preview, Apply ve Cancel sunar. Önizleme sahneye ve geçmişe yazılmaz. Apply öncesi kaynak revision/document/işlem durumu tekrar kontrol edilir; köşe işlemleri hedef konturdaki animasyon track'leri varsa reddedilir. Offset/Outline kaynak spline'ı korur. Uygulama bir Undo adımıdır.

Script/QuickJS/MCP yüzeyine `offsetContour`, `outlineContour`, `chamferCorners` ve `filletCorners` eklendi. UI ve script aynı `src/lib/spline/modeling` geometri işlevlerini kullanır. Offset/Outline yeni katman ID'si döndürür. Geometri algoritması, panel ve script sözleşmesi [Türkçe teknik belgede](../spline-modeling.md) açıklanır.

## Doğrulama ve release kararı

- `npm test`: 376 dosya, 3011 test geçti (son küçük kesişim kontrolü değişikliğinden önce). Son değişiklikten sonra ilgili 3 dosyada 32 test geçti.
- `npm run mcp:build` ve `npm run build`: geçti (son küçük kesişim kontrolü değişikliğinden önce); yeniden çalıştırılacak.
- Tarayıcıda Offset önizlemesi ve Apply ile ikinci katmanın oluşması görüldü; tek Undo ile katman sayısı 2'den 1'e döndü.
- Kaynak değişiklikleri henüz commit edilmedi, push edilmedi veya GitHub release'e bağlanmadı. Çalışma ağacında bu işten bağımsız Agent Handoff/Snap/UI değişiklikleri de bulunuyor; bunlar yanlışlıkla modelleme commit'ine alınmamalı.

`v0.4.0` **taslak** release metni [burada](../../releases/v0.4.0-draft.md). Üç yeni araç için metin hazırlanabilir; kullanıcının bildirdiği diğer özellikler kaynak entegrasyonu ve kabul testleri tamamlanmadan yayımlanmış özellik olarak listelenmemeli. Bir sonraki adım, bağımsız değişiklikleri koruyarak modelleme değişikliklerini commit etmek, kalan spline paketinin gerçek kaynak farkını değerlendirmek, portable save/load ve export görsel kabulünü tamamlamak, ardından tag hedefiyle GitHub taslağını eşleştirmektir.
