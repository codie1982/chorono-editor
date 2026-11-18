# Açılışta sürüm notları

`src/components/releaseNotes` editörün sürüm duyurusunu yönetir. `page.tsx` önce karşılama ekranının tarayıcı tercihlerini okumasını bekler. Karşılama ekranı kapandıktan sonra `useReleaseNotes`, uygulama sürümüyle `featuredReleaseNotes.version` eşleşiyorsa `chorono.releaseNotes.lastShownVersion` değerini tarayıcıdaki `localStorage` alanına yazar ve native sürüm notları penceresini açar. Aynı sürüm bu tarayıcı origin'inde yeniden otomatik açılmaz. Kaydedilemeyen durumda tekrar tekrar pencere göstermemek için otomatik açılış atlanır.

Pencere sahneyi, Undo geçmişini ve proje dosyasını değiştirmez. File → Help → What’s New seçeneği notları her zaman elle açar. Karşılama ve tanılama izni pencereleriyle aynı anda açılmaz. Escape, kapatma düğmesi ve Open editor pencereyi kapatır; bağlantılar GitHub sürüm notlarını yeni sekmede açar.

Yeni sürümde `releaseNotes.ts` içindeki sürüm numarası, başlık ve bağlantıları, `ReleaseNotesDialog.tsx` içindeki kısa maddeleri yayımlanan sürüm notlarıyla birlikte güncelleyin. Sürüm numarası `package.json` ile eşleşmeden yeni otomatik duyuru açılmaz. Tek seferlik depolama sözleşmesi `releaseNotes.test.ts` içinde doğrulanır.
