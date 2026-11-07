export const mockRoot = '/homepage-mock'

export type ArtKind = 'orbit' | 'success' | 'type' | 'loader' | 'chart' | 'bell' | 'character' | 'particles'
export type Sample = {
  slug: string
  title: string
  category: string
  kind: ArtKind
  tone: string
  description: string
  use: string
  duration: string
  previewVideo?: string
  projectUrl?: string
}

export const samples: Sample[] = [
  { slug: 'orbital-dongu', title: 'Orbital döngü', category: 'Soyut', kind: 'orbit', tone: 'ink', description: 'Yörüngeler, geometrik formlar ve kesintisiz bir hareket. Açılış ekranlarına ritim katan soyut bir kompozisyon.', use: 'Web sitesi açılışları, ürün tanıtımları ve bekleme ekranları.', duration: '6 sn' },
  { slug: 'basarili-islem', title: 'Küçük bir kutlama', category: 'Arayüz', kind: 'success', tone: 'mint', description: 'Bir işlemin tamamlandığını anlaşılır bir onay işareti ve küçük bir kutlamayla gösteren arayüz fikri.', use: 'Form gönderimleri, tamamlanan görevler ve ödeme onayları.', duration: '3 sn' },
  { slug: 'kinetik-tipografi', title: 'Kelimeler hareketlenir', category: 'Tipografi', kind: 'type', tone: 'lilac', description: 'Kısa mesajları ritim, ölçek ve tipografik hiyerarşiyle öne çıkaran hareketli başlık çalışması.', use: 'Kampanya başlıkları, ürün açılışları ve sosyal içerikler.', duration: '4 sn' },
  { slug: 'nokta-yukleyici', title: 'Beklemeye biraz ritim', category: 'Arayüz', kind: 'loader', tone: 'peach', description: 'Birbiriyle uyum içinde hareket eden noktalar, yükleme durumuna sade ve tutarlı bir görsel dil kazandırır.', use: 'Veri yükleme, arama sonuçları ve uygulama geçişleri.', duration: '2 sn' },
  { slug: 'buyume-grafigi', title: 'Veri de hikâye anlatır', category: 'İnfografik', kind: 'chart', tone: 'blue', description: 'Sütunların sıralı hareketiyle değişimi görünür kılan bir veri görselleştirme çalışması.', use: 'Analiz panelleri, raporlar ve ürün sunumları.', duration: '4 sn' },
  { slug: 'bildirim-zili', title: 'Hey, bir haber var!', category: 'Arayüz', kind: 'bell', tone: 'butter', description: 'Dikkati doğru anda çeken, kısa bir salınımla yeni bir bildirimi haber veren ikon çalışması.', use: 'Bildirim merkezleri, hatırlatıcılar ve uygulama içi geri bildirim.', duration: '2 sn' },
  { slug: 'merhaba-karakter', title: 'Yeni arkadaşınla tanış', category: 'Karakter', kind: 'character', tone: 'rose', description: 'Yumuşak formlar ve küçük bir selamla karşılama deneyimine kişilik katan bir maskot fikri.', use: 'Karşılama akışları, boş durum ekranları ve yardım alanları.', duration: '4 sn' },
  { slug: 'parcacik-oyunu', title: 'Biraz yaratıcı kaos', category: 'Soyut', kind: 'particles', tone: 'lemon', description: 'Bir merkez etrafında buluşan renkli geometrik parçalarla döngüsel bir kompozisyon.', use: 'Yaratıcı portfolyolar, geçişler ve marka anlatımları.', duration: '5 sn' },
]

export const categories = ['Tümü', 'Arayüz', 'Soyut', 'Tipografi', 'Karakter', 'İnfografik']

export type Story = {
  slug: string
  category: string
  title: string
  description: string
  time: string
  kind: ArtKind
  tone: string
  sections: { title: string; text: string }[]
}

export const stories: Story[] = [
  {
    slug: 'arayuz-animasyonu-nereden-baslamali', category: 'Tasarım rehberi', title: 'Arayüz animasyonu: nereden başlamalı?', description: 'Doğru anda, doğru miktarda hareket. Mikro etkileşimleri anlamlı kılmak için bir başlangıç rehberi.', time: '5 dk okuma', kind: 'success', tone: 'mint',
    sections: [
      { title: 'Önce hareketin görevini belirle', text: 'İyi bir arayüz animasyonu, kullanıcının yaptığı bir işlemin sonucunu anlamasına yardım eder. Bir düğmeye basıldığında işlemin başladığını, bir form gönderildiğinde tamamlandığını veya yeni bir panel açıldığında içeriğin nereden geldiğini gösterebilir. Tasarıma başlamadan önce tek bir soruyu yanıtla: Kullanıcı bu hareket sayesinde neyi daha iyi anlayacak?' },
      { title: 'Küçük bir akış seç', text: 'İlk çalışmada bütün uygulamayı hareketlendirmek yerine bir yükleme durumu veya başarı mesajı seç. Başlangıç, işlem ve sonuç durumlarını ayrı ayrı tasarla. Başarı işaretinin yanında “İşlem tamamlandı” gibi görünür bir metin kullan. Böylece yalnızca harekete veya renge bağlı olmayan bir geri bildirim oluşturursun.' },
      { title: 'Zamanlamayı bağlamda değerlendir', text: 'Bir onay işaretinin süresi ile açıklayıcı bir sahnenin süresi aynı ihtiyacı karşılamaz. Hareketi gerçek ekranda, diğer içeriklerle birlikte izle. Kullanıcının bir sonraki işlemini geciktiren veya dikkati sürekli üzerine çeken döngüleri sadeleştir. Aynı etkileşim tekrarlandığında hareketin hâlâ rahat hissettirdiğini kontrol et.' },
      { title: 'Hareket olmadan da anlaşılır olsun', text: 'Azaltılmış hareket tercihini destekle ve otomatik oynayan örnekler için durdurma kontrolü sun. Klavye odağını görünür tut. Onay, hata ve yükleme durumlarını metinle ifade et. Son kontrolü mobil ekranda yap: Animasyon içerikten daha baskınsa boyutunu veya tekrar sıklığını azalt.' },
    ],
  },
  {
    slug: 'keyframe-ve-easing-rehberi', category: 'Animasyon temelleri', title: 'İki keyframe arasında neler olur?', description: 'Hızlanma, yavaşlama ve ritim: bir hareketin hissini değiştiren easing eğrilerini keşfet.', time: '6 dk okuma', kind: 'orbit', tone: 'lilac',
    sections: [
      { title: 'Başlangıç ve bitişi tanımla', text: 'Keyframe, bir özelliğin belirli bir andaki değerini kaydeder. Bir nesnenin soldan sağa gitmesi için başlangıç konumunu ve bitiş konumunu tanımlayabilirsin. Animasyon sistemi bu iki değer arasındaki geçişi hesaplar. Konumun yanında ölçek, dönüş ve opaklık gibi özellikler de bir hareketin parçası olabilir.' },
      { title: 'Hızın dağılımını seç', text: 'Aynı mesafe ve aynı süre, farklı bir hız dağılımıyla bambaşka hissedebilir. Doğrusal geçiş sabit hız verir. Yavaşlayarak biten bir hareket, nesnenin yerine yerleşmesini vurgular. Yavaş başlayan bir hareket ise ayrılış hissini güçlendirebilir. Eğriyi seçerken bir fizik gösterisi kurmak yerine sahnenin amacını düşün.' },
      { title: 'Hareketleri sıraya koy', text: 'Bütün öğelerin aynı anda hareket etmesi görsel hiyerarşiyi zayıflatabilir. Önce ana nesneyi, ardından açıklayıcı öğeleri göster. Gecikmeleri küçük tut ve son öğenin görünmesi için kullanıcının uzun süre beklemesini önle. Önce tek bir nesneyle çalışmak, zamanlamanın etkisini daha kolay fark etmene yardım eder.' },
      { title: 'Döngünün birleşme noktasına bak', text: 'Döngüsel bir sahnede son kareden ilk kareye geçiş de hareketin bir parçasıdır. Konum ve hızda ani bir sıçrama olup olmadığını kontrol et. Sahneyi birkaç kez izle, ardından yavaş oynatarak geçişleri incele. Düzenlenebilir bir projede anahtar kareleri korumak, sonraki zamanlama değişikliklerini kolaylaştırır.' },
    ],
  },
  {
    slug: 'ai-ajanlariyla-animasyon', category: 'Chorono ile üret', title: 'Bir fikir, bir AI ajanı, düzenlenebilir bir sahne.', description: 'Claude veya Codex ile Chorono iş akışını ve kontrol edebileceğin bir animasyon brief’ini tanı.', time: '4 dk okuma', kind: 'particles', tone: 'peach',
    sections: [
      { title: 'Çıktıyı en başta tarif et', text: 'Bir AI ajanıyla animasyon üretirken sahnenin amacı, boyutu, süresi ve hedef kullanım alanını belirt. “Bir yükleyici yap” yerine, hangi ekranda kullanılacağını ve nasıl bir his vermesini istediğini anlat. Renk, metin ve döngü davranışı gibi kısıtlar, sonucun değerlendirilmesini kolaylaştırır.' },
      { title: 'Editör bağlantısını doğrula', text: 'Chorono yerel bir editör ve MCP bağlantısıyla çalışabilir. Kurulum rehberindeki adımları izledikten sonra editörün tarayıcıda açık ve ajana bağlı olduğunu doğrula. Yalnızca web adresinin açılması, bağlantının tamamlandığı anlamına gelmez. Ajan mevcut sahneyi okuyarak çalışmaya başlamalıdır.' },
      { title: 'Önizlemeye göre düzelt', text: 'İlk taslaktan sonra başlangıç, orta ve bitiş anlarını gözden geçir. Nesnelerin çakışması, metinlerin okunurluğu ve döngü geçişi gibi somut noktalara odaklan. “Daha güzel olsun” yerine “Başlık göründükten sonra ikon gelsin” gibi bir değişiklik iste. Her turda küçük bir sorunu çözmek, sonucu karşılaştırmayı kolaylaştırır.' },
      { title: 'Projeyi düzenlenebilir olarak sakla', text: 'Sonucu yalnızca bir video olarak düşünme. Katmanları, zaman çizelgelerini ve anahtar kareleri içeren taşınabilir proje, ileride rengi veya metni değiştirmeni sağlar. Dışa aktarmadan önce projeyi doğrula ve kaydet. Farklı bir uygulamada kullanacaksan ilgili oynatıcı ve biçim desteğini ayrıca kontrol et.' },
    ],
  },
]

export const useCases = [
  { slug: 'web-siteleri', title: 'Web siteleri', description: 'İlk bakışta bir fark yarat. Açılışlardan etkileşimli detaylara.', kind: 'orbit' as ArtKind, tone: 'lilac', category: 'Soyut' },
  { slug: 'urun-arayuzleri', title: 'Ürün arayüzleri', description: 'Yüklemeleri, onayları ve küçük anları daha anlaşılır kıl.', kind: 'success' as ArtKind, tone: 'mint', category: 'Arayüz' },
  { slug: 'hikaye-anlatimi', title: 'Hikâye anlatımı', description: 'Bir fikri hareketle anlat. Başlıklara ve verilere ritim kat.', kind: 'type' as ArtKind, tone: 'peach', category: 'Tipografi' },
]

export const faqs = [
  { question: 'Chorono nedir?', answer: 'Chorono; katmanlar, zaman çizelgeleri, anahtar kareler ve parçacıklarla çalışabileceğin açık kaynaklı bir 2D animasyon editörüdür. Yerel kurulumla tarayıcıda çalışır; Claude veya Codex gibi AI ajanları MCP üzerinden düzenlenebilir sahneler oluşturabilir.' },
  { question: 'Buradaki örnekleri nasıl kullanabilirim?', answer: 'Bu tasarım mock’unda kartlar görsel önizlemelerdir. Her örneğin detay sayfasını inceleyebilir, kullanım alanını görebilir ve editörü açabilirsin. Gerçek Chorono proje dosyaları bağlandığında örnekler bu yapı üzerinden sunulabilir; mock şu anda proje içe aktarmıyor.' },
  { question: 'Animasyon oluşturmak için kod yazmam gerekiyor mu?', answer: 'Chorono görsel düzenleme araçları sunar. Ayrıca bir AI ajanına sahneyi tarif ederek MCP üzerinden çalışabilirsin. Yerel kurulumu ve ajan bağlantısını yapmak için kurulum rehberini takip etmen gerekir.' },
  { question: 'Projeler sonradan düzenlenebilir mi?', answer: 'Evet. Chorono iş akışında katmanları, zaman çizelgelerini ve anahtar kareleri koruyarak taşınabilir proje kaydedebilirsin. Kaydettiğin projeyi tekrar açarak üzerinde çalışmaya devam edebilirsin.' },
]
