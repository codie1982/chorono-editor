import type { ProjectResourceSnapshot } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Project-wide inventory plus separate owned-resource, heap and browser-page estimates. Never adds overlapping totals. */
export function OverviewSection({ snapshot: s, onSampleMemory }: { snapshot: ProjectResourceSnapshot; onSampleMemory: () => void }) {
  const { heap, page } = s.browser
  return <>
    <div className={styles.scope}>
      <h3>Proje ve editör kaynakları</h3>
      <span className={styles.badge}>Tahmini · bilinen kaynaklar</span>
      <div className={styles.bigValue}>{formatBytes(s.knownBytes)}</div>
      <p>Canvas, görüntü, tek video karesi, ses PCM ve izlenen GPU tamponları. Toplam işlem RAM’i değildir.</p>
    </div>
    <MetricList rows={[
      ['Katman / animasyon', `${s.project.layers} / ${s.project.timelines}`],
      ['Track / keyframe', `${s.project.tracks} / ${s.project.keyframes}`],
      ['Medya kaynağı', s.project.assets],
      ['Canvas2D · RGBA8', `${formatBytes(s.canvases.canvas2dBytes)} · ${s.canvases.canvas2dCount} yüzey`],
      ['Görüntü / sprite · RGBA8', formatBytes(s.media.imageBytes)],
      ['Video · bir RGBA karesi', formatBytes(s.media.videoFrameBytes)],
      ['Ses PCM · Float32', `${formatBytes(s.audio.bytes)} · ${s.audio.bufferCount} tampon`],
      ['GPU renk yüzeyi · RGBA8', formatBytes(s.canvases.webglBytes)],
      ['GPU parçacık buffer', formatBytes(s.gpuBufferBytes)],
      ['CPU parçacık staging', formatBytes(s.stagingBytes)],
    ]} />
    {!s.canvases.supported && <p>Canvas takibi bu tarayıcıda desteklenmiyor; kaynak toplamı eksik.</p>}
    <h3>Tarayıcı belleği <span className={styles.badge}>Ayrı kapsam</span></h3>
    <MetricList rows={[
      ['JS heap · tahmini', heap ? formatBytes(heap.used) : 'Ölçülemiyor'],
      ['Heap ayrılan / sınır', heap ? `${formatBytes(heap.allocated)} / ${formatBytes(heap.limit)}` : 'Ölçülemiyor'],
      ['Sayfa bellek örneği', page.bytes === null ? page.status === 'pending' ? 'Ölçülüyor…' : 'Örnek yok' : formatBytes(page.bytes)],
    ]} />
    <button type="button" onClick={onSampleMemory} disabled={page.status === 'unsupported' || page.status === 'pending'}>
      {page.status === 'pending' ? 'Örnek alınıyor…' : 'Sayfa belleğini örnekle'}
    </button>
    {page.reason && <p>{page.reason}</p>}
    {page.sampledAt && <p>Örnek zamanı: {new Date(page.sampledAt).toLocaleTimeString('tr-TR')}</p>}
    <p>Heap: performance.memory (Chromium, yaklaşık). Sayfa örneği: measureUserAgentSpecificMemory. Kaynak toplamıyla toplanmaz; sekme ve proje dışı paylaşımlar bulunabilir.</p>
  </>
}
