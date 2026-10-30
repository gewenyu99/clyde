// Every effect the core can have, injected. The core never imports a Node or Bun API.
// `store`, `git` and `tool` join this type in the slices that use them (3, 4 and 9).

export type Ports = {
  fs: {
    read(p: string): Promise<string>
    readBytes(p: string): Promise<Uint8Array>
    exists(p: string): Promise<boolean>
    list(d: string): Promise<string[]>
    stat(p: string): Promise<{ mtimeMs: number; size: number } | null>
  }
  digest(algo: 'SHA-1' | 'SHA-256', bytes: Uint8Array): Promise<Uint8Array>
  budgetMs(): number
  now(): string
  id(): string
}
