export interface JsonMeasurement { chars:number; utf8Bytes:number; nodes:number; scriptEscapes:number }
export interface JsonMeasureOptions { maxChars?:number; maxBytes?:number; maxNodes?:number; maxDepth?:number; space?:0|2 }

/** Measure well-formed JSON without building its serialized string. Counts
 * UTF-16 code units and UTF-8 wire bytes exactly, including escaping, lone
 * surrogates, omitted object values, array holes and optional two-space indent.
 * scriptEscapes counts literal `<`/`>` for exact HTML JSON escaping admission.
 * Plain objects/arrays only: accessors, toJSON, cycles and native instances are
 * explicitly unsupported, so preflight cannot invoke user/native conversion.
 * Shared acyclic values count each serialized occurrence. No mutation; work is
 * bounded by nodes/depth/characters and uses only the active recursion path.
 * Limits are positive safe integers. Defaults match a finite project/transport
 * policy; callers may choose smaller limits before allocation. */
export function measureJson(value:unknown,options:JsonMeasureOptions={}):JsonMeasurement {
  const maxChars=options.maxChars??32*1024**2,maxBytes=options.maxBytes??48*1024**2
  const maxNodes=options.maxNodes??600000,maxDepth=options.maxDepth??48,space=options.space??0
  for(const limit of [maxChars,maxBytes,maxNodes,maxDepth])if(!Number.isSafeInteger(limit)||limit<1)throw new RangeError('Invalid JSON measurement limit.')
  if(space!==0&&space!==2)throw new RangeError('Unsupported JSON indentation.')
  const result={chars:0,utf8Bytes:0,nodes:0,scriptEscapes:0},path=new Set<object>()
  /** Charge punctuation/ASCII or already measured text without a large string. */
  function add(chars:number,bytes=chars):void {
    result.chars+=chars;result.utf8Bytes+=bytes
    if(result.chars>maxChars||result.utf8Bytes>maxBytes)throw new RangeError('JSON size limit exceeded.')
  }
  /** Quoted JSON string; escaping is specified by JSON.stringify, not a codec. */
  function string(text:string):void {
    add(2)
    for(let i=0;i<text.length;i++){
      const code=text.charCodeAt(i)
      if(code===60||code===62)result.scriptEscapes++
      if(code===34||code===92||[8,9,10,12,13].includes(code)){add(2);continue}
      if(code<32){add(6);continue}
      if(code>=0xd800&&code<=0xdbff){
        const next=text.charCodeAt(i+1)
        if(next>=0xdc00&&next<=0xdfff){add(2,4);i++;continue}
        add(6);continue
      }
      if(code>=0xdc00&&code<=0xdfff){add(6);continue}
      add(1,code<128?1:code<2048?2:3)
    }
  }
  /** Reject custom conversion before native stringify could call it, including
   * conversion attached to an otherwise omitted function or array prototype. */
  function checkSerializer(input:object):void{
    let current:object|null=input,depth=0
    while(current){
      if(++depth>4)throw new TypeError('Custom JSON prototypes are unsupported.')
      const serializer=Object.getOwnPropertyDescriptor(current,'toJSON')
      if(serializer&&(!('value' in serializer)||typeof serializer.value==='function'))throw new TypeError('Custom JSON conversion is unsupported.')
      current=Object.getPrototypeOf(current)
    }
  }
  /** Undefined/function/symbol omission follows native JSON for data records. */
  const omitted=(item:unknown)=>{
    if(typeof item==='function')checkSerializer(item)
    return item===undefined||typeof item==='function'||typeof item==='symbol'
  }
  function visit(input:unknown,depth:number):void {
    if(++result.nodes>maxNodes||depth>maxDepth)throw new RangeError('JSON structure limit exceeded.')
    if(input===null||omitted(input)){add(4);return}
    if(typeof input==='string'){string(input);return}
    if(typeof input==='number'){add(Number.isFinite(input)?JSON.stringify(input).length:4);return}
    if(typeof input==='boolean'){add(input?4:5);return}
    if(typeof input!=='object')throw new TypeError('Unsupported JSON value.')
    const record=input
    const array=Array.isArray(input),prototype=Object.getPrototypeOf(input)
    if(array?prototype!==Array.prototype&&prototype!==null:prototype!==Object.prototype&&prototype!==null)throw new TypeError('JSON preflight requires plain data records.')
    checkSerializer(input)
    if(path.has(input))throw new TypeError('Cyclic JSON value.')
    path.add(input);add(1);let count=0
    /** Admit delimiters before descending; property descriptors avoid getters. */
    function item(key:string,index:boolean):void {
      const descriptor=Object.getOwnPropertyDescriptor(input!,key)
      if(descriptor&&!('value' in descriptor))throw new TypeError('JSON accessors are unsupported.')
      if(index&&!descriptor&&key in record)throw new TypeError('Inherited JSON array elements are unsupported.')
      const data=descriptor?.value
      if(!index&&omitted(data))return
      if(count++)add(1)
      if(space)add(1+(depth+1)*space)
      if(!index){string(key);add(space?2:1)}
      visit(data,depth+1)
    }
    if(array){
      if(input.length>maxNodes-result.nodes)throw new RangeError('JSON structure limit exceeded.')
      for(let i=0;i<input.length;i++)item(String(i),true)
    }else for(const key in input)if(Object.prototype.hasOwnProperty.call(input,key))item(key,false)
    if(space&&count)add(1+depth*space)
    add(1);path.delete(input)
  }
  if(omitted(value))throw new TypeError('Top-level JSON value is undefined.')
  visit(value,0);return result
}

/** UTF-8 encoding length without allocating a byte buffer. Unlike JSON string
 * measurement, native TextEncoder replaces lone surrogates with U+FFFD (3 bytes).
 * Throws before returning if a caller's finite wire limit would be exceeded. */
export function utf8ByteLength(text:string,maxBytes=48*1024**2):number {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError('Invalid UTF-8 byte limit.')
  let bytes=0
  for(let i=0;i<text.length;i++){
    const code=text.charCodeAt(i)
    if(code>=0xd800&&code<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++}
    else bytes+=code<128?1:code<2048?2:3
    if(bytes>maxBytes)throw new RangeError('UTF-8 output byte limit exceeded.')
  }
  return bytes
}
