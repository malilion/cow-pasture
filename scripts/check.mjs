import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function sources(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await sources(path));
    else if (/\.[cm]?js$/.test(entry.name)) paths.push(path);
  }
  return paths;
}
const files = (await Promise.all(['docs/js', 'scripts', '.github/actions'].map(dir => sources(resolve(root, dir))))).flat().sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`語法檢查通過：${files.length} 個模組`);
const result = spawnSync(process.execPath, ['--test', 'test/index.js'], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
