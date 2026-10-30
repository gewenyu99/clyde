import { expect, test } from 'bun:test'

// The core runs inside a Claude Code mod, so it may touch no Node, Bun or DOM API.
// tsconfig.core.json loads no such types, and the compiler is the fence.
test('core compiles with no Node, Bun or DOM types', async () => {
  const root = `${import.meta.dir}/..`
  const tsc = Bun.spawn([`${root}/node_modules/.bin/tsc`, '--noEmit', '-p', 'tsconfig.core.json'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [out, code] = await Promise.all([new Response(tsc.stdout).text(), tsc.exited])
  expect(out).toBe('')
  expect(code).toBe(0)
})
