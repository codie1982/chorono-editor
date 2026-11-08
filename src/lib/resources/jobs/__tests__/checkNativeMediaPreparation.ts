import type { NativeMediaPreparationFixture } from './nativeMediaPreparationFixture'
import { until } from './nativeMediaPreparationFixture'
import { nativeFingerprint, seekNativeVideo } from '@/lib/asset/visual/__tests__/nativeMediaFixtures'
import { downsampleAudioBuffer } from '@/lib/timeline/audioWaveform'

/** Native integration checks of shared admission, cancellation, independent
 * lease handoff and real decoder output. A thrown assertion preserves completed
 * rows; fixture disposal still drains native work rather than abandoning it. */
export async function checkNativeMediaPreparation(owner: NativeMediaPreparationFixture, inspect: () => Promise<void>, rows: object[], copies: HTMLElement) {
  const test = (name: string, passed: boolean, details?: unknown) => {
    rows.push({ name, passed, details }); if (!passed) throw new Error(name)
  }
  const { audio, visual, fonts, assets, executor, pending, pins } = owner
  const sourceBefore = JSON.stringify(owner.scene)
  const cancelAudio = new AbortController(), cancelImage = new AbortController(), cancelVideo = new AbortController()
  const a = audio.acquire(assets[0], { signal: cancelAudio.signal }).then(pin => ({ pin, error: '' }), error => ({ pin: null, error: error.name }))
  const i = visual.acquire(assets[1], { signal: cancelImage.signal }).then(pin => ({ pin, error: '' }), error => ({ pin: null, error: error.name }))
  const image = visual.acquire(assets[1]), font = fonts.acquire(assets[2])
  // Inspection can outlast a failing native request. Handle rejection immediately;
  // the original promise still throws when awaited by this acceptance routine.
  void image.catch(() => {}); void font.catch(() => {})
  const video = visual.acquire(assets[3], { consumerId: 'native:old', signal: cancelVideo.signal }).then(pin => ({ pin, error: '' }), error => ({ pin: null, error: error.name }))
  pending.push(a, i, image, font, video)
  await until(() => owner.nativeReady.has('audio') && owner.nativeReady.has('image') && executor.getSnapshot().queued === 2)
  test('mixed audio/image/font/video requests share exactly two active pipeline slots',
    executor.getSnapshot().active === 2 && owner.stats().peak === 2 && owner.started.length === 2
    && owner.started.includes('audio') && owner.started.includes('image'), executor.getSnapshot())
  test('waiting font/video work creates no native resource or byte reservation',
    !owner.started.includes('font') && !owner.started.includes('video') && fonts.getSnapshot().residency.reservedBytes === 0,
    { visual: visual.getSnapshot().preparation, fonts: fonts.getSnapshot().preparation })
  await inspect()
  cancelImage.abort(); test('one cancelled shared image consumer leaves its independent consumer waiting',
    (await i).error === 'AbortError' && visual.getSnapshot().pendingCount === 2 && executor.getSnapshot().active === 2)
  cancelVideo.abort(); test('queued video cancellation never constructs a native decoder', (await video).error === 'AbortError')
  await until(() => executor.getSnapshot().queued === 1)
  test('queued cancellation removes shared metadata without disturbing other owners', !owner.started.includes('video') && fonts.getSnapshot().pendingCount === 1)
  cancelAudio.abort(); test('native audio cancellation rejects its consumer promptly', (await a).error === 'AbortError')
  audio.cancelPending(); owner.sources[0].release()
  test('non-abortable actual decode keeps its shared slot, byte reservation and source until settlement',
    executor.getSnapshot().active === 2 && audio.getMemorySnapshot().residency!.reservedBytes === 24000 && (await fetch(assets[0].url)).ok)
  owner.holds.image.release(); const imagePin = await image; pins.push(imagePin); owner.media.set(assets[1].id, imagePin.value.element)
  await until(() => owner.nativeReady.has('font'))
  test('releasing one native result admits the next owner while cancelled audio still occupies a slot',
    executor.getSnapshot().active === 2 && audio.getMemorySnapshot().preparation!.executing === 1 && fonts.getSnapshot().preparation.executing === 1)
  owner.holds.font.release(); const fontPin = await font; pins.push(fontPin)
  const finalImage = imagePin.retain(), finalFont = fontPin.retain(); pins.push(finalImage, finalFont)
  const imageCanvas = owner.surface(32, 32), glyph = owner.surface(), glyphContext = glyph.getContext('2d', { willReadFrequently: true })!
  const imageBefore = nativeFingerprint(finalImage.value.element, imageCanvas)
  /** Native font pixels are compared before/after cache invalidation, using the
   * same held final pin and exact byte readback, without changing tolerance. */
  const drawGlyph = (context = glyphContext) => { context.clearRect(0, 0, glyph.width, glyph.height); context.font = `24px "${finalFont.value.alias}"`; context.fillStyle = '#dbeafe'; context.fillText('Chorono MW il 0123', 4, 30); return context.getImageData(0, 0, glyph.width, glyph.height).data }
  const defaultContext = owner.surface().getContext('2d')!, defaultFirst = drawGlyph(defaultContext).slice(), defaultSecond = drawGlyph(defaultContext)
  const defaultRepeatDifferentBytes = defaultFirst.reduce((sum, byte, index) => sum + Number(byte !== defaultSecond[index]), 0)
  const glyphBefore = drawGlyph().slice(), glyphRepeat = drawGlyph()
  test('explicit readback fixture has exact same-code glyph parity before ownership changes', glyphBefore.every((byte, index) => byte === glyphRepeat[index]),
    { defaultContextRepeatDifferentBytes: defaultRepeatDifferentBytes, readbackContextRepeatDifferentBytes: glyphBefore.reduce((sum, byte, index) => sum + Number(byte !== glyphRepeat[index]), 0) })
  visual.cancelPending(); fonts.cancelPending(); imagePin.release(); fontPin.release(); owner.budget.reclaimIdle()
  const glyphAfter = drawGlyph()
  const pinProof = { imageEqual: imageBefore === nativeFingerprint(finalImage.value.element, imageCanvas),
    glyphNonempty: glyphBefore.some(byte => byte !== 0), glyphDifferentBytes: glyphBefore.reduce((sum, byte, index) => sum + Number(byte !== glyphAfter[index]), 0),
    imageDisposed: owner.disposed.includes('image'), fontDisposed: owner.disposed.includes('font'), fontReady: document.fonts.check(`24px "${finalFont.value.alias}"`) }
  test('independent final image/font pins survive local cancellation and idle cleanup',
    pinProof.imageEqual && pinProof.glyphNonempty && pinProof.glyphDifferentBytes === 0 && !pinProof.imageDisposed && !pinProof.fontDisposed, pinProof)
  owner.holds.audio.release(); await until(() => executor.getSnapshot().active === 0)
  test('late cancelled PCM is discarded and its original input releases only after settlement',
    audio.getMemorySnapshot().bytes === 0 && !(await fetch(assets[0].url).then(() => true, () => false)))
  // Reacquire real PCM through the same shared executor after the late old decode.
  const source = owner.audioSource(), pcm = await audio.acquire({ ...assets[0], url: source.url }); pins.push(pcm)
  const peaks = downsampleAudioBuffer(pcm.buffer, 12)
  test('a fresh generation preserves native stereo PCM and waveform extrema', pcm.buffer.numberOfChannels === 2 && pcm.buffer.length === 2400
    && Math.abs(peaks.peaks[0] + 0.5) < 1e-4 && Math.abs(peaks.peaks[1] - 0.5) < 1e-4)
  const failure = await audio.acquire({ ...assets[0], url: assets[1].url }).then(() => '', error => error.name)
  test('a native decode failure does not poison shared capacity', failure === 'EncodingError' && executor.getSnapshot().active === 0)
  const [v1, v2] = await Promise.all([visual.acquire(assets[3], { consumerId: 'native:a' }), visual.acquire(assets[3], { consumerId: 'native:b' })])
  pins.push(v1, v2)
  const first = v1.value.element as HTMLVideoElement, second = v2.value.element as HTMLVideoElement
  await seekNativeVideo(first, 0.1); await seekNativeVideo(second, 0.5)
  test('scoped native video clocks and frame content remain independent', first !== second && Math.abs(first.currentTime - 0.1) < .03
    && Math.abs(second.currentTime - 0.5) < .03 && nativeFingerprint(first, owner.surface(32, 32)) !== nativeFingerprint(second, owner.surface(32, 32)))
  test('all native producer bodies stay within shared capacity', owner.stats().peak <= 2, owner.stats())
  test('native preparation never mutates serializable scene or authored asset descriptors', JSON.stringify(owner.scene) === sourceBefore)
  for (const canvas of [imageCanvas, glyph]) {
    const image = document.createElement('img'); image.src = canvas.toDataURL(); image.alt = canvas === glyph ? 'Native held font glyphs' : 'Native held PNG pixels'
    copies.append(image)
  }
  const status = { queue: executor.getSnapshot(), budget: owner.budget.getSnapshot(), native: owner.stats() }
  return status
}
