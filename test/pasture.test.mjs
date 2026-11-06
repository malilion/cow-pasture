import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../docs/vendor/three.module.min.js';
import { cowSupportHeight, fitTerrainCamera, layout } from '../docs/js/pasture.js';
import { readFile } from 'node:fs/promises';
import { normalizeEod } from '../scripts/lib/normalize.mjs';
import { changePct } from '../docs/js/logic.js';

function projectBounds(bounds, width, height) {
  const yaw = -0.35, pitch = 0.53;
  const { target, radius } = fitTerrainCamera(bounds, width / height, yaw, pitch);
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 2000);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius,
    Math.cos(yaw) * Math.cos(pitch) * radius).add(target);
  camera.lookAt(target); camera.updateMatrixWorld();
  const projected = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    projected.push(new THREE.Vector3(x, y, z).project(camera));
  }
  return { projected, radius };
}

test('桌面與 360–390px 手機取景填滿約 90% 寬，所有地形邊界留在畫面內', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-43, -0.82, -36.25), new THREE.Vector3(43, 2.1, 36.25));
  for (const [w, h] of [[1280, 620], [1280, 512], [362, 420], [332, 420]]) {
    const { projected } = projectBounds(bounds, w, h);
    for (const p of projected) {
      assert.ok(Math.abs(p.x) <= 0.900001 && Math.abs(p.y) <= 0.860001 && p.z < 1);
    }
    const xs = projected.map(p => p.x), widthRatio = (Math.max(...xs) - Math.min(...xs)) / 2;
    assert.ok(widthRatio >= 0.85 && widthRatio <= 0.900001, `${w}x${h}: ${widthRatio}`);
  }
  assert.ok(projectBounds(bounds, 332, 420).radius > projectBounds(bounds, 1280, 620).radius);
});

test('放大乳牛的整個腳印與行走路徑高於附近田塊，遠處高地不使牛懸空', () => {
  const tiles = [{ x: 0, z: 0, height: 0.28 }, { x: 5, z: 0, height: 1.8 },
    { x: 10, z: 0, height: 2.08 }, { x: 50, z: 0, height: 20 }];
  const scale = 4.5, a = { x: 0, z: 0 }, b = { x: 4, z: 0 };
  assert.equal(cowSupportHeight(tiles, a, b, scale), 2.12);
  assert.equal(cowSupportHeight(tiles, b, a, scale), 2.12);
  assert.equal(cowSupportHeight([], a, b, scale), 0.06);
});

test('真實樣本的地形保留每檔股票與實際漲跌高度', async () => {
  const rows = JSON.parse(await readFile(new URL('fixtures/twse_STOCK_DAY_ALL.sample.json', import.meta.url), 'utf8'));
  const stocks = normalizeEod(rows, 'tse').map(s => ({ ...s, pct: changePct(s.price, s.prev) }));
  const { tiles, width, depth } = layout(stocks);
  assert.equal(tiles.length, stocks.length);
  assert.deepEqual(new Set(tiles.map(t => t.stock)), new Set(stocks));
  for (const tile of tiles) {
    assert.equal(tile.height, 0.28 + Math.min(Math.abs(tile.stock.pct ?? 0), 10) * 0.18);
    assert.ok(Math.abs(tile.x) < width / 2 && Math.abs(tile.z) < depth / 2);
  }
});
