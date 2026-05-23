# Parametre Bağlama

Parametre Bağlama, bir özelliğin başka bir özelliği **otomatik olarak yönlendirmesini** sağlar. Her katmanı bağımsız olarak animasyonlamak yerine, özellikleri birbirine bağlarsınız; böylece bir değeri değiştirmek ona bağlı her şeyi etkiler — manuel senkronizasyon gerekmez.

Maya veya Cinema 4D gibi 3D araçlarda rigleme kullandıysanız kavram tanıdık gelecektir: animasyon özellikleri için bir kontrol rigi oluşturuyorsunuz.

---

## Parametre Bağlama Neden Kullanılır?

| Senaryo | Bağlama Olmadan | Bağlama İle |
|----------|---------------|-------------|
| 5 katman birlikte soluklaşıyor | Tüm 5 katmanda opaklığı ayrı ayrı animasyonla | Bir "Ana Opaklık" parametresi tümünü yönlendirir |
| Renk teması değişikliği | Her katmanın dolgu rengini düzenle | Bir renk parametresi tüm sahneyi günceller |
| Konuma bağlı opaklık | Keyframe'leri manuel olarak senkronize tut | Opaklık formülü konumdan otomatik okur |
| Döngü salınımı | Karmaşık easing eğrileri çiz | Bir faz formülünü parametre sürgüsüne bağla |

Parametre Bağlama, pek çok şeyi etkileyen şey için **tek kontrol noktası** istediğinizde veya bir özelliğin elle ayarlanmak yerine başka bir özelliğe dinamik olarak yanıt vermesi gerektiğinde en değerlidir.

---

## Özellik Bağlama

### Bağlama Modalını Açma

Denetçideki her animasyonlu özelliğin sağında küçük bir **bağlantı simgesi** (🔗) bulunur. O özellik için **Parametre Bağlama Modalını** açmak için tıklayın.

Modalın üç bölümü vardır: **Kaynak**, **Eşleme** ve **Önizleme**.

### Kaynak Seçme

**Kaynak** bölümü, geçerli özelliği yönlendirebilecek her şeyin hiyerarşik ağacını gösterir:

- **Sahne Parametreleri** — aşağıda tanımladığınız global sürgüler ve değerler
- **Katman özellikleri** — sahnedeki herhangi bir katmandan, katman adına ve ardından özelliğe göre düzenlenmiş herhangi bir özellik

Ada göre filtrelemek için üstteki **arama kutusunu** kullanın. Seçmek için bir kaynak öğeye tıklayın. Seçtiğiniz kaynak, eşleme formülünün girdisidir.

> Örnek: Bir katmanın opaklığını X konumundan yönlendirmek için, kaynaktaki katmanı genişletin, **Konum X** özelliğini bulun ve seçin.

### Eşleme Ön Ayarı Seçme

**Eşleme** bölümü, kaynak değerini hedef değere dönüştüren formülü tanımladığınız yerdir. Chorono 6 kategoride 17 ön ayar formülle birlikte gelir:

#### Kısıt
Kaynağın ne kadar gittiğinden bağımsız olarak çıkış değerini minimum ve maksimum sınır içinde tutar.

- **Minimum Kısıt** — çıkış asla bir taban değerin altına inmez
- **Maksimum Kısıt** — çıkış asla bir tavan değerin üstüne çıkmaz
- **Aralık Kısıt** — her ikisini birleştirir: çıkış min ve maks arasında sabitlenir

*Kullanım senaryosu:* Bir konumdan opaklığı yönlendirirken %10'dan aşağı veya %100'den yukarı asla düşmemesini sağlayın.

#### Yeniden Eşleme
Bir sayısal aralığı diğerine eşler. Kaynak A'dan B'ye giderse, çıkış C'den D'ye gider.

- **Doğrusal Yeniden Eşleme** — orantılı eşleme, düz çizgi ilişkisi
- **Kısıtlı Yeniden Eşleme** — Doğrusal Yeniden Eşleme ile aynı, ancak çıkışı [C, D] dışına çıkmayacak şekilde kısıtlar

*Kullanım senaryosu:* 0 ile 500 piksel arasında değişen yatay konum, 0 ile 360 derece arasında döndürmeye eşlenir.

#### Aralık
Kaynak değerini hedef çıkış aralığına sığdırmak için ölçekler; kaynağın doğal min/maks'ını referans olarak kullanır.

- **Aralık Ölçekleme** — kaynağı çıkış aralığına ölçekle
- **Aralık Normalleştirme** — kaynağı 0-1'e normalleştir, ardından çıkışa ölçekle

*Kullanım senaryosu:* Parametre sürgüsü (0-100), bulanıklık miktarını (0-40px) yönlendirir.

#### Eğri
Eşlemeye özel easing fonksiyonu uygular; böylece girdi-çıktı ilişkisi düz çizgi yerine Bezier eğrisi izler.

- **Eğri Ease** — düzgün ease-in-out ilişkisi
- **Özel Eğri** — tam transfer fonksiyonunu çizmeniz için eğri editörünü açar

*Kullanım senaryosu:* Kaynak bir eşiği geçtiğinde yavaş başlayıp tam görünürlüğe hızla geçen bir opaklık.

#### Faz
Salınım ve döngü davranışını kontrol eder — zaman veya konum gibi bir sürüş değerine göre nabız atması veya tekrarlaması gereken özellikler için kullanışlıdır.

- **Faz Sinüs** — çıkış sinüs dalgası olarak salınır
- **Faz Kosinüs** — aynı ancak 90 derece kaydırılmış
- **Faz Üçgen** — doğrusal yukarı-aşağı salınım
- **Faz Kare** — ikili açık/kapalı salınım

*Kullanım senaryosu:* Ölçek özelliğini zamana dayalı sinüs dalgasıyla yönlendirerek hiçbir keyframe olmadan bir öğeyi ritmik olarak nabız attırın.

#### Modülo
Her kaynak bir eşiği geçtiğinde çıkış sıfıra geri döner — kilometre sayacı gibi.

- **Modülo Sarma** — çıkış = kaynak mod N
- **Modülo Ping-Pong** — çıkış N'ye kadar sayar, ardından tekrarlayarak geri sayar

*Kullanım senaryosu:* Sürgü arttıkça bir öğenin sürekli dönmesi için, kaynak hareketi 360 birim her geçişinde 0'a geri dönen döndürme özelliği.

---

## Canlı Önizleme

Eşleme bölümünün altındaki **Önizleme** alanı, formül parametrelerini ayarlarken mevcut eşlenmiş çıkış değerini gerçek zamanlı olarak gösterir.

Çıkışın tepkisini görmek için Zaman Çizelgesindeki oynatma başlığını taşıyın veya kaynak özelliğin değerini sürükleyin. **Uygula**'ya tıklamadan önce eşlemenin doğru göründüğünü onaylayın.

---

## Bağlantıları Yönetme

### Bağlantı Listesi Paneli

Sahnedeki tüm aktif bağlantıları tek yerden görmek için Pencere menüsünden **Bağlantı Listesini** açın (veya **W** tuşuna basın).

Her satır şunları gösterir:
- **Hedef** — yönlendirilen katman ve özellik
- **Kaynak** — onu yönlendiren
- **Formül** — eşleme ön ayarı adı
- **Durum** — aktif (yeşil), devre dışı (gri) veya bozuk (kırmızı)

Bu panelden şunları yapabilirsiniz:
- Onay kutusunu değiştirerek bir bağlantıyı **Etkinleştirin / Devre Dışı Bırakın** — bağlantıyı silmeden geçici olarak atlamak için kullanışlıdır
- Kalem simgesine tıklayarak bir bağlantıyı **Düzenleyin**, bu da o bağlantı için Parametre Bağlama Modalini yeniden açar
- Çöp kutusu simgesine tıklayarak bir bağlantıyı **Silin**

### Bağlı Parça Göstergesi

Zaman Çizelgesinde, aktif bağlantısı olan herhangi bir parçanın parça başlığında 🔗 simgesi gösterilir. Bu, özelliğin manuel olarak animasyonlanmak için serbest olmadığını — değerinin bağlantı tarafından kontrol edildiğini — hatırlatan hızlı bir görsel uyarıdır.

Bağlı bir özelliğe keyframe'ler eklerseniz, keyframe değerleri bağlantı çıkışıyla birleşir (keyframe, aksi yapılandırılmadığı sürece eklemeli fark olarak değerlendirilir).

### Bozuk Bağlantı Tespiti

Bağlantının kaynak özelliği veya kaynak katmanı silinir veya yeniden adlandırılırsa, Chorono bağlantıyı **bozuk** olarak işaretler ve hem Bağlantı Listesinde hem de parça başlığında kırmızı uyarı göstergesi görüntüler.

Parametre Bağlama Modalini açmak için uyarıya tıklayın; burada yeni bir geçerli kaynak seçebilir veya bozuk bağlantıyı silebilirsiniz.

---

## Sahne Parametreleri

**Sahne Parametreleri**, kendiniz tanımladığınız global değerlerdir — sahnenizdeki özel sürgüler olarak düşünün. Onlara bir şey bağlayana kadar kendiliğinden bir anlamları yoktur.

Sahne Parametresi oluşturmak için:

1. **Sahne Parametreleri** panelini açın (Pencere menüsü).
2. Yeni parametre eklemek için **+**'ya tıklayın.
3. Bir ad verin (ör. "Ana Opaklık"), bir tür seçin (Sayı, Renk, Boolean) ve bir aralık ayarlayın (ör. 0 ile 100).

Oluşturulduktan sonra parametre, her Parametre Bağlama Modalindeki kaynak ağacının üstünde görünür. Birden fazla özelliği aynı Sahne Parametresine bağlayın ve hepsini tek bir sürgüden kontrol edin.

---

## Pratik Örnek: Ana Opaklık Sürgüsü

Tek bir sürgüyü 5 katmanın opaklığını aynı anda kontrol edecek şekilde bağlamanın adım adım örneği:

**Hedef:** Tek bir kontrol kullanarak 5 arka plan katmanını birlikte soluklaştırın.

**Adım 1 — Parametreyi oluşturun**

1. **Sahne Parametreleri** panelini açın.
2. **+**'ya tıklayın, adını `Ana Opaklık` koyun, türünü **Sayı**, aralığını 0 ile 100, varsayılan değerini 100 olarak ayarlayın.

**Adım 2 — İlk katmanı bağlayın**

1. Sahnedeki Katman 1'i seçin.
2. Denetçide **Opaklık** özelliğini bulun ve 🔗 simgesine tıklayın.
3. **Kaynak** seçicide **Sahne Parametreleri**'ni genişletin ve `Ana Opaklık`'ı seçin.
4. **Eşleme**'de kaynak aralığı 0-100 ve çıkış aralığı 0-100 ile **Doğrusal Yeniden Eşleme**'yi seçin (şimdilik 1:1 eşleme).
5. **Önizlemeyi** kontrol edin — sürgüyü hareket ettirmek görüntülenen opaklık değerini değiştirmelidir.
6. **Uygula**'ya tıklayın.

**Adım 3 — Kalan katmanları bağlayın**

Her seferinde aynı `Ana Opaklık` parametresini seçerek 2. ile 5. Katmanlar için 2. Adımı tekrarlayın.

**Adım 4 — Test edin**

**Sahne Parametreleri** panelini açın. `Ana Opaklık` sürgüsünü 100'den 0'a sürükleyin. Tüm 5 katman birlikte soluklaşır. Geri sürükleyin ve geri dönerler.

Artık Zaman Çizelgesinde `Ana Opaklık` parametresini animasyonlayabilirsiniz — 0. karede değer 0 ve 30. karede değer 100 olan bir keyframe ekleyin; tüm 5 katman tek bir iki-keyframe parçasıyla birlikte soluklaşır.

---

## İpuçları ve En İyi Uygulamalar

**Sahne Parametrelerinizi açıkça adlandırın.** `Ana Opaklık`, `parametre1`'den daha iyidir. Sahnede 20 bağlantı olduğunda teşekkür edeceksiniz.

**Bağlantı Listesini kontrol paneli olarak kullanın.** Bir katmanda manuel düzenleme yapmadan önce, özelliklerinden herhangi birinin bağlı olup olmadığını görmek için listeyi kontrol edin — bağlantının aktif olduğunu unutursanız bağlı bir özelliği elle düzenlemek işe yaramıyor gibi hissedebilir.

**Denerken silmeyin, devre dışı bırakın.** Yapılandırmanızı kaybetmeden bağlı ve bağlantısız davranışı karşılaştırmak için Bağlantı Listesinde bağlantıyı kapatın.

**Keyframe'lerin üstüne sparingly bağlantı ekleyin.** Bağlantılar ve keyframe'ler bir arada bulunabilir, ancak sonucu tahmin etmek zorlaşır. Netlik için, belirli bir parçada ya keyframe'ler ya da bağlantı kullanın — her ikisi değil.

**Yeniden Eşleme sizin ana araçınız.** Şüpheye düştüğünüzde Doğrusal Yeniden Eşleme ile başlayın. En tahmin edilebilir formüldür ve gerçek dünyadaki bir-şeyi-diğerinden-yönlendirme ihtiyaçlarının büyük çoğunluğunu karşılar.
