import type { ScaffoldRecord, State } from './types.ts'

export type Finding = { lane: 'sync'; code: 'unconfirmed' | 'dangling-need'; record: string; detail: string }
export type LoadError = {
  code: 'piece-goal' | 'duplicate-id' | 'no-serves' | 'dangling-serves' | 'serves-cycle' | 'misplaced-field'
  record?: string
  detail: string
}
export type Loaded =
  | { ok: true; records: ScaffoldRecord[]; findings: Finding[] }
  | { ok: false; errors: LoadError[] }

const isPieceGoal = (r: ScaffoldRecord) => r.kind === 'goal' && r.level === 'piece'

/**
 * The loader rules of design.md "The revision format", over a materialized state.
 * Structural breaks refuse the load. A confirmed record the writer never authorized loads as
 * proposed, and a dangling need is a finding. `validAct` is the store's check that an act exists
 * with a valid MAC.
 */
export function load(state: State, validAct: (act: string) => boolean): Loaded {
  const errors = structuralErrors(state.records)
  if (errors.length) return { ok: false, errors }

  const findings: Finding[] = []
  const ids = new Set(state.records.map((r) => r.id))
  const records = state.records.map((r) => {
    for (const need of r.needs ?? []) {
      if (!ids.has(need.id)) findings.push({ lane: 'sync', code: 'dangling-need', record: r.id, detail: `${r.id} needs ${need.id}, which doesn't exist` })
    }
    if (r.standing !== 'confirmed' || !needsWriterAct(r)) return r
    const act = state.origin[r.id]?.act
    if (r.by === 'writer' && act !== undefined && validAct(act)) return r
    findings.push({ lane: 'sync', code: 'unconfirmed', record: r.id, detail: `${r.id} is confirmed with no valid writer act, so it loads as proposed` })
    return { ...r, standing: 'proposed' as const }
  })
  return { ok: true, records, findings }
}

/** Confirmation at section level or above is the writer's alone. Ideas and commitments sit at 'piece'. */
function needsWriterAct(r: ScaffoldRecord): boolean {
  return r.level === 'piece' || r.level === 'section'
}

function structuralErrors(records: ScaffoldRecord[]): LoadError[] {
  const errors: LoadError[] = []
  const byId = new Map<string, ScaffoldRecord>()
  for (const r of records) {
    if (byId.has(r.id)) errors.push({ code: 'duplicate-id', record: r.id, detail: `${r.id} appears twice` })
    byId.set(r.id, r)
  }

  const live = records.filter((r) => isPieceGoal(r) && !r.retired)
  if (live.length !== 1) errors.push({ code: 'piece-goal', detail: `expected one live piece goal, found ${live.length}` })

  for (const r of records) {
    if (r.serves === undefined) {
      if (!r.retired && !isPieceGoal(r)) errors.push({ code: 'no-serves', record: r.id, detail: `${r.id} serves nothing, and only the piece goal may` })
    } else if (!byId.has(r.serves)) {
      errors.push({ code: 'dangling-serves', record: r.id, detail: `${r.id} serves ${r.serves}, which doesn't exist` })
    } else if (cycles(r, byId)) {
      errors.push({ code: 'serves-cycle', record: r.id, detail: `${r.id} serves itself through ${r.serves}` })
    }
    errors.push(...misplacedFields(r))
  }
  return errors
}

function cycles(start: ScaffoldRecord, byId: Map<string, ScaffoldRecord>): boolean {
  const seen = new Set<string>()
  for (let r: ScaffoldRecord | undefined = start; r?.serves !== undefined; r = byId.get(r.serves)) {
    if (seen.has(r.id)) return r.id === start.id
    seen.add(r.id)
  }
  return false
}

function misplacedFields(r: ScaffoldRecord): LoadError[] {
  const bad = (field: string, where: string): LoadError => ({ code: 'misplaced-field', record: r.id, detail: `${r.id} has ${field}, which only ${where} may` })
  const errors: LoadError[] = []
  if (r.rule !== undefined && r.kind !== 'commitment') errors.push(bad('rule', 'a commitment'))
  if ((r.audience !== undefined || r.exigence !== undefined) && !isPieceGoal(r)) errors.push(bad('audience or exigence', 'the piece goal'))
  if (r.doubt !== undefined && r.anchor === undefined) errors.push(bad('doubt', 'an anchored record'))
  return errors
}
