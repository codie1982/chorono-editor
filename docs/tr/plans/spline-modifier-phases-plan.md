# 2D Spline Modifier — Faz 1 / Faz 2

Durum: **uygulama önerisi; yeni modifier teslimi değildir**. 23 Kasım 2026.
Kullanıcı kararı: ilk faz mevcut statik Execute akışıyla ilerler. Animasyonlu
modifier parametreleri ilk fazın ön koşulu değildir; ileri işlemler Faz 2'dedir.
Native Edit araçlarının teslim durumu
[ayrı planda](spline-edit-native-tools-plan.md) korunur.

## Faz 1 — temel statik spline modifier'ları

| Modifier | İlk teslim kapsamı | Paylaşılacak mevcut hesap |
| --- | --- | --- |
| Offset Path | Tam konturlarda paralel üretim; açıkta Left/Right, kapalıda Inside/Outside; mesafe ve join. | PlanarOutlineBackend ve mevcut Offset hesabı. Kısmi edge zinciri ayrıca native Edit teslimidir. |
| Round Corners | Uygun köşelerde sabit yarıçaplı, ayarı değiştirilebilir yuvarlama. | Fillet solver ve mevcut corner doğrulamaları. |
| Path Simplify | Toleransa göre nokta azaltma; korunan anchor, uç, köşe ve delik sözleşmesi aynı kalır. | simplifySplineObjects. |
| Path Smoothing | Anchor'ları taşımadan komşu noktalara göre Smooth tangent'ler. | smoothSplineObjects / resetSplineTangents. |
| Path Resample | Yerel px aralığıyla yeniden örnekleme; açık uçlar, köşeler ve kontur sahipliği korunur. Çıktının örneklenmiş polyline olduğu açıkça belirtilir; hata/bütçe kontrol edilir. | Mevcut path sampler, Bézier uzunluk ve adaptif örnekleme hesapları. |
| Zig Zag | Sabit genlik/aralık ve keskin uçlu zikzak; zamana bağlı hareket yoktur. | Ortak path örnekleme ve yerel normal hesapları. Eğrisel zikzak geçişleri genişletme olarak ele alınır. |
| Pucker & Bloat | Belirlenmiş merkez çevresinde sabit miktarda içe/dışa deformasyon; nokta ve kollar aynı dönüşüm kuralını izler. | Mevcut yerel geometri dönüşümleri ve sınır doğrulaması. |
| Repeater | Aynı spline içinde sınırlı sayıda doğrusal/dairesel kontur kopyası; kopyalar layer'ın ortak boyasını kullanır. | RepeaterResolver yerleşim matrisleri ve spline kopyalama yardımcıları. |

Faz 1 uygulama sırası:

1. Offset Path, Round Corners, Path Simplify ve Path Smoothing: mevcut
   hesaplara yeni statik parametrik adapter'lar.
2. Path Resample: sonraki deformasyonlar için ortak uzunluk/örnekleme hazırlığı.
3. Zig Zag ve Pucker & Bloat.
4. Temel Repeater.

Bu liste mevcut sınıfların doğrudan yeniden görünür yapılması anlamına gelmez.
Offset/Outline/Chamfer/Fillet'in kayıtlı eski type/default/değerlendirme anlamı
korunur. Yeni parametrik UI sözleşmesi gerektiğinde açık sürüm/adapter ile
kurulur. Edit Offset, Fillet, Simplify ve Smooth kaynak değiştiren araçlar olarak
yerlerinde kalır; modifier sürümleri aynı matematiği kaynak korunarak çalıştırır.

## Faz 1 ortak yürütme sözleşmesi

- Mevcut Modifier, registry, ordered stack ve native modifier komutları kullanılır.
  Kaynak → etkin modifier'lar, üstten alta → sonuç; her Execute orijinal girdiden
  başlar. İkinci bir runner veya solver kurulmaz.
- Her modifier kendi statik ayarlarını sunar; sıra değiştirme, aç/kapat, silme ve
  Execute mevcuttaki ortak akışa bağlanır. Sonucun tamamı tek komutla uygulanır;
  başarısız hesap kaynak/geçmişi değiştirmez. Undo/Redo birebir geri döner.
- Koordinat ve mesafeler kaynak-layer yerel px; layer TRS/origin ve paint ayrı
  kalır. Repeater bağımsız scene layer'ları üretmez; her kopyanın delik/contour
  sahipliği korunur. Mevcut layer Repeater kendi akışını sürdürür.
- Kaynak Object/contour hedefleri ve üretilen ID'ler deterministiktir. Upstream
  topoloji değişince eski seçim yeni elemana sessizce bağlanmaz. Generated
  geometriye doğrudan edit için mevcut açık Bake-to-editable/Undo yolu geçerlidir.
- Açık/kapalı path, delikler, Bézier, kilit/driver, bütçe, clone/instance,
  save/load, viewport/bounds/picking ve statik runtime/export birlikte doğrulanır.
  Registry kaydı tek başına tamamlanmış özellik sayılmaz.
- Parametre keyframe'leri, zaman sözleşmesi ve frame cache bu fazı bloke etmez.

## Faz 2 — ileri geometri, görünüm ve hareket

| İş | Neden sonraki faz? |
| --- | --- |
| Variable Width | Path boyunca profil, bant üretimi, renderer ve taşınabilir çıktı entegrasyonu. |
| Stroke to Path | Cap/join/alignment/dash ve gerçek delikli bant. Outline v2 ile tek geometri hesabı. |
| Outline v2'nin tam kapsamı | Eğri-fit, adaptif vertex yoğunluğu, ayrı band paint'i, preset ve clipboard. [Ayrıntılı plan](spline-outline-band-v2-plan.md). |
| Boolean Paths modifier | Kaynak operandları ve sıralamayı stack içinde koruma, upstream hedef kimlikleri; layer referansları eklenirse bağımlılık ve döngü denetimi. Mevcut native Boolean işlemleri kullanılmaya devam eder. |
| Wiggle Paths | Deterministik seed/zaman, zamansal süreklilik, seek ve çıktı eşliği. |
| Path Dynamics | Physics sahibi, sabit zaman adımı, rest state, seek/cache ve bake yaşam döngüsü. |
| Animasyonlu modifier parametreleri | Sabit modifier ID'leri üzerinden keyframe adresleme, zamanlı değerlendirme ve cache/runtime/export desteği. |

Trim Paths, mevcut Stroke Trim görünüm akışında kalır; native Edit Trim'in
kesişimden parça silme anlamı değişmez. Path Follow mevcut Motion/Follow Path
akışında kalır. Bu iki mevcut özellik Faz 1 için yeniden yazılacak modifier
eksikleri olarak sayılmaz; ileri genişletmeleri ayrıca değerlendirilir.

## Native Edit ile iş sırası

Object Subdivide ve Interpolation native Edit teslimi 23 Kasım 2026'da tamamlandı;
bu işlemler yeni modifier satırı üretmez. Temel statik modifier fazı yukarıdaki
sınırlı kapsamla ele alınır. Geometrik
Outline'ın tam v2 kapsamı ve ileri transform çalışmaları Faz 2'ye bırakılır;
animasyonlu modifier altyapısı temel modifier'ların teslimini geciktirmez.
