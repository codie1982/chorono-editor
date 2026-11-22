# 3D Texture / Material ilk uygulaması

3D editörün **Texture / Material** çalışma alanı, seçili primitive veya içe aktarılan glTF parçasının materyalini sağdaki Properties panelinde gösterir. Giriş noktaları `ModelPrimitiveInspector`, `ModelNodeInspector` ve ortak `ModelMaterialPanel` bileşenidir. Düzenlemeler model detay taslağının doğrulanmış kaynak değişikliğidir; Apply ile sahneye geçer, yerel geçmiş ve ana Undo ile geri alınır. Editör seçimi materyal kaydına yazılmaz.

## Veri akışı ve sahiplik

- Kaynak sözleşmesi `src/lib/model3d/material/pbrSurface.ts` içindedir. Renk, metalness, roughness, opacity, emission, normal/AO kuvveti, alpha mode/cutoff ve çift taraflı yüzler taşınır. Primitive'lerde `modeling.objects[].color` eski animasyon yolunu korur; isteğe bağlı `material` alanı diğer faktörleri saklar. Eski v4 kaynakları, önceki mat görünümüyle açılır. Bütün değerler kayıttan ve renderer tahsisinden önce doğrulanır.
- İçe aktarılan materyaller `content.instances[].materials` içinde varlık revizyonuna bağlı olarak kalır. Bu kayıt artık base color, normal, metallic, roughness, occlusion ve emission doku indekslerini taşıyabilir. Doku indeksleri glTF'nin gömülü görüntülerini işaret eder; sRGB renk kanalları ile linear veri kanalları ayrı doğrulanır. Dosya yeniden açıldığında aynı varlık revizyonu ve indeksler kullanılır.
- `prepareModelSource` orijinal Three/glTF kaynaklarından yalnız serileştirilebilir materyal ve doku envanterini çıkarır. `ModelPose` materyal kopyalarını kendisi yönetir, gömülü doku ve geometriyi prepared source'dan ödünç alır. `PrimitiveScene` materyali ve geometriyi kendisi yönetir. İki renderer yolu `applyPbrSurface` üzerinden aynı sayısal ve alpha kurallarını kullanır. Viewport ve çıktı aynı `ModelComposition` değerlendirmesini kullanır.

## Kullanım

3D sahnede Box ekleyin, nesneyi seçip **Texture / Material** alanına geçin. Surface bölümünde Metallic/Roughness, Emission & lighting bölümünde ışık yayımı, Transparency & faces bölümünde Mask/Blend ve çift taraflı görünüm ayarlanır. İçe aktarılan dokulu glTF seçildiğinde Textures bölümünde mevcut gömülü doku uygun renk uzayındaki kanala atanır. Doku bulunmuyorsa panel bunu belirtir.

Bu ilk uygulama yeni resim yükleme, primitive'e resim atama, UV düzenleme, materyal kütüphanesi/instance paylaşımı veya node tabanlı shader içermez. glTF dokuları kaynak UV'lerini korur; bir doku kanalındaki değişiklik yalnız seçili materyal örneğine uygulanır. İleri PBR ve doku varlık mimarisi `Chorono_PBR_Material_Texture_Teknik_Mimari_v1.docx` içindeki sonraki aşamalardır; belge önerileri uygulanmış API sayılmaz.
