import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendHistoryFile } from './lib/history.mjs';

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 4 || args[0] !== '--snapshot' || args[2] !== '--history') throw new Error('用法：node scripts/append-history.mjs --snapshot docs/data/snapshot.json --history docs/data/history.json');
  return appendHistoryFile({ snapshot: JSON.parse(await readFile(args[1], 'utf8')), path: args[3] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
