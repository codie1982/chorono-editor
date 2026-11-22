# 3D sahne kameraları ve ışıkları

3D viewport'un sol üstündeki **Add** menüsü dikeydir. Camera satırı
Perspective/Orthographic; Light satırı Directional/Point/Spot seçeneklerini
yana açar. Nesneler oluşturulunca 3D Scene Explorer'da kendi tür gruplarında
görünür, seçilir, yeniden adlandırılır, gizlenir, dondurulur ve silinir.

## Kaynak ve veri akışı

- `src/lib/model3d/source/modelSceneObjects.ts`, `Model3DData.sceneObjects`
  içindeki kararlı ID'li kamera ve ışık kayıtlarının sözleşmesini, doğrulamasını
  ve immutable komutlarını sağlar. Konum ve hedef **Y-up dünya metresi**, FOV ve
  roll derecedir. Camera nesnesi konum + hedef ile saklanır; viewport orbit
  değerleri yalnız bir görünüm dönüşümüdür. Runtime Three nesneleri kaydedilmez.
- `src/lib/model3d/render/ModelSceneObjectView.ts` editör işaretçilerini ve
  sahne ışıklarını kurar. İşaretçiler yalnız inspection çizimindedir; GLB'ye
  girmez. Kurulum kendi küçük geometri ve materyallerini sonraki yapılandırmada
  veya `dispose` sırasında serbest bırakır.
- `ModelComposition.configure` inspection kamerasını viewport için kullanır.
  Inspection yoksa etkin ve çıktıya açık sahne kamerasından çıktı pozu türetir.
  `exportGlb` bu kamerayı ve oluşturulmuş punctual ışıkları taşır. Add edilmiş
  en az bir çıktı ışığı varsa eski varsayılan key light ikinci kez eklenmez.
- `ModelRenderPanel` render için gerçek, etkin bir Camera nesnesi ister. Kamera
  seçici aynı sceneObjects kaydındaki `activeCameraId` alanını değiştirir.
  Etkin kamera silinirse bir sonraki kamera seçilir; kamera kalmazsa Render
  düğmesi devre dışı kalır. Eski dosyalardaki `data.camera` ve `data.lighting`
  alanları geriye dönük kompozisyon görünümü için korunur ve sahte Scene
  Explorer satırı üretmez.

## Kısa kullanım

1. 3D editörde **Add → Camera → Perspective** ile kamera ekleyin. Oluşan ilk
   kamera etkin çıktı kamerası olur. Birden fazla varsa Render panelinde
   **Scene camera** seçicisinden istediğinizi belirleyin.
2. **Add → Light → Point** ile ışık ekleyin. Scene Explorer'da nesneyi seçip
   Properties içinde konum, renk ve şiddeti düzenleyin.
3. Render alanında **Render frame** seçilen sahne kamerasından GLB üretir ve
   yerel Chorono Render servisine gönderir. Viewport grid ve seçim işaretçileri
   çıktıya eklenmez.

Eski dosyalar açılırken otomatik nesne oluşturulmaz. Böyle bir dosyada render
almak için Add menüsünden Camera ekleyin veya Viewport settings içindeki
**Use view for output** ile mevcut görünümden sahne kamerası oluşturun.
