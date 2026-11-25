import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { editorDisplayState } from './displayPolicy'
import { EditorDisplayBoundary } from './EditorDisplayBoundary'

describe('editor display capability policy', () => {
  it('accepts the inclusive desktop boundary and larger fine-pointer displays', () => {
    expect(editorDisplayState({ width: 1280, height: 720, finePointer: true })).toBe('supported')
    expect(editorDisplayState({ width: 1920, height: 1080, finePointer: true })).toBe('supported')
    expect(editorDisplayState({ width: 1366, height: 1024, finePointer: true })).toBe('supported')
  })
  it('blocks phones/tablets and either short or narrow desktop windows', () => {
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1279, 900], [1600, 719], [NaN, 900]]) {
      expect(editorDisplayState({ width, height, finePointer: true })).toBe('too-small')
    }
  })
  it('uses pointer capabilities instead of user-agent names or screen width alone', () => {
    expect(editorDisplayState({ width: 1920, height: 1080, finePointer: false })).toBe('pointer-required')
    expect(editorDisplayState({ width: 1024, height: 768, finePointer: false })).toBe('too-small')
  })
  it('keeps SSR and initial hydration from constructing scene/resource owners before observation', () => {
    let mounted = 0
    function Owner() { mounted++; return <div>Expensive editor</div> }
    const html = renderToStaticMarkup(<EditorDisplayBoundary><Owner /></EditorDisplayBoundary>)
    expect(mounted).toBe(0)
    expect(html).toContain('Checking workspace size')
    expect(html).not.toContain('Expensive editor')
  })
})
