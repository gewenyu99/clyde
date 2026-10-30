// Bytes to and from a revision body. A body is stored and hashed as canonical JSON.
//
// decodeBody checks the shape the type promises and returns the parsed object itself,
// so keys this reader doesn't know ride along and encode back unchanged (design: loader rule 5).
// It never reads a body from a higher major version.

import { canonicalJson, CanonicalError } from './canonical.ts'
import type { RevBody } from './types.ts'

export type Decoded<T> = { ok: true; value: T } | { ok: false; why: 'version' | 'malformed'; detail: string }

export function encodeBody(body: RevBody): Uint8Array {
  return new TextEncoder().encode(canonicalJson(body))
}

export function decodeBody(bytes: Uint8Array): Decoded<RevBody> {
  let raw: unknown
  try {
    // Fatal, since a replacement character would encode back to other bytes and so to another id.
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (e) {
    return { ok: false, why: 'malformed', detail: e instanceof Error ? e.message : String(e) }
  }
  try {
    const value = readBody(raw)
    canonicalJson(value) // a body that can't be hashed (a float under an unknown key) can't be read either
    return { ok: true, value }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, why: e.why, detail: e.detail }
    if (e instanceof CanonicalError) return { ok: false, why: 'malformed', detail: e.message }
    throw e
  }
}

class Bad extends Error {
  constructor(readonly why: 'version' | 'malformed', readonly detail: string) {
    super(detail)
  }
}

const ALPHABET = '0-9a-hjkmnp-tv-z' // Crockford base32, lowercase
const PIECE_ID = new RegExp(`^p[${ALPHABET}]{26}$`)
const RECORD_ID = new RegExp(`^[girc]-[${ALPHABET}]{6}$`)
const KIND_LETTER = { goal: 'g', idea: 'i', reason: 'r', commitment: 'c' } as const
const REV_ID = /^r[0-9a-f]{32}$/
const BLOB_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/

const REV_KINDS = ['init', 'settle', 'outside', 'claim', 'decide', 'lane', 'merge', 'git', 'import', 'fork', 'hold']
const REV_AUTHORS = /^(?:writer|agent|outside|git|hook|lane:.+)$/
const RECORD_AUTHORS = /^(?:writer|agent|outside|lane:.+)$/
const CHANGES = ['wording', 'meaning', 'function', 'new', 'delete', 'split', 'merge', 'move', 'rename', 'rewrite', 'draft']
const KINDS = ['goal', 'idea', 'reason', 'commitment']
const LEVELS = ['piece', 'section', 'paragraph', 'sentence', 'word']
const FNS = [
  'claim', 'reason', 'evidence', 'warrant', 'concession', 'response', 'definition',
  'example', 'background', 'setup', 'payoff', 'transition', 'summary', 'question', 'scene', 'hook',
]
const RELS = ['needs', 'setup', 'antecedent', 'precedes', 'supports', 'answers', 'echo']
const HOWS = ['stated', 'confirmed', 'proposed', 'inferred', 'validated']

type Obj = { [k: string]: unknown }

function bad(at: string, msg: string): never {
  throw new Bad('malformed', `${at}: ${msg}`)
}

function obj(v: unknown, at: string): Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : bad(at, 'expected an object')
}

function str(v: unknown, at: string, pattern?: RegExp): string {
  if (typeof v !== 'string') return bad(at, 'expected a string')
  if (pattern && !pattern.test(v)) return bad(at, `"${v}" has the wrong shape`)
  return v
}

function oneOf(v: unknown, at: string, allowed: string[]): string {
  return typeof v === 'string' && allowed.includes(v) ? v : bad(at, `expected one of ${allowed.join(', ')}`)
}

function int(v: unknown, at: string): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : bad(at, 'expected a non-negative integer')
}

function list(v: unknown, at: string, each: (item: unknown, at: string) => void): void {
  if (!Array.isArray(v)) return bad(at, 'expected an array')
  v.forEach((item, i) => each(item, `${at}[${i}]`))
}

/** Reads field `k` of `o` when present. */
function opt(o: Obj, k: string, at: string, check: (v: unknown, at: string) => void): void {
  if (o[k] !== undefined) check(o[k], `${at}.${k}`)
}

function readBody(raw: unknown): RevBody {
  const o = obj(raw, 'body')
  if (typeof o.v === 'number' && Number.isInteger(o.v) && o.v > 1) throw new Bad('version', `body is format v${o.v}, this reader knows v1`)
  if (o.v !== 1) bad('body.v', 'expected 1')

  str(o.piece, 'body.piece', PIECE_ID)
  list(o.parents, 'body.parents', (p, at) => str(p, at, REV_ID))
  const parents = o.parents as string[]
  if (parents.length > 2) bad('body.parents', 'at most two')
  if (parents.length === 2 && parents[0]! >= parents[1]!) bad('body.parents', 'two parents are distinct and sorted')
  readTextRef(o.text, 'body.text')
  oneOf(o.kind, 'body.kind', REV_KINDS)
  if (o.kind === 'merge' && parents.length !== 2) bad('body.parents', 'a merge has two parents')
  str(o.by, 'body.by', REV_AUTHORS)
  str(o.at, 'body.at', TIME)
  opt(o, 'act', 'body', (v, at) => str(v, at))
  opt(o, 'call', 'body', (v, at) => {
    const c = obj(v, at)
    str(c.point, `${at}.point`)
    str(c.call, `${at}.call`)
    oneOf(c.change, `${at}.change`, CHANGES)
  })
  opt(o, 'client', 'body', (v, at) => oneOf(v, at, ['claude-code', 'codex', 'cursor']))
  for (const k of ['session', 'toolUse', 'agentId']) opt(o, k, 'body', (v, at) => str(v, at))
  opt(o, 'header', 'body', (v, at) => {
    const h = obj(v, at)
    opt(h, 'mode', at, (m, mAt) => oneOf(m, mAt, ['draft', 'revise']))
    opt(h, 'drafting', at, (d, dAt) => list(d, dAt, (s, sAt) => str(s, sAt)))
  })
  opt(o, 'puts', 'body', readPuts)
  opt(o, 'ctx', 'body', (v, at) => {
    for (const [id, c] of Object.entries(obj(v, at))) {
      str(id, `${at} key`, RECORD_ID)
      if (c === null) continue
      const ctx = obj(c, `${at}.${id}`)
      for (const k of ['pre', 'suf', 'self']) str(ctx[k], `${at}.${id}.${k}`)
    }
  })
  opt(o, 'base', 'body', (v, at) => str(v, at, REV_ID))
  return o as unknown as RevBody
}

function readTextRef(v: unknown, at: string): void {
  const t = obj(v, at)
  str(t.id, `${at}.id`, BLOB_ID)
  opt(t, 'git', at, (g, gAt) => str(g, gAt, BLOB_ID))
  int(t.bytes, `${at}.bytes`)
}

function readPuts(v: unknown, at: string): void {
  const seen = new Set<string>()
  list(v, at, (r, rAt) => {
    readRecord(r, rAt, null)
    const id = (r as Obj).id as string
    if (seen.has(id)) bad(rAt, `id ${id} is put twice`)
    seen.add(id)
  })
}

/** `nested` is the side record this one sits in, which may not nest the same side again. */
function readRecord(v: unknown, at: string, nested: 'prev' | 'conflict' | null): void {
  const r = obj(v, at)
  const kind = oneOf(r.kind, `${at}.kind`, KINDS) as keyof typeof KIND_LETTER
  str(r.id, `${at}.id`, RECORD_ID)
  if ((r.id as string)[0] !== KIND_LETTER[kind]) bad(`${at}.id`, `a ${kind} id starts with ${KIND_LETTER[kind]}`)
  oneOf(r.level, `${at}.level`, LEVELS)
  str(r.text, `${at}.text`)
  opt(r, 'fn', at, (f, fAt) => oneOf(f, fAt, FNS))
  opt(r, 'serves', at, (s, sAt) => str(s, sAt, RECORD_ID))
  for (const k of ['does', 'audience', 'exigence', 'said', 'retired']) opt(r, k, at, (s, sAt) => str(s, sAt))
  opt(r, 'needs', at, (n, nAt) =>
    list(n, nAt, (item, iAt) => {
      const need = obj(item, iAt)
      str(need.id, `${iAt}.id`, RECORD_ID)
      oneOf(need.rel, `${iAt}.rel`, RELS)
    }),
  )
  opt(r, 'anchor', at, (a, aAt) => {
    const anchor = obj(a, aAt)
    str(anchor.q, `${aAt}.q`)
    opt(anchor, 'end', aAt, (e, eAt) => str(e, eAt))
  })
  opt(r, 'rule', at, readRule)
  opt(r, 'pins', at, (p, pAt) => {
    const pins = obj(p, pAt)
    for (const k of ['up', 'kids', 'order']) opt(pins, k, pAt, (s, sAt) => str(s, sAt))
    opt(pins, 'needs', pAt, (n, nAt) => Object.entries(obj(n, nAt)).forEach(([id, pin]) => str(pin, `${nAt}.${id}`)))
  })
  opt(r, 'doubt', at, (d, dAt) => {
    const doubt = obj(d, dAt)
    oneOf(doubt.by, `${dAt}.by`, ['code', 'lane:edit'])
    str(doubt.at, `${dAt}.at`, TIME)
    for (const k of ['was', 'now', 'why']) str(doubt[k], `${dAt}.${k}`)
  })
  oneOf(r.standing, `${at}.standing`, ['confirmed', 'proposed'])
  str(r.by, `${at}.by`, RECORD_AUTHORS)
  oneOf(r.how, `${at}.how`, HOWS)
  str(r.at, `${at}.at`, TIME)
  if (nested !== 'prev') opt(r, 'prev', at, (p, pAt) => readRecord(p, pAt, 'prev'))
  else if (r.prev !== undefined) bad(`${at}.prev`, 'a prev has no prev')
  if (nested !== 'conflict') opt(r, 'conflict', at, (c, cAt) => readRecord(c, cAt, 'conflict'))
  else if (r.conflict !== undefined) bad(`${at}.conflict`, 'a conflict has no conflict')
}

function readRule(v: unknown, at: string): void {
  const rule = obj(v, at)
  switch (oneOf(rule.type, `${at}.type`, ['term', 'promise', 'fact', 'voice'])) {
    case 'term':
      opt(rule, 'use', at, (s, sAt) => str(s, sAt))
      list(rule.not, `${at}.not`, (s, sAt) => str(s, sAt))
      opt(rule, 'intro', at, (b, bAt) => (typeof b === 'boolean' ? undefined : bad(bAt, 'expected a boolean')))
      oneOf(rule.level, `${at}.level`, ['error', 'warning', 'suggestion'])
      return
    case 'voice':
      int(rule.rank, `${at}.rank`)
  }
}
