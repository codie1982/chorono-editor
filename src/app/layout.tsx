import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chorono Builder',
  description: 'Chorono Animator — editable 2D animation editor',
}

/**
 * Renders the shared document shell and mounts route-aware Vercel page tracking.
 * Children retain their layout; the Analytics component loads its browser script.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
