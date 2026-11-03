import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, symlink, writeFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { writeArtifact, loadProject, listProjects } from '../storage'
import { portableScene } from '../editor'
import { emptyScene } from '../../defaults'

let root: string
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'chorono-projects-')); vi.stubEnv('CHORONO_MCP_PROJECT_DIR', root) })
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })

describe('portable project persistence', () => {
  it('saves and reloads, rejects traversal and requires explicit overwrite', async () => {
    const scene = emptyScene()
    const saved = await writeArtifact('demo', '.chorono.json', JSON.stringify(scene))
    expect(saved.path.startsWith(await realpath(root))).toBe(true)
    expect(await loadProject('demo')).toEqual(scene)
    expect(await listProjects()).toHaveLength(1)
    await expect(writeArtifact('../outside', '.chorono.json', '{}')).rejects.toThrow('no paths')
    await expect(writeArtifact('demo', '.chorono.json', '{}')).rejects.toThrow('exists')
    await writeArtifact('demo', '.chorono.json', JSON.stringify(scene), true)
  })
  it('refuses symlinks and prevents atomic create races', async () => {
    await writeFile(path.join(root, 'target.json'), '{}')
    await symlink(path.join(root, 'target.json'), path.join(root, 'link.chorono.json'))
    await expect(loadProject('link')).rejects.toThrow('Invalid project')
    const results = await Promise.allSettled([writeArtifact('same','.json','one'),writeArtifact('same','.json','two')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  })
  it('embeds blob media which survives revocation of the original URL', async () => {
    const scene = emptyScene()
    const url = URL.createObjectURL(new Blob(['fixture'], {type:'image/png'}))
    scene.assets.push({id:'image1',name:'fixture.png',type:'image',url,runtime:{objectUrl:url}})
    const packaged = await portableScene(scene)
    URL.revokeObjectURL(url)
    expect(packaged.assets[0].url.startsWith('data:image/png;base64,')).toBe(true)
    expect(packaged.assets[0].runtime).toBeUndefined()
    expect(await (await fetch(packaged.assets[0].url)).text()).toBe('fixture')
  })
})
