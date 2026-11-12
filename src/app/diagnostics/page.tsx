import type { Metadata } from 'next'
import { DiagnosticManagementPanel } from '@/components/diagnostics-management/DiagnosticManagementPanel'

export const metadata: Metadata = {
  title: 'Error management | Chorono',
  description: 'Private diagnostic issue management',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

/** Public empty shell; authenticated issue data is loaded only after the
 * operator explicitly supplies a token in the mounted client session. */
export default function DiagnosticsPage() { return <DiagnosticManagementPanel /> }
