# Spline Fillet — S2D-5D

Point modunda seçili köşeleri kompozisyon pikseli cinsinden yarıçapla yuvarlar.
Line–line, line–quadratic, line–cubic ve düzenli cubic–cubic kenar çiftleri
aynı araçtan çalışır. Yeni bağlantı, mevcut iki kenara teğet bir dairesel yayın
hata sınırı kontrollü cubic Bézier karşılığıdır. Kaynak kenarların kalan
kısımları tam Bézier alt eğrileri olarak korunur.

## Kullanım

1. Spline'a sağ tık → **Edit mode → Point**. Mevcut **Spline & Boolean**
   panelinde bir veya birden fazla keskin iç köşe seçin.
2. **Fillet → Preview Fillet** açın, **Radius** değerini px olarak girin.
   Yarıçap zoom veya layer-local ölçek değil, o anda görünen kompozisyon
   uzayındadır. Dönmüş, yansımış ve nonuniform ölçekli parent'lar hesaba katılır.
3. Sarı kesikli eğri ve kesim işaretleri önizlemedir. **Apply Fillet** bütün
   seçili köşeleri tek Undo adımıyla uygular; yeni iki kesim ucu seçili kalır.
   **Cancel Fillet** source, Undo ve Redo'ya yazmaz.
4. Chamfer ve Fillet önizlemeleri aynı anda açılmaz. Diğer araca geçmeden
   Apply veya Cancel yapın. Mod, zaman, seçim, belge veya source değişirse
   önizleme iptal edilir; geç sonuçlar yeniden Apply yetkisi vermez.

Kesilmiş circle → iç Offset → Add Line ve Spline Vertices snap ile iki ucu
bağla → köprü köşelerini Point modunda seç → Fillet akışı kabul testindedir.
Orijinal circle'ın kalan üç cubic kenarı korunur.

## Kabul edilmeyen durumlar

- Açık konturun uçları, zaten teğet/smooth birleşimler, tam ters dönen kenarlar,
  sıfır teğet ve cusp, keskin bir köşe yerine belirsiz bir bağlantı oluşturur;
  açıklamalı ret verilir. Smooth point type seçmek yarıçaplı Fillet yerine geçmez.
- Yarıçap kenara sığmıyorsa, komşu yuvarlatmalar aynı edge üzerinde çakışıyorsa,
  birden fazla teğet çözüm varsa, normal offset tekilleşiyorsa veya sayısal
  bütçe güvenilir çözümü doğrulayamıyorsa Apply engellenir. Sessiz clamp,
  en yakın Newton tohumu seçimi ve düşük kaliteli fallback yoktur.
- Sonuç kendiyle kesişiyor/temas ediyor veya delik sahipliğini, winding'i ya da
  fillRule anlamını değiştiriyorsa bütün işlem reddedilir.
- Kilitli/gizli/frozen hiyerarşi, instance ve üretilmiş Boolean sonucu düzenlenmez.
  Spline koordinatlarını süren key/expression/binding/controller ile silinecek
  point/handle ID'sini kullanan canlı referans korunur: topology yazımı engellenir.
  Root/parent transform, paint ve diğer nesnelerin animasyonları değişmez.

## Sayısal ve topolojik sözleşme

- Yarıçap 0.1–10.000 composition px, tek Apply'da en çok 64 köşe.
- Çizgi çiftinde kesim mesafesi `R * tan(abs(turn) / 2)` ile hesaplanır.
  Eğrili çiftte `C(t) = P(t) + signedR * normal(P'(t))` offset'lerinin kesişimi
  aranır. Parametre hücreleri Bézier kontrol hull'ları ve normal/teğet aralıklarıyla
  bölünür; sabit aralıklı örnekleme ile kök atlanmaz. Küçük düzenli hücrede
  inverse-midpoint Jacobian kontraksiyon sınırı ve Newton residual kontrolü
  kullanılır. Birden çok farklı kök varsa işlem reddedilir.
- Her köşe için en çok 24.000 hücre ve 44 bölme derinliği. Float aralıkları
  küçük geometrik padding kullanır; bu formal directed-rounding ispatı değildir.
  Çözülemeyen hücre atılmak yerine tanı üretir.
- Bağlantı residual hedefi <=0.001 px; yönlü teğet hatası <=0.0001 radyan.
  Yay <180° olan yerel minor arc'tır. Her yay en çok 32 cubic parça kullanır;
  radyal yaklaşım hatası Bernstein katsayı hull'u ile <=0.001 world px olarak
  sınırlandırılır. Polynomial cubic tam daire değildir.
- Orijinal eğriler De Casteljau ile tam derecesinde kesilir. İki köşenin paylaştığı
  edge orijinal parametre aralığından bir kere kesilir; kalan parça >0.01 px olmalı.
- Eski seçili point ve handle ID'leri kaldırılır. Yeni uç, ara arc anchor ve
  segment ID'leri bir kere preview sonucunda üretilir; Apply/Redo aynı kayıtları
  kullanır. Worker ayrı sayaç kullandığından kaynakta rezerve edilmiş ID'ler
  ortak işlem-local allocator ile ayrıca korunur; çakışan aday yeniden üretilir.
  `cuts` eski point → yeni iki uç/bridge segment ID'lerini bildirir.
  Mevcut edge/contour/Object ID'leri, sıra ve etkilenmeyen kayıt kimlikleri korunur.
- Kısalan bir mirror handle, karşı taraftaki eğriyi korumak için ilgili eski
  `bezier` noktasını `smooth` yapar. Yeni cubic uçları `bezierCorner` olur;
  sonraki elle düzenlemelerde iki handle bağımsız tutulabilir.
- Boundary kontrolleri 0.01 world px adaptif örnekleme kullanır; exact curve–curve
  intersection ispatı değildir. Önce/sonra toplam 4.096 doğrulama vertex'i,
  2.048 path komutu ve her yönde 32 kontur sınırı vardır. Kaynak eğriler bu
  doğrulama polyline'larına dönüştürülmez. Ayrı Object'ler örtüşebilir.

## Mimari, yaşam döngüsü ve bakım

- `src/lib/geometry/fillet`: saf teğet-circle çözümü, offset aralıkları ve
  sınırlı çok-kök araması. React, scene, storage ve worker handle içermez.
- `src/lib/geometry/bezier`: ortak exact split/evaluate/trim, türevler ve
  `circularArcCubics` converter'ı. Mevcut `createArcSpline` da aynı tangent-k
  hesabını kullanır; eski 90° parça, saat açısı, açık/reverse sweep anlamı korunur.
- `src/lib/spline/corners`: Chamfer ve Fillet'in ortak seçim, kontrol converter'ı,
  atomik topology splice, lock/overlap/boundary doğrulaması. Chamfer'ın eski
  public import ve sonuç sözleşmeleri compatibility adapter olarak kalır.
- `src/lib/spline/fillet`: DTO/ayarlar, world-space çözümü layer-local source'a
  uygulayan strateji ve worker adapter'ı.
- `src/lib/editor/spline/corners/cornerPlan.ts`: ortak güncel source, driver ve
  referans kontrolü; worker kopyasındaki değişmeyen kayıtları yeniden paylaşma;
  tek native Undo/Redo komutu. Fillet/Chamfer planları yalnız ayar adapter'ıdır.
- `src/components/splineEdit/preview`: Offset/Chamfer/Fillet'in ortak preview
  yaşam döngüsü ve köşe araçlarının read-only SVG overlay'i. Page sahibidir;
  mevcut dock yalnız kontrolleri gösterir. Export renderer overlay'i görmez.
- Fillet realm başına 1 aktif worker + en çok 2 kuyruk işi, 5 saniye deadline.
  Cancel, ayar/bağlam değişikliği ve unmount worker'ı terminate eder. Ortak
  `BoundedJobQueue` ve `OneShotWorkerClient` kullanılır; kalıcı frame/mesh cache'i
  ve main-thread fallback yoktur.
- Sonuç sıradan editable spline JSON'dur. Yeni şema, gizli runtime nesnesi veya
  export özelliği gerektirmez. Preview ölçümleri `arcs` yalnız geçici sonuçtadır.

Saf kullanım örneği (editor'de komut adapter'ı üzerinden dispatch edin):

```ts
const result = filletSpline({
  data: spline, pointIds: selectedPointIds, radiusPx: 10,
  matrix: displayedWorldMatrix.toArray(),
})
// result.data: yerel kaynak; result.path/markers/arcs: dünya preview/ölçümleri.
// prepareSplineFillet(...).command(result) tek guarded native command döndürür.
```

Temel geometrik referanslar: [Bézier convex-hull ve affine dönüşümler](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/bezier-construct.html),
[SVG path ve cubic/arc ayrımı](https://www.w3.org/TR/SVG/paths.html).

## Doğrulama

`npm test`, `npx tsc --noEmit`, `npm run mcp:build`, `npm run build`.
Çalışan editör checkout'una build yazılmaz; izole kaynak kopyası kullanılır.
`node scripts/perf/spline-fillet.mjs <çıktı>` ayrı origin'de gerçek worker,
viewport seçimi, cubic–cubic ve bağlı circle köşesi, pixel eşliği, portable JSON,
Apply/Cancel, source/driver iptali ve tek Undo/Redo kabulünü hazırlar. Kullanıcının
mevcut sahnesi veya Undo/Redo store'u test kaynağı olarak kullanılmaz.
