/** Literal 4×4 GIF87a/89a QA inputs, authored from the GIF grammar with a
 * clear code before every pixel (three-bit clear/index/end LZW codes). Three
 * solid frames are red/blue/green at 100/200/300 ms; expected colors/timing do
 * not depend on the application decoder/compositor. No general encoder added. */
export function animatedGif(): Uint8Array<ArrayBuffer> { return new Uint8Array([71, 73, 70, 56, 57, 97, 4, 0, 4, 0, 129, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 33, 255, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0, 33, 249, 4, 4, 10, 0, 0, 0, 44, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 13, 4, 65, 16, 4, 65, 16, 4, 65, 16, 4, 65, 16, 5, 0, 33, 249, 4, 4, 20, 0, 0, 0, 44, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 13, 12, 195, 48, 12, 195, 48, 12, 195, 48, 12, 195, 48, 5, 0, 33, 249, 4, 4, 30, 0, 0, 0, 44, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 13, 20, 69, 81, 20, 69, 81, 20, 69, 81, 20, 69, 81, 5, 0, 59]) }
export function staticGif(): Uint8Array<ArrayBuffer> { return new Uint8Array([71, 73, 70, 56, 55, 97, 4, 0, 4, 0, 129, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 44, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 13, 4, 65, 16, 4, 65, 16, 4, 65, 16, 4, 65, 16, 5, 0, 59]) }
/** Partial rectangles, transparency and disposal 1/2/3 exercise native history
 * when each caller-owned VideoFrame is closed immediately after drawing. */
export function partialGif(): Uint8Array<ArrayBuffer> { return new Uint8Array([71, 73, 70, 56, 57, 97, 4, 0, 4, 0, 129, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 33, 249, 4, 4, 10, 0, 3, 0, 44, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 13, 4, 65, 16, 4, 65, 16, 4, 65, 16, 4, 65, 16, 5, 0, 33, 249, 4, 9, 20, 0, 3, 0, 44, 1, 0, 1, 0, 2, 0, 2, 0, 0, 2, 4, 12, 199, 49, 5, 0, 33, 249, 4, 12, 30, 0, 3, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 84, 1, 0, 59]) }
