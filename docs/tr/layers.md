# Katmanlar

Chorono sahnesindeki her görsel ve ses öğesi bir **katmandır**. Katmanları animasyonunuzun yapı taşları olarak düşünün — her birinin kendi konumu, zamanlaması, görünümü ve animasyonlu özellikler seti vardır. Katmanlara hakim olmak, Chorono'daki en önemli tek beceridir.

---

## Katman Nedir?

Katman, sahnenizdeki bağımsız bir nesnedir. Şunları içerir:

- **Geometri** — canvas üzerinde nerede olduğu ve nasıl şekillendiği.
- **Görünüm** — renk, opaklık, karıştırma modu, efektler.
- **Zaman Çizelgesi** — ne zaman göründüğü, kaybolduğu ve özelliklerinin keyframe'ler aracılığıyla zaman içinde nasıl değiştiği.
- **Hiyerarşi** — katmanlar grupların içine yerleştirilebilir, böylece bir üst-çocuk sahne grafiği oluşturulabilir.

Katman Panelinde gördüğünüz her katman, Zaman Çizelgesindeki bir satıra karşılık gelir. Sahne, esasen alttan üste render edilen bir katman yığınıdır.

---

## Katman Türleri

Chorono zengin bir katman türü setini destekler. Oluşturmak istediğinize göre doğru türü seçin.

### Şekil

Şekil katmanları, doğrudan canvas üzerinde geometrik ilkeller çizer. Varlık içe aktarmadan illüstrasyonlar ve UI öğeleri oluşturmanın en hızlı yoludur.

Kullanılabilir şekiller:

| Şekil | Açıklama |
|---|---|
| **Dikdörtgen** | Dikdörtgen veya kare. Ayarlanabilir köşe yuvarlaklığı. |
| **Daire** | Mükemmel daire (kısıtlı elips). |
| **Elips** | Bağımsız genişlik ve yüksekliğe sahip oval. |
| **Çokgen** | 3 ile 12 kenar arasında düzenli çokgen (üçgen, beşgen, altıgen…). |
| **Yıldız** | Ayarlanabilir iç ve dış yarıçaplı çok köşeli yıldız. |
| **Halka** | Ayarlanabilir iç yarıçaplı içi boş daire (çörek şekli). |
| **Yay** | Başlangıç ve bitiş açılarıyla tanımlanan bir halka dilimi. |
| **Kapsül** | Tamamen yuvarlatılmış uçlara sahip dikdörtgen. |
| **Çizgi** | Kontur stiliyle düz çizgi. |
| **Ok** | Bir veya her iki ucunda ok başlı çizgi. |
| **Spiral** | Ayarlanabilir tur ve sıkılıkla Arşimet sarmalı. |
| **Dalga** | Ayarlanabilir genlik ve frekansla yatay sinüs dalgası. |
| **Blob** | Gürültü fonksiyonuyla tohumlanan organik düzensiz kapalı şekil. |

Tüm şekil katmanları dolgu (düz veya degrade), kontur, yol kırpma ve tüm standart efektleri destekler.

### Metin

Metin katmanları stillendirilmiş metin render eder. Her metin özelliğini — konum, ölçek, renk, opaklık, karakter aralığı ve daha fazlasını — animasyonlayabilirsiniz. Metin katmanları şunları destekler:

- Font ailesi, ağırlık, boyut, satır yüksekliği, harf aralığı.
- Dolgu ve kontur (düz renk veya degrade).
- Hizalamalı (sol, orta, sağ, iki yana yaslı) çok satırlı bloklar.
- Metin animatörü aracılığıyla karakter başına animasyon (bireysel harfleri rigleme).
- **Spline'a Dönüştür** — metni düzenlenebilir bezier konturlarına parçalar.

### Resim

Raster resmi (PNG, JPG, WebP, GIF, SVG) bir katman olarak içe aktarır. Resim katmanları, diğer katmanlar gibi dönüştürülebilir, maskelenebilir ve animasyonlanabilir. Eklemeden önce varlıkları içe aktarmak için Varlık Panelini kullanın.

### Video

Bir video dosyasını kendi oynatma zaman çizelgesiyle bir katman olarak gömer. Video kırpılabilir, döngüye alınabilir veya sahne oynatma başlığıyla senkronize edilebilir. GPU hızlandırmalı kod çözme performansı kesintisiz tutar.

### Ses

Sahneye bir ses parçası ekler. Ses katmanları Zaman Çizelgesinde dalga formu olarak görünür. Düzenleme sırasında ses geri bildirimi için sesi canlandırabilir ve ses motorunu kullanabilirsiniz.

### Yol / YolKontur

**Kalem aracıyla** (P) oluşturulan el çizimi bezier yol katmanı. Şekil katmanlarının aksine, yol katmanları tamamen nokta düzenlenebilirdir: çapa noktalarını taşıyın, tutamaçları ayarlayın ve segment türünü değiştirin (çizgi, kuadratik, kübik). Özel şekiller, hareket yolları ve kaligrafi konturları için kullanışlıdır.

### Spline

Spline katmanları, Chorono'nun gelişmiş, nokta düzenlenebilir yol sistemidir. Karmaşık illüstrasyonlar ve şekil morflama için tasarlanmıştır. Tam ayrıntılar için aşağıdaki [Spline Katmanları](#spline-katmanları) bölümüne bakın.

### Grup

Gruplar bir veya daha fazla alt katman içerir. Bir grubu dönüştürmek tüm çocukları birlikte dönüştürür. Karmaşık hiyerarşiler oluşturmak için gruplar iç içe yerleştirilebilir.

Gruplar aynı zamanda maskelemenin de temelidir: bir grup, içine çizilen bir maske şekline alt katmanlarını kırpabilir.

### Tekrarlayıcı

Tekrarlayıcı katman, alt katmanlarını belirli sayıda klonlar ve bunları uzayda dağıtır. Her kopyada konum, döndürme, ölçek ve opaklık kaydırılabilir. Tekrarlayıcılar şunlar için idealdir:

- Aynı öğelerin satırları (ör. ızgaradaki simgeler).
- Radyal dağıtılmış öğeler (ör. saat çizgileri).
- Her kopyanın animasyonunun sabit bir gecikmeyle ertelendiği kademeli gösterimler.

### Parçacık Yayıcı

Fizik benzeri davranışa sahip sürekli bir parçacık akışı (küçük şekil veya resim katmanları) oluşturur. Kontrol edin:

- Yayım hızı, ömür ve başlangıç hızı.
- Yerçekimi, sürükleme ve türbülans.
- Parçacık ömrü boyunca boyut ve opaklık.
- Ömür boyunca renk (degrade düzenleyici kullanarak).

Parçacık katmanları, kare düşürme olmadan yüksek parçacık sayılarına ulaşmak için GPU üzerinde render edilir.

---

## Katman Ekleme

Sahnenize katman eklemenin üç yolu vardır:

### Ekle Düğmesi

Katman Panelinin üstündeki **+** (Ekle) düğmesine tıklayın. Kategori bazında gruplandırılmış tüm katman türlerini içeren bir menü görünür. Canvas'ın ortasına eklemek için bir türe tıklayın.

### Sağ Tıklama Menüsü

Canvas'ta boş bir alana sağ tıklayarak bağlam menüsünü açın. **Katman Ekle**'yi ve ardından katman türünü seçin. Katman tıkladığınız konuma yerleştirilir.

### AI Komutu

**AI Panelinde** bir açıklama yazın. Örnekler:

- `"Sol üst köşeye mavi bir dikdörtgen ekle"`
- `"48px beyaz renkte 'Merhaba' yazan bir metin katmanı oluştur"`
- `"Turuncu kıvılcımlarla bir parçacık yayıcı ekle"`

AI, açıklamanıza göre mantıklı varsayılanlarla katmanı oluşturur.

---

## Katman Paneli Kontrolleri

Katman Paneli, herhangi bir iletişim kutusu açmadan her katman üzerinde ayrıntılı kontrol sağlar.

### Yeniden Sıralama

Yığınlama sırasını değiştirmek için bir katman satırını yukarı veya aşağı sürükleyin. Listenin üstündeki katmanlar en üstte render edilir. İçine yerleştirmek için bir katmanı bir grubun üzerine de sürükleyebilirsiniz.

### Görünürlük (Göz Simgesi)

Katmanı gizlemek için göz simgesine tıklayın. Gizli katmanlar render edilmez ancak sahnede kalır. Diğer öğeler üzerinde çalışırken canvas'ı sadeleştirmek için kullanışlıdır.

### Kilit (Asma Kilit Simgesi)

Katmanı kilitlemek için asma kilide tıklayın. Kilitli katmanlar canvas üzerinde seçilemez, yanlışlıkla taşınmalarını önler. Katman Panelinde satırlarına tıklayarak Özellikler Panelinden hala düzenleyebilirsiniz.

### Solo

Alt tuşuna basılı tutarak göz simgesine tıklayarak katmanı solo yapın — bu, diğer tüm katmanları gizler ve tek bir öğeye odaklanmanızı sağlar. Solo'yu kaldırmak için Alt ile tekrar tıklayın.

### Sabitle

Sabitlenen katmanlar, grupları daraltırken veya uzun bir listede kaydırırken bile Katman Panelinde görünür kalır. Sık döndüğünüz referans katmanlar için kullanışlıdır.

### Renk Etiketleri

Bir katman satırına sağ tıklayın ve bir renk etiketi seçin. Etiketler tamamen organizasyoneldir — satırı ve katmanın Zaman Çizelgesindeki parçasını renklendirir, böylece ilgili katmanları kolayca fark etmenizi sağlar.

---

## Dönüşüm

Her katmanın, Özellikler Panelindeki Dönüşüm bölümünde bulunan şu dönüşüm özellikleri vardır:

| Özellik | Açıklama |
|---|---|
| **Konum (X, Y)** | Katmanın çapa noktasının sahne koordinatlarındaki konumu. |
| **Ölçek (X, Y)** | Boyut çarpanı. 100 = orijinal boyut. Büyüme/küçülme efektleri için animasyonlanabilir. |
| **Döndürme** | Derece cinsinden açı. Pozitif değerler saat yönünde döndürür. |
| **Çapa Noktası** | Döndürme ve ölçekleme için pivot. Varsayılan olarak katman merkezinde. Örneğin bir köşede döndürmek için taşıyın. |

Tüm dönüşüm özellikleri animasyonlanabilir — değeri kaydetmek için herhangi bir değerin yanındaki keyframe elmas simgesine tıklayın.

**İpucu:** Canvas'ta sürüklerken Shift basılı tutarak hareketi yatay veya dikey olarak kısıtlayın.

---

## Görünüm

### Opaklık

Katmanın ne kadar şeffaf olduğunu ayarlar. %100 tamamen opak, %0 görünmezdir. Opaklık, efektleri dahil olmak üzere tüm katmana uygulanır.

Dolgu ve konturun her birinin Özellikler Panelinde kendi bağımsız opaklık kontrolü vardır, böylece tamamen opak bir konturla yarı saydam bir dolguya sahip olabilirsiniz.

### Karıştırma Modları

Karıştırma modları, bir katmanın altındaki her şeyle nasıl birleşeceğini kontrol eder. Kullanılabilir modlar:

| Mod | Efekt |
|---|---|
| **Normal** | Standart birleştirme (varsayılan). |
| **Çarp** | Karartır — renkleri çarpar. Siyah siyah kalır, beyaz şeffaftır. |
| **Ekran** | Aydınlatır — Çarpın tersi. Siyah şeffaftır, beyaz kalır. |
| **Kaplama** | Kontrastı artırır — karanlık alanlar karardı, açık alanlar aydınlandı. |
| **Karart** | İki pikselin daha karanlık olanını korur. |
| **Aydınlat** | İki pikselin daha açık olanını korur. |
| **Renk Yakma** | Bu katmanın parlaklığına göre alttaki katmanı aydınlatır. |
| **Renk Yoğunlaştırma** | Alttaki katmanı karartır. |
| **Sert Işık** | Kaplama gibi ama üst katmana göre. |
| **Yumuşak Işık** | Sert Işığın daha yumuşak versiyonu. |
| **Fark** | Renkleri çıkarır — psikedelik veya glitch efektleri için harika. |
| **Dışlama** | Farka benzer ama daha düşük kontrast. |
| **Renk Tonu** | Bu katmanın renk tonunu alttaki katmanın doygunluk ve parlaklığıyla kullanır. |
| **Doygunluk** | Bu katmanın doygunluğunu kullanır. |
| **Renk** | Bu katmanın renk tonunu ve doygunluğunu, alttaki parlaklığı kullanır. |
| **Parlaklık** | Bu katmanın parlaklığını, alttaki rengi kullanır. |

Karıştırma modu Özellikler Panelinden ayarlanabilir veya — gruplar için — tüm gruba bir birim olarak uygulanır.

---

## Gruplama ve Hiyerarşi

### Grup Oluşturma

İki veya daha fazla katman seçin, ardından **Cmd/Ctrl + G** tuşlarına basın (veya sağ tıklayıp **Grupla**'yı seçin). Seçilen katmanlar yeni bir Grup katmanının çocukları haline gelir.

### Üst-Çocuk İlişkileri

Bir katman bir grubun içindeyken:
- Grubun dönüşümü tüm çocukları toplamsal olarak etkiler. Grubu döndürmek, tüm çocukları grubun çapa noktası etrafında döndürür.
- Her çocuğun hala grubun üstünde kendi bağımsız dönüşümü vardır.
- Grup üzerinde ayarlanan opaklık ve karıştırma modu, grubu birleşik bir birim olarak etkiler.

### Sahne Grafiği

Chorono, ağaç yapılı bir **sahne grafiği** kullanır. Gruplar herhangi bir derinliğe kadar diğer grupların içine yerleştirilebilir. Katman Paneli bunu genişletilebilir ağaç olarak gösterir — genişletmek veya daraltmak için bir grup satırındaki oka tıklayın.

**İpucu:** Mümkün olduğunda hiyerarşiyi sığ tutun. Derin iç içe yerleştirme, sahneyi anlamayı zorlaştırır ve belirli katmanları seçmeyi daha sıkıcı hale getirebilir.

### Grubu Çözme

Bir grup seçin ve grubu çözmek için **Shift + Cmd/Ctrl + G** tuşlarına basın. Çocuklar üst düzeye yükseltilir.

---

## Spline Katmanları

Spline katmanları, 3D uygulama spline editörlerinin iş akışından ilham alınan Chorono'nun profesyonel vektör çizim sistemidir. Temel şekil katmanlarından farklı olarak, yol üzerindeki her nokta doğrudan düzenlenebilir.

### Sekiz Temel İlkel

Bir Spline katmanı eklediğinizde, başlangıç ilkelini seçersiniz:

| İlkel | Açıklama |
|---|---|
| **Daire** | Mükemmel dairesel spline. Organik ovaller yapmak için noktaları düzenleyin. |
| **Çizgi** | Düz çizgi segmenti. Şekillendirmek için noktalar ve eğri tutamaçları ekleyin. |
| **Dikdörtgen** | Dört noktalı dikdörtgen. Köşe tutamaçlarını sürükleyerek köşeleri yuvarlayın. |
| **Elips** | Dört Bezier kontrol noktasıyla oval spline. |
| **Yay** | Açık yay segmenti. Uç noktaları taşıyarak açıklığı ayarlayın. |
| **Çörek** | Morflayabilen iki eşmerkezli kapalı yol (halka şekli). |
| **N-gen** | N kenarlı düzenli çokgen. N'yi Özellikler Panelinde düzenleyin. |
| **Yıldız** | Ayrı iç ve dış nokta düzenlemeli yıldız şekli. |

Tüm ilkeller oluşturulduktan sonra tamamen düzenlenebilir — hiçbir şey kilitli değil.

### Nokta Düzenleme

Bir Spline katmanında nokta düzenleme moduna girmek için canvas'ta çift tıklayın (veya seçin ve Kalem aracını etkinleştirmek için **P** tuşuna basın). Nokta düzenleme modunda:

- Seçmek için bir noktaya **tıklayın**.
- Taşımak için bir noktayı **sürükleyin**.
- Eğriliği ayarlamak için bir tutamacı (noktadan uzanan çizgiler) **sürükleyin**.
- O konuma yeni bir nokta eklemek için bir segmente **tıklayın**.
- Kaldırmak için seçili bir noktayı **silin** (yol boşlukta yeniden bağlanır).

Her noktanın tutamaçlarının nasıl davrandığını kontrol eden bir türü vardır:

| Nokta Türü | Tutamaç Davranışı |
|---|---|
| **Köşe** | Tutamaç yok — keskin açı. |
| **Düzgün** | Tutamaçlar doğrusaldır ancak bağımsız uzunluklara sahip olabilir. |
| **Bezier** | Tutamaçlar doğrusal ve eşit uzunluktadır (yansımalı). |
| **Bezier Köşe** | Tutamaçlar her iki tarafta tamamen bağımsızdır. |

Nokta türlerini, bir nokta seçildiğinde görünen **Spline Nokta İnceleyicisi**nde değiştirin.

### Alt Şekilleri Birleştirme

Tek bir Spline katmanı birden fazla alt şekil (kontur) içerebilir. Her alt şeklin bir **Birleştirme Modu** olabilir:

- **Ekle** — normal birleşim (varsayılan).
- **Çıkar** — aynı spline içindeki altındaki katmanlardan delik keser.
- **Kesişim** — yalnızca örtüşme görünürdür.
- **Dışla** — XOR (örtüşmeyen alanları gösterir).

Bu, tek bir katmanda delikli bir O harfi gibi karmaşık bileşik şekiller oluşturmanıza olanak tanır.

### Metni Spline'a Dönüştürme

Bir Metin katmanı seçin ve Özellikler Panelinde **Spline'a Dönüştür**'e tıklayın. Her karakter düzenlenebilir bir spline alt şekli haline gelir. Bu şunlar için kullanışlıdır:

- Özel harf yazısı ve logo tasarımı.
- Bireysel harf konturlarını animasyonlama.
- Metin yolları boyunca kontur kırpma.

---

## Klon ve Dizi Sistemi

Chorono, minimum manuel çalışmayla bir katmanın birden fazla kopyasını oluşturmak için iki tamamlayıcı sisteme sahiptir.

### Klon Aracı (Canlı Örnekler)

**Klon**, başka bir katmanın canlı örneğidir. Orijinalin şeklini ve stilini paylaşır — orijinali değiştirin ve tüm klonlar anında güncellenir.

**Klon oluşturmak için:**
- **Option/Alt + Cmd/Ctrl + D** tuşlarına basın (Hızlı Klon kısayolu).
- Veya canvas'ta bir katmanı sürüklerken **Alt** basılı tutun.

Klonlar, örnek olduklarını belirten bağlantı simgesiyle Katman Panelinde görünür. Her klonu bağımsız olarak taşıyabilir, döndürebilir ve ölçeklendirebilirsiniz. Ancak orijinalde yapılan şekil, renk ve efekt değişiklikleri tüm klonlara yayılır.

**Kullanım senaryosu:** Hepsini yerleştirdikten sonra kar tanesi tasarımını ayarlamak istediğiniz dekoratif kar tanesi seti.

### Dizi Desenleri

**Dizi** sistemi, seçilen katmanların bir desende düzenlenmiş birden fazla kopyasını oluşturur. **Shift + Cmd/Ctrl + A** ile veya **Katman > Dizi** aracılığıyla Dizi iletişim kutusunu açın.

Kullanılabilir dizi türleri:

| Tür | Açıklama |
|---|---|
| **Doğrusal** | Sabit aralık farkıyla düz bir çizgide kopyalar. |
| **Izgara** | X ve Y aralığıyla satır ve sütunlarda düzenlenen kopyalar. |
| **Radyal** | Merkez noktası etrafında eşit dağıtılmış kopyalar. |
| **Yol** | Bezier yol katmanı boyunca yerleştirilen kopyalar. |
| **Tekrarlayıcı** | Tekrarlayıcı katman kullanır (katmanın içinde yapılandırılır). |

**Dizi seçenekleri:**
- **Sayı** — kopya sayısı.
- **Fark** — her kopyaya kümülatif olarak uygulanan konum, döndürme ve ölçek deltası.
- **Kademelendirme** — her kopyanın animasyonunun başlangıcını sabit bir zaman farkıyla geciktirir, basamaklı efektler oluşturur.

**Kullanım örneği (Radyal):** Daire etrafına eşit yerleştirilmiş sekiz saat çizgisi işareti — Sayı'yı 8 olarak ayarlayın, Merkez'i saat merkezine ayarlayın ve işaretler otomatik olarak yerleştirilir.

---

## Akıllı Seçim

Canvas'ta çok sayıda katman olduğunda, doğru olanları hızlıca seçmek çok önemlidir. Chorono, filtreleme için dört canvas seçim aracı ve değiştiriciler sağlar.

### Seçim Araçları

Bu araçları Üst Araç Çubuğundan veya klavye kısayollarıyla etkinleştirin:

| Araç | Kısayol | Nasıl Çalışır |
|---|---|---|
| **Kutu Seçimi** | B | Dikdörtgen sürükleyin. Kutudaki katmanlar seçilir. |
| **Kement Seçimi** | L | Serbest el kapalı şekil çizin. İçindeki katmanlar seçilir. |
| **Daire Seçimi** | O | Daire tanımlamak için sürükleyin. Dairenin içindeki katmanlar seçilir. |
| **Boya Seçimi** | W | Fırça gibi tıklayıp sürükleyin. Üzerinden geçtiğiniz katmanlar seçime eklenir. |

### İçinde vs. Değiyor

Seçim aracı etkinken canvas'ın üstünde bir geçiş görürsünüz:

- **İçinde** — yalnızca sınırlayıcı kutusu tamamen seçim şekli içine sığan katmanları seçer. Büyük arka plan katmanlarını yanlışlıkla almasını önlemek istediğinizde kullanışlıdır.
- **Değiyor** — sınırlayıcı kutusu seçim şekliyle herhangi bir şekilde örtüşen herhangi bir katmanı seçer.

### Benzerini Seç

Canvas'ta veya Katman Panelinde bir katmana sağ tıklayıp **Benzerini Seç**'i seçerek aynı türdeki tüm katmanları seçin (ör. tüm Metin katmanları, tüm Daire şekilleri). Toplu özellik değişiklikleri için kullanışlıdır.

### Dönüşüme Göre Seç

Sağ tıklama menüsünde ayrıca: **Dönüşüme Göre Seç**, benzer bir dönüşüm özelliğini paylaşan tüm katmanları seçmenizi sağlar — örneğin aynı X konumundaki tüm katmanlar veya aynı ölçeğe sahip tüm katmanlar. Bu, başlangıçta bir grup içine düzenlemiş olmadığınız öğeleri hizalarken veya dağıtırken yararlıdır.

### Seçime Ekleme ve Çıkarma

- Geçerli seçime eklemek için **Shift** basılı tutarak bir katmana tıklayın.
- Seçimi kaldırmak için **Shift** basılı tutarak seçili bir katmana tıklayın.
- Her şeyin seçimini kaldırmak için canvas'ın boş bir alanına tıklayın.

---

## Pratik Örnekler

**İlerleme çubuğu oluşturma:** Yol için bir Dikdörtgen katmanı, ardından dolgu için ikinci bir Dikdörtgen ekleyin. Dolgunun **Ölçek X**'ini iki keyframe arasında 0'dan 1'e animasyonlayın. Sol kenardan sağa doğru büyümesi için çapa noktasını sol kenara ayarlayın.

**Radyal menü yapma:** Bir simge katmanı ekleyin, ardından altı kopyayı merkez noktası etrafına eşit yerleştirmek için **Dizi > Radyal**'i Sayı 6 ile kullanın. Birbiri ardına görünmeleri için kademelendirme uygulayın.

**Özel logo ana hatları:** Bir Metin katmanı ekleyin, logo metninizi yazın, ardından Özellikler Panelinde **Spline'a Dönüştür**'e tıklayın. Nokta düzenleme moduna geçin ve bireysel harf eğrilerini ayarlayın. El yazısıyla yazma efekti için kontur **Yol Kırpma**'yı %0'dan %100'e animasyonlayın.

**Videoyu maskeleme:** Bir Grup içine video katmanı yerleştirin. Aynı grubun içine bir şekil katmanı çizin ve Özellikler Panelinde **Maske Olarak Kullan**'ı etkinleştirin. Video artık şeklin ana hatlarına kırpılır.
