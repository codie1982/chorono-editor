'use client'

import { useRef } from 'react'
import { useNativeModal } from '@/components/ui/useNativeModal'
import { featuredReleaseNotes } from './releaseNotes'

/** Accessible, read-only release announcement. The owning hook decides when
 * it mounts and records the one-time display; this dialog owns focus only. */
export default function ReleaseNotesDialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useNativeModal(ref, '[aria-label="Close release notes"]')

  return <dialog ref={ref} aria-labelledby="release-notes-title"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onKeyDown={event => event.stopPropagation()}
    className="fixed inset-0 m-auto max-h-[min(90dvh,48rem)] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-0 text-gray-100 shadow-2xl backdrop:bg-black/70">
    <div className="flex max-h-[min(90dvh,48rem)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-700 px-5 py-4 sm:px-7">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Chorono · v{featuredReleaseNotes.version}</span>
        <button type="button" aria-label="Close release notes" onClick={onClose}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-gray-300 hover:bg-gray-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">×</button>
      </header>
      <main className="min-h-0 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
        <h2 id="release-notes-title" className="text-2xl font-semibold leading-tight text-white sm:text-3xl">What’s new in Chorono</h2>
        <p className="mt-2 text-sm leading-6 text-gray-300">{featuredReleaseNotes.title}</p>
        <ul className="mt-6 space-y-3">
          <li className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
            <h3 className="font-semibold text-white">Create and texture 2D meshes</h3>
            <p className="mt-1 text-sm leading-6 text-gray-300">Start with a grid, closed shape or spline. Adjust the texture, pin vertices and play baked deformation.</p>
          </li>
          <li className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
            <h3 className="font-semibold text-white">Preview physics before applying</h3>
            <p className="mt-1 text-sm leading-6 text-gray-300">Review rigid motion and Voronoi fracture in Jobs &amp; Bake. Apply the result in one Undo step.</p>
          </li>
          <li className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
            <h3 className="font-semibold text-white">Render a frame or sequence</h3>
            <p className="mt-1 text-sm leading-6 text-gray-300">Download PNG output directly or send frames to a running local Chorono Render service.</p>
          </li>
        </ul>
      </main>
      <footer className="flex shrink-0 flex-col gap-3 border-t border-gray-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a href={featuredReleaseNotes.url} target="_blank" rel="noopener noreferrer"
            className="text-blue-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">Full release notes</a>
          <a href={featuredReleaseNotes.turkishUrl} target="_blank" rel="noopener noreferrer"
            className="text-blue-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">Türkçe</a>
        </div>
        <button type="button" onClick={onClose}
          className="min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">Open editor</button>
      </footer>
    </div>
  </dialog>
}
