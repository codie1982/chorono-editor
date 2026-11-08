interface Stage { calls:number; ms:number; maxMs:number }
const stages=new Map<string,Stage>()
/** Profiling bundle only: bounded by a fixed source-label list. Inclusive wall
 * durations overlap; they are not system CPU percentages or GPU elapsed time. */
export function recordStage(name:string,ms:number) {
  const row=stages.get(name)??{calls:0,ms:0,maxMs:0}
  row.calls++;row.ms+=ms;row.maxMs=Math.max(row.maxMs,ms);stages.set(name,row)
}
/** Clears only counters, never renderer/resource caches. */
export function resetStages(){stages.clear()}
/** Detached counters; no scene, pixel buffer or DOM handle is retained. */
export function readStages(){return Object.fromEntries(Array.from(stages,([name,row])=>[name,{...row}]))}
