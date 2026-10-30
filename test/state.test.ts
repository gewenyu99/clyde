import { expect, test } from 'bun:test'
import { applyRev } from '../core/state.ts'
import { rec, rev } from './support.ts'

test('a state is its first parent\'s with header, puts and ctx applied, and each record remembers the revision that put it', async () => {
  const ctx = { pre: 'a', suf: 'b', self: 'h' }
  const first = await rev({ header: { mode: 'draft', drafting: ['Intro'] }, puts: [rec({ id: 'i-bbbbbb', text: 'one' }), rec({ id: 'i-aaaaaa' })], ctx: { 'i-aaaaaa': ctx, 'i-bbbbbb': ctx } })
  const second = await rev({ kind: 'decide', parents: [first.id], act: 'act-1', header: { drafting: [] }, puts: [rec({ id: 'i-bbbbbb', text: 'two' })], ctx: { 'i-aaaaaa': null } })

  const one = applyRev(null, first)
  const two = applyRev(one, second)

  expect(two.rev).toBe(second.id)
  expect(two.header).toEqual({ mode: 'draft', drafting: [] })
  expect(two.records.map((r) => `${r.id}:${r.text}`)).toEqual(['i-aaaaaa:text', 'i-bbbbbb:two'])
  expect(two.ctx).toEqual({ 'i-bbbbbb': ctx })
  expect(two.origin).toEqual({ 'i-aaaaaa': { rev: first.id }, 'i-bbbbbb': { rev: second.id, act: 'act-1' } })
  expect(one.records.map((r) => r.text)).toEqual(['text', 'one'])  // the parent's state isn't touched
})

test('a re-put that changes nothing the writer authorized keeps the act, and any other re-put takes the new revision\'s', async () => {
  const goal = rec({ id: 'g-aaaaaa', kind: 'goal', level: 'piece', standing: 'confirmed', by: 'writer', how: 'confirmed' })
  const first = await rev({ by: 'writer', act: 'act-1', puts: [goal] })
  const doubted = await rev({ kind: 'lane', parents: [first.id], puts: [{ ...goal, at: '2027-01-01T00:00:00.000Z', pins: { kids: 'k' } }] })
  const reworded = await rev({ kind: 'settle', parents: [doubted.id], puts: [{ ...goal, text: 'a different aim' }] })

  const afterDoubt = applyRev(applyRev(null, first), doubted)
  expect(afterDoubt.origin['g-aaaaaa']).toEqual({ rev: first.id, act: 'act-1' })
  expect(applyRev(afterDoubt, reworded).origin['g-aaaaaa']).toEqual({ rev: reworded.id })
})

test('a merge revision starts from its first parent\'s state, and no other piece\'s revision applies', async () => {
  const a = await rev({ puts: [rec({ id: 'i-aaaaaa', text: 'ours' })] })
  const b = await rev({ at: '2026-10-29T12:01:00.000Z', puts: [rec({ id: 'i-bbbbbb', text: 'theirs' })] })
  const [low, high] = a.id < b.id ? [a, b] : [b, a]
  const merged = await rev({ kind: 'merge', parents: [low.id, high.id], puts: [] })
  expect(applyRev(applyRev(null, low), merged).records.map((r) => r.text)).toEqual(low === a ? ['ours'] : ['theirs'])

  const elsewhere = await rev({ kind: 'settle', piece: 'p' + 'z'.repeat(26), parents: [low.id] })
  expect(() => applyRev(applyRev(null, low), elsewhere)).toThrow()
})

test('a revision applies only on the state it follows', async () => {
  const first = await rev({ puts: [rec({ id: 'i-aaaaaa' })] })
  const second = await rev({ kind: 'settle', parents: [first.id] })
  expect(() => applyRev(null, second)).toThrow()
  expect(() => applyRev(applyRev(null, first), first)).toThrow()
})
