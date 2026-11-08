export interface FontFamilyToken { readonly name: string; readonly css: string; readonly generic: boolean }
const generics = new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','ui-rounded','emoji','math','fangsong'])

/** Parse a CSS family list without DOM access. Commas inside quotes and escaped
 * characters/hex escapes are preserved. Generic keywords are recognized only
 * when unquoted. Invalid unterminated quoted input is returned as one unmatched
 * token, so a resolver never rewrites malformed input into another asset name.
 * Returns new readonly records; authored CSS is not mutated or normalized. */
export function fontFamilyList(css: string): readonly FontFamilyToken[] {
  const parts: string[] = []; let start = 0, quote = '', escaped = false
  for (let i=0;i<css.length;i++) {
    const ch=css[i]
    if (escaped) { escaped=false; continue }
    if (ch==='\\') { escaped=true; continue }
    if (quote) { if(ch===quote)quote=''; continue }
    if(ch==='"'||ch==="'")quote=ch
    else if(ch===','){parts.push(css.slice(start,i));start=i+1}
  }
  if(quote)return [{name:'',css,generic:false}]
  parts.push(css.slice(start))
  return parts.map(part=>{
    const raw=part.trim(),quoted=(raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'"))
    const decoded=(quoted?raw.slice(1,-1):raw).replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|\s)?|\\([^\r\n])/g,(_match,hex:string|undefined,ch:string|undefined)=>{
      if(!hex)return ch??''
      const code=Number.parseInt(hex,16);return code===0||code>0x10ffff||code>=0xd800&&code<=0xdfff?'\ufffd':String.fromCodePoint(code)
    })
    const name=quoted?decoded:decoded.replace(/\s+/g,' ').trim()
    return {name,css:raw,generic:!quoted&&generics.has(name.toLowerCase())}
  }).filter(token=>token.name.length>0)
}
