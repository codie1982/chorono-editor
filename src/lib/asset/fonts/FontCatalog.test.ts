import {describe,expect,it} from 'vitest'
import type {Asset} from '../../types'
import {fontCatalog,describeFont,importedFontNames} from './FontCatalog'
import {fontFamilyList} from './FontFamilyList'
import {FontBindingsSnapshot} from './FontBindingsSnapshot'

const font=(id:string,family:string,url=id):Asset=>({id,name:id,type:'font',url,metadata:{notes:`family: ${family}`}})

describe('source-scoped font names',()=>{
  it('parses quoted commas, escapes and generic keywords without DOM or CSS mutation',()=>{
    const css='"A, B", Some\\20 Font, "serif", serif, sans-serif'
    expect(fontFamilyList(css).map(({name,generic})=>({name,generic}))).toEqual([
      {name:'A, B',generic:false},{name:'Some Font',generic:false},{name:'serif',generic:false},
      {name:'serif',generic:true},{name:'sans-serif',generic:true},
    ])
    expect(fontFamilyList('"  Wide  "')[0].name).toBe('  Wide  ')
    expect(fontFamilyList('"A\\"B"')[0].name).toBe('A"B')
    expect(fontFamilyList('"broken')[0].name).toBe('')
  })
  it('uses the last authored same-family source, never asynchronous load order',()=>{
    const a=font('a','Brand'),b=font('b','brand'),assets=[a,b,font('generic','serif')],catalog=fontCatalog(assets)
    expect(fontCatalog(assets)).toBe(catalog)
    expect(catalog.find('Brand, BRAND, sans-serif').map(d=>d.asset.id)).toEqual(['b'])
    expect(catalog.resolve('Brand, serif',()=> 'private')).toBe('"private", serif')
    expect(catalog.resolve('Brand, serif',()=>undefined)).toBe('serif')
    expect(catalog.resolve('Brand',()=>undefined)).toBe('sans-serif')
    expect(catalog.resolve('Brand, serif',()=>undefined,false)).toBe('Brand, serif')
    expect(catalog.find('serif')).toEqual([])
    expect(catalog.find('"serif"')[0].asset.id).toBe('generic')
    expect(describeFont(a)).toBe(describeFont(a))
    expect(describeFont({...a,id:'alias'}).key).toBe(describeFont(a).key)
    expect(describeFont({...a,url:'new'}).key).not.toBe(describeFont(a).key)
  })
  it('does not invent family names for malformed metadata',()=>{
    for(const family of ['', 'A, B', '"unterminated'])expect(()=>describeFont(font('bad',family))).toThrow('family')
    expect(()=>describeFont({...font('bad','A'),type:'image'})).toThrow('font')
    const assets=[font('bad','A, B')]
    expect(fontCatalog(assets).fonts).toEqual(assets)
    expect(fontCatalog(assets).find('A')).toEqual([])
  })
  it('preserves imported ASCII family names and gives non-ASCII names a stable fallback',()=>{
    expect(importedFontNames('My-Font_VF.woff2','id')).toEqual({name:'My Font VF',family:'My_Font_VF'})
    expect(importedFontNames('字体.ttf','font-7')).toEqual({name:'字体',family:'ImportedFont_font-7'})
  })
  it('never lends an expired alias to another source or a stale consumer',()=>{
    const a=font('a','Brand'),b=font('b','Brand');let live=true
    const bindings=new FontBindingsSnapshot([{asset:a,alias:'private-a',state:()=>live?'ready':'notResident'}])
    expect(bindings.resolveFamily('Brand, serif',[a])).toBe('"private-a", serif')
    expect(bindings.resolveFamily('Brand, serif',[b])).toBe('serif')
    expect(bindings.state(a)).toBe('ready');live=false
    expect(bindings.resolveFamily('Brand, serif',[a])).toBe('serif')
    expect(bindings.state(a)).toBe('notResident')
    expect(bindings.state(font('bad',''))).toBe('error')
  })
})
