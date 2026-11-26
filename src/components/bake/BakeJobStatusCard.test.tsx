import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BakeJobSnapshot } from '@/lib/bake'
import { BakeJobStatusCard } from './BakeJobStatusCard'

describe('BakeJobStatusCard', () => {
  it('communicates running progress and source context without colour-only state', () => {
    const snapshot: BakeJobSnapshot<never> = {
      id: 'job-1', kind: 'rigidPose', label: 'Rigid body simulation',
      source: { kind: 'rigidScene', ownerId: 'main', revision: 'hash' },
      status: 'running', progress: { value: 0.42, phase: 'simulate', message: 'Simulated 50 / 120 fixed ticks.' },
    }
    const html = renderToStaticMarkup(createElement(BakeJobStatusCard, {
      snapshot, sourceLabel: 'Box', rangeLabel: '0–3000 ms', qualityLabel: '120 Hz',
    }))
    expect(html).toContain('Preparing preview')
    expect(html).toContain('42%')
    expect(html).toContain('Box')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="42"')
  })

  it('renders a durable stale diagnosis', () => {
    const snapshot: BakeJobSnapshot<never> = {
      id: 'job-2', kind: 'rigidPose', label: 'Fracture',
      source: { kind: 'rigidScene', ownerId: 'main', revision: 'old' },
      status: 'stale', progress: { value: 1, phase: 'stale', message: 'Bake source is stale.' },
      error: 'Bake source changed.',
    }
    const html = renderToStaticMarkup(createElement(BakeJobStatusCard, { snapshot }))
    expect(html).toContain('Source changed')
    expect(html).toContain('Stale preview')
    expect(html).toContain('role="alert"')
  })

  it('lets a parent queue own the single live announcement', () => {
    const snapshot: BakeJobSnapshot<never> = {
      id: 'job-3', kind: 'rigidPose', label: 'Remote preview',
      source: { kind: 'rigidScene', ownerId: 'main', revision: 'hash' },
      status: 'preview-ready', progress: { value: 1, phase: 'ready', message: 'Preview ready.' },
    }
    const html = renderToStaticMarkup(createElement(BakeJobStatusCard, { snapshot, announce: false }))
    expect(html).toContain('Preview ready')
    expect(html).not.toContain('role="status"')
  })
})
