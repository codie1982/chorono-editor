import type {Asset} from '../../types'
import {fontFamilyList} from './FontFamilyList'

export interface FontDescriptor { readonly asset:Asset;readonly family:string;readonly key:string }
const descriptors=new WeakMap<Asset,FontDescriptor>()
const catalogs=new WeakMap<readonly Asset[],FontCatalog>()

/** Read the existing serialized family: note; no new scene field or native
 * handle. Asset descriptors must be immutable, matching source/media indexing.
 * Long data-URL identity strings are built once per descriptor, not per frame. */
export function describeFont(asset:Asset):FontDescriptor {
  const cached=descriptors.get(asset);if(cached)return cached
  if(asset.type!=='font'||!asset.url)throw new TypeError('A font source URL is required.')
  const note=asset.metadata?.notes?.match(/(?:^|\n)family:\s*([^\r\n]+)/)?.[1]?.trim()
  const tokens=fontFamilyList(note??'')
  if(tokens.length!==1||!tokens[0].name)throw new TypeError('Font asset metadata must contain one family name.')
  const family=tokens[0].name,descriptor={asset,family,key:JSON.stringify(['font',family.toLowerCase(),asset.url])}
  descriptors.set(asset,descriptor);return descriptor
}

/** Immutable source-name catalog. Duplicate family names deliberately select
 * the LAST authored asset, independent of asynchronous load completion order.
 * It owns metadata only, never native faces/pins. CSS generic keywords remain
 * system fonts; quoting a generic name explicitly selects a custom family. */
export class FontCatalog {
  private readonly families=new Map<string,FontDescriptor>()
  readonly fonts:readonly Asset[]
  /** Snapshot immutable source descriptors; invalid metadata remains in fonts
   * for diagnostics but is not eligible to resolve a CSS family. */
  constructor(assets:readonly Asset[]) {
    this.fonts=assets.filter(asset=>asset.type==='font')
    this.fonts.forEach(asset=>{try{const d=describeFont(asset);this.families.set(d.family.toLowerCase(),d)}catch{/* Invalid descriptors remain diagnostic asset rows. */}})
  }
  /** Referenced project fonts only; fallback/system families create no load. */
  find(css:string):readonly FontDescriptor[] {
    const result:FontDescriptor[]=[]
    for(const token of fontFamilyList(css)){const d=!token.generic&&this.families.get(token.name.toLowerCase());if(d&&!result.includes(d))result.push(d)}
    return result
  }
  /** Convert source family names to ready runtime aliases. A managed-but-cold
   * family is omitted when pendingFallback=true; final jobs await required pins
   * first. Unknown/system families and authored fallback order are preserved.
   * false supports synchronous editor measurement without initiating loads. */
  resolve(css:string,alias:(descriptor:FontDescriptor)=>string|undefined,pendingFallback=true):string {
    let changed=false
    const parts=fontFamilyList(css).flatMap(token=>{
      const d=!token.generic&&this.families.get(token.name.toLowerCase())
      if(!d)return [token.css]
      const ready=alias(d)
      if(ready){changed=true;return [JSON.stringify(ready)]}
      if(pendingFallback){changed=true;return []}
      return [token.css]
    })
    return changed?parts.join(', ')||'sans-serif':css
  }
}

/** Weak immutable-array cache: no history/scene is strongly retained. */
export function fontCatalog(assets:readonly Asset[]):FontCatalog {
  let result=catalogs.get(assets);if(!result){result=new FontCatalog(assets);catalogs.set(assets,result)}return result
}

/** Preserve existing ASCII imported family naming; non-ASCII-only filenames
 * receive a stable serialized asset-id fallback instead of an invalid empty name. */
export function importedFontNames(filename:string,assetId:string):{name:string;family:string} {
  const name=filename.replace(/\.(woff2?|ttf|otf)$/i,'').replace(/[-_]/g,' ').trim()
  return {name,family:name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_-]/g,'')||`ImportedFont_${assetId.replace(/[^a-zA-Z0-9_-]/g,'')}`}
}
