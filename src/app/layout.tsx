import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chorono Builder',
  description: 'Chorono Animator — editable 2D animation editor',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  )
}
