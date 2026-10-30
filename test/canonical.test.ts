import { expect, test } from 'bun:test'
import { canonicalJson } from '../core/canonical.ts'

// Expected strings are written by hand from RFC 8785.
test('canonical JSON sorts keys by UTF-16 unit, drops undefined fields and prints no spaces', () => {
  expect(canonicalJson({ b: [1, { d: null, c: 'é"\n' }], a: undefined, 'é': true, z: false }))
    .toBe('{"b":[1,{"c":"é\\"\\n","d":null}],"z":false,"é":true}')
})

test('canonical JSON sorts by UTF-16 code unit, not code point', () => {
  // U+10000 is the surrogate pair D800 DC00, so it sorts before U+FFFF, though its code point is higher.
  expect(canonicalJson({ '\uffff': 1, '\u{10000}': 2 })).toBe('{"\u{10000}":2,"\uffff":1}')
})

test('canonical JSON refuses what a Go reader could print differently', () => {
  expect(() => canonicalJson({ n: 1.5 })).toThrow()
  expect(() => canonicalJson({ n: 2 ** 53 })).toThrow()
  expect(() => canonicalJson([1, undefined])).toThrow()
})
