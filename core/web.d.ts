// The two web-standard text codecs the core needs. Declared here because core
// compiles with no DOM, Node or Bun types (tsconfig.core.json).
declare class TextEncoder {
  encode(input: string): Uint8Array
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean })
  decode(input: Uint8Array): string
}
