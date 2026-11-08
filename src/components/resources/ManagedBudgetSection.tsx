import type { ResourceBudgetSnapshot } from '@/lib/resources/budget'
import { formatBytes } from '@/lib/format/formatBytes'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

/** Read-only admission diagnostics. Resident/pending partition one ledger; its
 * local/global scopes overlap existing resource estimates and are never summed.
 * Input includes encoded/decoded buffers, document text/copies and GIF workspace policy. This
 * component allocates no resources; remaining coverage limits stay explicit. */
export function ManagedBudgetSection({ snapshot: s }: { snapshot: ResourceBudgetSnapshot }) {
  const percent = s.maxBytes > 0 ? Math.min(100, s.chargedBytes / s.maxBytes * 100) : 0
  return <div className={styles.scope}>
    <h3>Managed allocation budget</h3><span className={styles.badge}>Estimated · admission-controlled</span>
    <p>Budget coverage includes scratch and preview surfaces, leased media, audio PCM, GPU workspaces, font/metadata preparation, bounded input, document conversion, GIF, raster/ZIP/WAV/text output and file/server/MCP handoff. Native working sets and text/object copies use admission estimates. Decoder/encoder/driver, filesystem/network and JS-engine internals, persistent source storage, shader binaries, untracked allocations and total browser/process RAM are not measured or hard-capped by this policy.</p>
    <div className={styles.budget}>
      <div className={styles.budgetHeading}><span>Committed and pending charges</span><strong>{formatBytes(s.chargedBytes)}</strong></div>
      <progress max={100} value={percent} aria-label="Shared managed allocation budget usage"
        aria-valuetext={`${formatBytes(s.chargedBytes)} / ${formatBytes(s.maxBytes)}`} />
      <div className={styles.budgetCaption}><span>Shared limit: {formatBytes(s.maxBytes)}</span><span>{percent.toFixed(1)}%</span></div>
    </div>
    <MetricList rows={[
      ['Resident / pending', `${formatBytes(s.residentBytes)} / ${formatBytes(s.reservedBytes)}`],
      ['Protected / reclaimable', `${formatBytes(s.protectedBytes)} / ${formatBytes(s.reclaimableBytes)}`],
      ['Available / peak charge', `${formatBytes(s.availableBytes)} / ${formatBytes(s.peakBytes)}`],
      ['Allocation records / capacity', `${s.entries} / ${s.maxEntries}`],
      ['Admission denials / reclaimed', `${s.denials} / ${s.reclaims}`],
      ['Reclaim failures', s.reclaimFailures],
      ['Input processing · resident / pending', s.categories.input ? `${formatBytes(s.categories.input.residentBytes)} / ${formatBytes(s.categories.input.reservedBytes)}` : 'Not tracked'],
    ]} />
    <p>Protected allocations cannot be reclaimed. Pending work reserves capacity before allocation; idle resources may be released under pressure. These charges overlap tracked-resource estimates and must not be added to them.</p>
  </div>
}
