/** Scalar facts for the existing STORE ZIP32 layout. Data/ownership and CRC
 * computation are separate; no clock, native handle or source bytes retained. */
export interface ZipEntry {nameBytes:Uint8Array<ArrayBuffer>;crc:number;size:number;offset:number}

/** Same version/flags/timestamps as the existing writer, preserving archive
 * byte semantics. Caller admits 30+nameBytes.length before invocation. */
export function localZipHeader(entry:ZipEntry):Uint8Array<ArrayBuffer>{
  const bytes=new Uint8Array(30+entry.nameBytes.length),v=new DataView(bytes.buffer)
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true)
  v.setUint32(14,entry.crc,true);v.setUint32(18,entry.size,true);v.setUint32(22,entry.size,true)
  v.setUint16(26,entry.nameBytes.length,true);bytes.set(entry.nameBytes,30);return bytes
}
/** Caller admits 46+nameBytes.length before allocating a central record. */
export function centralZipHeader(entry:ZipEntry):Uint8Array<ArrayBuffer>{
  const bytes=new Uint8Array(46+entry.nameBytes.length),v=new DataView(bytes.buffer)
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true)
  v.setUint32(16,entry.crc,true);v.setUint32(20,entry.size,true);v.setUint32(24,entry.size,true)
  v.setUint16(28,entry.nameBytes.length,true);v.setUint32(42,entry.offset,true);bytes.set(entry.nameBytes,46);return bytes
}
/** ZIP32 EOCD; caller validates record count/offset/size against finite policy
 * before invoking, so no uint16/uint32 field can silently wrap. */
export function zipEndRecord(count:number,centralSize:number,centralOffset:number):Uint8Array<ArrayBuffer>{
  const bytes=new Uint8Array(22),v=new DataView(bytes.buffer)
  v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true)
  v.setUint32(12,centralSize,true);v.setUint32(16,centralOffset,true);return bytes
}
