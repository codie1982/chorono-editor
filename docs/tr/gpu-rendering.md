# Chorono Animator'da GPU Render

Chorono, en zorlu görsel çalışmaları için **WebGL2 ile hızlandırılmış GPU render** kullanır. Bu bir geçiş veya dışa aktarma ayarı değildir — tarayıcınız desteklediği her an otomatik olarak çalışır ve herhangi bir yapılandırma gerektirmeden çok daha hızlı bir deneyim sunar.

---

## GPU Render Neden Önemlidir

Geleneksel animasyon araçları her şeyi tarayıcının Canvas 2D API'si (CPU tabanlı) aracılığıyla render eder. Bu şekiller, metin ve resimler için yeterlidir, ancak binlerce parçacık veya ağır son işleme efektleri eklediğinizde hızla bozulur.

Chorono pahalı işleri GPU'ya taşır. Fark artımlı değildir — büyüklük sıralarında bir iyileşmedir:

| Parçacık Sayısı | CPU (Canvas 2D) | GPU (WebGL2) | Hızlanma |
|----------------|-----------------|--------------|---------|
| 1.000          | 1,9 ms          | 0,01 ms      | ~140x   |
| 10.000         | 4,9 ms          | 0,12 ms      | ~42x    |
| 50.000         | 49,5 ms         | 0,6 ms       | ~84x    |

*Apple M2'de ölçülmüştür. Sonuçlarınız donanıma göre farklılık gösterebilir.*

50.000 parçacıkta CPU render 60 FPS'in çok altına düşer — GPU render yükü neredeyse hissetmez. Bu, web tabanlı bir araçta ateş, yağmur, konfeti ve karmaşık parçacık sistemlerini pratik kılan şeydir.

---

## GPU'da Ne Çalışır

### Parçacık Render
Her parçacık yayıcısı **WebGL2 örnekli dörtlüler** kullanır — tüm parçacıkları kaç tane olursa olsun tek bir çizim çağrısında gönderen bir teknik. Bir yayıcıda 100 veya 100.000 parçacık olsun, GPU bir talimat alır ve geri kalanını paralel olarak işler.

Bu, her parçacığı tek tek işleyip çizmesi gereken CPU yaklaşımından temelden farklıdır.

### Son İşleme Efektleri
Üç son işleme efekti, **ayrılabilir GPU filtre** hattı aracılığıyla tamamen GPU'da çalışır:

- **Gauss Bulanıklığı** — iki geçişte (yatay sonra dikey) uygulanan matematiksel olarak hassas, donanım hızlandırmalı bulanıklık. Bulanıklık yarıçapı ne kadar büyük olursa olsun maliyet düşük kalır.
- **Parlaklık** — profesyonel düzenleme araçlarında görülen parlak hale efektini oluşturmak için Gauss bulanıklığı üzerine inşa edilir.
- **Düşen Gölge** — orijinalin altına doğru birleştirilen, bulanık, ofsetli bir katman kopyasını tek bir GPU geçişinde uygular.

### Hareket Bulanıklığı
Chorono, hareket bulanıklığı için **birikim yöntemi** kullanır — After Effects ve üst düzey düzenleyiciler tarafından kullanılan aynı yaklaşım. Pürüzsüz, fiziksel olarak doğru bir yayılma üretmek için birden fazla alt kare örneği bir araya getirilir. Efekt GPU'da çalışır, bu nedenle parçacık sistemine hareket bulanıklığı eklemek performansı anlamlı ölçüde etkilemez.

---

## CPU'da Ne Çalışır (ve Neden)

İki kategori iş kasıtlı olarak CPU'da kalır:

### Parçacık Simülasyonu
Parçacık doğurma, ömürlerini değerlendirme, kuvvetler uygulama (yerçekimi, türbülans) ve konumlarını takip etme — bunların hepsi CPU'da çalışır. Bu kasıtlı bir seçimdir: GPU hesaplama hızlıdır ancak belirleyici değildir; bu da aynı animasyonun farklı makinelerde biraz farklı sonuçlar üretebileceği anlamına gelir. CPU simülasyonu, animasyon yazma ve dışa aktarma için gerekli olan her seferinde aynı kareyi garanti eder.

### Sahne Render'ı (Canvas 2D)
Şekiller, metin katmanları, resimler ve genel sahne bileşimi tarayıcının Canvas 2D hattını kullanmaya devam eder. Bu, o iş için doğru araçtır — tarayıcının düzeni, erişilebilirliği ve font render sistemleriyle doğru şekilde entegre olur.

---

## SDF Parçacık Şekilleri

GPU ile render edilen parçacıklar, gölgelendiricideki şekillerini tanımlamak için **İmzalı Mesafe Alanları (SDF)** kullanır. Bu, her parçacık şeklinin piksel düzeyinde matematiksel olarak hesaplandığı anlamına gelir ve boyut veya dönüşten bağımsız olarak mükemmel kenar yumuşatmalı kenarlar üretir — pikselleme yok, doku ölçeklemesinden bulanıklık yok.

9 kullanılabilir SDF şekli vardır:

| Şekil | Karakter |
|-------|---------|
| Daire | Sert kenarlı disk |
| Yumuşak Daire | Yumuşak, tüylü kenarlı disk |
| Dikdörtgen | Keskin köşeli dörtlü |
| Yuvarlak Dikdörtgen | Ayarlanabilir köşe yarıçaplı dörtlü |
| Çizgi | İnce segment, kıvılcımlar ve yağmur için kullanışlı |
| Üçgen | Üç köşeli çokgen |
| Yıldız | Beş köşeli yıldız |
| Duman Pufu | Duman ve bulutlar için organik, ince blob |
| Alev Blob | Ateş parçacıkları için asimetrik damla |

Bu şekiller Parçacık dock'ta yayıcı başına seçilir. Her biri tüm karıştırma modlarıyla çalışır ve aynı GPU maliyetiyle render edilir.

---

## GPU Birleştirici ve Karıştırma Modları

GPU katmanı, altındaki Canvas 2D sahnesiyle doğru şekilde birleşir. Chorono, parçacıklar ve sahne arasında dört karıştırma modunu destekler:

- **Normal** — standart alfa birleştirme
- **Ekran** — parlatıcı karıştırma; toplamsal parlaklık, ateş ve ışık efektleri için ideal
- **Çarpı** — koyulaştırıcı karıştırma; duman ve gölgeler için kullanışlı
- **Kaplama** — stilize efektler için kontrast artıran karıştırma

Karıştırma modu sahne başına değil yayıcı başına ayarlanır, bu nedenle aynı sahnedeki farklı parçacık sistemleri aynı anda farklı karıştırma kullanabilir.

---

## Otomatik CPU Geri Dönüşü

WebGL2 kullanıcının tarayıcısında mevcut değilse, Chorono otomatik olarak tüm GPU hızlandırmalı çalışmalar için Canvas 2D render'a geri döner. Hata mesajı yok, boş ekran yok, herhangi bir eylem gerekmez. Geri dönüş sorunsuz olur — birkaç yüzün üzerindeki parçacık sayıları performansı etkileyebilir, ancak sahne doğru şekilde render edilecektir.

---

## GPU Render için Tarayıcı Gereksinimleri

GPU hızlandırmasını kullanmak için WebGL2 desteği gereklidir. Aşağıdaki tarayıcı sürümleri WebGL2'yi destekler:

| Tarayıcı | Minimum Sürüm |
|---------|-----------------|
| Chrome  | 70+             |
| Firefox | 65+             |
| Safari  | 15+             |
| Edge    | 79+             |

GPU render'ın oturumunuzda aktif olup olmadığını kontrol etmek için tarayıcının WebGL hata ayıklama sayfasını açın veya tarayıcı konsolunu kontrol edin — Chorono, WebGL2 başarıyla başlatıldığında başlangıçta bir onay mesajı kaydeder.

---

## En İyi GPU Performansı için İpuçları

- **Birçok küçük yayıcı yerine daha az, daha büyük yayıcı tercih edin.** Her yayıcı GPU'da bir çizim çağrısı kullanır. 1.000 parçacıklı on yayıcı, 10 parçacıklı 1.000 yayıcıdan daha verimlidir.
- **Toplamsal efektler için Ekran karıştırma kullanın.** Ekran karıştırma ateş, kıvılcımlar, neon parlamalar ve ışık izleri için doğru seçimdir. Aynı zamanda koyu üzerine parlak birleştirme için en GPU verimli seçenektir.
- **Son işleme efektlerini hedefli tutun.** Tek bir parçacık katmanına Gauss bulanıklığı veya Parlaklık uygulamak ucuzdur. Birçok katmanda birden fazla büyük yarıçaplı bulanıklık yığmak sonunda maliyet biriktirecektir. Yaratıcı amaca hizmet eden bulanıklık yarıçapı değerleri kullanın, mümkün olan en büyük değeri değil.
- **Hareket bulanıklığı alt kare örnekleri ekler.** Daha fazla alt kare örneği daha pürüzsüz hareket bulanıklığı üretir ancak render çalışmasını orantılı olarak çarpar. Çoğu animasyon için varsayılan ayar mükemmel sonuçlar üretir.
