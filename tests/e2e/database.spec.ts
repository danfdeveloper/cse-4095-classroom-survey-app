/**
 * Phase 14: "Test database Row Level Security". Runs the database verification
 * script (scripts/verify-db.ts: RLS, grants, RPCs, triggers, cascades) and the
 * CSV unit tests as part of the suite. Browser-independent, so Chrome only.
 */
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test.skip(({ browserName }) => browserName !== 'chromium', 'runs once, not per browser')

/** Runs a check script and returns its output, whether it passed or failed. */
function run(script: string): string {
  try {
    return execFileSync(process.execPath, [script], {
      env: process.env,
      encoding: 'utf8',
      timeout: 120_000,
    })
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? String(e)
  }
}

for (const [name, script] of [
  ['database security and RPCs (npm run verify:db)', 'scripts/verify-db.ts'],
  ['CSV escaping unit tests (npm run test:csv)', 'scripts/test-csv.ts'],
]) {
  test(name, () => {
    const output = run(script)
    const failed = output.split('\n').filter((l) => /^(FAIL|ERROR)/.test(l))
    expect(failed, output).toEqual([])
    expect(output).toContain('All checks passed')
  })
}
