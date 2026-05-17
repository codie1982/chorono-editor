'use client'
// ── SnapPanel ─────────────────────────────────────────────────────────────
// Dockable settings panel for the snap subsystem. Sister to the canvas's
// quick-toggle SnapMenu — the menu gives you fast on/off, the panel gives
// you full control (targets, radius, grid, angle, scale).
//
// State lives at the page level via useSnapSettings so dragging this panel
// across the dock tree keeps the same settings, and the canvas reads the
// same source of truth.

import type { SnapSettingsHook, SnapSettings } from '@/app/hooks/useSnapSettings'

interface Props {
  snap: SnapSettingsHook
}

export default function SnapPanel({ snap }: Props) {
  const { settings: s } = snap
  const enabled = s.enabled
  return (
    <div className="h-full bg-gray-900 text-gray-200 overflow-auto">
      <div className="p-3 space-y-4">

        {/* ── Master toggle ───────────────────────────────────────────────── */}
        <Section title="General">
          <Row>
            <ToggleCheckbox
              checked={enabled}
              label="Enable Snapping"
              shortcut="Alt + S"
              onChange={snap.setEnabled}
            />
          </Row>
          <Row>
            <NumberField
              label="Snap Radius"
              suffix="px"
              value={s.radiusPx}
              min={2} max={32} step={1}
              onChange={snap.setRadiusPx}
              disabled={!enabled}
            />
          </Row>
        </Section>

        {/* ── Targets ─────────────────────────────────────────────────────── */}
        <Section title="Targets">
          <TargetRow label="Grid"            checked={s.targets.grid}    disabled={!enabled} onChange={(v) => snap.setTarget('grid', v)} />
          <TargetRow label="Object Bounds"   checked={s.targets.objects} disabled={!enabled} onChange={(v) => snap.setTarget('objects', v)} />
          <TargetRow label="Object Points"   checked={s.targets.points}  disabled={!enabled} onChange={(v) => snap.setTarget('points', v)} />
          <TargetRow label="Guides"          checked={s.targets.guides}  disabled={!enabled} onChange={(v) => snap.setTarget('guides', v)} />
          <TargetRow label="Pixel"           checked={s.targets.pixel}   disabled={!enabled} onChange={(v) => snap.setTarget('pixel', v)} />
          <div className="h-px bg-gray-800 my-1" />
          <TargetRow label="Vertex"          checked={s.targets.vertex}  disabled={!enabled} onChange={(v) => snap.setTarget('vertex', v)} hint="Spline / pen tool (BL-27)" />
          <TargetRow label="Segment"         checked={s.targets.segment} disabled={!enabled} onChange={(v) => snap.setTarget('segment', v)} hint="Closest point on path (BL-27)" />
        </Section>

        {/* ── Grid ────────────────────────────────────────────────────────── */}
        <Section title="Grid">
          <Row>
            <NumberField
              label="Size"
              suffix="px"
              value={s.grid.sizePx}
              min={2} max={200} step={1}
              onChange={snap.setGridSize}
              disabled={!enabled || !s.targets.grid}
            />
          </Row>
          <Row>
            <NumberField
              label="Subdivisions"
              value={s.grid.subdivisions}
              min={1} max={16} step={1}
              onChange={snap.setGridSubdivs}
              disabled={!enabled || !s.targets.grid}
            />
          </Row>
        </Section>

        {/* ── Angle snap ──────────────────────────────────────────────────── */}
        <Section title="Angle (Rotate)">
          <Row>
            <ToggleCheckbox
              checked={s.angle.enabled}
              label="Enable Angle Snap"
              hint="Rotate gizmo only (Shift = temporary toggle)"
              onChange={snap.setAngleEnabled}
              disabled={!enabled}
            />
          </Row>
          <Row>
            <NumberField
              label="Step"
              suffix="°"
              value={s.angle.stepDeg}
              min={1} max={90} step={1}
              onChange={snap.setAngleStep}
              disabled={!enabled || !s.angle.enabled}
            />
          </Row>
        </Section>

        {/* ── Scale snap ──────────────────────────────────────────────────── */}
        <Section title="Scale (%)">
          <Row>
            <ToggleCheckbox
              checked={s.scale.enabled}
              label="Enable Scale Snap"
              hint="Scale gizmo only (BL-29)"
              onChange={snap.setScaleEnabled}
              disabled={!enabled}
            />
          </Row>
          <Row>
            <NumberField
              label="Step"
              suffix="%"
              value={s.scale.stepPercent}
              min={1} max={50} step={1}
              onChange={snap.setScaleStep}
              disabled={!enabled || !s.scale.enabled}
            />
          </Row>
        </Section>

        {/* ── Reset ───────────────────────────────────────────────────────── */}
        <div className="pt-2 border-t border-gray-800">
          <button
            onClick={snap.resetDefaults}
            className="w-full px-3 py-1.5 text-xs rounded
                       bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>
}

interface ToggleProps {
  checked: boolean
  label: string
  hint?: string
  shortcut?: string
  disabled?: boolean
  onChange: (v: boolean) => void
}
function ToggleCheckbox({ checked, label, hint, shortcut, disabled, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left
        ${disabled
          ? 'text-gray-600 cursor-not-allowed'
          : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
    >
      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px]
        ${checked
          ? 'bg-blue-600 border-blue-500 text-white'
          : 'bg-gray-900 border-gray-600'}`}>
        {checked ? '✓' : ''}
      </span>
      <span className="flex-1">
        {label}
        {hint && <span className="block text-[10px] text-gray-500 font-normal">{hint}</span>}
      </span>
      {shortcut && (
        <span className="text-[10px] font-mono text-gray-500">{shortcut}</span>
      )}
    </button>
  )
}

interface TargetRowProps {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  hint?: string
}
function TargetRow({ label, checked, disabled, onChange, hint }: TargetRowProps) {
  return (
    <ToggleCheckbox label={label} checked={checked} disabled={disabled} onChange={onChange} hint={hint} />
  )
}

interface NumberFieldProps {
  label: string
  suffix?: string
  value: number
  min: number; max: number; step: number
  disabled?: boolean
  onChange: (v: number) => void
}
function NumberField({ label, suffix, value, min, max, step, disabled, onChange }: NumberFieldProps) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 w-full ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-[11px] text-gray-400 w-24">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="text-[11px] font-mono text-gray-300 w-14 text-right">
        {value}{suffix}
      </span>
    </div>
  )
}

// ── Re-export the typed settings shape so callers can import without
// reaching into the hook. (Currently unused outside the hook itself.)
export type { SnapSettings }
