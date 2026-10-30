import { describe, expect, test } from 'bun:test'
import { decodeBody, encodeBody } from '../core/codec.ts'
import { mergeRev, mintMerge, revId } from '../core/revision.ts'
import { PIECE, T0, T1, body, ports, rec, rev } from './support.ts'

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('revision ids are stable', () => {
  // The expected id was computed outside the code: the canonical string below, piped to `shasum -a 256`.
  test('the id is r plus 32 hex of the SHA-256 of the canonical body, whatever the key order', async () => {
    const canonical =
      '{"at":"2026-10-29T12:00:00.000Z","by":"agent","kind":"init","parents":[],"piece":"p0123456789abcdefghjkmnpqrs",' +
      '"text":{"bytes":0,"id":"e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"},"v":1}'
    const scrambled = {
      v: 1, text: { id: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391', bytes: 0 }, session: undefined, piece: PIECE,
      parents: [], kind: 'init', by: 'agent', at: T0, call: undefined,
    } as const

    expect(text(encodeBody(scrambled as never))).toBe(canonical)
    expect(await revId(ports, scrambled as never)).toBe('r5704cfce8882efb681b366efe3fbadd6')
  })

  test('keys this reader does not know round-trip byte for byte, so an older reader computes the same id', async () => {
    const withUnknown = JSON.stringify({
      ...body({ puts: [rec({ id: 'g-aaaaaa', kind: 'goal', level: 'piece', serves: undefined })] }),
      futureTop: { b: 1, a: [true, null] },
    }).replace('"standing"', '"futureRec":"x","standing"')
    const bytes = new TextEncoder().encode(withUnknown)

    const decoded = decodeBody(bytes)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const again = encodeBody(decoded.value)
    expect(text(again)).toContain('"futureTop":{"a":[true,null],"b":1}')
    expect(text(again)).toContain('"futureRec":"x"')
    // decoding what we encoded gives the same bytes, so the id never depends on who wrote it.
    const second = decodeBody(again)
    expect(second.ok && text(encodeBody(second.value))).toBe(text(again))
    expect(await revId(ports, decoded.value)).not.toBe(await revId(ports, body({ puts: decoded.value.puts })))
  })

  test('a body from a higher major version is refused, not read', () => {
    const v2 = new TextEncoder().encode(JSON.stringify({ ...body(), v: 2 }))
    expect(decodeBody(v2)).toMatchObject({ ok: false, why: 'version' })
  })
})

describe('two replicas merging one pair mint one id', () => {
  const pair = async () => ({
    a: await rev({ kind: 'settle', parents: [], at: T0, session: 'sess-a', toolUse: 'tu-1', agentId: 'ag-1', client: 'claude-code' }),
    b: await rev({ kind: 'outside', by: 'outside', at: T1, text: { id: 'a'.repeat(40), bytes: 9 }, session: 'sess-b' }),
  })
  const merged = { id: 'a'.repeat(40), bytes: 12 }

  test('the same pair gives the same id from either side and either put order', async () => {
    const { a, b } = await pair()
    const p1 = rec({ id: 'i-aaaaaa' })
    const p2 = rec({ id: 'i-bbbbbb' })

    const onLaptop = await mintMerge(ports, { ours: a, theirs: b, text: merged, by: 'hook', puts: [p2, p1], base: 'r' + '0'.repeat(32) })
    const onDesktop = await mintMerge(ports, { ours: b, theirs: a, text: merged, by: 'hook', puts: [p1, p2], base: 'r' + '0'.repeat(32) })

    expect(onLaptop.id).toBe(onDesktop.id)
    expect(onLaptop.body.kind).toBe('merge')
    expect(onLaptop.body.parents).toEqual([a.id, b.id].sort())
    expect(onLaptop.body.at).toBe(T1)  // the later parent's
    for (const field of ['session', 'toolUse', 'agentId', 'client'] as const) expect(onLaptop.body).not.toHaveProperty(field)
    expect(onLaptop.id).toBe(await revId(ports, onLaptop.body))
  })

  test('a device that already holds a remote merge of the pair adopts it', async () => {
    const { a, b } = await pair()
    const remote = await mintMerge(ports, { ours: a, theirs: b, text: merged, by: 'writer', act: 'act-1' })
    const unrelated = await rev({ kind: 'settle', at: T1, session: 'other' })
    const importedOnTop = await rev({ kind: 'import', parents: [a.id, b.id].sort(), by: 'writer' })

    const adopted = await mergeRev(ports, [unrelated, remote], { ours: b, theirs: a, text: merged, by: 'hook' })
    expect(adopted.id).toBe(remote.id)

    const minted = await mergeRev(ports, [unrelated, importedOnTop], { ours: b, theirs: a, text: merged, by: 'hook' })
    expect(minted.id).not.toBe(remote.id)
    expect(minted.body.kind).toBe('merge')
  })

  test('it will not merge a revision with itself or with another piece\'s', async () => {
    const { a, b } = await pair()
    const elsewhere = await rev({ piece: 'p' + 'z'.repeat(26) })
    await expect(mintMerge(ports, { ours: a, theirs: a, text: merged, by: 'hook' })).rejects.toThrow()
    await expect(mintMerge(ports, { ours: b, theirs: elsewhere, text: merged, by: 'hook' })).rejects.toThrow()
  })
})

describe('a body the format does not allow is refused', () => {
  const bad = (over: object) => decodeBody(new TextEncoder().encode(JSON.stringify({ ...body(), ...over })))
  const [ra, rb] = ['r' + 'a'.repeat(32), 'r' + 'b'.repeat(32)]
  const put = (over: object) => ({ puts: [{ ...rec({ id: 'i-aaaaaa' }), ...over }] })

  const cases: [string, object][] = [
    ['two parents out of order', { kind: 'merge', parents: [rb, ra] }],
    ['two parents the same', { kind: 'merge', parents: [ra, ra] }],
    ['a merge with one parent', { kind: 'merge', parents: [ra] }],
    ['three parents', { kind: 'settle', parents: [ra, rb, 'r' + 'c'.repeat(32)] }],
    ['a record id whose letter isn\'t its kind', put({ id: 'g-aaaaaa' })],
    ['a record id outside the alphabet', put({ id: 'i-aaaaao' })],
    ['one record put twice', { puts: [rec({ id: 'i-aaaaaa' }), rec({ id: 'i-aaaaaa' })] }],
    ['a prev that has a prev', put({ prev: { ...rec({ id: 'i-aaaaaa' }), prev: rec({ id: 'i-aaaaaa' }) } })],
    ['a conflict that has a conflict', put({ conflict: { ...rec({ id: 'i-aaaaaa' }), conflict: rec({ id: 'i-aaaaaa' }) } })],
    ['a float under a key this reader does not know', { future: 1.5 }],
    ['a time with no milliseconds', { at: '2026-10-29T12:00:00Z' }],
    ['an author nobody is', { by: 'robot' }],
    ['a negative byte count', { text: { id: 'e'.repeat(40), bytes: -1 } }],
    ['a term rule with no level', put({ rule: { type: 'term', not: [] } })],
  ]
  for (const [name, over] of cases) test(name, () => expect(bad(over)).toMatchObject({ ok: false, why: 'malformed' }))

  test('bytes that are not JSON, or not UTF-8', () => {
    expect(decodeBody(new TextEncoder().encode('{'))).toMatchObject({ ok: false, why: 'malformed' })
    // U+FFFD would stand in for the bad byte, so the body would encode to other bytes and another id.
    const withBadByte = new TextEncoder().encode(JSON.stringify({ ...body(), future: 'Q' }))
    withBadByte[withBadByte.indexOf(0x51)] = 0xff
    expect(decodeBody(withBadByte)).toMatchObject({ ok: false, why: 'malformed' })
  })
})
