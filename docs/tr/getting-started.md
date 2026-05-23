# Chorono Animator'a Başlarken

Chorono Animator'a hoş geldiniz — hareket tasarımcıları, geliştiriciler ve yaratıcı ekipler için tasarlanmış profesyonel, web tabanlı bir animasyon aracı. İster küçük bir UI mikro-etkileşimi oluşturuyor olun, ister yayın kalitesinde bir sekans hazırlıyor olun, Chorono size bunları tarayıcınızdan çıkmadan yapabileceğiniz araçları sunar.

---

## Chorono Animator Nedir?

Chorono Animator, tamamen tarayıcınızda çalışan **web tabanlı, GPU hızlandırmalı bir animasyon editörüdür**. Öne çıkan özellikler:

- **Kurulum gerektirmez** — bir URL açın ve animasyon yapmaya başlayın.
- **GPU hızlandırmalı render** — karmaşık bulanıklık ve parlaklık efektleri içeren sahnelerde bile gerçek zamanlı önizleme için donanım destekli canvas render.
- **AI destekli içerik üretimi** — düz metin komutlarını anlayan, animasyon betikleri yazan, keyframe değerleri öneren ve bir açıklamadan sahne oluşturan entegre AI paneli.
- **After Effects'ten ilham alan iş akışı** — hareket tasarımcılarına tanıdık gelen katman paneli, keyframe'li zaman çizelgesi, eğriler ve özellik parçaları.
- **Betiklenebilir** — her sahne öğesi prosedürel animasyon ve etkileşim için bir JavaScript betik API'sini açığa çıkarır.
- **Dışa aktarılabilir** — yerleşik dışa aktarma iletişim kutusundan raster dizilere, vektör formatlarına ve daha fazlasına render edin.

---

## Sistem Gereksinimleri

### Barındırılan Editörü Kullanma

| Gereksinim | Minimum |
|---|---|
| Tarayıcı | Chrome 110+, Edge 110+, Firefox 115+, Safari 16.4+ |
| WebGL2 | Etkin olmalı (tüm modern tarayıcılarda varsayılan olarak etkin) |
| RAM | 4 GB (video ve yoğun parçacık projeleri için 8 GB önerilir) |
| Ekran | 1280 x 800 veya daha büyük |

> Tarayıcınızda WebGL2'nin kullanılabilir olup olmadığını kontrol etmek için [get.webgl.org](https://get.webgl.org/webgl2/) adresini ziyaret edin.

### Kendi Sunucunuzda Barındırma

Chorono'yu kendi sunucunuzda çalıştırmak veya yerel olarak geliştirmek istiyorsanız:

| Gereksinim | Sürüm |
|---|---|
| Node.js | 18.17.0 veya üzeri |
| Paket yöneticisi | npm 9+ veya pnpm 8+ |

```bash
# Depoyu klonlayın ve geliştirme sunucusunu başlatın
git clone <repo-url>
cd chorono-editor
npm install
npm run dev
```

Editör `http://localhost:3000` adresinde kullanılabilir olacaktır.

> **Önemli:** Geliştirme sunucusu çalışırken `npm run build` komutunu çalıştırmayın. Önce sunucuyu durdurun, derleyin, ardından yeniden başlatın.

---

## Hızlı Başlangıç: 5 Dakikada İlk Animasyonunuz

Basit bir zıplayan daire animasyonu oluşturmak için şu adımları izleyin.

### Adım 1 — Editörü Açın

Chorono URL'sine tarayıcınızda gidin. Editör boş bir sahneyle yüklenir.

### Adım 2 — Şekil Katmanı Ekleyin

Katman Panelindeki (sol üst alan) **Ekle** düğmesine tıklayın ve **Şekil > Daire**'yi seçin. Canvas'ın ortasında bir daire belirir.

### Adım 3 — Başlangıç Keyframe'i Ayarlayın

1. **Özellikler Panelinde** (sağ taraf), **Konum** alanını bulun.
2. Zaman Çizelgesindeki **oynatma başlığını** 0. kareye taşıyın.
3. Başlangıç konumunu kaydetmek için Konum'un yanındaki keyframe elmas simgesine tıklayın.

### Adım 4 — Yeni Konuma Animasyon Ekleyin

1. Oynatma başlığını 30. kareye (60 fps'de yaklaşık 0,5 saniye) taşıyın.
2. Canvas'ta daireyi yukarı sürükleyin — veya Özellikler Panelinde yeni bir Y değeri yazın.
3. Otomatik olarak bir keyframe eklenir.

### Adım 5 — Easing Eğrisi Ekleyin

Zaman Çizelgesindeki ikinci keyframe'e sağ tıklayın ve doğal bir zıplama hissi için **Ease In/Out**'u seçin.

### Adım 6 — Önizleyin

Animasyonu oynatmak için **Boşluk** tuşuna basın. Daire başlangıç konumundan yeni konuma easing ile hareket eder.

### Adım 7 — Dışa Aktarın

**Dosya > Dışa Aktar**'a tıklayın, formatınızı seçin (PNG dizisi, video veya vektör) ve **Render**'a tıklayın.

Tebrikler — ilk Chorono animasyonunuzu oluşturdunuz.

---

## Arayüze Genel Bakış

Chorono editörü altı ana alana bölünmüştür:

```
┌──────────────────────────────────────────────────────────────┐
│  Üst Araç Çubuğu  (araçlar, hizalama, görünüm kontrolleri)  │
├──────────┬───────────────────────────────────┬───────────────┤
│  Katman  │                                   │  Özellikler   │
│  Paneli  │           Canvas                  │  Paneli       │
│          │                                   │               │
├──────────┴───────────────────────────────────┤               │
│              Zaman Çizelgesi Paneli           │               │
├──────────────────────────────────────────────┴───────────────┤
│  AI Paneli / Varlık Paneli (sekmeli, alt veya yan)           │
└──────────────────────────────────────────────────────────────┘
```

### Canvas

Sahnenizi gördüğünüz ve etkileşime girdiğiniz ana çalışma alanı. Yakınlaştırmak için kaydırma tekerleğini, kaydırmak için **H** aracını (veya orta fare sürüklemeyi) kullanın. Canvas, GPU hızlandırması ile gerçek zamanlı render edilir.

### Katman Paneli

Sahnenizdeki her katmanı listeler. Buradan şunları yapabilirsiniz:
- Katman ekleme, silme ve yeniden sıralama.
- Görünürlüğü değiştirme (göz simgesi), katmanı kilitleme (asma kilit), solo veya sabitleme.
- Karmaşık projeleri düzenlemek için renk etiketleri uygulama.
- Alt katmanları görmek için grupları genişletme.

### Zaman Çizelgesi Paneli

Altta zamanın yaşadığı yatay şerit. Temel kavramlar:
- **Oynatma başlığı** — geçerli zamanı temsil eden dikey çizgi. Sürükleyin veya cetvel üzerinde herhangi bir yere tıklayın.
- **Parçalar** — bir katmanın her animasyonlu özelliğinin kendi parça satırı vardır.
- **Keyframe'ler** — belirli bir zamanda özellik değeri kaydeden elmas şeklindeki işaretçiler.
- **Dope Sheet modu** — tüm keyframe'leri bir arada görün; yeniden zamanlamak için sürükleyin.

### Özellikler Paneli

Sağdaki bağlama duyarlı panel. Bir katman seçildiğinde şunları gösterir:
- **Dönüşüm** — konum, ölçek, döndürme, çapa noktası.
- **Görünüm** — opaklık, karıştırma modu, dolgu, kontur.
- **Efektler** — bulanıklık, parlaklık, gölge, renk tonu ve daha fazlası.
- **Katman türüne özgü ayarlar** — şekil geometrisi, metin stili, video oynatma vb.

### AI Paneli

Düz metin bir komut yazın ve AI sizin için sahneyi oluşturacak veya değiştirecektir. Örnekler:
- "2 saniyede soluklaşan dönen bir yıldız ekle."
- "Seçili katmanı üç kez zıplat."
- "Üç noktalı bir yükleme döndürücü oluştur."

AI paneli ayrıca hataları açıklar ve betik sorunları için düzeltmeler önerir.

### Varlık Paneli

İçe aktarılan varlıkları yönetin — resimler, videolar, ses dosyaları ve fontlar. Bir katman oluşturmak için doğrudan canvas'a sürükleyin.

---

## Temel İş Akışı

Chorono'daki çoğu animasyon aynı beş adımlı ritmi izler:

1. **Katman ekleyin** — Ekle düğmesini, canvas'ta sağ tıklamayı veya AI panelinde komut yazmayı kullanın.
2. **Özellikleri ayarlayın** — Özellikler Panelinde konum, boyut, renk ve diğer görsel özellikleri düzenleyin.
3. **Keyframe ekleyin** — oynatma başlığını yeni bir zamana taşıyın, özellik değerini değiştirin ve keyframe kaydedilir.
4. **Önizleyin** — oynatmak için **Boşluk** tuşuna basın veya tek tek kareleri kontrol etmek için oynatma başlığını sürükleyin.
5. **Dışa aktarın** — memnun olduğunuzda **Dosya > Dışa Aktar**'ı açın ve render edin.

Her katman için tekrarlayın. Karmaşık sahneler, her biri bu ritmi izleyen çok sayıda katmandan oluşur.

---

## Klavye Kısayolları

Kısayollar bağlama duyarlıdır: imlecin canvas veya zaman çizelgesi üzerinde olmasına bağlı olarak aynı tuş farklı şeyler yapabilir.

### Genel (her yerde çalışır)

| Kısayol | Eylem |
|---|---|
| Boşluk | Oynat / Duraklat |
| Cmd/Ctrl + Z | Geri Al |
| Cmd/Ctrl + Shift + Z | Yinele |
| Delete / Backspace | Seçili katmanları veya keyframe'leri sil |
| Sol Ok | 1 kare geri git |
| Sağ Ok | 1 kare ileri git |
| Shift + Sol Ok | 10 kare geri git |
| Shift + Sağ Ok | 10 kare ileri git |
| Cmd/Ctrl + / | Klavye kısayolları referansını göster |

### Canvas Araçları

| Kısayol | Araç |
|---|---|
| V | Seçim aracı |
| H | Kaydırma aracı |
| P | Kalem aracı (yol çizimi) |
| G | Taşıma aracı |
| R | Döndürme aracı |
| S | Ölçekleme aracı |
| A | Çapa noktası aracı |
| B | Kutu seçimi |
| L | Kement seçimi |
| O | Daire seçimi |
| W | Boya seçimi |

### Canvas Eylemleri

| Kısayol | Eylem |
|---|---|
| Cmd/Ctrl + D | Seçili katmanı çoğalt |
| Option/Alt + Cmd/Ctrl + D | Animasyonla klonla (canlı örnek) |
| Shift + Cmd/Ctrl + A | Dizi iletişim kutusunu aç |
| Cmd/Ctrl + C | Kopyala |
| Cmd/Ctrl + V | Yapıştır |
| Cmd/Ctrl + G | Seçili katmanları grupla |
| Shift + Cmd/Ctrl + G | Grubu çöz |
| Alt + A | Sola hizala |
| Alt + D | Sağa hizala |
| Alt + W | Üste hizala |
| Alt + S | Alta hizala |

### Zaman Çizelgesi Bağlamı (imleç zaman çizelgesi üzerindeyken)

| Kısayol | Eylem |
|---|---|
| P | Seçili katman için Konum parçasını göster |
| S | Ölçek parçasını göster |
| R | Döndürme parçasını göster |
| T | Opaklık parçasını göster |
| U | Tüm animasyonlu özellikleri göster |
| Alt + P | Oynatma başlığında Konum keyframe'i ekle/kaldır |
| Alt + S | Ölçek keyframe'i ekle/kaldır |
| Alt + R | Döndürme keyframe'i ekle/kaldır |
| Alt + T | Opaklık keyframe'i ekle/kaldır |
| J | Önceki keyframe'e atla |
| K | Sonraki keyframe'e atla |

### Canvas'ta Sürükleme Hareketleri

| Hareket | Eylem |
|---|---|
| Shift + sürükle | Katmanı klonla (statik kopya) |
| Alt + sürükle | Örnek klon (canlı bağlantılı kopya) |

---

## Yeni Başlayanlar İçin İpuçları

**Tek bir katmanla başlayın.** Her şeyi bir anda eklemeye cazip gelir. İlk katmanınızı oluşturun, animasyonu doğru yapın, sonra çoğaltın veya sonraki katmanı ekleyin.

**AI panelini özgürce kullanın.** Bir şeyi nasıl başaracağınızdan emin değilseniz, AI panelinde düz Türkçe olarak açıklayın. Saniyeler içinde karmaşık bir animasyon iskeletleyebilir, siz de onu rafine edersiniz.

**Zaman çizelgesinde U tuşuna basın.** Bir katman seçiliyken U tuşuna basmak (imleciniz zaman çizelgesi üzerindeyken) yalnızca keyframe içeren özellikleri gösterir — odaklanmış kalmak için harika.

**Zaman çizelgesini yakınlaştırın.** Belirli bir zaman aralığına yakınlaştırmak için zaman çizelgesinde yatay olarak kaydırın. Kaydırmak yerine yakınlaştırmak için Ctrl/Cmd basılıyken kaydırın.

**Alt + sürükleme canlı örnek oluşturur.** Animasyonlu bir öğenin birden fazla kopyasına ihtiyacınız varsa, örnek klon oluşturmak için Alt + sürüklemeyi kullanın. Orijinali değiştirmek tüm örnekleri otomatik olarak günceller.

**Özellikler Paneli sekmelerini kontrol edin.** Özellikler Panelinin birden fazla sekmesi vardır — Dönüşüm, Görünüm, Efektler ve Etkileş gibi sekmeleri arayın. Pek çok ayar ilk başta gözden kaçması kolay sekmelerdedir.

**Sık kaydedin.** Chorono çalışmanızı otomatik olarak tarayıcı deposuna kaydeder, ancak önemli projeler için **Dosya > Kaydet**'i düzenli olarak kullanın ve yerel bir yedek tutun.

**Easing kısayollarını öğrenin.** Easing eğrisini ayarlamak için herhangi bir keyframe'e sağ tıklayın. **Easy Ease** (varsayılan) çoğu doğal hareket için işe yarar. Hassas kontrol için eğri editöründe Bezier easing'i keşfedin.
