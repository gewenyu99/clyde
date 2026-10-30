// Canonical JSON for revision ids: RFC 8785 for the values the format holds.
// Keys sort by UTF-16 code unit, no whitespace, `undefined` object fields are
// omitted, and numbers must be safe integers so a Go reader prints them alike.

export class CanonicalError extends Error {}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new CanonicalError(`canonical JSON holds safe integers only, got ${value}`)
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  throw new CanonicalError(`canonical JSON can't hold ${typeof value}`)
}
