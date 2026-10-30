import { describe, expect, test } from 'bun:test'
import { deriveStatus, kh, vh, type Status, type View } from '../core/staleness.ts'
import type { ScaffoldRecord } from '../core/types.ts'
import { ports, rec } from './support.ts'

const confirmed = { standing: 'confirmed', by: 'writer', how: 'confirmed' } as const
const main = rec({ id: 'g-aaaaaa', kind: 'goal', level: 'piece', text: 'Teach your agent to think like a writer', ...confirmed })
const section = rec({ id: 'g-bbbbbb', kind: 'goal', level: 'section', serves: main.id, text: 'Say why drift happens', ...confirmed })
const para = rec({ id: 'g-cccccc', kind: 'goal', level: 'paragraph', serves: section.id, text: 'An agent sees one paragraph' })

const calm: View = { anchor: () => ({ self: '' }), order: () => undefined }
const statusOf = async (rs: ScaffoldRecord[], id: string, view: View = calm, ctx = {}): Promise<Status | undefined> =>
  (await deriveStatus(ports, rs, ctx, view)).get(id)
const ok: Status = { kind: 'ok' }
const suspect = (why: Extract<Status, { kind: 'suspect' }>['why'], need?: string): Status => (need ? { kind: 'suspect', why, need } : { kind: 'suspect', why })

describe('pins', () => {
  // Expected values computed outside the code: the canonical JSON, piped to `shasum -a 256 | cut -c1-16`.
  test('vh and kh are the first 16 hex of the SHA-256 of canonical JSON', async () => {
    expect(await vh(ports, main)).toBe('9fa9f0c391dd0e81')
    const kids = [rec({ id: 'i-bbbbbb', does: 'Names the cost' }), rec({ id: 'i-aaaaaa', fn: 'claim', does: 'ignored beside fn' })]
    expect(await kh(ports, kids)).toBe('71b06049753e1afb')
  })

  test('moving, confirming or re-reading a record does not change its vh', async () => {
    const before = await vh(ports, para)
    const touched: ScaffoldRecord = {
      ...para, anchor: { q: 'moved' }, by: 'writer', how: 'stated', standing: 'confirmed', said: 'because', at: '2027-01-01T00:00:00.000Z',
      pins: { up: 'x' }, does: 'a new reading', needs: [{ id: 'i-aaaaaa', rel: 'needs' }],
    }
    expect(await vh(ports, touched)).toBe(before)
    for (const changed of [{ text: 'other' }, { fn: 'claim' }, { serves: main.id }, { level: 'sentence' }, { retired: 'now' }, { rule: { type: 'fact' } }] as Partial<ScaffoldRecord>[]) {
      expect(await vh(ports, { ...para, ...changed })).not.toBe(before)
    }
  })
})

describe('a change makes only its dependents suspect', () => {
  test('a changed goal stales its direct children, and a child re-pinned as still serving stops there', async () => {
    const s = { ...section, pins: { up: await vh(ports, main) } }
    const p = { ...para, pins: { up: await vh(ports, s) } }
    expect(await statusOf([main, s, p], s.id)).toEqual(ok)

    const edited = { ...main, text: 'Teach your agent to think like an editor' }
    expect(await statusOf([edited, s, p], s.id)).toEqual(suspect('parent'))
    expect(await statusOf([edited, s, p], p.id)).toEqual(ok)  // grandchildren wait for their own parent to change
    expect(await statusOf([edited, s, p], edited.id)).toEqual(ok)

    const repinned = { ...s, pins: { up: await vh(ports, edited) } }
    expect(await statusOf([edited, repinned, p], repinned.id)).toEqual(ok)
  })

  test('a proposed section or piece goal is not effective until accepted', async () => {
    const p = { ...para, pins: { up: await vh(ports, section) } }
    const proposal = { ...section, text: 'A new aim', standing: 'proposed' as const, by: 'agent' as const, prev: section }
    expect(await statusOf([main, proposal, p], p.id)).toEqual(ok)

    expect(await statusOf([main, { ...proposal, standing: 'confirmed' as const, prev: undefined }, p], p.id)).toEqual(suspect('parent'))
    const s = { ...section, pins: { up: await vh(ports, main) } }
    const retitled = { ...main, text: 'A new main aim', standing: 'proposed' as const, by: 'agent' as const, prev: main }
    expect(await statusOf([retitled, s], s.id)).toEqual(ok)
    // a goal never accepted has no version a pin could match, so a child pinned to it is suspect
    const fresh = { ...proposal, prev: undefined }
    expect(await statusOf([main, fresh, p], p.id)).toEqual(suspect('parent'))
  })

  test('a child that changes function, or goes away, stales its parent', async () => {
    const a = rec({ id: 'g-dddddd', kind: 'goal', serves: section.id, fn: 'evidence' })
    const b = rec({ id: 'g-eeeeee', kind: 'goal', serves: section.id, does: 'Gives the number' })
    const s = { ...section, pins: { kids: await kh(ports, [a, b]) } }
    expect(await statusOf([main, s, a, b], s.id)).toEqual(ok)

    expect(await statusOf([main, s, { ...a, fn: 'concession' }, b], s.id)).toEqual(suspect('kids'))
    expect(await statusOf([main, s, a, { ...b, retired: 'merged' }], s.id)).toEqual(suspect('kids'))
    expect(await statusOf([main, s, { ...a, text: 'reworded', does: 'unread beside fn' }, b], s.id)).toEqual(ok)
    expect(await statusOf([main, s, a, { ...b, does: 'Gives the number, late' }], s.id)).toEqual(suspect('kids'))
  })

  test('a need that is retired, orphaned, missing or changed stales every record that needs it', async () => {
    const target = rec({ id: 'i-aaaaaa', kind: 'idea', text: 'the drought', anchor: { q: 'No rain fell' } })
    const needy = rec({ id: 'i-bbbbbb', needs: [{ id: target.id, rel: 'setup' }], pins: { needs: { [target.id]: await vh(ports, target) } } })
    const other = rec({ id: 'i-cccccc', needs: [{ id: target.id, rel: 'needs' }], pins: { needs: { [target.id]: await vh(ports, target) } } })
    const unrelated = rec({ id: 'i-dddddd' })
    expect(await statusOf([target, needy, other, unrelated], needy.id)).toEqual(ok)

    const stale = suspect('need', target.id)
    expect(await statusOf([{ ...target, retired: 'cut' }, needy, other, unrelated], needy.id)).toEqual(stale)
    expect(await statusOf([{ ...target, text: 'the flood' }, needy, other, unrelated], other.id)).toEqual(stale)
    expect(await statusOf([needy, other, unrelated], needy.id)).toEqual(stale)
    expect(await statusOf([{ ...target, text: 'the flood' }, needy, other, unrelated], unrelated.id)).toEqual(ok)
    const unpinned = rec({ id: 'i-eeeeee', needs: [{ id: target.id, rel: 'needs' }] })  // never pinned, still depends on it
    expect(await statusOf([target, unpinned], unpinned.id)).toEqual(ok)
    expect(await statusOf([{ ...target, retired: 'cut' }, unpinned], unpinned.id)).toEqual(stale)
    const proposed = { ...target, level: 'section' as const, standing: 'proposed' as const, text: 'the flood', prev: { ...target, level: 'section' as const } }
    const onPrev = rec({ id: 'i-ffffff', needs: [{ id: target.id, rel: 'needs' }], pins: { needs: { [target.id]: await vh(ports, proposed.prev) } } })
    expect(await statusOf([proposed, onPrev], onPrev.id)).toEqual(ok)  // an unaccepted proposal isn't what needers are pinned to
    const orphaned: View = { ...calm, anchor: (r) => (r.id === target.id ? 'orphan' : { self: '' }) }
    expect(await statusOf([target, needy, other, unrelated], needy.id, orphaned)).toEqual(stale)
  })
})

describe('status takes the first rule that applies', () => {
  const ctx = { 'i-aaaaaa': { pre: '', suf: '', self: 'h1' } }
  const base = rec({ id: 'i-aaaaaa', anchor: { q: 'x' } })
  const doubt = { by: 'code', at: '2026-10-29T12:00:00.000Z', was: 'a', now: 'b', why: 'c' } as const
  const at = (self: string, over: Partial<View> = {}): View => ({ anchor: () => ({ self }), order: () => undefined, ...over })

  const cases: [string, ScaffoldRecord, View, Status][] = [
    ['an untouched record is ok', base, at('h1'), ok],
    ['retired beats everything', { ...base, retired: 'cut', doubt, conflict: base }, { ...at('h2'), anchor: () => 'orphan' }, { kind: 'retired' }],
    ['a conflict beats an orphan', { ...base, conflict: base, doubt }, { ...at('h1'), anchor: () => 'orphan' }, { kind: 'conflict' }],
    ['an orphan beats a doubt', { ...base, doubt }, { ...at('h1'), anchor: () => 'orphan' }, { kind: 'orphan' }],
    ['an ambiguous anchor', base, { ...at('h1'), anchor: () => 'ambiguous' }, { kind: 'ambiguous' }],
    ['a doubt beats a changed span', { ...base, doubt }, at('h2'), suspect('doubted')],
    ['a changed span', base, at('h2'), suspect('text')],
    ['a changed order', { ...base, pins: { order: 'o1' } }, at('h1', { order: () => 'o2' }), suspect('order')],
    ['the same order', { ...base, pins: { order: 'o1' } }, at('h1', { order: () => 'o1' }), ok],
    ['nothing pinned, nothing stale', { ...base, anchor: undefined }, at('h2'), ok],
  ]
  for (const [name, record, view, want] of cases) {
    test(name, async () => expect(await statusOf([record], record.id, view, ctx)).toEqual(want))
  }

  test('a record with no self pin cannot have a changed span', async () => {
    expect(await statusOf([base], base.id, at('h2'), {})).toEqual(ok)
  })
})
