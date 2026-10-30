import { canonicalJson } from './canonical.ts'
import type { Rev, ScaffoldRecord, State } from './types.ts'

const EMPTY: Pick<State, 'header' | 'records' | 'ctx' | 'origin'> = { header: {}, records: [], ctx: {}, origin: {} }

/**
 * The state after a revision: its first parent's state with header, puts and ctx applied.
 * `parent` is null for a first revision. Needs no scaffold logic, so Go does the same.
 */
export function applyRev(parent: State | null, rev: Rev): State {
  const { body } = rev
  if ((parent?.rev ?? undefined) !== body.parents[0]) {
    throw new Error(`${rev.id} follows ${body.parents[0] ?? 'nothing'}, not ${parent?.rev ?? 'nothing'}`)
  }
  if (parent && parent.piece !== body.piece) throw new Error(`${rev.id} is a revision of ${body.piece}, not ${parent.piece}`)
  const base = parent ?? { ...EMPTY, piece: body.piece }

  const records = new Map(base.records.map((r) => [r.id, r]))
  const origin = { ...base.origin }
  for (const put of body.puts ?? []) {
    // A re-put that changes nothing the writer authorized (a doubt, a re-pin) keeps the earlier act.
    if (!sameAuthority(records.get(put.id), put)) origin[put.id] = { rev: rev.id, act: body.act }
    records.set(put.id, put)
  }

  const ctx = { ...base.ctx }
  for (const [id, c] of Object.entries(body.ctx ?? {})) {
    if (c === null) delete ctx[id]
    else ctx[id] = c
  }

  return {
    rev: rev.id,
    piece: body.piece,
    text: body.text,
    header: { ...base.header, ...body.header },
    records: [...records.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    ctx,
    origin,
  }
}

/** Same standing, author and meaning (the fields vh hashes), so the earlier authorization still covers it. */
function sameAuthority(old: ScaffoldRecord | undefined, put: ScaffoldRecord): boolean {
  const key = (r: ScaffoldRecord) => canonicalJson([r.standing, r.by, r.kind, r.level, r.text, r.fn ?? null, r.serves ?? null, r.rule ?? null, r.retired ?? null])
  return old !== undefined && key(old) === key(put)
}
