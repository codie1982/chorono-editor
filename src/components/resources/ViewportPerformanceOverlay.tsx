'use client'
import {useEffect,useState} from 'react'
import {renderWorkMonitor} from '@/lib/resources/performance/RenderWorkMonitor'
import {browserMemoryReader} from '@/lib/resources/memory/BrowserMemoryReader'
import {formatBytes} from '@/lib/format/formatBytes'
import {observeResourceMonitor} from './observeResourceMonitor'

/** Cheap, detached viewport telemetry. No scene/media handles, GPU observation,
 * page-memory measurement or second animation loop is acquired by this source.
 * Last draw is a measured synchronous interval, appropriate for an on-demand
 * canvas. Heap is sampled after drawing and is not total project/process RAM.
 */
const source={getSnapshot:()=>({
  drawMs:renderWorkMonitor.getLastSample('viewport')?.ms??null,
  heap:browserMemoryReader.getSnapshot().heap?.used??null,
}),subscribe:(changed:()=>void)=>renderWorkMonitor.subscribe('viewport',changed)}

/** Isolated leaf: changes coalesce for 500 ms after actual drawing; idle has no
 * polling timer. Updates never rerender SceneCanvas or draw the composition.
 * Hidden/unmounted/StrictMode cleanup detaches subscriptions and pending work.
 * Initial markup is stable
 * for server rendering. This DOM overlay is outside every output canvas.
 */
export default function ViewportPerformanceOverlay(){
  const [snapshot,setSnapshot]=useState<ReturnType<typeof source.getSnapshot>|null>(null)
  useEffect(()=>observeResourceMonitor(source,document,setSnapshot),[])
  return <div role="group" aria-label="Viewport performance" aria-live="off"
    title="Last measured viewport drawing duration, including onion skin. Heap: last sampled JavaScript heap estimate, refreshed after viewport redraws; not total RAM. This indicator is excluded from exports."
    className="absolute top-10 left-7 z-20 max-w-[calc(100%-2.5rem)] truncate pointer-events-none select-none rounded border border-gray-700 bg-gray-900/90 px-2 py-1 text-[10px] leading-4 font-mono tabular-nums text-gray-300">
    Last draw {snapshot?.drawMs==null?'—':`${snapshot.drawMs.toFixed(1)} ms`} <span className="text-gray-500">·</span> Heap {snapshot?.heap==null?'—':formatBytes(snapshot.heap)}
  </div>
}
