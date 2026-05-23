# Chorono Animator'da Parçacık Efektleri

Chorono'nun parçacık sistemi; ateş, duman, yağmur, konfeti, kıvılcım ve birlikte hareket eden çok sayıda küçük elemandan oluşan diğer efektleri oluşturmanıza olanak tanır. Parçacıklar GPU ile hızlandırılmıştır; bu nedenle kare düşümü yaşamadan on binlerce parçacıkla gerçek zamanlı olarak çalışabilirsiniz.

---

## Parçacık Yayıcı Ekleme

**Katman Panelini** açın ve **+** düğmesine tıklayın. Katman türü menüsünden **Parçacıklar**'ı seçin. Sahnede ve zaman çizelgesinde yeni bir parçacık yayıcı katman belirir.

Her parçacık yayıcının kendine ait **Parçacık dock sekmesi** vardır — standart Özellikler Panelinden ayrı bir panel. Tüm yayım ve görsel kontrollere erişmek için Parçacık sekmesine tıklayın. Bu, parçacığa özel ayarların genel katman özelliklerinden ayrı ve düzenli kalmasını sağlar.

---

## Yayım Şekilleri

Yayım şekli, yeni parçacıkların nereden kaynaklandığını tanımlar. Altı seçenek vardır:

### Nokta
Tüm parçacıklar tek bir kaynak noktasından doğar. Mum alevleri, çeşme spreyleri veya küçük kıvılcımlar gibi odaklanmış efektler için kullanın. Yayıcı konumu, kaynağı sahne boyunca hareket ettirmek için keyframe'lerle animasyonlanabilir.

### Çizgi
Parçacıklar düz bir çizgi boyunca doğar. Karenin üst kısmına düşen yağmur, parıldayan bir şerit veya uzunluğu boyunca dışa doğru yayan bir ışın için kullanışlıdır. Çizginin uzunluğunu ve yönünü kontrol edersiniz.

### Daire
Parçacıklar bir dairenin çevresinden veya alanından doğar. **Çevre modu** halka şeklinde yayım oluşturur — patlama halkaları veya dairesel patlamalar için iyidir. **Alan modu** daireyi doldurur; parlayan bir küre veya alan sisi gibi hacme dayalı bir kaynak oluşturur.

### Dikdörtgen
Parçacıklar dikdörtgen bir bölge içinden doğar. Bir sahne boyunca düşen kar veya geniş bir alana dağılmış ateşböcekleri gibi büyük alan efektleri için kullanın.

### Yol
Parçacıklar çizilmiş bir yol boyunca yayılır. İstediğiniz eğriyi çizin — yayıcı parçacıkları uzunluğu boyunca yerleştirir. Bu, belirli bir şekli izleyen iz efektleri için idealdir; zikzak bir tel boyunca kıvılcımlar veya kıvrımlı bir boru boyunca yükselen baloncuklar gibi.

### Kaynak Katman
Bu en güçlü yayım modudur. **Kaynak Katman**, yayıcıyı sahnenizdeki herhangi bir katmana — şekil, resim veya metin katmanı — bağlar ve o katmanın geometrisinden parçacık yayar. Kritik olarak, yayım katmanın animasyonunu canlı olarak takip eder.

**Örnek:** Sahnede bir araba şekli katmanı yerleştirin ve karenin üzerinde geçtiğini animasyonlayın. Kaynak Katman olarak ayarlanmış bir parçacık yayıcı ekleyin, araba katmanını hedefleyin ve parçacıklar hareket eden arabanın konumundan doğacaktır — yayıcının manuel keyframe'lenmesine gerek yoktur. Kıvılcımlar, duman veya toz izi, her karede arabayı otomatik olarak takip eder.

---

## Parçacık Şekilleri

Her parçacık, GPU gölgelendiricisinde doğrudan hesaplanan bir SDF (İmzalı Mesafe Alanı) şekli olarak render edilir. Bu, herhangi bir boyut veya dönüşte keskin, kenar yumuşatmalı kenarlar anlamına gelir. Dokuz şekil mevcuttur:

| Şekil | En İyi Kullanım |
|-------|----------------|
| **Daire** | Genel amaçlı parçacıklar, baloncuklar, damlalar |
| **Yumuşak Daire** | Duman, sis, yumuşak parlamalar |
| **Dikdörtgen** | Kağıt konfeti, düşen yapraklar, enkaz |
| **Yuvarlak Dikdörtgen** | Stilize konfeti, yumuşak enkaz |
| **Çizgi** | Yağmur, kıvılcımlar, şeritler, hareket izleri |
| **Üçgen** | Stilize kor, geometrik efektler |
| **Yıldız** | Sihir parıltıları, ışık parlamaları |
| **Duman Pufu** | Gerçekçi duman, bulutlar, egzoz |
| **Alev Blob** | Ateş parçacıkları, mum alevleri |

Parçacık şeklini Parçacık dock'ta seçin. Tüm şekiller tüm karıştırma modlarıyla çalışır.

---

## Temel Kontroller

Bu parametreler parçacıkların nasıl doğduğunu ve nasıl hareket ettiğini kontrol eder:

- **Yayım Hızı** — Saniyede kaç parçacık doğduğu. Yüksek değerler daha yoğun efektler oluşturur. Mevcut parçacıkları canlı tutarken yayımı durdurmak için 0 olarak ayarlayın.
- **Parçacık Ömrü** — Her parçacığın ne kadar süre yaşadığı (saniye cinsinden). Kısa ömürler sıkı, hızlı efektler oluşturur; uzun ömürler kalıcı izler oluşturur.
- **Başlangıç Hızı** — Parçacıkların ilk doğduklarında ne kadar hızlı hareket ettiği. Yön ve yayılma ile birleşince efektin genel enerjisini şekillendirir.
- **Yön** — Parçacıkların doğduklarında hareket ettiği temel açı (derece cinsinden). 0 sağa, 90 yukarıya doğrudur.
- **Yayılma Açısı** — Yayım konisinin ne kadar geniş olduğu (derece cinsinden). 0 yayılma, tüm parçacıkları tam olarak aynı yönde fırlatır. 360 yayılma, parçacıkları eşit olarak her yöne fırlatır — patlamalar ve radyal patlamalar için kullanışlıdır.

---

## Görsel Kontroller

Bu parametreler parçacıkların ömürleri boyunca nasıl göründüğünü kontrol eder:

- **Boyut (min/maks)** — Parçacıklar bu aralıkta rastgele bir boyutta doğar, doğal çeşitlilik oluşturur. Parçacıkların büyümesini veya küçülmesini sağlamak için boyut aralığını zaman içinde animasyonlayın.
- **Ömür Boyunca Opaklık** — Bir parçacığın şeffaflığının doğumdan ölüme nasıl değiştiğini kontrol eden bir eğri. Varsayılan kademeli kayboluş eğrisi (doğumda tam opaklık, ölümde sıfır) çoğu efekt için doğrudur. Parçacıkların belirip zirveye ulaşıp sonra kaybolması gereken efektler için eğriyi ayarlayın.
- **Ömür Boyunca Renk** — Her parçacığın ömrüne eşlenen bir gradyan ayarlayın. Bir ateş efekti genellikle doğumda parlak sarı-beyazdan ölüm yakınında derin turuncu-kırmızıya geçer. Sihirli bir iz beyazdan firuzeye oradan mora kayabilir.
- **Döndürme** — Başlangıç döndürme aralığı ve döndürme hızı ayarlayın. Döndürme hızı parçacıkları saat yönünde veya saat yönünün tersine döndürmek için pozitif veya negatif olabilir. Dikdörtgen veya Yuvarlak Dikdörtgen parçacıklara rastgele döndürme eklemek konfetinin doğal görünmesini sağlar.

---

## Karıştırma Modları

Karıştırma modu, parçacıkların altlarındaki katmanlarla nasıl birleştiğini kontrol eder:

- **Normal** — Standart alfa birleştirme. Sahnede basitçe üstte durması gereken opak veya yarı şeffaf parçacıklar için kullanın.
- **Ekran** — Toplamsal parlaklık. Parçacıklar altlarındaki her şeye ışık ekler — parçacıktaki karanlık alanlar şeffaf hale gelir. Ekranı ateş, kıvılcımlar, parlamalar, lens parlamaları ve neon efektleri için kullanın. Bu, parlak parçacık efektleri için en yaygın seçimdir.
- **Çarpı** — Karartan karıştırma. Parçacıktaki açık alanlar şeffaf hale gelir; karanlık alanlar altındaki sahneyi karartır. Duman, gölgeler ve mürekkep sıçramaları için kullanın.
- **Kaplama** — Alttaki katmanın parlaklığına göre Çarpı ve Ekranı birleştirir. Kontrast artıran, stilize bir görünüm oluşturur.

---

## Patlama Modu

Sürekli olarak yayım yapmak yerine, zaman çizelgesinde yayıcının başlama zamanında (t=0'da) tüm parçacıkları bir anda yayımlamak için **Patlama Modunu** etkinleştirin. Patlama Modu şunlar için tasarlanmıştır:

- **Havai fişekler** — genişleyip kaybolan tek büyük patlama
- **Patlamalar** — kısa ömürlü ve dışa doğru yayılmalı yüksek sayılı patlama
- **Çarpışma efektleri** — bir çarpma anında enkaz veya kıvılcımların hızlı dağılması

Patlama Modunda, Yayım Hızı parametresi patlamada doğan toplam parçacık sayısını kontrol eder. Patlama gerçekleştikten sonra yeni parçacık yayılmaz — yalnızca mevcut parçacıklar ömürlerini tamamlar.

---

## Parçacık Özelliklerini Animasyonlama

Parçacık dock'undaki her parametre **keyframe'leri** destekler. Herhangi bir parametrenin yanındaki keyframe elmasına tıklayarak zaman içinde animasyonlamaya başlayın.

Yaygın animasyonlu iş akışları:

- **Yayım hızını artırma** — Kademeli olarak yükselen bir ateş için 0'dan başlayıp yarım saniye içinde artırın.
- **Renk değişimi** — Bir patlama ilk flaştan sürekli yanmaya geçerken renk-ömür gradyanını soğuktan sıcağa animasyonlayın.
- **Zaman içinde hız** — Bir parçacık sistemini salıverilme anında hızlandırmadan önce yavaşlatın.
- **Yayıcı konumu** — Diğer tüm parametreleri sabit tutarken kaynağı sahne boyunca hareket ettirmek için yayıcı katmanın konumunu keyframe'leyin.

---

## Performans

Chorono'da parçacık render'ı **WebGL2 örnekli render aracılığıyla GPU ile hızlandırılmıştır**. Her yayıcı, parçacık sayısından bağımsız olarak tek bir çizim çağrısı kullanır — GPU tüm parçacıkları paralel olarak işler.

Pratikte modern donanımda sahnenizdeki geri kalanı etkilemeden **10.000'den fazla parçacığı 60 FPS'de** çalıştırabilirsiniz. Referans olarak, Apple M2'de 50.000 parçacık yaklaşık 0,6 ms render süresiyle ölçülmüştür.

Birkaç pratik ipucu:

- Yoğun, büyük alan efektine ihtiyacınız varsa, düşük sayılı birçok yayıcı yerine yüksek sayılı tek bir yayıcı kullanın. Daha az yayıcı, daha az çizim çağrısı anlamına gelir.
- Koyu üzerine parlak toplamsal efektler için Ekran karıştırma en GPU dostu seçenektir.
- Parçacık simülasyonu (konum güncellemeleri, ömür takibi) determinizm için CPU'da çalışır, bu nedenle son derece yüksek parçacık sayıları (yüz binlerce) sonunda simülasyon maliyetini etkileyecektir — ancak render bu eşiğin çok ötesinde hızlı kalmaya devam edecektir.
