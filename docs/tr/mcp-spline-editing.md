# MCP spline düzenleme sözleşmesi — 16 Kasım 2026

Son spline araçları ortak bir işlem sözleşmesiyle açılır. Birbirine benzeyen
her araç için yeni MCP adı üretmek yerine üç yaşam döngüsü aracı vardır:
`prepare_spline_edit`, `apply_spline_edit`, `discard_spline_edit`.
Eski çağrı adları ve parametreleri korunur.

## Akış ve örnek

`get_scene` ile mevcut kaynak/elle düzenlemeler okunur. `get_capabilities` içinde
`toolName:'prepare_spline_edit'` kesin şemayı; `summary:true` ise `splineEditing`
özetini verir. Örneğin mevcut bir spline köşesinde Fillet:

```json
{
  "layerId": "SOURCE_SPLINE_ID",
  "operation": { "kind": "fillet", "pointIds": ["EXISTING_POINT_ID"], "radiusPx": 12 },
  "expectedRevision": 42,
  "readToken": "TOKEN_FROM_CURRENT_GET_SCENE"
}
```

Kimlikler/42 örnektir; gerçek okumadan gelen değerler kullanılır. Prepare kaynak,
geçmiş, seçim ve oynatmayı değiştirmez. İşlem sonucu özel kaynak taslağında
hesaplanır; gerçek PNG, yeni kimlikler, değişiklik özeti, `planId`, aynı revision
ve **yeni plana bağlı readToken** döner. PNG incelendikten sonra Apply bu üç
değeri kullanır. Yeniden hesaplama veya ID üretme yapılmaz; tek Undo oluşur.
Cancel karşılığı Discard taslağı ve kullanılmamış tokenı bırakır. Kaynak tokenı
istemeyen bu çağrı yine aynı doğrulanmış istemci/editöre aittir. Başka istemcinin
ve script planının iptali reddedilir. Bu üç araç `batch_actions` içinde değildir.

## Kapsam ve birimler

[Dağıtılan skill referansı](../../skills/chorono/references/spline-editing.md)
işlem türlerini ve sınırlarını listeler. Point/Edge/Object seçimleri açık ID
listeleridir. UI modunu açmak gerekmez. Object normalleştirilmiş SubShape ve
konturlarıdır. Append aynı katmana ekler; Continue ve çizerek Join mevcut açık
uç ID'lerini kullanır. Yeni noktalar ilk/son uç koordinatlarını tekrar içermez.
Auto Close ≥3 noktalı konturu kapatır; iki noktalı çizgiyi kapatmaz. Fill/Stroke
bağımsızdır; None ve Image mevcut ortak paint kaydını kullanır.

Point/transform/generator koordinatları katman yerel px; dönüş saat yönünde
derece; scale pozitif çarpandır. Outline/Chamfer/Fillet miktarları ve yaklaşık
eğri toleransı kompozisyon px'dir. Weld toleransı da kompozisyon px'dir. Refine
ve Divide eğri parametresinde çalışır; eşit yay uzunluğu vaat etmez.
`timeMs` kompozisyon milisaniyesidir. State machine varsa deterministik parent
değerlendirmesi için açık `timelineIds` gerekir. Global snap/Auto Close tercihi,
panel seçimi veya oynatma değişmez; vertex yakalama açık uç ID'siyle ifade edilir.

Offset yeni Object oluşturur. Chamfer ve Fillet seçili köşeleri native koruma
kurallarıyla değiştirir. Boolean Union/Subtract/Intersect özgün kaynakları sahipli
grupta korur; mevcut recipe `ownerId` ile yeniden düzenlenir. UI'da reddedilen
belirsiz, kesişen, kilitli, sürülen veya referansları bozacak işlemler MCP'de de
reddedilir. Kaynak topolojisi bake edilmez, keyler sessizce temizlenmez.

## Sahiplik, kaynak ve bakım

- `src/lib/editor/spline/operations`: türler, ortak sıkı şema/doğrulama, basit
  komut hazırlama ve headless çizim. UI geometrisi/komutları yeniden kullanılır.
- `src/lib/mcp/spline`: araçlar, capability, worker orchestration ve PNG yanıtı.
  Sayısal algoritmalar burada kopyalanmaz.
- `src/lib/script/api/SplineHandle`: eski API + basit `.edit(operation)`.
  QuickJS proxy/host listesi tek `splineSurface` kaynağını kullanır.
- `PreparedPlanStore`: script/spline taslakları ortak 50 adet / tahmini 64 MiB
  kaynak bütçesi ve 5 dakika yaşam süresi kullanır. Ücret JSON boyutu + düğüm
  ek yükü tahminidir; kesin RAM ölçümü değildir. PNG/worker/DOM saklanmaz.
- Browser/document/request iptali solver'a iletilir. Async hesaplama ve PNG
  kodlamasından sonra source identity/revision yeniden kontrol edilir.
  Apply başka belge, istemci, aktif transaction veya araya giren elle düzenleme
  karşısında kaynak değiştirmez. Bütçe dolarsa eski plan sessizce atılmaz.

Console ve MCP QuickJS senkron script yüzeyidir. Offset/Chamfer/Fillet/Boolean
asenkron native planlardır; sahte senkron script metodu sunulmaz. Bu ayrım ve
diğer mevcut sınırlar [uyumluluk raporunda](script-api-compatibility-audit.md).
