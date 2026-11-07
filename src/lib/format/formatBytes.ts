/**
 * Formats a byte count with binary IEC units (1 KiB = 1,024 B).
 * Values below zero display as zero; non-finite values remain unavailable.
 * No locale or browser dependency; callers supply non-negative byte estimates.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))))
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
