// The scaffold format, as design.md "The revision format" writes it.
// `Record` there is `ScaffoldRecord` here, so it doesn't shadow TypeScript's utility type.

export type Kind = 'goal' | 'idea' | 'reason' | 'commitment'
export type Level = 'piece' | 'section' | 'paragraph' | 'sentence' | 'word'
export type Fn =
  | 'claim' | 'reason' | 'evidence' | 'warrant' | 'concession' | 'response' | 'definition'
  | 'example' | 'background' | 'setup' | 'payoff' | 'transition' | 'summary' | 'question' | 'scene' | 'hook'
export type Rel = 'needs' | 'setup' | 'antecedent' | 'precedes' | 'supports' | 'answers' | 'echo'
export type Change =
  | 'wording' | 'meaning' | 'function' | 'new' | 'delete' | 'split' | 'merge'
  | 'move' | 'rename' | 'rewrite' | 'draft'

export type Rule =
  | { type: 'term'; use?: string; not: string[]; intro?: boolean; level: 'error' | 'warning' | 'suggestion' }
  | { type: 'promise' }
  | { type: 'fact' }
  | { type: 'voice'; rank: number }

export type ScaffoldRecord = {
  id: string
  kind: Kind
  level: Level
  text: string
  fn?: Fn
  does?: string
  serves?: string
  needs?: { id: string; rel: Rel }[]
  anchor?: { q: string; end?: string }
  rule?: Rule
  audience?: string
  exigence?: string
  pins?: { up?: string; kids?: string; needs?: { [id: string]: string }; order?: string }
  doubt?: { by: 'code' | 'lane:edit'; at: string; was: string; now: string; why: string }
  standing: 'confirmed' | 'proposed'
  by: 'writer' | 'agent' | 'outside' | `lane:${string}`
  how: 'stated' | 'confirmed' | 'proposed' | 'inferred' | 'validated'
  said?: string
  at: string
  prev?: Omit<ScaffoldRecord, 'prev'>
  retired?: string
  conflict?: Omit<ScaffoldRecord, 'conflict'>
}

export type Ctx = { pre: string; suf: string; self: string }

export type TextRef = { id: string; git?: string; bytes: number }

export type RevKind =
  | 'init' | 'settle' | 'outside' | 'claim' | 'decide' | 'lane' | 'merge' | 'git' | 'import' | 'fork' | 'hold'

export type RevBody = {
  v: 1
  piece: string
  parents: string[]
  text: TextRef
  kind: RevKind
  by: 'writer' | 'agent' | 'outside' | 'git' | 'hook' | `lane:${string}`
  act?: string
  call?: { point: string; call: string; change: Change }
  client?: 'claude-code' | 'codex' | 'cursor'
  session?: string
  toolUse?: string
  agentId?: string
  at: string
  header?: { mode?: 'draft' | 'revise'; drafting?: string[] }
  puts?: ScaffoldRecord[]
  ctx?: { [id: string]: Ctx | null }
  base?: string
}

/** A revision and its id. The id is derived from the body, never stored in it. */
export type Rev = { id: string; body: RevBody }

/** The state at a revision: its first parent's state with header, puts and ctx applied. */
export type State = {
  rev: string
  piece: string
  text: TextRef
  header: { mode?: 'draft' | 'revise'; drafting?: string[] }
  records: ScaffoldRecord[]          // sorted by id
  ctx: { [id: string]: Ctx }
  /** For each record, the revision that put its current version, and that revision's act. */
  origin: { [id: string]: { rev: string; act?: string } }
}
