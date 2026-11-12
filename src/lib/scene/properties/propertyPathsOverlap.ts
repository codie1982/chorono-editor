/** Test whether dot-separated value paths address a common leaf. Siblings
 * stay disjoint; whole-vector writes overlap their children. Paths must already
 * be validated by the caller's property-address contract. */
export function propertyPathsOverlap(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && (a === b || a.startsWith(b + '.') || b.startsWith(a + '.'))
}
