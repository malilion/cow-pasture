import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetchSnapshot } from './fetch-snapshot.mjs';
import { deployPages } from './deploy-pages-once.mjs';
import { nextSleep, shouldLoop } from './lib/loop-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function seedLiveSnapshot({
  url = process.env.LIVE_SNAPSHOT_URL ?? 'https://malilion.github.io/cow-pasture/data/snapshot.json',
  out = resolve(root, 'docs/data/snapshot.json'), fetcher = fetch, log = console.log,
} = {}) {
  const temporary = `${out}.${randomUUID()}.tmp`;
  try {
    const response = await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    if (snapshot?.v !== 1 || !Array.isArray(snapshot.rows) || !snapshot.rows.length) {
      throw new Error('快照格式無效或沒有資料');
    }
    await mkdir(dirname(out), { recursive: true });
    await writeFile(temporary, JSON.stringify(snapshot));
    await rename(temporary, out);
    log('已載入線上快照，首輪僅更新 MIS。');
    return true;
  } catch (error) {
    log(`線上快照載入失敗，首輪完整擷取：${error.message}`);
    return false;
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
function positive(env, key, fallback) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} 必須為正數`);
  return value;
}
export function checkModules() {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['scripts/check.mjs'], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`檢查失敗（${code}）`)));
  });
}
export async function runMarketLoop({ env = process.env, fetcher = fetchSnapshot, deploy = deployPages,
  check = checkModules, seed = seedLiveSnapshot, now = Date.now, pause = sleep, log = console.log } = {}) {
  let schedule;
  if (env.GITHUB_EVENT_NAME === 'schedule' && env.GITHUB_EVENT_PATH) {
    schedule = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')).schedule;
  }
  const until = env.MARKET_UNTIL_TAIPEI ?? '13:35';
  const mode = () => shouldLoop({ now: new Date(now()), eventName: env.GITHUB_EVENT_NAME, schedule, until });
  const looping = mode(), start = now(), deadline = start + positive(env, 'MARKET_LOOP_SECONDS', 270) * 1000;
  const targetMs = positive(env, 'MARKET_CYCLE_TARGET_MS', 100_000);
  const minMs = positive(env, 'MARKET_CYCLE_MIN_MS', 90_000);
  const docsDir = resolve(root, 'docs');
  let successes = 0, cycle = 0, stop = false;
  log(looping ? '盤中循環模式：嘗試載入線上快照，後續僅更新 MIS。' : '單次模式：完整擷取、檢查與部署。');
  const seeded = looping && await seed({ url: env.LIVE_SNAPSHOT_URL,
    out: resolve(docsDir, 'data/snapshot.json'), log });
  do {
    const cycleStart = now();
    cycle++;
    let complete = false;
    for (let attempt = 0; attempt < (cycle === 1 ? 1 : 2); attempt++) {
      let fetchMs = 0, deployMs = 0, snapshot;
      try {
        const fetchStart = now();
        // Reserve deployment time inside the loop; standalone full fetch keeps its 5.5-minute budget.
        const budgetMs = looping ? Math.max(1, Math.min(110_000, deadline - now() - 35_000)) : 210_000;
        try { snapshot = await fetcher({ out: resolve(docsDir, 'data'), quotesOnly: seeded || cycle > 1, budgetMs }); }
        finally { fetchMs = now() - fetchStart; }
        if (cycle === 1) await check();
        const deployStart = now();
        try {
          await deploy({ docsDir, cycle: `${cycle}-${attempt + 1}`, env,
            timeoutMs: looping ? Math.max(1, Math.min(90_000, deadline - now() - 5_000)) : 90_000 });
        } finally { deployMs = now() - deployStart; }
        successes++; complete = true;
      } catch (error) {
        log(`週期 ${cycle} 第 ${attempt + 1} 次失敗：${error.message}`);
        if (cycle === 1) throw error;
        if (error.stopLoop) { stop = true; break; }
        if (attempt === 0 && deadline - now() >= 80_000 && mode()) { log('稍後重試本輪一次。'); await pause(5_000); }
        else break;
      } finally {
        log(`週期 ${cycle} | 擷取 ${(fetchMs / 1000).toFixed(1)} 秒 | 部署 ${(deployMs / 1000).toFixed(1)} 秒 | quoteTime ${snapshot?.quoteTime ?? '無'} | generatedAt ${snapshot?.generatedAt ?? '無'}`);
      }
      if (complete) break;
    }
    if (stop || !looping || !mode()) break;
    const elapsed = now() - cycleStart;
    // Use the 90-second lower bound near hand-off, so the default 270-second job
    // can start a third cycle with at least 80 seconds left (rather than leave a long gap).
    const desired = nextSleep(elapsed, { targetMs, minMs });
    const delay = Math.min(desired, Math.max(0, deadline - now() - 80_000));
    if (elapsed + delay < minMs) break;
    if (deadline - now() - delay < 80_000) break;
    if (delay) await pause(delay);
    if (!mode() || deadline - now() < 80_000) break;
  } while (true);
  if (!successes) throw new Error('本次沒有成功部署；保留上次 Pages。');
  log(`完成 ${cycle} 個週期，成功部署 ${successes} 次。`);
  return { cycles: cycle, successes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMarketLoop().catch(error => { console.error(error.message); process.exitCode = 1; });
}
