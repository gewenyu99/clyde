// Staleness, derived from pins on every read (design: "Propagate staleness", R10).
// Nothing here is stored but a record's `doubt`, so it needs no queue and no merge rule.

import { canonicalJson } from './canonical.ts'
import type { Ports } from './ports.ts'
import { hex } from './revision.ts'
import type { ScaffoldRecord, State } from './types.ts'

type Digests = Pick<Ports, 'digest'>

export type Status =
  | { kind: 'ok' | 'retired' | 'conflict' | 'orphan' | 'ambiguous' }
  | { kind: 'suspect'; why: 'doubted' | 'text' | 'parent' | 'kids' | 'need' | 'order'; need?: string }

/**
 * What the world looks like now, which anchoring supplies (slice 2). The core of staleness
 * only compares it with the pins.
 */
export type View = {
  /** Where the record's anchor resolves, with the hash of the span there. Called only for anchored records. */
  anchor(r: ScaffoldRecord): { self: string } | 'orphan' | 'ambiguous'
  /** The hash of the order the record sits in, or undefined when it has none. */
  order(r: ScaffoldRecord): string | undefined
}

const PIN_HEX = 16

async function pin(ports: Digests, value: unknown): Promise<string> {
  return hex(await ports.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))).slice(0, PIN_HEX)
}

/** The version hash a `pins.up` or `pins.needs` pin holds. Anchors and provenance stay out, so moving or confirming a record stales nobody. */
export function vh(ports: Digests, r: Pick<ScaffoldRecord, 'kind' | 'level' | 'text' | 'fn' | 'serves' | 'rule' | 'retired'>): Promise<string> {
  return pin(ports, [r.kind, r.level, r.text, r.fn ?? null, r.serves ?? null, r.rule ?? null, r.retired ?? null])
}

/** The children hash a `pins.kids` pin holds: each child's id with its function, or the function observed in its text. */
export function kh(ports: Digests, children: ScaffoldRecord[]): Promise<string> {
  const pairs = children.map((c) => [c.id, c.fn ?? c.does ?? null] as const).sort(([a], [b]) => (a < b ? -1 : 1))
  return pin(ports, pairs)
}

/**
 * The version of a record its dependents are pinned to. A proposed record at section level or above
 * isn't effective until the writer accepts it (R4), so it counts as the last confirmed version, if any.
 */
function effective(r: ScaffoldRecord): Pick<ScaffoldRecord, 'kind' | 'level' | 'text' | 'fn' | 'serves' | 'rule' | 'retired'> | undefined {
  const unaccepted = r.standing === 'proposed' && (r.level === 'piece' || r.level === 'section')
  return unaccepted ? r.prev : r
}

/** The status of every record, first rule first, in the order design.md lists them. */
export async function deriveStatus(ports: Digests, records: ScaffoldRecord[], ctx: State['ctx'], view: View): Promise<Map<string, Status>> {
  const byId = new Map(records.map((r) => [r.id, r]))
  const children = new Map<string, ScaffoldRecord[]>()
  for (const r of records) {
    if (r.serves === undefined || r.retired) continue
    const siblings = children.get(r.serves)
    if (siblings) siblings.push(r)
    else children.set(r.serves, [r])
  }

  const versions = new Map(await Promise.all(records.map(async (r) => [r.id, await vh(ports, r)] as const)))
  /** The hash a dependent's `up` or `needs` pin holds: undefined while the record has no accepted version, so a dependent pinned to one is suspect. */
  const pinnedVersion = async (r: ScaffoldRecord) => {
    const accepted = effective(r)
    return accepted && (accepted === r ? versions.get(r.id) : await vh(ports, accepted))
  }
  const anchors = new Map(records.filter((r) => r.anchor).map((r) => [r.id, view.anchor(r)]))

  const out = new Map<string, Status>()
  for (const r of records) out.set(r.id, await statusOf(r))
  return out

  async function statusOf(r: ScaffoldRecord): Promise<Status> {
    if (r.retired) return { kind: 'retired' }
    if (r.conflict) return { kind: 'conflict' }
    const found = anchors.get(r.id)
    if (found === 'orphan' || found === 'ambiguous') return { kind: found }
    if (r.doubt) return { kind: 'suspect', why: 'doubted' }

    const selfPin = ctx[r.id]?.self
    if (found && selfPin !== undefined && found.self !== selfPin) return { kind: 'suspect', why: 'text' }

    const pins = r.pins
    if (pins?.up !== undefined && r.serves !== undefined) {
      const parent = byId.get(r.serves)
      const parentPin = parent && (await pinnedVersion(parent))
      if (pins.up !== parentPin) return { kind: 'suspect', why: 'parent' }
    }
    if (pins?.kids !== undefined && pins.kids !== (await kh(ports, children.get(r.id) ?? []))) return { kind: 'suspect', why: 'kids' }
    for (const { id: need } of r.needs ?? []) {
      const target = byId.get(need)
      const gone = !target || target.retired || anchors.get(need) === 'orphan'
      const pinned = pins?.needs?.[need]
      if (gone || (pinned !== undefined && pinned !== (await pinnedVersion(target)))) return { kind: 'suspect', why: 'need', need }
    }
    if (pins?.order !== undefined && pins.order !== view.order(r)) return { kind: 'suspect', why: 'order' }
    return { kind: 'ok' }
  }
}
