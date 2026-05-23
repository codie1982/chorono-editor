# AI Animasyonu

Chorono Animator, animasyonları düz Türkçe olarak tanımlamanıza ve otomatik olarak oluşturulmasına olanak tanıyan yerleşik bir AI asistanı içerir. Keyframe'leri manuel olarak yerleştirmek yerine "logoyu soldan kaydır" diyebilirsiniz ve AI katmanları, keyframe'leri ve zamanlamayı kendi başına oluşturacaktır.

---

## AI Panelini Açma

Sağ taraftaki araç çubuğundaki robot simgesine (🤖) tıklayın. Bu, canvas'ın yanında sabitlenmiş bir sohbet arayüzü olan **AI Animasyon çekmecesini** açar. Çalışırken açık tutabilir ve zaman çizelgesi ve denetçinin yanında kullanabilirsiniz.

---

## Desteklenen AI Sağlayıcıları

AI paneli birden fazla sağlayıcıyla çalışır. Kurulumunuza uyan birini seçin:

| Sağlayıcı | Modeller |
|---|---|
| **Anthropic Claude** | Claude Sonnet, Claude Haiku, Claude Opus |
| **OpenAI** | GPT-4o, GPT-4 Turbo |
| **Ollama** | Yerel olarak çalışan herhangi bir model (llama3, mistral vb.) |
| **Groq** | Llama 3, Mixtral (hızlı çıkarsama) |
| **Together AI** | Açık kaynak model barındırma |
| **Azure OpenAI** | Azure'da dağıtılan model uç noktanız |

---

## API Anahtarınızı Ayarlama

Seçtiğiniz sağlayıcıdan bir API anahtarına ihtiyacınız vardır. Eklemek için iki yol vardır:

### Seçenek 1 — .env.local dosyası (geliştirme için önerilir)

Proje kökünde bir `.env.local` dosyası oluşturun ve aşağıdakilerden birini ekleyin:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
TOGETHER_API_KEY=...
```

Kaydettikten sonra geliştirme sunucusunu yeniden başlatın.

### Seçenek 2 — Ayarlar Paneli

**Ayarları** açmak için araç çubuğundaki dişli simgesine tıklayın, ardından **AI** sekmesine gidin. API anahtarınızı seçtiğiniz sağlayıcının alanına yapıştırın. Bu, anahtarı tarayıcınızın yerel depolama alanına kaydeder ve sunucu yeniden başlatması gerektirmez.

Yerel modeller için (Ollama), API anahtarı yerine temel URL'yi ayarlayın. Örneğin:

```
http://localhost:11434
```

---

## Ne Söylemeli — Örnek Komutlar

AI doğal dili anlar. Özel sözdizimi kullanmanıza gerek yoktur. Neler sorabileceğinizin örnekleri:

**Katman ve nesne ekleme**
- "Canvas'ın ortasına mavi bir daire ekle"
- "Sol üst köşeye 200 x 100 piksel kırmızı bir dikdörtgen oluştur"
- "Büyük beyaz metinle 'Merhaba Dünya' yazan bir metin katmanı ekle"

**Animasyon oluşturma**
- "Mavi daireyi 1 saniye içinde sol kenardan sağ kenara kaydır"
- "Metni 10. kareden başlayarak 2 saniye içinde belirt"
- "Logoyu 3 saniye içinde 360 derece döndür"
- "Düğmeyi ease-out eğrisiyle %0'dan %100'e ölçekle"

**Çok katmanlı ve kademeli efektler**
- "Her kutu 0,2 saniye arayla görünecek şekilde kademeli animasyon oluştur"
- "Tüm daireleri birbiri ardına alttan uçarak gelecek şekilde animasyonla"
- "Menü öğelerinin her biri arasında 0,1 saniye gecikmeyle soldan kaymasını sağla"

**Düzen ve hizalama**
- "Tüm katmanları canvas'ta ortala"
- "Seçili katmanları alta hizala"
- "Üç kutuyu canvas boyunca eşit olarak dağıt"
- "Resim katmanını canvas boyutuna sığdır"

**Döngü ve tekrar**
- "Döndürme animasyonunu döngüye al"
- "Nabız efektini süresiz olarak tekrarla"
- "Nefes döngüsü oluştur — yumuşakça büyüt ve küçült, sonsuza dek"

**Özel efektler**
- "Merkeze parçacık patlama efekti ekle"
- "Metne parıltı efekti oluştur"
- "Topun hareketine zıplama kolaylaştırması ekle"

**Mevcut içeriği düzenleme**
- "Dairenin rengini turuncuya çevir"
- "Logoyu sağ üst köşeye taşı"
- "Soluklaşma süresini 3 saniyeye çıkar"
- "Arka plan dışındaki tüm katmanları sil"

---

## AI Nasıl Çalışır — Ajan Döngüsü

Bir komut gönderdiğinizde, AI kodu körü körüne oluşturmaz. Sahneyi incelediği, değişiklik yaptığı, sonucu doğruladığı ve gerekirse devam ettiği **ajan döngüsü** adı verilen bir akıl yürütme döngüsü üzerinden çalışır. Bu, istek başına otomatik olarak en fazla **5 tur** boyunca gerçekleşir.

Tipik bir tur şöyle görünür:

1. **Akıl yürüt** — AI komutunuzu okur ve ne yapacağına karar verir
2. **İncele** — Mevcut sahne durumunu okur (katmanlar, zaman çizelgeleri, keyframe'ler)
3. **Harekete geç** — Katman ekler, keyframe oluşturur veya betik çalıştırır
4. **Doğrula** — Sonucun istediğinizle eşleşip eşleşmediğini kontrol eder
5. **Devam et veya bitir** — Daha fazla çalışma gerekiyorsa döngüye girer; aksi takdirde ne yaptığını raporlar

Bu, AI'nın çok adımlı istekleri parçalara ayırmanıza gerek kalmadan işleyebileceği anlamına gelir. "Üç daire ekle ve görünümlerini kademel hale getir" tek bir komut olarak işlenir.

---

## AI Ne Yapabilir

AI'nın Chorono sahne API'sine tam erişimi vardır. Şunları yapabilir:

- **Katman oluştur** — şekiller, metin, resimler, spline'lar, gruplar
- **Katmanları sil veya güncelle** — herhangi bir katmandaki herhangi bir özelliği değiştir
- **Keyframe ayarla** — konum, ölçek, döndürme, opaklık, renk ve özel özellikler
- **Zaman çizelgesi oluştur** — parçalar oluştur, süreler ayarla, easing eğrileri seç
- **Betik çalıştır** — karmaşık prosedürel animasyonlar için AI JavaScript yazar ve çalıştırır
- **Sahne durumunu oku** — harekete geçmeden önce katman adlarını, konumlarını, zaman çizelgesi durumunu ve mevcut keyframe'leri görür
- **Yerleşik animasyon yardımcılarını kullan:**
  - `create_stagger_animation` — birden fazla katmanda herhangi bir özelliği kademel hale getir
  - `center_layer` — bir veya daha fazla katmanı canvas'ta ortala
  - `align_layers` — katmanları birbirine veya canvas'a göre hizala
  - `fit_to_canvas` — canvas'ı doldurmak için bir katmanı ölçekle
  - `create_loop_animation` — bir zaman çizelgesini sorunsuz döngüye sar

---

## AI Henüz Ne Yapamaz

Aşağıdakiler henüz desteklenmemektedir:

- **Dışa aktarma** — AI dışa aktarımı tetikleyemez veya yapılandıramaz. Dışa Aktarma panelini manuel olarak kullanın.
- **Karmaşık fizik** — Yerçekimi, çarpışmalar ve katı cisim simülasyonları mevcut değildir.
- **Karakter başına metin animasyonu** — Tek tek harfleri bağımsız olarak animasyonlamak henüz desteklenmemektedir.
- **Ses senkronizasyonu** — AI ses dalga biçimi verilerini okuyamaz veya yanıt veremez.

---

## Hızlı Eylem Çipleri

Sohbet girişinin altında bir sıra **Hızlı Eylem** düğmesi göreceksiniz. Bunlar en yaygın görevler için önceden oluşturulmuş komutlardır:

- **Tümünü ortala** — her katmanı canvas'ta ortalar
- **Soluklaşma ekle** — seçili katmana 1 saniyelik opaklık soluklaşması ekler
- **Kademeli giriş** — seçili katmanların giriş animasyonlarını kademel hale getirir
- **Animasyonu döngüye al** — mevcut zaman çizelgesini bir döngüye sarar
- **Canvas'a sığdır** — seçili katmanı canvas'ı dolduracak şekilde ölçekler

Yazmadan hemen çalıştırmak için herhangi bir çipe tıklayın. Bu çipleri Ayarlar > AI > Hızlı Eylemler'de özelleştirebilirsiniz.

---

## Geri Alma Desteği

AI'nın yaptığı her değişiklik Chorono'nun standart komut geçmişinden geçer. Tıpkı manuel düzenlemeler gibi herhangi bir AI eylemini **Ctrl+Z** (veya Mac'te Cmd+Z) ile geri alabilirsiniz. AI bir geçişte 10 keyframe oluşturursa, tek bir geri alma hepsini geri alır.

---

## Daha İyi Sonuçlar için İpuçları

**Zamanlama hakkında spesifik olun.** "Yavaşça animasyonla" yerine "2,5 saniye içinde animasyonla" deyin. AI tam değerinizi kullanacaktır.

**Katmanlarınızı adlandırın.** Katmanlarınızda "logo", "alt başlık" ve "arka plan" gibi adlar varsa, doğrudan onlara atıfta bulunabilirsiniz: "logoyu önce kaydır, sonra alt başlığı". Adsız katmanları hedeflemek daha zordur.

**Son durumu tanımlayın, adımları değil.** "Kutu sağ üst köşede bitmeli" deyin, "kutuyu 400 piksel sağa taşı" değil. AI koordinatları çözecektir.

**Komut başına bir konsept kullanın.** Hem kayma hem de renk değişikliği istiyorsanız, bunları ayrı komutlar olarak gönderin. AI her birini temiz bir şekilde işler ve gerekirse geri almak daha kolay olur.

**Yineleyin.** Temel bir komutla başlayın ve rafine edin. "Daha hızlı yap" veya "ease-out yerine ease-in kullan" mükemmel takip mesajları olarak çalışır.
