import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchSnapshot } from './fetch-snapshot.mjs';
import { checkModules, seedLiveSnapshot } from './lib/cycle-support.mjs';

export function parseCycle(args) {
  if (args.length !== 2 || args[0] !== '--cycle' || !/^[1-9]\d*$/.test(args[1]) || !Number.isSafeInteger(Number(args[1]))) {
    throw new Error('用法：node scripts/run-cycle.mjs --cycle N（正整數）');
  }
  return Number(args[1]);
}
export async function runCycle({ cycle = 1, env = process.env, out = 'docs/data',
  fetcher = fetchSnapshot, seed = seedLiveSnapshot, check = checkModules,
  now = Date.now, log = console.log } = {}) {
  if (!Number.isSafeInteger(cycle) || cycle < 1) throw new Error('cycle 必須為正整數');
  const start = now();
  let snapshot, fetchMs = 0;
  try {
    // The seed helper returns false on failure and leaves any existing snapshot intact.
    const seeded = cycle === 1 && await seed({ url: env.LIVE_SNAPSHOT_URL,
      out: resolve(out, 'snapshot.json'), log });
    const fetchStart = now();
    try {
      snapshot = await fetcher({ out, quotesOnly: seeded || cycle > 1,
        budgetMs: cycle > 1 || env.MARKET_LOOP !== 'false' ? 110_000 : 210_000 });
    } finally { fetchMs = now() - fetchStart; }
    if (cycle === 1) await check();
    return snapshot;
  } finally {
    log(`週期 ${cycle} | 擷取 ${(fetchMs / 1000).toFixed(1)} 秒 | 總計 ${((now() - start) / 1000).toFixed(1)} 秒 | quoteTime ${snapshot?.quoteTime ?? '無'} | generatedAt ${snapshot?.generatedAt ?? '無'}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  Promise.resolve().then(() => runCycle({ cycle: parseCycle(process.argv.slice(2)) }))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
