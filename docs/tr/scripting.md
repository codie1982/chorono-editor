# Betikleme

Chorono, görevleri otomatikleştirmenize, animasyonları programatik olarak oluşturmanıza ve yeniden kullanılabilir iş akışları oluşturmanıza olanak tanıyan yerleşik bir betikleme motoruna sahiptir — hepsi düz JavaScript ile. Öğrenilecek özel bir dil yoktur: JS biliyorsanız, betik yazmaya hazırsınız.

---

## Neden Betik Kullanmalı?

Görsel editör elle hazırlanmış animasyonlar için harikadır, ancak betikleme farklı bir çalışma sınıfının kilidini açar:

- **Tekrarlayan görevleri otomatikleştirin** — 50 katmanı yeniden adlandırın, şekillerin bir ızgarasını yeniden konumlandırın veya bir dizide tekdüze zamanlamayı dakikalar yerine saniyeler içinde ayarlayın.
- **Karmaşık animasyonlar oluşturun** — elle yerleştirmenin pratik olmayacağı matematiksel hassasiyetle yüzlerce keyframe oluşturun.
- **Yeniden kullanılabilir iş akışları oluşturun** — betikleri makro olarak kaydedin ve herhangi bir sahnede, herhangi bir projede yeniden oynatın.
- **Harici verilerle entegre edin** — veri odaklı animasyonlar oluşturmak için JSON, CSV veya API yanıtlarını doğrudan sahnenize besleyin.

---

## Betik Panelini Açma

1. **Pencere → Betik Paneli**'ne gidin veya **`** (backtick) tuşuna basın.
2. Panel, çalışma alanının altından kayar.
3. Soldaki editör alanına JavaScript yazın veya yapıştırın.
4. Çalıştırmak için **Çalıştır**'a tıklayın (veya **Shift+Enter** tuşuna basın).
5. Çıktı ve hatalar sağdaki konsol alanında görünür.

Editör sözdizimi vurgulamayı, parantez eşleşmesini ve çok satırlı düzenlemeyi destekler.

---

## Sahne API'si

Tüm betikleme global `scene` nesnesi üzerinden yapılır. Betik ortamında her zaman mevcuttur — içe aktarma gerekmez.

### Katman Ekleme

```javascript
const rect = scene.add('rect', {
  name: 'Kutum',
  x: 100,
  y: 100,
  width: 200,
  height: 200
})
```

Desteklenen katman türleri: `'rect'`, `'ellipse'`, `'text'`, `'image'`, `'group'`, `'spline'`, `'null'`.

Döndürülen nesne, sonraki işlemler için ihtiyaç duyduğunuz katmanın `id`'sini içerir.

### Özellikleri Güncelleme

```javascript
scene.update(rect.id, { opacity: 0.5, fill: '#FF0000' })
```

İkinci argümanda herhangi bir sayıda özellik iletin. Değişiklikler anında uygulanır ve Denetçi paneline yansıtılır.

### Katman Silme

```javascript
scene.delete(rect.id)
```

### Katmanları Sorgulama

```javascript
// Sahnedeki tüm katmanları al
const layers = scene.getLayers()

// Ada göre bul
const bg = layers.find(l => l.name === 'Arka Plan')

// Türe göre filtrele
const allText = layers.filter(l => l.type === 'text')
```

### Keyframe Ekleme

```javascript
// x'i t=0'da 0'dan t=2s'de 500'e animasyonla
scene.addKeyframe(rect.id, 'transform.x', { time: 0,    value: 0   })
scene.addKeyframe(rect.id, 'transform.x', { time: 2000, value: 500 })
```

`time` alanı milisaniye cinsindendir. `value` bir sayı, dize (renkler için) veya dizi (konum gibi çok bileşenli özellikler için) olabilir.

Keyframe başına easing fonksiyonunu da ayarlayabilirsiniz:

```javascript
scene.addKeyframe(rect.id, 'opacity', {
  time: 1000,
  value: 0,
  easing: 'easeInOutCubic'
})
```

### Zaman Çizelgeleriyle Çalışma

```javascript
// Yeni bir zaman çizelgesi oluştur
const timeline = scene.createTimeline({ duration: 5000, name: 'Giriş' })

// Aktif zaman çizelgesini ayarla
scene.setActiveTimeline(timeline.id)

// Geçerli oynatma başlığı zamanını al (ms)
const now = scene.getCurrentTime()
```

---

## Geri Al / Yinele

Sahne API'si aracılığıyla gerçekleştirdiğiniz her işlem tam olarak geri alınabilir. Chorono her çağrıyı geri alınabilir bir komuta sarar, bu nedenle **Ctrl+Z** (veya Mac'te **Cmd+Z**) betik eylemlerini manuel düzenlemeler gibi tersine çevirir.

Birden fazla işlemi tek bir geri alma adımında gruplamak isterseniz:

```javascript
scene.beginUndoGroup('Toplu işlemim')

scene.add('rect', { name: 'A', x: 0,   y: 0 })
scene.add('rect', { name: 'B', x: 100, y: 0 })
scene.add('rect', { name: 'C', x: 200, y: 0 })

scene.endUndoGroup()
// Ctrl+Z artık üç dikdörtgeni de bir anda kaldırır
```

---

## Olay Sistemi

Betikler gerçek zamanlı olarak sahne olaylarını dinleyebilir. Bu, reaktif araçlar oluşturmak veya editörde bir şey değiştiğinde mantık tetiklemek için kullanışlıdır.

```javascript
// Herhangi bir katman eklendiğinde tetikle
scene.on('layer:added', (layer) => {
  console.log('Yeni katman:', layer.name)
})

// Bir katmanın özellikleri değiştiğinde tetikle
scene.on('layer:updated', (layer, changes) => {
  console.log('Değişti:', changes)
})

// Seçim değiştiğinde tetikle
scene.on('selection:changed', (selectedIds) => {
  console.log('Seçildi:', selectedIds)
})

// Bir katman silindiğinde tetikle
scene.on('layer:deleted', (layerId) => {
  console.log('Silinen katman id:', layerId)
})

// Oynatma durumu değiştiğinde tetikle
scene.on('playback:stateChange', (state) => {
  // state 'playing', 'paused' veya 'stopped'
})

// Artık ihtiyaç duymadığınızda dinleyiciyi kaldırın
const handler = (layer) => console.log(layer.name)
scene.on('layer:added', handler)
scene.off('layer:added', handler)
```

Betik Panelinde kayıtlı olay dinleyicileri, paneli kapatana veya sahneyi yeniden yükleyene kadar devam eder.

---

## Pratik Örnekler

### Kademeli kayan 10 daire oluştur

```javascript
for (let i = 0; i < 10; i++) {
  const circle = scene.add('ellipse', {
    name: `Daire ${i + 1}`,
    x: 80 + i * 90,
    y: 300,
    width: 60,
    height: 60,
    fill: `hsl(${i * 36}, 80%, 55%)`
  })

  const delay = i * 150  // her daire için 150ms gecikme

  scene.addKeyframe(circle.id, 'opacity', { time: delay,       value: 0 })
  scene.addKeyframe(circle.id, 'opacity', { time: delay + 400, value: 1, easing: 'easeOutQuad' })
}
```

### Tüm katmanları önek ile toplu yeniden adlandır

```javascript
const prefix = 'SAHNE_01_'

scene.getLayers().forEach(layer => {
  scene.update(layer.id, { name: prefix + layer.name })
})
```

### Katmanları canvas boyunca eşit olarak otomatik dağıt

```javascript
const { width: canvasWidth } = scene.getCanvasSize()
const selected = scene.getSelectedLayers()

if (selected.length < 2) {
  console.log('Önce en az 2 katman seçin.')
} else {
  const step = canvasWidth / (selected.length + 1)

  selected.forEach((layer, i) => {
    scene.update(layer.id, { x: step * (i + 1) })
  })
}
```

### Şekil ızgarası oluştur

```javascript
const cols = 6
const rows = 4
const cellW = 120
const cellH = 120
const startX = 60
const startY = 60

scene.beginUndoGroup('Izgara oluştur')

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    scene.add('rect', {
      name: `Hücre_${row}_${col}`,
      x: startX + col * cellW,
      y: startY + row * cellH,
      width: 100,
      height: 100,
      fill: `hsl(${(row * cols + col) * 15}, 70%, 60%)`
    })
  }
}

scene.endUndoGroup()
```

---

## Betik Aracılığıyla Animasyon Değiştiriciler

Animasyon Değiştiricileri, keyframe değerlerinin üstüne prosedürel sinyaller uygulamanızı sağlar. Hassas kontrol için bunları betik aracılığıyla ekleyip yapılandırabilirsiniz.

```javascript
// Bir katmanın Y konumuna sinüs dalgası uygula
scene.addModifier(rect.id, 'transform.y', {
  type: 'sine',
  amplitude: 30,    // piksel cinsinden tepe sapma
  frequency: 0.5,   // saniyedeki döngü sayısı
  phase: 0          // radyan cinsinden ofset
})

// Opaklığa nabız (kare dalga) uygula
scene.addModifier(rect.id, 'opacity', {
  type: 'pulse',
  low: 0,
  high: 1,
  frequency: 2
})

// Titreşik, kare kare his için nicel gürültü
scene.addModifier(rect.id, 'transform.x', {
  type: 'quantizeNoise',
  amplitude: 10,
  frequency: 8,
  steps: 4
})
```

### Fizik Değiştiricileri

```javascript
// Yay: aşar ve yerleşir
scene.addModifier(rect.id, 'transform.y', {
  type: 'spring',
  stiffness: 200,
  damping: 12,
  mass: 1
})

// Zıplama: yerçekimi + zemin zıplaması simüle eder
scene.addModifier(rect.id, 'transform.y', {
  type: 'bounce',
  gravity: 980,
  restitution: 0.6   // 0 = zıplama yok, 1 = mükemmel zıplama
})

// Elastik: hızlı aşma
scene.addModifier(rect.id, 'transform.x', {
  type: 'elastic',
  amplitude: 50,
  period: 0.3
})
```

Değiştirici kaldırma:

```javascript
scene.removeModifiers(rect.id, 'transform.y')
```

---

## Betik Çalıştırma

**Betik Paneli** — tek seferlik betikler yazmanın ve çalıştırmanın birincil yolu. Backtick tuşuyla açın ve **Çalıştır**'a tıklayın.

**AI Asistanı** — Chorono'nun yerleşik AI'sını kullanarak sahnenizde değişiklik yaptığınızda, dahili olarak `run_script` aracılığıyla aynı `scene` betikleme API'sini kullanır. AI'nın çalıştırdığını Betik Panelinin geçmiş sekmesinde inceleyebilirsiniz.

**Kaydedilmiş Betikler** — Betik Panelinde bir betik adı vermek için **Kaydet** düğmesine tıklayın. Kaydedilmiş betikler **Pencere → Betikler**'de görünür ve **Düzenle → Klavye Kısayolları** aracılığıyla klavye kısayollarına atanabilir.

---

## Makro Kayıt

Makro kayıt, bir dizi manuel editör eylemini yakalamanıza ve yeniden kullanılabilir betik olarak dışa aktarmanıza olanak tanır.

1. Betik Panelini açın ve **Kaydet**'e tıklayın.
2. Editörde eylemlerinizi gerçekleştirin: katman ekleyin, şeyleri taşıyın, keyframe'ler ayarlayın vb.
3. **Kaydı Durdur**'a tıklayın.
4. Panel oluşturulan JavaScript'i gösterir. İnceleyin, düzenleyin ve kaydedin.

Kayıtlı makrolar tam olarak düzenlenebilir — daha karmaşık otomasyon için başlangıç noktası olarak kullanın.

---

## Konsol ve Hata Ayıklama

Betik Panelinin sağ yarısı konsoldur:

- `console.log()`, `console.warn()` ve `console.error()` hepsi buraya yazar.
- Çalışma zamanı hataları bir yığın izlemesiyle ve editörde vurgulanan hatalı satırla gösterilir.
- Konsol çıktısını sıfırlamak için **Temizle**'ye tıklayın.
- Önceki betikleri geri çağırmak ve yeniden çalıştırmak için **Geçmiş**'i (saat simgesi) kullanın.
