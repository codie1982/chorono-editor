/** Native PNG with two exact colors, suitable for comparing decoder reload. */
export async function nativePng(): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ec7926'; ctx.fillRect(0, 0, 32, 32)
  ctx.fillStyle = '#284bd2'; ctx.fillRect(8, 8, 16, 16)
  return new Promise(resolve => canvas.toBlob(value => resolve(value!), 'image/png'))
}
/** Generate private video through native canvas capture/MediaRecorder, without
 * camera/microphone access. Wall-clock frames are kept visible during recording. */
export async function nativeWebm(): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!, stream = canvas.captureStream(20)
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks: Blob[] = []
  const complete = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onerror = () => reject(new Error('Private video recording failed.'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
  })
  recorder.start(); const start = performance.now()
  try {
    await new Promise<void>(resolve => {
      const draw = () => {
        const elapsed = performance.now() - start
        ctx.fillStyle = elapsed < 300 ? '#e94739' : '#2875e8'; ctx.fillRect(0, 0, 32, 32)
        if (elapsed >= 700) resolve(); else requestAnimationFrame(draw)
      }; draw()
    })
    recorder.stop(); return await complete
  } finally { stream.getTracks().forEach(track => track.stop()) }
}
/** Await native seeked, rejecting readiness failures rather than assuming a
 * fixed browser delay. Videos are paused and independently clocked. */
export async function seekNativeVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener('seeked', done); error ? reject(error) : resolve() }
    const done = () => finish(), timer = setTimeout(() => finish(new Error('Native video seek timed out.')), 8000)
    video.addEventListener('seeked', done, { once: true }); video.currentTime = seconds
  })
}
/** Return exact native pixels, also preserving a visible copy in the QA canvas. */
export function nativeFingerprint(element: CanvasImageSource, canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 32, 32); ctx.drawImage(element, 0, 0, 32, 32)
  return Array.from(ctx.getImageData(0, 0, 32, 32).data).join(',')
}
