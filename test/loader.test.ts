import { describe, expect, test } from 'bun:test'
import { decodeBody, encodeBody } from '../core/codec.ts'
import { load } from '../core/loader.ts'
import { applyRev } from '../core/state.ts'
import type { RevBody, ScaffoldRecord, State } from '../core/types.ts'
import { body, ports, rec, rev } from './support.ts'
import { revId } from '../core/revision.ts'

const pieceGoal = (over: Partial<ScaffoldRecord> = {}) =>
  rec({ id: 'g-aaaaaa', kind: 'goal', level: 'piece', audience: 'writers', exigence: 'drift', ...over })
const section = (id: string, over: Partial<ScaffoldRecord> = {}) =>
  rec({ id, kind: 'goal', level: 'section', serves: 'g-aaaaaa', standing: 'confirmed', by: 'writer', how: 'confirmed', ...over })

/** Chain revisions through the codec and applyRev, the way a store's states arrive. */
async function stateOf(bodies: Partial<RevBody>[]): Promise<State> {
  let state: State | null = null
  let parent: string[] = []
  for (const b of bodies) {
    const made = body({ ...b, parents: parent, kind: parent.length ? 'settle' : 'init' })
    const decoded = decodeBody(encodeBody(made))
    if (!decoded.ok) throw new Error(decoded.detail)
    const id = await revId(ports, decoded.value)
    state = applyRev(state, { id, body: decoded.value })
    parent = [id]
  }
  return state!
}

const validActs = (act: string) => act === 'act-ok'

describe('a section goal without a valid act loads as proposed', () => {
  test('only a confirmed record at section level or above, by the writer, under a valid act stays confirmed', async () => {
    const state = await stateOf([
      { puts: [pieceGoal()] },
      { by: 'writer', act: 'act-ok', puts: [section('g-bbbbbb')] },
      { by: 'writer', puts: [section('g-cccccc')] },                                  // no act
      { by: 'writer', act: 'act-forged', puts: [section('g-dddddd')] },               // act with no valid MAC
      { by: 'agent', act: 'act-ok', puts: [section('g-eeeeee', { by: 'agent' })] },   // not the writer's
      { by: 'writer', act: 'act-ok', puts: [rec({ id: 'c-aaaaaa', kind: 'commitment', level: 'piece', serves: 'g-aaaaaa', standing: 'confirmed', by: 'writer', how: 'confirmed' })] },
      { by: 'writer', puts: [rec({ id: 'c-bbbbbb', kind: 'commitment', level: 'piece', serves: 'g-aaaaaa', standing: 'confirmed', by: 'writer', how: 'confirmed' })] }, // piece level, no act
      { by: 'agent', puts: [rec({ id: 'i-bbbbbb', serves: 'g-bbbbbb', standing: 'confirmed', by: 'agent', how: 'confirmed' })] }, // paragraph level, no act needed
    ])

    const loaded = load(state, validActs)
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors))
    const standing = Object.fromEntries(loaded.records.map((r) => [r.id, r.standing]))

    expect(standing).toEqual({
      'g-aaaaaa': 'proposed', 'g-bbbbbb': 'confirmed', 'g-cccccc': 'proposed', 'g-dddddd': 'proposed',
      'g-eeeeee': 'proposed', 'c-aaaaaa': 'confirmed', 'c-bbbbbb': 'proposed', 'i-bbbbbb': 'confirmed',
    })
    expect(loaded.findings.filter((f) => f.code === 'unconfirmed').map((f) => f.record).sort())
      .toEqual(['c-bbbbbb', 'g-cccccc', 'g-dddddd', 'g-eeeeee'])
    expect(loaded.findings.every((f) => f.lane === 'sync')).toBe(true)
  })
})

describe('the loader enforces what the type cannot', () => {
  const load1 = async (puts: ScaffoldRecord[]) => load(await stateOf([{ puts }]), validActs)
  const codes = (r: ReturnType<typeof load>) => (r.ok ? [] : r.errors.map((e) => e.code).sort())

  test('structural breaks refuse the load', async () => {
    const second = rec({ id: 'g-bbbbbb', kind: 'goal', level: 'piece' })
    expect(codes(await load1([pieceGoal(), second]))).toEqual(['piece-goal'])
    expect(codes(await load1([second, { ...second, id: 'g-cccccc', retired: 'now, replaced' }]))).toEqual([])
    expect(codes(await load1([]))).toEqual(['piece-goal'])
    expect(codes(await load1([pieceGoal(), section('g-bbbbbb', { serves: 'g-zzzzzz' })]))).toEqual(['dangling-serves'])
    expect(codes(await load1([pieceGoal(), section('g-bbbbbb', { serves: 'g-cccccc' }), section('g-cccccc', { serves: 'g-bbbbbb' })]))).toEqual(['serves-cycle', 'serves-cycle'])
    // a record that only leads into a cycle isn't part of it
    expect(codes(await load1([pieceGoal(), section('g-bbbbbb', { serves: 'g-cccccc' }), section('g-cccccc', { serves: 'g-bbbbbb' }), section('g-dddddd', { serves: 'g-bbbbbb' })]))).toEqual(['serves-cycle', 'serves-cycle'])
    expect(codes(await load1([pieceGoal(), rec({ id: 'i-aaaaaa' })]))).toEqual(['no-serves'])
    expect(codes(await load1([pieceGoal(), rec({ id: 'i-aaaaaa', retired: 'cut' })]))).toEqual([])
    const twice = await stateOf([{ puts: [pieceGoal(), rec({ id: 'i-aaaaaa', serves: 'g-aaaaaa' })] }])
    expect(codes(load({ ...twice, records: [...twice.records, twice.records[1]!] }, validActs))).toEqual(['duplicate-id'])
  })

  test('fields on the wrong kind of record refuse the load', async () => {
    const idea = (over: Partial<ScaffoldRecord>) => rec({ id: 'i-aaaaaa', serves: 'g-aaaaaa', ...over })
    expect(codes(await load1([pieceGoal(), idea({ rule: { type: 'fact' } })]))).toEqual(['misplaced-field'])
    expect(codes(await load1([pieceGoal(), idea({ audience: 'x' })]))).toEqual(['misplaced-field'])
    expect(codes(await load1([pieceGoal(), idea({ doubt: { by: 'code', at: '2026-10-29T12:00:00.000Z', was: 'a', now: 'b', why: 'c' } })]))).toEqual(['misplaced-field'])
    const ok = await load1([pieceGoal(), idea({ id: 'c-aaaaaa', kind: 'commitment', level: 'piece', rule: { type: 'promise' } }), idea({ id: 'i-bbbbbb', anchor: { q: 'x' }, doubt: { by: 'code', at: '2026-10-29T12:00:00.000Z', was: 'a', now: 'b', why: 'c' } })])
    expect(ok.ok).toBe(true)
  })

  test('a dangling need is a sync finding, and unknown keys survive the downgrade', async () => {
    const odd = { ...section('g-bbbbbb', { needs: [{ id: 'i-zzzzzz', rel: 'needs' }] }), futureKey: { keep: 'me' } } as ScaffoldRecord
    const loaded = await load1([pieceGoal(), odd])
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors))

    expect(loaded.findings.map((f) => `${f.code}:${f.record}`).sort()).toEqual(['dangling-need:g-bbbbbb', 'unconfirmed:g-bbbbbb'])
    const out = loaded.records.find((r) => r.id === 'g-bbbbbb')
    expect(out?.standing).toBe('proposed')
    expect(out).toHaveProperty('futureKey', { keep: 'me' })
  })
})
