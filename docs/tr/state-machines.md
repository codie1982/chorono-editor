# Durum Makineleri

**Durum Makinesi** (Sonlu Durum Makinesi veya FSM olarak da bilinir), "boşta", "yürüyor" ve "zıplıyor" gibi birden fazla adlandırılmış animasyon durumu tanımlamanıza ve bunları geçiş kurallarıyla bağlamanıza olanak tanır. Çalışma zamanında, animasyonunuz olaylara ve parametre değişikliklerine yanıt vererek durumlar arasında otomatik olarak geçiş yapar. Bu, Rive ve Unity'nin Animator Controller'ı gibi araçlarda kullanılan aynı kavramdır.

---

## Durum Makinesi Ne Zaman Kullanılır?

Durum Makineleri, animasyonunuz **reaktif** olduğunda — sonraki oynatılanın baştan sona sabit bir dizi değil, ne olduğuna bağlı olduğunda — doğru araçtır.

Yaygın kullanım senaryoları:

- **Karakter animasyon döngüleri** — dinlenirken boşta, hareket ederken yürür, hız yüksekken koşar, havadayken düşer
- **UI bileşen durumları** — kendi mikro animasyonlarına sahip buton varsayılan / hover / basılı / devre dışı
- **Döngü vs tek seferlik** — bir karakter döngüde boşta durur, tetiklendiğinde tek seferlik "el sallama" animasyonu oynatır, sonra boşta dönmeye döner
- **Sahne geçişleri** — giriş bir kez oynar, ardından döngüde bir ortam durumunda tutulur
- **Oyun tarzı etkileşim** — görünümü kullanıcı girdisine veya uygulamanızdaki verilere tepki veren herhangi bir nesne

Animasyonunuz her zaman baştan sona aynı şekilde oynarsa, düzenli bir Zaman Çizelgesi daha basittir. Animasyonun dallanması, koşullu döngüye girmesi veya harici girdiye yanıt vermesi gerektiğinde Durum Makinesi kullanın.

---

## Durum Makinesi Moduna Geçiş

Canvas'ın üstündeki araç çubuğunda bir **mod geçişi** bulunur:

```
[● Animasyon]  [○ Durum Makinesi]
```

FSM editörüne girmek için **Durum Makinesi**'ne tıklayın. Canvas, **düğüm grafik görünümüne** geçer — durumların düğümler ve geçişlerin oklar olarak göründüğü görsel bir editör. Mevcut katmanlarınız ve zaman çizelgeleriniz değişmez; sadece bunların üstüne bir mantık katmanı ekliyorsunuz.

İstediğiniz zaman standart Zaman Çizelgesi görünümüne dönmek için **Animasyon**'a tıklayın. Her iki mod aynı canvas'ı ve aynı katmanları paylaşır.

---

## Düğüm Grafik Editörü

Düğüm grafiği SVG tabanlı bir canvas'tır. Arka planı tıklayıp sürükleyerek kaydırabilir, kaydırma tekerleği ile yakınlaştırabilirsiniz.

### Durumlar

Her **durum düğümü** bir animasyon klibini temsil eder. Durum adını ve bağlı Zaman Çizelgesinin süresini gösterir.

- **Durum ekleyin** — Canvas arka planına sağ tıklayıp **Durum Ekle**'yi seçin. Yeni bir düğüm görünür.
- **Durumu yeniden adlandırın** — Düğüme sağ tıklayıp **Yeniden Adlandır**'ı seçin veya düğüm etiketine çift tıklayın.
- **Giriş durumu olarak ayarlayın** — Düğüme sağ tıklayıp **Giriş Olarak Ayarla**'yı seçin. Giriş durumu, animasyon yüklendiğinde ilk oynar. Sol kenarında dolu ok göstergesiyle işaretlenir.
- **Durumu silin** — Düğüme sağ tıklayıp **Sil**'i seçin.

Her durum bir **Zaman Çizelgesiyle** desteklenir — döngüye giren veya yapılandırmanıza bağlı olarak bir kez oynayan bağımsız bir animasyon klibi. Bir durum etkin olduğunda, Zaman Çizelgesi oynar. Geçiş tetiklendiğinde, oynatma yeni durumun Zaman Çizelgesine geçer.

### Geçişler

**Geçiş**, bir durumdan diğerine bir oktur. Durum Makinesinin kaynak durumdan hedef duruma ne zaman ve nasıl geçtiğini tanımlar.

- **Geçiş oluşturun** — Bağlantı noktası görünene kadar durum düğümünün üzerine gelin (düğümün kenarında küçük bir daire). O noktadan başka bir durum düğümüne sürükleyin. Aralarında bir ok görünür.
- **Geçiş seçin** — Oka tıklayın. Sağ panelde **Geçiş Denetçisi** açılır.
- **Geçişi silin** — Seçin ve Backspace tuşuna basın veya oka sağ tıklayıp **Sil**'i seçin.

**Geçiş görünümü:**
- Düz ok, tetiklenen geçiştir (bir olay veya parametre eşiğinde tetiklenir).
- Kesikli ok, yalnızca koruma geçişidir (açık bir tetikleyici gerekmeden, koruma koşulu sağlandığında otomatik olarak tetiklenir).

---

## Geçişleri Yapılandırma

Denetçisini açmak için bir geçiş seçin. Üç ayar vardır:

### Tetikleyici türü

| Tür | Ne Zaman Tetiklenir |
|---|---|
| **SDK otomatik** | SDK tetikleyici olayını otomatik olarak gönderir (ör. zaman çizelgesi bittiğinde) |
| **Manuel gönderim** | Kodunuz açıkça `player.dispatch('olayAdı')` çağırır |
| **Yalnızca koruma** | Tetikleyici gerekmez — koruma koşulu doğru olduğu anda tetiklenir |

### Koruma koşulu

Koruma, geçişin tetiklenmesi için doğru olması gereken parametre tabanlı bir kuraldır. Tetiklenen geçişler için korumalar isteğe bağlıdır ve yalnızca koruma geçişleri için zorunludur.

Örnekler:
- `hız > 5` — `hız` parametresi 5'i geçtiğinde geçiş tetiklenir
- `zıplıyor == true` — `zıplıyor` boole değeri true olarak ayarlandığında geçiş tetiklenir
- `sağlık <= 0` — `sağlık` 0'a veya altına düştüğünde geçiş tetiklenir

Korumalar, aşağıda tanımladığınız **Parametreler panelindeki** parametreleri kullanılarak oluşturulur.

### Geçiş süresi

Durumlar arasındaki geçiş-karışım süresini (saniye cinsinden) ayarlayın. `0` değeri durumları anında değiştirir.

---

## Parametreler Paneli

Parametreler, koruma koşullarını yönlendiren adlandırılmış değerlerdir. Herhangi bir bireysel durumun dışında yaşarlar ve çalışma zamanında kodunuzdan güncellenebilirler.

Durum Makinesi modunda sağ kenar çubuğundan **Parametreler panelini** açın.

**Parametre türleri:**

- **Sayı** — Ondalık noktalı değer (ör. `hız`, `sağlık`, `açı`)
- **Boolean** — Doğru/yanlış bayrağı (ör. `zıplıyor`, `seçili`)

**Parametre eklemek için:**
1. Parametreler panelinin üstündeki **+ Parametre Ekle**'ye tıklayın.
2. Türü seçin (Sayı veya Boolean).
3. Bir ad verin — bu, koruma koşullarında ve kodunuzda kullanacağınız addır.
4. Varsayılan değerini ayarlayın.

Parametreler, geçiş değerlendirildiği sırada okunur. Bir parametreyi güncellerseniz ve bir koruma koşulu sağlanırsa, geçiş hemen tetiklenir.

---

## Çalışma Zamanında Geçişleri Tetikleme

Durum Makineniz dışa aktarıldıktan sonra **Chorono Web SDK** (veya Android SDK) aracılığıyla kontrol edersiniz. İki yaklaşım vardır:

### Manuel tetikleme — olay gönderme

Geçişin ne zaman tetikleneceği üzerinde açık kontrol istediğinizde kullanın. Geçişin tetikleyici türü **Manuel gönderim** olarak ayarlanmış olmalı ve olay adı eşleşmelidir.

```javascript
const player = new ChronoPlayer('#canvas', sahneVerisi);
await player.load();
player.play();

// 'zıpla' tetikleyicisini göndererek 'zıpla' durumuna geç
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    player.dispatch('zıpla');
  }
});
```

### Parametre tabanlı — parametre değeri ayarlama

Geçiş uygulamanızdaki bir değere göre otomatik olarak tetiklenecekse kullanın. Geçişin parametreye başvuran bir koruma koşulu olmalıdır.

```javascript
// 'hız' parametresini güncelleyin — 'hız'ı izleyen her koruma hemen yeniden değerlendirilir
function oyuncuHareket(hız) {
  player.setParam('hız', hız.büyüklük);
}

// Boolean parametre geçişi
function oyuncuInis() {
  player.setParam('zıplıyor', false);
}
```

Her iki yaklaşımı birleştirebilirsiniz. Örneğin, bir "koş" durumu hem manuel tetikleyici hem de koruma olarak `hız > 5` gerektirebilir, böylece geçiş yalnızca kullanıcı koş düğmesine *basar* ve karakter gerçekten hareket ediyorsa tetiklenir.

---

## Parametre Bağlama ile Entegrasyon

**Parametre Bağlama** (PB), animasyonlu özellikleri harici veri kaynaklarına bağlamak için Chorono'nun sistemidir. Durum Makineleri ve Parametre Bağlama iyi bir arada çalışır:

- Diğer görsel özellikleri yönlendirmek için Durum Makinesinden **etkin durum adını** bir PB kaynağı olarak kullanın (ör. hangi durumun etkin olduğuna göre arka plan rengini değiştirme).
- Veri hattınızın durum geçişlerini otomatik olarak yönlendirmesi için `setParam()` girişleri olarak PB değerlerini kullanın.
- Durumlar arasında düzgün görsel harmanlama için sıfır olmayan bir geçiş süresi ayarlayın ve PB'nin ton veya ölçek gibi ikincil özellikleri paralel olarak enterpolasyon yapmasına izin verin.

---

## Sahne Gezgini

Durum Makinesi modunda, **Sahne Gezgini** paneli durumları bağlı Zaman Çizelgesi süreleriyle birlikte listeler. Örneğin:

```
Durumlar
  → boşta          2.4 s   [giriş]
    yürüyor         1.2 s
    koşuyor         0.8 s
    zıplıyor        0.6 s   [tek seferlik]
    düşüyor         döngü
```

Sahnedeki düğümünü seçmek ve alttaki önizleme şeridinde zaman çizelgesini açmak için Sahne Gezgininde herhangi bir duruma tıklayın. Bu, FSM editöründen çıkmadan belirli bir durumun animasyonunu ileri geri oynatmanızı sağlar.

---

## Dışa Aktarma ve SDK Uyumluluğu

Durum Makinesi tanımı **sahne JSON'unun** bir parçası olarak kaydedilir. Ayrı bir dışa aktarma adımına gerek yoktur — sahneyi dışa aktardığınızda FSM otomatik olarak dahil edilir.

Dışa aktarılan JSON şunları içerir:

- Durum listesi ve bağlı zaman çizelgesi kimlikleri
- Tetikleyici türleri, koruma koşulları ve süreli tüm geçişler
- Parametre tanımları ve varsayılan değerler
- Giriş durumu işaretçisi

Bu format şunlar tarafından desteklenir:

- **Chorono Web SDK** — `ChronoPlayer`, tarayıcıda durum değerlendirmeyi, geçiş zamanlamasını ve parametre güncellemelerini yönetir
- **Chorono Android SDK** — aynı sahne JSON'u, aynı API ile (`dispatch()`, `setParam()`) Android'de yerel olarak çalışır

Chorono'da Durum Makinesini güncelleyip yeniden dışa aktarırsanız, tetikleyici ve parametre adları aynı kaldığı sürece SDK entegrasyon tarafında kod değişikliği gerekmez.

---

## Hızlı Referans

| Eylem | Nasıl |
|---|---|
| Durum Makinesi moduna geç | Araç çubuğu geçişinde **Durum Makinesi**'ne tıklayın |
| Durum ekle | Canvas arka planına sağ tıklayın → Durum Ekle |
| Geçiş oluştur | Bir durumun noktasından başka bir duruma sürükleyin |
| Giriş durumu ayarla | Duruma sağ tıklayın → Giriş Olarak Ayarla |
| Parametre ekle | Parametreler paneli → + Parametre Ekle |
| Koddan geçiş tetikle | `player.dispatch('tetikleyiciAdı')` |
| Koddan parametre güncelle | `player.setParam('parametreAdı', değer)` |
| Bir durumun zaman çizelgesini önizle | Sahne Gezgininde duruma tıklayın |
