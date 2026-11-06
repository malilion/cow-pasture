import { mkdir, readFile, rename, rm, writeFile, link, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { breadth, decodeSnapshot, industryAggregates } from '../../docs/js/logic.js';

const finite = value => Number.isFinite(value) ? value : null;
export function validHistory(value) {
  return value?.v === 1 && /^\d{4}-\d{2}-\d{2}$/.test(value.marketDate) &&
    Array.isArray(value.times) && Array.isArray(value.generatedAt) && value.times.length === value.generatedAt.length &&
    ['indices', 'industries', 'breadth', 'series'].every(group => value[group] && typeof value[group] === 'object' &&
      !Array.isArray(value[group]) && Object.values(value[group]).every(rows => Array.isArray(rows) && rows.length === value.times.length && rows.every(x => x === null || Number.isFinite(x))));
}
export function appendHistory(prev, snapshot) {
  const stocks = decodeSnapshot(snapshot);
  const history = validHistory(prev) && prev.marketDate === snapshot.marketDate ? prev : {
    v: 1, marketDate: snapshot.marketDate, times: [], generatedAt: [], indices: {}, industries: {}, breadth: {}, series: {},
  };
  if (history.times.length && history.times.at(-1) === (snapshot.quoteTime ?? null) && history.generatedAt.at(-1) === (snapshot.generatedAt ?? null)) return history;
  const b = breadth(stocks);
  const sample = {
    indices: { taiex: finite(snapshot.indices?.taiex?.price), otc: finite(snapshot.indices?.otc?.price) },
    industries: Object.fromEntries(industryAggregates(stocks, null).map(s => [s.name, s.avg])),
    breadth: { up: b.up, down: b.down, pastureIndex: b.pastureIndex },
    series: Object.fromEntries(stocks.map(s => [s.key, finite(s.price)])),
  };
  const result = { v: 1, marketDate: snapshot.marketDate,
    times: [...history.times, snapshot.quoteTime ?? null].slice(-200),
    generatedAt: [...history.generatedAt, snapshot.generatedAt ?? null].slice(-200) };
  for (const group of Object.keys(sample)) {
    result[group] = Object.fromEntries([...new Set([...Object.keys(history[group]), ...Object.keys(sample[group])])].map(key =>
      [key, [...(history[group][key] ?? Array(history.times.length).fill(null)), finite(sample[group][key])].slice(-200)]));
  }
  return result;
}
export async function readHistory(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
export async function writeHistory(path, history) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try { await writeFile(temporary, JSON.stringify(history)); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
export async function appendHistoryFile({ snapshot, path }) {
  const history = appendHistory(await readHistory(path), snapshot);
  await writeHistory(path, history);
  return history;
}
export async function seedLiveHistory({ url = 'https://malilion.github.io/cow-pasture/data/history.json', out, fetcher = fetch } = {}) {
  const temporary = `${out}.${randomUUID()}.tmp`;
  try {
    try { await access(out); return false; } catch (error) { if (error.code !== 'ENOENT') return false; }
    const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return false;
    const history = await response.json();
    if (!validHistory(history)) return false;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(temporary, JSON.stringify(history));
    // Atomic exclusive publication: a local file created during fetch always wins.
    await link(temporary, out);
    return true;
  } catch { return false; }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
}
