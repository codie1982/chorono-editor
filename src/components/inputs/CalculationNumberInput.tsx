'use client'
import { forwardRef, type InputHTMLAttributes } from 'react'
import { CalculationButton } from './expressions/CalculationButton'

/** Numeric configuration adapter: native editing stays with the owning form;
 * the separate fx action computes once and invokes an explicit number callback.
 * No synthetic input event, scene recipe or per-frame task is created. Draft
 * forms may store the result until their existing Apply action commits it.
 * Limits use source units; step is presentation, never an integer constraint. */
type CalculationNumericProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { onCalculate(value: number): void }

/** Compose native number/range controls with exactly the same calculation API. */
function calculationInput(type: 'number' | 'range') { return forwardRef<HTMLInputElement, CalculationNumericProps>(function CalculationNumericInput({ onCalculate, ...props }, ref) {
  const label = props['aria-label'] ?? props.name ?? props.placeholder ?? 'setting'
  const limit = (value: string | number | undefined) => value === undefined ? undefined : Number(value)
  return <span className="inline-flex max-w-full min-w-0 items-center gap-1">
    <input {...props} className={(props.className ?? "") + " min-w-0"} ref={ref} type={type} />
    <CalculationButton label={String(label)} kind="number" value={props.value === '' ? null : Number(props.value ?? props.defaultValue)}
      min={limit(props.min)} max={limit(props.max)} disabled={props.disabled || props.readOnly}
      onResult={value => onCalculate(value as number)} />
  </span>
}) }

export const CalculationNumberInput = calculationInput('number')
/** Range-only settings expose the same keyboard-accessible exact calculation. */
export const CalculationRangeInput = calculationInput('range')
