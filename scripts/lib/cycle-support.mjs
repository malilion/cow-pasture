import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
export function checkModules() {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['scripts/check.mjs'], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`檢查失敗（${code}）`)));
  });
}
