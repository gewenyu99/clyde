import { encodeBody } from './codec.ts'
import type { Ports } from './ports.ts'
import type { Ctx, Rev, RevBody, ScaffoldRecord, TextRef } from './types.ts'

type Digests = Pick<Ports, 'digest'>

export const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** `'r'` plus the first 32 hex characters of the SHA-256 of the canonical body. */
export async function revId(ports: Digests, body: RevBody): Promise<string> {
  return 'r' + hex(await ports.digest('SHA-256', encodeBody(body))).slice(0, 32)
}

/**
 * What the merge resolution decided. `text`, `puts`, `ctx` and `header` are changes against the
 * first parent after sorting (the lower id), since that is the state `applyRev` starts from. Everything here must come out the same on every
 * device that merges this pair, since the revision's id is the hash of what it holds.
 */
export type MergeInput = {
  ours: Rev
  theirs: Rev
  text: TextRef
  by: RevBody['by']
  act?: string
  header?: RevBody['header']
  puts?: ScaffoldRecord[]
  ctx?: { [id: string]: Ctx | null }
  base?: string
}

/**
 * The merge revision of two parents. The parents sort by id, so which side is "ours" doesn't matter,
 * the device-local fields (`session`, `toolUse`, `agentId`, `client`) stay out, `at` is the later
 * parent's, and puts sort by id.
 */
export async function mintMerge(ports: Digests, input: MergeInput): Promise<Rev> {
  const { ours, theirs } = input
  if (ours.id === theirs.id) throw new Error(`can't merge ${ours.id} with itself`)
  if (ours.body.piece !== theirs.body.piece) throw new Error('can\'t merge revisions of two pieces')

  const body: RevBody = {
    v: 1,
    piece: ours.body.piece,
    parents: [ours.id, theirs.id].sort(),
    text: input.text,
    kind: 'merge',
    by: input.by,
    act: input.act,
    at: ours.body.at > theirs.body.at ? ours.body.at : theirs.body.at,
    header: input.header,
    puts: input.puts && [...input.puts].sort((a, b) => (a.id < b.id ? -1 : 1)),
    ctx: input.ctx,
    base: input.base,
  }
  return { id: await revId(ports, body), body }
}

/** A merge of this pair already known, as a remote device's, is adopted rather than minted again. */
export async function mergeRev(ports: Digests, known: Rev[], input: MergeInput): Promise<Rev> {
  const parents = [input.ours.id, input.theirs.id].sort()
  const existing = known.find((r) => r.body.kind === 'merge' && r.body.parents.join() === parents.join())
  return existing ?? mintMerge(ports, input)
}
