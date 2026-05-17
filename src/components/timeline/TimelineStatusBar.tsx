'use client'

interface Props {
  currentTimeMs: number
  frameRate: number
  selectedKfCount: number
  zoomFactor: number
  snapEnabled: boolean
  /** Optional: label shown during snap (e.g. "Frame 24" or "Marker CTA"). */
  snapLabel?: string | null
  /** Auto-key mode (BL-41) — when 'record' the bar shows a pulsing red badge. */
  autoKeyMode?: 'manual' | 'auto' | 'record'
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const m   = Math.floor(total / 60000)
  const s   = Math.floor((total % 60000) / 1000)
  const rem = total % 1000
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`
}

export default function TimelineStatusBar({
  currentTimeMs, frameRate, selectedKfCount, zoomFactor, snapEnabled, snapLabel, autoKeyMode,
}: Props) {
  const frame = frameRate > 0 ? Math.round(currentTimeMs / (1000 / frameRate)) : 0

  return (
    <div className="flex items-center gap-0 px-3 h-5 border-t border-gray-700/60
                    bg-gray-950/80 text-[9px] font-mono text-gray-600 shrink-0 select-none">

      {autoKeyMode === 'record' && (
        <>
          <span className="flex items-center gap-1 px-2 text-red-400 font-bold animate-pulse">
            <span>●</span>REC
          </span>
          <Sep />
        </>
      )}
      {autoKeyMode === 'auto' && (
        <>
          <span className="flex items-center gap-1 px-2 text-yellow-500">
            <span>◆</span>AUTO
          </span>
          <Sep />
        </>
      )}
      <Segment label="F" value={String(frame)} />
      <Sep />
      <Segment label="" value={formatTime(currentTimeMs)} valueClass="text-gray-400" />
      <Sep />
      {selectedKfCount > 0
        ? <Segment label="" value={`${selectedKfCount} key${selectedKfCount !== 1 ? 's' : ''}`} valueClass="text-yellow-500" />
        : <span className="text-gray-700 px-2">no selection</span>
      }
      <Sep />
      <Segment label="zoom" value={`${zoomFactor.toFixed(1)}×`} />
      <Sep />
      <Segment
        label="snap"
        value={snapLabel ?? (snapEnabled ? 'on' : 'off')}
        valueClass={snapLabel ? 'text-yellow-400' : snapEnabled ? 'text-green-600' : 'text-gray-700'}
      />
    </div>
  )
}

function Segment({ label, value, valueClass = 'text-gray-400' }: {
  label: string; value: string; valueClass?: string
}) {
  return (
    <span className="flex items-center gap-1 px-2">
      {label && <span className="text-gray-700">{label}:</span>}
      <span className={valueClass}>{value}</span>
    </span>
  )
}

function Sep() {
  return <span className="text-gray-800 select-none">│</span>
}
