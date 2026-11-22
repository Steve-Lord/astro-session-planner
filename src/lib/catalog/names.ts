/** First non-designation name after the primary one (skips NGC/IC/Sh2/numeric and Messier "M 31"/"M31", Caldwell). */
export function commonName(names: string[]): string | undefined {
  return names.slice(1).find((n) => !/^(NGC|IC|Sh2|\d|M ?\d|Caldwell ?\d|C ?\d)/.test(n))
}
