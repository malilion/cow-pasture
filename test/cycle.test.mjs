import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCycle, runCycle } from '../scripts/run-cycle.mjs';
import { modeOutput, writeModeOutput } from '../scripts/lib/loop-policy.mjs';

test('cycle 1 seeds in both modes, falls back to full fetch, and checks once; later cycles only fetch quotes', async () => {
  for (const cycle of [1, 2, 3]) {
    for (const seeded of [true, false]) {
      for (const loop of ['true', 'false']) {
        const calls = [], logs = [];
        let clock = 0;
        const snapshot = { quoteTime: '09:01:00', generatedAt: '2026-11-06T01:01:01Z' };
        const result = await runCycle({ seedHistory: async () => {}, append: async () => {}, cycle, env: { MARKET_LOOP: loop, LIVE_SNAPSHOT_URL: 'https://example.com/live.json' },
          now: () => clock, log: line => logs.push(line), seed: async options => {
            calls.push('seed');
            assert.equal(options.url, 'https://example.com/live.json');
            assert.ok(options.out.endsWith('/docs/data/snapshot.json'));
            clock += 1_000;
            return seeded;
          }, fetcher: async options => {
            calls.push('fetch');
            assert.equal(options.quotesOnly, cycle > 1 || seeded);
            assert.equal(options.budgetMs, cycle > 1 || loop === 'true' ? 110_000 : 210_000);
            clock += 80_000;
            return snapshot;
          }, check: async () => { calls.push('check'); clock += 2_000; },
        });
        assert.equal(result, snapshot);
        assert.deepEqual(calls, cycle === 1 ? ['seed', 'fetch', 'check'] : ['fetch']);
        assert.match(logs[0], /擷取 80\.0 秒/);
        assert.ok(logs[0].includes(`總計 ${cycle === 1 ? '83.0' : '80.0'} 秒`));
        assert.ok(logs[0].includes(`quoteTime ${snapshot.quoteTime} | generatedAt ${snapshot.generatedAt}`));
      }
    }
  }
});
test('fetch/check failures propagate and still log cycle timing', async () => {
  for (const cycle of [1, 2, 3]) {
    const logs = [];
    await assert.rejects(runCycle({ seedHistory: async () => {}, append: async () => {}, cycle, seed: async () => false,
      fetcher: async () => { throw new Error('fetch failed'); },
      check: async () => assert.fail('cannot check a failed fetch'), log: line => logs.push(line),
    }), /fetch failed/);
    assert.match(logs[0], /quoteTime 無 \| generatedAt 無/);
  }
  await assert.rejects(runCycle({ seedHistory: async () => {}, append: async () => {}, seed: async () => true, fetcher: async () => ({}),
    check: async () => { throw new Error('check failed'); }, log: () => {},
  }), /check failed/);
});
test('cycle argument parser requires a positive integer', () => {
  assert.equal(parseCycle(['--cycle', '3']), 3);
  for (const args of [[], ['--cycle'], ['--cycle', '0'], ['--cycle', '-1'], ['--cycle', '1.5'], ['--cycle', 'x'], ['--cycle', '1', '--extra']]) {
    assert.throws(() => parseCycle(args), /用法/);
  }
});
test('mode output follows Taipei boundaries and event schedule; output writer appends GITHUB_OUTPUT', async () => {
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch' };
  for (const [date, expected] of [
    ['2026-11-06T00:59:59Z', false], ['2026-11-06T01:00:00Z', true],
    ['2026-11-06T05:34:59Z', true], ['2026-11-06T05:35:00Z', false], ['2026-11-07T01:00:00Z', false],
  ]) assert.equal(await modeOutput({ env, now: new Date(date) }), `loop=${expected}`);
  const temp = await mkdtemp(join(tmpdir(), 'cow-mode-'));
  try {
    const event = join(temp, 'event.json'), output = join(temp, 'output');
    await writeFile(event, JSON.stringify({ schedule: '20 6 * * 1-5' }));
    const scheduledEnv = { GITHUB_EVENT_NAME: 'schedule', GITHUB_EVENT_PATH: event };
    assert.equal(await modeOutput({ env: scheduledEnv, now: new Date('2026-11-06T01:00:00Z') }), 'loop=false');
    await writeFile(output, 'existing=value\n');
    const logs = [];
    assert.equal(await writeModeOutput({ env: { ...scheduledEnv, GITHUB_OUTPUT: output },
      now: new Date('2026-11-06T01:00:00Z'), log: line => logs.push(line),
    }), 'loop=false');
    assert.deepEqual(logs, ['loop=false']);
    assert.equal(await readFile(output, 'utf8'), 'existing=value\nloop=false\n');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
