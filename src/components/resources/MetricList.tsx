import type { ReactNode } from 'react'
import styles from './ResourceMonitorPanel.module.css'

/** Compact, semantic label/value rows shared by resource categories; values retain their unit/quality labels. */
export function MetricList({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return <dl className={styles.counters}>{rows.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  ))}</dl>
}
