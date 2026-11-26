# SceneCanvas modülerleştirme planı

18 Kasım 2026 · Durum: öneri; uygulama başlamadı.

## Amaç ve mevcut sınır

`src/components/SceneCanvas.tsx` yaklaşık 1.976 satırda viewport durumunu,
pointer yönlendirmesini, gesture başlangıçlarını, seçili frame hesabını ve
overlay/menü JSX'ini birlikte koordine ediyor. Özellikle `handleCanvasPointerDown`
birçok aracın önceliğini belirliyor; transform başlangıçları aynı editor
transaction ve `useCanvasDrag` oturumuna bağlanıyor. Bu yoğunluk, bir aracın
değişiminin başka bir aracın input veya çizim sırasını etkilemesini kolaylaştırıyor.

Var olan sorumluluk sahipleri yeniden kurulmayacak: `useCanvasDrag` ve
`hooks/drag/*` preview/commit akışını, `PointerGestureSession` native pointer
ömrünü, `lib/canvas/math/*` geometriyi, `useSelectionTools` alan seçimini,
`useSplineDrawing` çizimi, `useCanvasRenderer` boyamayı ve `buildCanvasMenu`
menü yapısını zaten yönetiyor. Yeni dosyalar bunların adapter'ları olacak.

Bu çalışma bir refaktördür. `SceneCanvas` dış `Props` sözleşmesi, sahne JSON'u,
komutların/undo'nun anlamı, timeline saatleri, kısayollar ve desteklenen araçlar
aynı kalır. `page.tsx` içinde ikinci bir viewport state sahibi kurulmaz.

## Korunacak davranışlar

- Authored `scene` komut ve transaction kaynağıdır; `displayScene`, font
  projeksiyonu ve runtime override'ları yalnız görüntü/hit-test hesabına girer.
- Client/CSS px → canvas rect → composition px → parent/local dönüşümü bir kez
  yapılır. Pan, zoom, DPR ve layout değişimi gesture sırasında kayma yaratmaz.
- Body/axis move, resize, rotation, anchor ve çoklu seçim aynı gesture
  başlangıcı → preview → son örnek → tek commit/undo yolunu kullanır. No-op
  history üretmez; iptal source'u korur.
- Pointer önceliği (pan, Array, shape placement, motion, path pick,
  spline/selection araçları, runtime preview, path/spline edit, layer pick)
  ve right-click/double-click semantiği korunur.
- Overlay DOM sırası, pointer-events/capture sahipliği, görünürlük koşulları,
  gerçek renderer çıktısı ve menüdeki enabled/disabled durumları korunur.

## Hedef modül sınırları

| Sahip | Sorumluluk | Mevcut kullanım |
| --- | --- | --- |
| `SceneCanvas.tsx` | Dış API, alt modülleri bağlama ve viewport kök DOM'u | Sayfa entegrasyonu |
| `canvas/hooks/useCanvasFrame.ts` | Aktif authoring saati, timeline/runtime override birleşimi ve görüntü için font projeksiyonu | `evaluateTimelines`, `evaluateTrajectoryFrame`, `projectFrameFonts` |
| `canvas/hooks/useSelectionFrame.ts` | Drag override'larıyla canlı seçili geometri, bounds, world matrix ve gizmo görünürlüğü | `selectionGeometry`, `createLayerWorldBoundsResolver`, `useSelectionMeasurements` |
| `canvas/hooks/useTransformGestureStart.ts` | Body/off-artboard/gizmo pointer-down başlangıçları; önkoşul ve başlangıç snapshot'ı | `prepareTransformTargets`, `useCanvasDrag.startDrag` |
| `canvas/hooks/useCanvasPrimaryPointer.ts` | Canvas primary pointer-down araç önceliği ve hit-test yönlendirmesi | `useSelectionTools`, `usePathEdit`, `useSplineDrawing`, mevcut hit-test |
| `canvas/hooks/useCanvasHover.ts` | rAF ile sınırlı hover ve cleanup | Mevcut hit-test ve seçme politikası |
| `canvas/hooks/useCanvasContextActions.ts` | Right-click/double-click hedefi, spline context ve mevcut menü adapter'ı | `buildCanvasMenu`, mevcut `ContextMenu` |
| `canvas/overlays/CanvasToolOverlays.tsx` | Motion/path/Array ve çizim preview'larının sıralı yerleşimi; eylemleri mevcut owner'lara iletir | `MotionPathOverlay`, `PathGuideOverlay`, `ArrayViewportOverlay` |
| `canvas/overlays/CanvasSelectionOverlays.tsx` | Hover, seçili frame, gizmo, snap guide ve HUD yerleşimi | Var olan küçük overlay bileşenleri |
| `canvas/controls/CanvasViewportControls.tsx` | Zoom/fit/view/snap kontrol JSX'i | `useZoomAndPan`, var olan kontrol bileşenleri |
| `canvas/controls/CanvasContextMenus.tsx` | Mevcut menü öğelerini ve açık/kapalı durumunu render etme | `ContextMenu`, `buildCanvasMenu` |

Bu adlar uygulama sırasında mevcut owner ile çakışma görülürse uyarlanabilir;
her modülün tek işi ve bağımlılık yönü korunmalıdır. Hook'lara tüm
`SceneCanvas` props'larını veya gevşek bir `context` nesnesini geçirmek yerine
gereken değer ve callback'ler açık, tipli bir arayüzle verilir. Mutable gesture
state'i bir owner'da kalır; aynı bilgiyi yeni React state'e kopyalamayız.

## Uygulama sırası

1. **Görünümü ayır.** Önce overlay gruplarını ve viewport kontrol/menülerini
   çıkar. Mevcut canvas elemanı, native handler ve ref sahibi `SceneCanvas`
   içinde kalır. Overlay çocuklarının mevcut eylem callback'leri kendi
   owner'larına gider. JSX sırası ve CSS/pointer-events özellikleri
   karşılaştırılır. Bu aşama input mantığını değiştirmez.
2. **Frame okumasını ayır.** Timeline/runtime override ve font projeksiyonunu
   `useCanvasFrame` içine; drag overlay, seçili bounds/matrix ve ölçümleri
   `useSelectionFrame` içine taşı. Aynı evaluated frame, kaynak/görüntü ayrımı
   ve memoization bağımlılıkları korunur. Büyük sahnede yeni tam-sahne hesap
   veya her pointer move'da yeni indeks eklenmez.
3. **Gesture başlangıçlarını ayır.** `beginMoveForSelection`, off-artboard
   başlangıcı ve resize/scale/rotate/anchor handler'larını
   `useTransformGestureStart` içinde topla. Hook yalnız geçerli başlangıç
   snapshot'ını hazırlar ve mevcut `useCanvasDrag` transaction/oturumuna
   teslim eder; preview, snapping ve commit algoritmalarını kopyalamaz.
4. **Pointer ve menü yönlendirmesini ayır.** `handleCanvasPointerDown` sırasını
   `useCanvasPrimaryPointer` içinde birebir koru. Hover ve context/double-click
   davranışlarını kendi owner'larına taşı. Öncelik sırasını açıklayan küçük
   karar tablosu ve farklı araçlar için gerçek mounted etkileşim kontrolleri
   ekle; yeni genel amaçlı event bus kurma.
5. **Host'u sadeleştir.** Kullanılmayan ref/import'ları kaldır, modül
   arayüzlerini belgele ve `SceneCanvas` içinde yalnız bağlama kodu bırak.
   Fonksiyon veya hook başka bir mini `SceneCanvas` haline geldiyse sorumluluğa
   göre böl; sırf satır sayısı için forwarding katmanı ekleme.

Her aşama ayrı, incelenebilir değişiklik olarak tamamlanır. Bir aşama kabul
edilmeden sonraki gesture sınırına geçilmez. Var olan kullanıcı değişiklikleri
ve ilgisiz dosyalar bu plana dahil değildir.

## Doğrulama ve bitiş ölçütü

Her aşamada ilgili unit/integration testleri ve TypeScript kontrolü çalışır.
Uygulama değişikliği tamamlandığında, çalışan Next sunucusu durdurulduktan
sonra `npm test`, `npm run mcp:build` ve `npm run build` çalıştırılır. Görsel
ve input aşamalarında gerçek `SceneCanvas` kullanan browser fixture'ları
(`browser-viewport-interactions`, `browser-pointer-release`,
`browser-clone-interactions`, `browser-array-interactions`,
`browser-motion-keys`, `browser-shape-placement`) ilgili senaryolar için
çalıştırılır; temsilî zamanlarda gerçek görüntü incelenir. Synthetic pointer
kontrolünün fiziksel fare testinin yerini tutmadığı ayrıca belirtilir.

Kabul matrisi en azından pan sonrası ilk hareket, no-op click, Escape/blur/
pointercancel, parent+child çoklu seçim, farklı parent'lar, animasyonlu parent,
keyed layer, clone/Array/shape/motion araç geçişi, gizmo ve artboard dışı
drag, zoom/DPR, right-click ve double-click'i kapsar. Her senaryoda görsel
preview ile release sonucu, source ID'leri, tek undo/redo ve listener cleanup
karşılaştırılır. Özellikle render/overlay değişimlerinde yalnız değer testiyle
yetinilmez.

Bitmiş sayılması için `SceneCanvas` bir koordinasyon bileşeni olmalı; giriş
önceliği, gesture sahibi, frame verisi ve sunum sınırları dosya yapısı ve
JSDoc'tan anlaşılmalı. Yeni/etkilenen modüller repository'nin sorumluluk,
belgelendirme ve makul boyut kurallarına uymalı. Sayfa API'si ve portable
dosya/undo davranışı değişmemeli; varsa sınırlamalar değişiklik açıklamasında
açıkça kaydedilmeli.
