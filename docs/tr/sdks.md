# SDK'lar

Chorono animasyonları yalnızca Chorono editörüyle sınırlı değildir. Web SDK ve Android SDK, `.json` sahne dosyalarını kendi ürünlerinizde — web siteleri, uygulamalar veya kullanıcılarınızın bulunduğu her yerde — oynatmanıza olanak tanır.

---

## Web SDK

Web SDK, Chorono sahnelerini herhangi bir modern tarayıcıda oynatır. Bir web sayfasına bırakın, dışa aktarılmış bir sahne dosyasını gösterin ve harici bağımlılıklar olmadan tam animasyonlu, etkileşimli bir bileşeniniz olur.

### Kurulum

**CDN aracılığıyla** — başlamak için en hızlı yol:

```html
<script src="https://cdn.chorono.io/web-sdk/latest.js"></script>
```

**npm aracılığıyla** — paketleyici tabanlı projeler için önerilir (Webpack, Vite, Rollup vb.):

```bash
npm install @chorono/web-sdk
```

[npm paketi →](https://www.npmjs.com/package/@chorono/web-sdk)

```javascript
import { ChronoPlayer } from '@chorono/web-sdk'
```

### Temel Kullanım

```html
<div id="animasyonum" style="width: 800px; height: 450px;"></div>

<script>
const player = new ChronoPlayer({
  container: '#animasyonum',
  sceneUrl: './animasyon.json',
  autoplay: true,
  loop: true
})
</script>
```

`container`, bir CSS seçici dizesi veya doğrudan bir DOM öğesi referansı kabul eder. Oynatıcı konteyneri doldurur ve sahneyi sığacak şekilde ölçekler.

### Tam API

**Oynatma kontrolü:**

```javascript
player.play()
player.pause()
player.stop()
player.seek(2000)            // 2000 ms'ye (2 saniye) atla
player.setPlaybackRate(1.5)  // 1,5x hız; herhangi bir pozitif sayıyı destekler
player.setLoop(true)         // döngüyü açıp kapat
```

**Durum Makinesi kontrolü:**

```javascript
player.setParam('hiz', 10)  // ada göre bir Durum Makinesi parametresi ayarla
player.dispatch('zipla')     // adlandırılmış Durum Makinesi geçişini tetikle
```

**Katman kontrolü:**

```javascript
player.setLayerVisible('arkaplan', false)  // bir katmanı ada göre göster veya gizle
```

**Olaylar:**

```javascript
player.on('play',        () => { /* oynatma başladı */ })
player.on('pause',       () => { /* oynatma duraklatıldı  */ })
player.on('complete',    () => { /* sona ulaştı  */ })
player.on('seek',        (timeMs)       => { /* timeMs'e atlandı */ })
player.on('stateChange', (from, to)     => { /* DM geçişi    */ })
```

**Temizlik:**

```javascript
player.destroy()  // canvas'ı kaldırır, tüm olayları bağlantısını keser, belleği serbest bırakır
```

### Duyarlı Ölçekleme

Oynatıcı, konteyner yeniden boyutlandığında otomatik olarak yeniden ölçeklenir. Ekstra kod gerekmez. Akışkan düzenler için konteyneri yüzde genişliğine ayarlayabilir ve en-boy oranı CSS kuralı kullanabilirsiniz:

```css
#animasyonum {
  width: 100%;
  aspect-ratio: 16 / 9;
}
```

### GPU Hızlandırma

Chorono editöründe WebGL2 parçacık sistemleri kullanan sahneler, Web SDK'da da GPU hızlandırmasıyla render edilir. Herhangi bir yapılandırma gerekmez — SDK, WebGL2 kullanılabilirliğini algılar ve tarayıcı veya cihaz desteklemiyorsa Canvas 2D'ye zarif biçimde geri döner.

### Boyut ve Tarayıcı Desteği

| Özellik | Değer |
|---|---|
| Paket boyutu | ~45 KB sıkıştırılmış |
| Chrome | 70+ |
| Firefox | 65+ |
| Safari | 15+ |
| Edge | 79+ |
| Mobil tarayıcılar | iOS Safari 15+, Android için Chrome 70+ |

---

## Android SDK

Android SDK, Chorono sahnelerinin Android uygulamalarında yerel olarak oynatılmasını sağlar. Standart Android View sistemiyle entegre olur ve Activity ile Fragment yaşam döngüsünü otomatik olarak dikkate alır.

### Kurulum

Maven Central deposunu ekleyin ve modül düzeyindeki `build.gradle` dosyanıza bağımlılığı ekleyin:

```kotlin
repositories {
    mavenCentral()
}

dependencies {
    implementation("com.grntsoftware:chorono-android-sdk:1.0.0")
}
```

[Maven Central →](https://repo1.maven.org/maven2/com/grntsoftware/chorono-android-sdk/1.0.0/)

Bağımlılığı ekledikten sonra projenizi senkronize edin.

### Temel Kullanım

```kotlin
// Activity veya Fragment'ınızda
val player = ChronoPlayer(context)
player.loadScene(uri)         // Uri'den yükle (assets, dosya sistemi veya URL)
player.play()
```

`player.getView()`'i düzeninize ekleyin veya XML'de doğrudan `ChronoPlayerView` tanımlayın:

```xml
<io.chorono.ChronoPlayerView
    android:id="@+id/chronoPlayer"
    android:layout_width="match_parent"
    android:layout_height="wrap_content" />
```

```kotlin
// Oynatıcıyı görünüme bağla
val playerView = findViewById<ChronoPlayerView>(R.id.chronoPlayer)
val player = playerView.getPlayer()
player.loadScene(uri)
player.play()
```

### Tam API

**Oynatma kontrolü:**

```kotlin
player.play()
player.pause()
player.stop()
player.seek(2000)               // 2000 ms'ye atla
player.setPlaybackRate(1.5f)    // 1,5x hız
```

**Durum Makinesi kontrolü:**

```kotlin
player.setParam("hiz", 10.0)  // ada göre bir Durum Makinesi parametresi ayarla
player.dispatch("zipla")       // adlandırılmış Durum Makinesi geçişini tetikle
```

**Katman kontrolü:**

```kotlin
player.setLayerVisible("arkaplan", false)  // bir katmanı ada göre göster veya gizle
```

**Olaylar:**

Olay API'si coroutine dostudur ve `lifecycleScope` ile doğal çalışır:

```kotlin
lifecycleScope.launch {
    player.onEvent { event ->
        when (event) {
            is PlayEvent     -> { /* oynatma başladı             */ }
            is PauseEvent    -> { /* oynatma duraklatıldı              */ }
            is CompleteEvent -> { /* sona ulaştı              */ }
            is SeekEvent     -> { /* event.timeMs'e atlandı       */ }
            is StateChangeEvent -> {
                val from = event.from  // önceki DM durum adı
                val to   = event.to    // yeni DM durum adı
            }
        }
    }
}
```

### Sahneleri Yükleme

Oynatıcı birden fazla kaynaktan sahne yükleyebilir:

```kotlin
// assets klasöründen
player.loadScene(context.assets.open("animasyon.json"))

// Dosya Uri'sinden
player.loadScene(Uri.fromFile(File(context.filesDir, "animasyon.json")))

// InputStream'den (ör. sunucudan indirilen)
player.loadScene(inputStream)

// URL'den (asenkron yükler)
player.loadSceneFromUrl("https://example.com/animations/giris.json")
```

### Render

| Mod | Ne Zaman Kullanılır |
|---|---|
| Android Canvas (CPU) | Tüm sahneler için varsayılan |
| OpenGL ES 3.0 (GPU) | Cihaz OpenGL ES 3.0'ı desteklediğinde GPU parçacık katmanları olan sahneler için otomatik olarak kullanılır |

CPU render'ı zorlamak için (test veya `SurfaceView`'e yerleştirme için kullanışlı):

```kotlin
val player = ChronoPlayer(context, renderMode = RenderMode.CPU)
```

### Yaşam Döngüsü Farkındalığı

`ChronoPlayer` yaşam döngüsü farkındadır. Uygulama arka plana geçtiğinde duraklayıp döndüğünde devam etmesi için Activity veya Fragment yaşam döngüsüne bağlayın:

```kotlin
lifecycle.addObserver(player)
```

Bu tek satırla oynatıcı, `ON_PAUSE`'da otomatik olarak duraklar ve `ON_RESUME`'da devam eder. `ON_DESTROY`'da tüm kaynakları serbest bırakır.

### Adaptif Kalite

Düşük özellikli cihazlarda SDK, CPU veya GPU'yu aşırı yüklemeden pürüzsüz algılanan oynatmayı sürdürmek için otomatik olarak kare atlama devreye girer. Kalite eşiğini yapılandırabilirsiniz:

```kotlin
val player = ChronoPlayer(
    context,
    qualityMode = QualityMode.ADAPTIVE  // varsayılan
    // veya her zaman tam kalite için QualityMode.HIGH
    // veya pil tasarrufu ortamları için QualityMode.LOW
)
```

---

## SDK'lar için Sahneleri Dışa Aktarma

Web veya Android SDK'da bir sahne oynatmadan önce Chorono editöründen dışa aktarın:

1. **Dosya → Dışa Aktar → Sahne JSON (.json)**'a gidin.
2. Varlıkların (resimler, fontlar) **gömülü** (`.json` içinde base64 ile kodlanmış) mı yoksa **URL ile referans verilmiş** mi (varlıklar ayrı kalır, `.json` küçük kalır) olacağını seçin.
3. **Dışa Aktar**'a tıklayın.

Dışa aktarılan dosya çalışma zamanı için optimize edilmiştir: katman kilit durumu, renk etiketleri, gizli katmanlar ve taslak notlar gibi yalnızca editöre özgü meta veriler otomatik olarak ayıklanır ve dosya olabildiğince kompakt tutulur.

**Dosyanın içerdiği:**

- Tüm katmanlar ve özellik değerleri
- Zaman çizelgesi keyframe'leri ve easing verileri
- Durum Makinesi tanımları, durumlar, geçişler ve parametreler
- Animasyon Değiştirici ayarları (sinüs, yay, zıplama vb.)
- Varlık referansları veya gömülü varlık verileri

**Tipik dosya boyutları:**

| Sahne karmaşıklığı | Gömülü varlıklar | Referanslı varlıklar |
|---|---|---|
| Basit (< 20 katman) | 10–80 KB | < 5 KB |
| Orta (20–100 katman) | 80 KB–2 MB | 5–30 KB |
| Karmaşık (100+ katman, parçacıklar) | 2–10 MB | 30–100 KB |

Üretim dağıtımları için CDN ile referanslı varlıklar önerilen yaklaşımdır: daha küçük başlangıç indirmesi, varlıklar için tarayıcı/ağ önbellekleme ve sahneyi yeniden dışa aktarmadan daha kolay varlık güncellemeleri.
