import type { Ports } from '../core/ports.ts'
import type { Rev, RevBody, ScaffoldRecord } from '../core/types.ts'
import { revId } from '../core/revision.ts'

export const ports: Pick<Ports, 'digest'> = {
  digest: async (algo, bytes) => new Uint8Array(await crypto.subtle.digest(algo, bytes)),
}

export const T0 = '2026-10-29T12:00:00.000Z'
export const T1 = '2026-10-29T12:05:00.000Z'
export const PIECE = 'p0123456789abcdefghjkmnpqrs'
export const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'

export function rec(over: Partial<ScaffoldRecord> & { id: string }): ScaffoldRecord {
  return { kind: 'idea', level: 'paragraph', text: 'text', standing: 'proposed', by: 'agent', how: 'proposed', at: T0, ...over }
}

export function body(over: Partial<RevBody> = {}): RevBody {
  return { v: 1, piece: PIECE, parents: [], text: { id: EMPTY_BLOB, bytes: 0 }, kind: 'init', by: 'agent', at: T0, ...over }
}

export async function rev(over: Partial<RevBody> = {}): Promise<Rev> {
  const b = body(over)
  return { id: await revId(ports, b), body: b }
}
