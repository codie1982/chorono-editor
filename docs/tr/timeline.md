# Zaman Çizelgesi

Zaman Çizelgesi, animasyonunuza zaman içinde şekil verdiğiniz yerdir. Animasyonlamak istediğiniz her özellik değişikliği burada bir keyframe olarak yaşar ve Zaman Çizelgesi bunları hassasiyetle düzenlemeniz, ayarlamanız ve ince ayar yapmanız için araçlar sağlar.

---

## Temel Kavramlar

### Parçalar

Sahnenizdeki her katman, Zaman Çizelgesinde bir veya daha fazla **parça** olarak görünür. Parça, tek bir animasyonlu özelliğe karşılık gelir — konum, opaklık, döndürme vb. Tüm parçalarını görmek için bir katman satırındaki açma okuna tıklayın.

**Parça türleri:**
- **Konum** — X ve Y koordinatları (veya 3D modlarda X/Y/Z)
- **Ölçek** — tekdüze veya tekdüze olmayan ölçekleme
- **Döndürme** — derece cinsinden açı
- **Opaklık** — 0 (görünmez) ile 100 (tamamen opak) arasında şeffaflık
- **Renk** — dolgu veya kontur renk değerleri
- **Özel özellikler** — bir eklenti veya betik tarafından tanımlanan herhangi bir özellik

### Keyframe'ler

Keyframe, belirli bir zamanda özelliğin değerini depolar. Zaman Çizelgesi, iki keyframe arasına bir çizgi çizer ve özelliği aralarında yumuşakça enterpolasyonlar.

Keyframe'ler parça satırında elmas şeklindeki işaretçiler olarak görünür. Seçili keyframe'ler sarıya döner.

### Oynatma Başlığı

Dikey kırmızı çizgi **oynatma başlığıdır**. Geçerli zamanı işaretler. Denetçide gösterilen tüm özellik değerleri oynatma başlığı konumundaki değerleri yansıtır.

Animasyonunuzda gezinmek için oynatma başlığını sürükleyin veya cetvelde herhangi bir yere tıklayın.

### Çalışma Alanı

**Çalışma alanı** (cetvelde daha açık bölge olarak gösterilir), oynatma ve render için kullanılan zaman çizelgesi bölümünü tanımlar. Tam zaman çizelgesine dokunmadan yalnızca üzerinde çalıştığınız bölümü önizlemek veya dışa aktarmak için kesin bir çalışma alanı belirleyin.

---

## Keyframe Ekleme

Keyframe eklemenin iki hızlı yolu vardır:

1. **Elmas simgesi** — Denetçi panelinde, her animasyonlu özelliğin solunda küçük bir elmas simgesi bulunur. O özellik için geçerli oynatma başlığı konumunda keyframe ayarlamak için tıklayın.
2. **Parçaya sağ tıklayın** — Zaman Çizelgesinde bir parça satırına sağ tıklayın ve bağlam menüsünden **Oynatma Başlığında Keyframe Ekle**'yi seçin.

Bir özelliğin en az bir keyframe'i olduğunda, Chorono **Otomatik Keyframe** araç çubuğunda etkinleştirildiği sürece o özelliğin değerini her değiştirdiğinizde otomatik olarak yeni keyframe kaydeder.

> İpucu: Oynatma başlığını istediğiniz ana taşıyın, Denetçide değeri değiştirin ve keyframe görünür. Bu, çoğu görev için en hızlı animasyon iş akışıdır.

---

## Keyframe Düzenleme

### Keyframe Seçme

- Seçmek için tek bir keyframe'e **tıklayın**.
- Seçime keyframe ekleme veya çıkarma için **Shift + tıklayın**.
- Seçim dikdörtgeni çizmek için parçanın boş bir alanında **sürükleyin** (lastik bant seçimi).
- Tüm görünür parçalarda belirli bir zaman aralığındaki tüm keyframe'leri seçmek için **cetvelde Shift + sürükleyin**.

### Keyframe Taşıma

Seçili keyframe'leri parça boyunca sola veya sağa sürükleyin. Tam karelere yaslamak için sürüklerken **Shift** basılı tutun.

Keyframe'leri tam kare sayısıyla taşımak için onları seçin ve panel altındaki keyframe denetçisindeki **Zaman Farkı** alanını kullanın.

### Keyframe Kopyalama ve Yapıştırma

Bir veya daha fazla keyframe seçin, ardından kopyalamak için **Cmd+C** (Mac) / **Ctrl+C** (Windows) tuşlarına basın. Oynatma başlığını hedef zamana taşıyın ve yapıştırmak için **Cmd+V** / **Ctrl+V** tuşlarına basın. Yapıştırılan keyframe'ler oynatma başlığı konumuna iner ve birden fazla keyframe kopyaladıysanız göreli zamanlamalarını korur.

### Keyframe Silme

Keyframe'leri seçin ve **Backspace** veya **Delete** tuşuna basın.

### Keyframe Kademelendirme

**Kademelendirme**, bir grup keyframe'i biraz farklı zamanlarda başlayacak şekilde kaydırmanıza olanak tanır — bir set katmanın aynı anda değil de sırayla animasyonlanmasını sağlamak için kullanışlıdır.

1. Birden fazla katmanda keyframe'leri seçin (lastik bant veya Shift + tıklama).
2. Sağ tıklayın ve **Kademelendirme** seçin.
3. Kare cinsinden **farkı** girin. Her ardışık katmanın keyframe'leri o miktarda geciktirilecektir.

Örneğin, 3 karelik farkla 5 katmanı kademelendirmek, 1. katmanın 0. karede, 2. katmanın 3. karede, 3. katmanın 6. karede başlaması anlamına gelir.

---

## Easing Eğrileri

İki keyframe arasındaki eğri, özellik değerinin zaman içinde nasıl değişeceğini kontrol eder. Düz bir bölüm yavaş değişim anlamına gelir; dik bir bölüm hızlı değişim anlamına gelir.

### Yerleşik Ön Ayarlar

Bir veya daha fazla keyframe seçin ve sağ tıklama bağlam menüsünden veya keyframe denetçisindeki easing açılır menüsünden bir easing ön ayarı seçin:

| Ön Ayar | His |
|--------|------|
| **Doğrusal** | Sabit değişim hızı — mekanik, ivmelenmesiz |
| **Ease In** | Yavaş başlar, hızlı biter — tepeden aşağı yuvarlanan top gibi |
| **Ease Out** | Hızlı başlar, yavaş biter — durağa yuvarlanan top gibi |
| **Ease In-Out** | Yavaş başlangıç, hızlı orta, yavaş son — doğal ve cilalı |
| **Tut** | Değer hedef keyframe'de anında değişir — enterpolasyon yok |

### Özel Eğri Editörü

Tam kontrol için bir keyframe'i çift tıklayın veya seçin ve **E** tuşuna basarak **Eğri Editörünü** açın.

Eğri Editörü, Bezier grafiği gösterir. Keyframe noktasının her iki tarafındaki kontrol tutamaçlarını sürükleyerek eğriyi yeniden şekillendirin:

- Hareketi o keyframe'in yanında yavaşlatmak için tutamacı yataya yakın çekin.
- Hareketi ivmelendirmek için tutamacı daha dikey çekin.
- Simetriyi kırmak ve giriş ve çıkış eğrisini bağımsız olarak kontrol etmek için **Alt** basılı tutarak bir tutamacı sürükleyin.

Birden fazla parçayı aynı anda düzenleyebilirsiniz — hangi parçaların görünür olduğunu değiştirmek için Eğri Editörünün sol tarafındaki parça listesini kullanın.

---

## Aralık Dışı Modlar

Aralık dışı modlar, bir özelliğin değerinin **ilk keyframe'den önce** veya **son keyframe'den sonra** ne olacağını kontrol eder. Parça başlığına sağ tıklayarak parça başına modu ayarlayın.

### Sabit (varsayılan)

Özellik, en yakın keyframe'in değerini süresiz olarak tutar. İlk keyframe'den önce ilk keyframe'in değerine eşittir; son keyframe'den sonra son keyframe'in değerine eşittir.

*Görsel:* Her iki tarafta da dışa uzanan düz yatay çizgiler.

### Döngü

Keyframe dizisi her bitişinde baştan tekrar eder ve başlangıç değerine aniden geri döner.

*Görsel:* Animasyon eğrisi her tekrar sınırında keskin atlamayla aynı bloklarda tekrar eder.

### Döngü (Sürekli)

Döngüye benzer, ancak bir tekrarın sonundaki değer bir sonraki tekrarın başındaki değerle atlama olmaksızın bağlanır (ilk ve son keyframe değerlerinin eşleşmesi gerekir veya Chorono bunları harmanlır).

*Görsel:* Görünür bir dikiş olmaksızın düzgün tekrarlayan dalga.

### Ping-Pong

Animasyon ileri oynar, sonra tersine döner, sonra tekrar ileri oynar — süresiz olarak ileri geri zıplar.

*Görsel:* Eğri grafiğinde zikzak deseni.

### Doğrusal

Eğriyi son keyframe'in ötesinde düz bir çizgide uzatır, en yakın keyframe çiftinden hızı sürdürür.

*Görsel:* Eğri, keyframe sınırının ötesinde düz çapraz bir çizgi olarak devam eder — sabit bir hızda hareket etmeye devam etmesi gereken özellikler için kullanışlıdır.

---

## Zaman Çizelgesi Araçları

### Kare Kaydırma

Oynatma başlığını bir kare geri veya ileri ilerletmek için Zaman Çizelgesi araç çubuğundaki **◀F** ve **F▶** düğmelerini kullanın. Klavye kısayolları: (Zaman Çizelgesi paneli odaktayken) **Sol Ok** ve **Sağ Ok**.

Sürekli ilerleme için tuşu basılı tutun.

### Aralık Seçimi

Belirli bir zaman aralığındaki tüm keyframe'leri seçmek için:

1. Cetvelde **Shift** basılı tutarak sürükleyin.
2. Chorono seçili zaman aralığını vurgular.
3. O aralıktaki tüm görünür parçaların tüm keyframe'leri seçilir.

Bu, animasyonun bir bölümünü taşımanın en hızlı yoludur — aralığı seçin, ardından sürükleyin.

### Ölçek Tutamaçları

İki veya daha fazla keyframe seçildiğinde, seçim sınırlayıcı kutusunun sol ve sağ kenarlarında **ölçek tutamaçları** görünür.

Tüm seçimin zamanlamasını orantılı olarak sıkıştırmak veya genişletmek için bir ölçek tutamacını içe veya dışa sürükleyin. Çapa kenarındaki keyframe'ler sabit kalır; diğer her şey bunlara göre ölçeklenir.

Seçimin merkezinden ölçeklendirmek için sürüklerken **Alt** basılı tutun.

---

## Çalışma Alanı

Çalışma alanı oynatma ve render bölgesini tanımlar. Varsayılan olarak tüm zaman çizelgesine yayılır, ancak istediğiniz aralığa daraltabilirsiniz.

- Çalışma alanı **Giriş** noktasını geçerli oynatma başlığı konumuna ayarlamak için **[** tuşuna basın.
- Çalışma alanı **Çıkış** noktasını geçerli oynatma başlığı konumuna ayarlamak için **]** tuşuna basın.
- Sınırları manuel olarak ayarlamak için cetveldeki sol veya sağ köşeli parantez tutamacını sürükleyin.

Dışa aktardığınızda veya render ettiğinizde, dışa aktarma iletişim kutusunda bunları geçersiz kılmadığınız sürece Chorono çalışma alanı başlangıç ve bitiş zamanlarını dışa aktarma aralığı olarak kullanır.

> İpucu: Çalışma alanınızı cilalaşan bölüm etrafında sıkıca ayarlayın ve yalnızca o aralığı döngü olarak oynatmak için **Boşluk** tuşunu kullanın. Sıkı bir döngüyle zamanlama sorunlarını daha hızlı fark edeceksiniz.

---

## İşaretçiler

İşaretçiler, cetvere bir ritim, sahne kesimi, logo gösteriminin başlangıcı gibi önemli anları etiketlemek için yerleştirdiğiniz adlandırılmış bayraklardır.

### İşaretçi Ekleme

- İşaretçi eklemek için cetverde herhangi bir yere **Cmd + tıklayın** (Mac) / **Ctrl + tıklayın** (Windows).
- İşaretçiler cetverde renkli üçgenler olarak görünür.

### İşaretçi Taşıma

Cetvelde işaretçiyi sola veya sağa sürükleyin.

### İşaretçiyi Yeniden Adlandırma, Renklendirme ve Silme

Bağlam menüsünü açmak için herhangi bir işaretçiye sağ tıklayın:
- **Yeniden Adlandır** — işaretçiye açıklayıcı bir etiket verin
- **Renk** — ilgili işaretçileri görsel olarak gruplamak için bir renk seçin
- **Sil** — işaretçiyi kaldırın

### İşaretçiler Arasında Gezinme

Oynatma başlığını **önceki** işaretçiye atlamak için **[** tuşuna, **sonraki** işaretçiye atlamak için **]** tuşuna basın.

> Not: Çalışma alanı ayarlanmamışken ve işaretçi yoksa, [ ve ] çalışma alanı sınırlarını ayarlar. İşaretçiler varsa, öncelik alırlar ve [ / ] bunlar arasında gezinir.

---

## Keyframe Tablosu

**Keyframe Tablosu** (Pencere menüsünden erişilebilir veya **K** tuşuyla), seçili katman için tüm keyframe'leri bir tabloda görüntüler. Her satır şunları gösterir:

| Sütun | Açıklama |
|--------|-------------|
| Parça | Özellik adı |
| Zaman | Kare numarası veya zaman kodu |
| Değer | Ham sayısal veya renk değeri |
| Easing | Uygulanan easing ön ayarı |

Herhangi bir hücreye tıklayarak doğrudan düzenleyebilirsiniz. **Zaman** sütununu değiştirmek keyframe'i taşır; **Değer**'i değiştirmek o anda özelliğin ne yaptığını günceller; **Easing**'i değiştirmek enterpolasyonu günceller.

Tablo, sürükleyerek elde etmesi zor olan kesin sayısal değerleri ayarlamak için özellikle kullanışlıdır — örneğin 24. karede tam olarak 45,0 derece döndürme.

---

## Çok Katmanlı İşlemler

### Toplu Seçim ve Taşıma

1. Katman listesinde katman adına tıklayın, ardından ek katmanlar için **Shift + tıklayın**.
2. Tüm seçili katmanların parçaları birlikte genişler.
3. Hepsinde keyframe'leri lastik bant ile seçin.
4. Tüm grubu aynı anda taşımak için sürükleyin.

### Animasyon Kademelendirme

Bir dizi katmanı tutarlı bir gecikmeyle sırayla animasyonlamak için:

1. Tüm ilgili katmanlardaki keyframe'leri seçin.
2. Sağ tıklayın ve **Kademelendirme**'yi seçin.
3. Farkı ayarlayın (ör. 4 kare).

İlk katmanın keyframe'leri yerinde kalır. Her sonraki katmanın keyframe'leri fark miktarı kadar geç kayar. 4 karede 5 katmanlı kademelendirme, toplamda 16 ekstra kare yayan basamaklı bir efekt üretir.

Bu teknik genellikle uçuşarak gelen liste öğeleri, tek tek beliren metin karakterleri veya görünüme animasyonlu simge setleri için kullanılır.
