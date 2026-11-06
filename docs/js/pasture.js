import * as THREE from '../vendor/three.module.min.js';
import { stockDetail, tileColor } from './display.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fraction = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function layout(stocks) {
  const groups = new Map();
  for (const stock of stocks) { if (!groups.has(stock.ind)) groups.set(stock.ind, []); groups.get(stock.ind).push(stock); }
  const blocks = [...groups].sort((a, b) => b[1].length - a[1].length);
  const shelfWidth = Math.max(12, Math.ceil(Math.sqrt(stocks.length) * 1.7));
  const tiles = []; let x = 0, z = 0, rowDepth = 0, width = 0;
  for (const [, rows] of blocks) {
    const cols = Math.ceil(Math.sqrt(rows.length * 1.4)), depth = Math.ceil(rows.length / cols);
    const blockWidth = cols * 1.15 + 2, blockDepth = depth * 1.15 + 2;
    if (x && x + blockWidth > shelfWidth) { x = 0; z += rowDepth; rowDepth = 0; }
    rows.forEach((stock, i) => tiles.push({ stock, x: x + i % cols * 1.15, z: z + Math.floor(i / cols) * 1.15,
      height: 0.28 + Math.min(Math.abs(stock.pct ?? 0), 10) * 0.18 }));
    x += blockWidth; rowDepth = Math.max(rowDepth, blockDepth); width = Math.max(width, x);
  }
  const depth = z + rowDepth;
  tiles.forEach(tile => { tile.x -= width / 2 - 1; tile.z -= depth / 2 - 1; });
  return { tiles, width: width + 3, depth: depth + 3 };
}

export function fitTerrainCamera(bounds, aspect, yaw = -0.35, pitch = 0.53, fov = 42) {
  const target = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tanY = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const limitX = tanY * aspect * 0.9, limitY = tanY * 0.86;
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(target);
    corners.push({ x: corner.dot(right), y: corner.dot(up), z: corner.dot(direction) });
  }
  // Fit opposite projected edges together, then recenter their perspective bounds.
  // A distance from the longest world-space edge leaves this wide canvas mostly empty.
  let radius = Math.max(...corners.map(corner => corner.z)) + 0.1;
  for (const a of corners) for (const b of corners) {
    radius = Math.max(radius, (a.x - b.x) / (2 * limitX) + (a.z + b.z) / 2,
      (a.y - b.y) / (2 * limitY) + (a.z + b.z) / 2);
  }
  const offset = (axis, limit) => (Math.max(...corners.map(p => p[axis] - limit * (radius - p.z))) +
    Math.min(...corners.map(p => p[axis] + limit * (radius - p.z)))) / 2;
  target.addScaledVector(right, offset('x', limitX)).addScaledVector(up, offset('y', limitY));
  return { target, radius };
}

export function cowSupportHeight(tiles, origin, destination, scale) {
  const margin = scale * 1.35 + 0.6;
  return tiles.reduce((height, tile) => tile.x >= Math.min(origin.x, destination.x) - margin &&
    tile.x <= Math.max(origin.x, destination.x) + margin && tile.z >= Math.min(origin.z, destination.z) - margin &&
    tile.z <= Math.max(origin.z, destination.z) + margin ? Math.max(height, tile.height) : height, 0.02) + 0.04;
}

export function createPasture(container, controls) {
  const mobile = matchMedia('(max-width: 600px)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.replaceChildren(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xdcece4, 70, 240);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xf0f8ff, 0x847e4c, 2.3));
  const sun = new THREE.DirectionalLight(0xfff5d9, 2.5); sun.position.set(-20, 40, 15); scene.add(sun);
  const scenery = new THREE.Group(); scene.add(scenery);
  let tiles = [], terrain, grass, flowers, stems, ground, herd = [], snapshotMood;
  let disposed = false, visible = false, raf = 0, previousTime = 0, elapsed = 0, lastInput = performance.now();
  let width = 30, depth = 30, radius = 60, initialRadius = 60, yaw = -0.35, pitch = 0.53;
  const point = new THREE.Object3D(), color = new THREE.Color(), raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const target = new THREE.Vector3(0, 0, 0);
  const grassTime = { value: 0 };
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 7, 5),
    cone: new THREE.ConeGeometry(1, 1, 5),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 6),
  };
  const material = (colorValue, extra = {}) => new THREE.MeshLambertMaterial({ color: colorValue, ...extra });
  const materials = {
    white: material(0xfffcf0), black: material(0x303734), pink: material(0xe7aca5),
    horn: material(0xc6b18c), soil: material(0xb3a07a), meadow: material(0xb6c58c),
    flower: material(0xd35e6b), stem: material(0x808a51), case: material(0xa17b55),
    tiles: material(0xffffff), grass: material(0x6a9b50, { side: THREE.DoubleSide }),
  };
  materials.grass.onBeforeCompile = shader => {
    shader.uniforms.uPastureTime = grassTime;
    shader.vertexShader = `uniform float uPastureTime;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.x += sin(uPastureTime * 1.7 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z) * 0.12 * position.y * position.y;`);
  };
  materials.grass.customProgramCacheKey = () => 'pasture-sway-v1';
  function mesh(geometry, mat, parent, position, scale) {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(...position); item.scale.set(...scale); parent.add(item); return item;
  }
  function makeCow(departing = false) {
    const cow = new THREE.Group(); scenery.add(cow);
    mesh(geometries.box, materials.white, cow, [0, 0.9, 0], [1.5, 0.8, 0.75]);
    mesh(geometries.sphere, materials.black, cow, [-0.25, 1.05, 0.37], [0.34, 0.28, 0.025]);
    mesh(geometries.sphere, materials.black, cow, [0.35, 0.88, -0.37], [0.3, 0.29, 0.025]);
    mesh(geometries.sphere, materials.black, cow, [-0.47, 1.29, 0.06], [0.25, 0.025, 0.27]);
    for (const z of [-0.38, 0.38]) {
      mesh(geometries.sphere, materials.black, cow, [0.35, 1.08, z], [0.26, 0.23, 0.025]);
      mesh(geometries.sphere, materials.black, cow, [-0.52, 0.73, z], [0.2, 0.19, 0.025]);
    }
    for (const x of [-0.5, 0.5]) for (const z of [-0.23, 0.23]) {
      mesh(geometries.box, materials.white, cow, [x, 0.38, z], [0.18, 0.55, 0.18]);
      mesh(geometries.box, materials.black, cow, [x, 0.1, z], [0.2, 0.18, 0.2]);
    }
    const head = new THREE.Group(); head.position.set(0.75, 1.1, 0); cow.add(head);
    mesh(geometries.box, materials.white, head, [0.22, -0.03, 0], [0.55, 0.58, 0.55]);
    mesh(geometries.box, materials.black, head, [0.05, 0.15, 0.28], [0.28, 0.25, 0.025]);
    mesh(geometries.box, materials.pink, head, [0.48, -0.2, 0], [0.23, 0.3, 0.58]);
    for (const z of [-0.31, 0.31]) {
      const ear = mesh(geometries.box, materials.white, head, [0, 0.17, z * 1.2], [0.3, 0.12, 0.24]); ear.rotation.x = z;
      mesh(geometries.sphere, materials.black, head, [0.3, 0.04, z * 0.92], [0.05, 0.065, 0.03]);
      const horn = mesh(geometries.cone, materials.horn, head, [-0.06, 0.38, z * 0.7], [0.085, 0.3, 0.085]); horn.rotation.x = z * 0.8;
      mesh(geometries.sphere, materials.black, head, [0.6, -0.16, z * 0.6], [0.015, 0.035, 0.04]);
    }
    const tail = new THREE.Group(); tail.position.set(-0.78, 1.05, 0); cow.add(tail);
    mesh(geometries.cylinder, materials.white, tail, [-0.13, -0.18, 0], [0.035, 0.53, 0.035]).rotation.z = -0.35;
    mesh(geometries.sphere, materials.black, tail, [-0.23, -0.44, 0], [0.08, 0.13, 0.08]);
    if (departing) {
      mesh(geometries.box, materials.case, cow, [0.15, 0.45, 0.62], [0.6, 0.48, 0.23]);
      mesh(geometries.box, materials.black, cow, [0.15, 0.73, 0.62], [0.25, 0.1, 0.07]);
    }
    return { group: cow, head, tail, departing };
  }
  function removeInstanced(item, ownGeometry = false) {
    if (!item) return;
    scenery.remove(item); item.dispose();
    if (ownGeometry) item.geometry.dispose();
  }
  function update(stocks, nextMood) {
    if (disposed) return;
    const previousWidth = width, previousDepth = depth, oldMood = snapshotMood;
    snapshotMood = nextMood;
    removeInstanced(terrain); removeInstanced(grass, true); removeInstanced(flowers); removeInstanced(stems);
    if (ground) scenery.remove(ground);
    herd.forEach(cow => scenery.remove(cow.group)); herd = [];
    const next = layout(stocks); tiles = next.tiles; width = next.width; depth = next.depth;
    const extent = Math.max(width, depth, 16);

    scene.fog.near = extent * 2; scene.fog.far = extent * 5;
    camera.far = extent * 8; camera.updateProjectionMatrix();
    terrain = new THREE.InstancedMesh(geometries.box, materials.tiles, tiles.length);
    terrain.name = 'all-stock-tiles'; terrain.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    tiles.forEach((tile, i) => {
      point.position.set(tile.x, tile.height / 2, tile.z); point.scale.set(1, tile.height, 1); point.rotation.set(0, 0, 0); point.updateMatrix();
      terrain.setMatrixAt(i, point.matrix); terrain.setColorAt(i, color.set(tileColor(tile.stock.pct)));
    });
    terrain.instanceMatrix.needsUpdate = true;
    if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
    terrain.computeBoundingBox(); terrain.computeBoundingSphere(); scenery.add(terrain);
    ground = new THREE.Group(); scenery.add(ground);
    mesh(geometries.box, materials.soil, ground, [0, -0.42, 0], [width, 0.8, depth]);
    mesh(geometries.box, materials.meadow, ground, [0, -0.045, 0], [width + 0.12, 0.12, depth + 0.12]);
    materials.meadow.color.set(nextMood.state === 'red' ? 0xb3ad7d : nextMood.state === 'flat' ? 0xb0bb96 : 0xa4c28b);
    const grazable = tiles.filter(t => t.stock.pct < 0), red = tiles.filter(t => t.stock.pct > 0);
    const grassTiles = grazable.length ? grazable : tiles;
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0, 1.15, 0, 0, 0, -0.06, 0, 0, 0.06, 0.015, 0.95, 0], 3));
    bladeGeometry.computeVertexNormals();
    const wilted = nextMood.state === 'red';
    materials.grass.color.set(wilted ? 0x9a8050 : 0x4e883f);
    const grassCount = grassTiles.length ? Math.round((mobile ? 1800 : 4200) * (wilted ? 0.3 : nextMood.g)) : 0;
    grass = new THREE.InstancedMesh(bladeGeometry, materials.grass, grassCount);
    for (let i = 0; i < grassCount; i++) {
      const tile = grassTiles[Math.floor(fraction(i + 10) * grassTiles.length)];
      point.position.set(tile.x + (fraction(i + 2) - 0.5) * 0.9, tile.height, tile.z + (fraction(i + 5) - 0.5) * 0.9);
      const scale = 0.8 + fraction(i + 9) * 0.85;
      point.scale.set(scale, scale * (wilted ? 0.6 : 1), scale); point.rotation.set(0, fraction(i + 8) * Math.PI * 2, wilted ? 0.65 : 0); point.updateMatrix(); grass.setMatrixAt(i, point.matrix);
    }
    grass.instanceMatrix.needsUpdate = true; grass.computeBoundingSphere(); scenery.add(grass);
    const flowerTiles = red.length ? red : tiles;
    const flowerCount = wilted && flowerTiles.length ? Math.min(mobile ? 160 : 300, flowerTiles.length * 2) : 0;
    flowers = new THREE.InstancedMesh(geometries.sphere, materials.flower, flowerCount);
    stems = new THREE.InstancedMesh(geometries.cylinder, materials.stem, flowerCount);
    for (let i = 0; i < flowerCount; i++) {
      const tile = flowerTiles[Math.floor(fraction(i + 300) * flowerTiles.length)];
      point.position.set(tile.x + (fraction(i + 301) - 0.5) * 0.7, tile.height + 0.85, tile.z + (fraction(i + 302) - 0.5) * 0.7);
      point.scale.set(0.34, 0.16, 0.34); point.rotation.set(0, 0, 0); point.updateMatrix(); flowers.setMatrixAt(i, point.matrix);
      point.position.y = tile.height + 0.4; point.scale.set(0.055, 0.8, 0.055); point.updateMatrix(); stems.setMatrixAt(i, point.matrix);
    }
    flowers.instanceMatrix.needsUpdate = true; flowers.computeBoundingSphere(); scenery.add(flowers);
    stems.instanceMatrix.needsUpdate = true; stems.computeBoundingSphere(); scenery.add(stems);
    const count = nextMood.state === 'red' ? 3 : nextMood.cowCount;
    const cowScale = clamp(extent / 30, 0.8, 1.8) * 2.5;
    for (let i = 0; i < count; i++) {
      const cow = makeCow(nextMood.state === 'red');
      const tile = grassTiles[Math.floor(fraction(i + 200) * grassTiles.length)];
      // Keep the whole enlarged cow's footprint above nearby tiles, including its walking route.
      const anchor = tile ?? { x: 0, z: 0 };
      cow.origin = new THREE.Vector3(clamp(anchor.x, -width / 2 + cowScale * 1.4, width / 2 - cowScale * 1.4), 0,
        clamp(anchor.z, -depth / 2 + cowScale * 1.4, depth / 2 - cowScale * 1.4));
      cow.destination = cow.origin.clone().add(new THREE.Vector3(cow.departing ? cowScale * 0.7 : 0.35, 0, 0.25));
      cow.origin.y = cow.destination.y = cowSupportHeight(tiles, cow.origin, cow.destination, cowScale);
      cow.group.position.copy(cow.origin); cow.group.scale.setScalar(cowScale);
      cow.group.rotation.y = cow.departing ? 0 : fraction(i + 800) * Math.PI * 2;
      cow.head.rotation.z = nextMood.state === 'green' ? -0.7 : 0;
      herd.push(cow);
    }
    controls.tooltip.hidden = true; delete controls.tooltip.dataset.key; controls.moo.hidden = true;
    grassTime.value = reduced.matches ? 0 : elapsed;
    resize(!oldMood || previousWidth !== width || previousDepth !== depth); requestFrame();
  }
  function updateCamera() {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius, Math.cos(yaw) * Math.cos(pitch) * radius).add(target);
    camera.lookAt(target);
  }
  function animate(time) {
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    if (!reduced.matches) {
      elapsed += delta; grassTime.value = elapsed;
      if (!pointers.size && time - lastInput > 6000) yaw += delta * 0.018;
      herd.forEach((cow, i) => {
        cow.tail.rotation.x = Math.sin(elapsed * 1.7 + i) * 0.4;
        cow.head.rotation.z = cow.departing ? -0.05 : snapshotMood.state === 'flat' ? Math.sin(elapsed * 0.5) * 0.06 : -0.65 + Math.sin(elapsed * 1.8 + i) * 0.14;
        if (cow.departing) {
          const walk = (Math.sin(elapsed * 0.18 + i) + 1) / 2;
          cow.group.position.lerpVectors(cow.origin, cow.destination, walk);
        }
        else if (snapshotMood.state === 'green') {
          cow.group.position.lerpVectors(cow.origin, cow.destination, (Math.sin(elapsed * 0.11 + i) + 1) / 2);
          cow.group.rotation.y += delta * 0.015;
        }
      });
    }
    updateCamera();
    if (hover && !pointers.size) pick(hover.x, hover.y);
    const mooCow = herd[0];
    if (!reduced.matches && mooCow && !mooCow.departing && Math.floor(elapsed) % 17 >= 13) {
      const projected = mooCow.group.position.clone(); projected.y += 1.7 * mooCow.group.scale.y; projected.project(camera);
      controls.moo.hidden = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      controls.moo.style.left = `${clamp((projected.x + 1) / 2 * container.clientWidth, 32, container.clientWidth - 32)}px`;
      controls.moo.style.top = `${clamp((1 - projected.y) / 2 * container.clientHeight, 42, container.clientHeight - 12)}px`;
    } else controls.moo.hidden = true;
    renderer.render(scene, camera);
  }
  function frame(time) {
    raf = 0;
    if (disposed || !visible || document.hidden) { previousTime = 0; return; }
    animate(time);
    if (!reduced.matches) raf = requestAnimationFrame(frame);
  }
  function requestFrame() { if (!disposed && visible && !document.hidden && !raf) raf = requestAnimationFrame(frame); }
  function suspend() { cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
  const viewObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) requestFrame(); else suspend(); });
  viewObserver.observe(container);
  function onVisibility() { if (document.hidden) suspend(); else requestFrame(); }
  document.addEventListener('visibilitychange', onVisibility);
  function onMotion() { grassTime.value = reduced.matches ? 0 : elapsed; previousTime = 0; requestFrame(); }
  reduced.addEventListener('change', onMotion);
  function fitCamera() {
    if (!terrain?.boundingBox) return;
    const bounds = terrain.boundingBox.clone();
    bounds.expandByPoint(new THREE.Vector3(-width / 2 - 0.06, -0.82, -depth / 2 - 0.06));
    bounds.expandByPoint(new THREE.Vector3(width / 2 + 0.06, 2.1, depth / 2 + 0.06));
    const fit = fitTerrainCamera(bounds, camera.aspect, yaw, pitch, camera.fov);
    target.copy(fit.target);
    initialRadius = fit.radius;
    radius = fit.radius;
    updateCamera();
  }
  let viewportWidth = 0, viewportHeight = 0;
  function resize(resetRadius = false) {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h || disposed) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    // ResizeObserver supplies entries, so only literal true requests a data-layout reset.
    if (resetRadius === true || w !== viewportWidth || h !== viewportHeight) fitCamera();
    viewportWidth = w; viewportHeight = h;
    requestFrame();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  function pick(clientX, clientY) {
    if (!terrain || disposed) return;
    const rect = canvas.getBoundingClientRect();
    mouse.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(terrain)[0];
    const tile = hit ? tiles[hit.instanceId] : null;
    if (!tile) { controls.tooltip.hidden = true; return; }
    if (controls.tooltip.dataset.key !== tile.stock.key) { controls.tooltip.innerHTML = stockDetail(tile.stock); controls.tooltip.dataset.key = tile.stock.key; }
    controls.tooltip.hidden = false;
    const tipWidth = controls.tooltip.offsetWidth, tipHeight = controls.tooltip.offsetHeight;
    controls.tooltip.style.left = `${clamp(clientX - rect.left + 15, 8, Math.max(8, rect.width - tipWidth - 8))}px`;
    controls.tooltip.style.top = `${clamp(clientY - rect.top - 90, 8, Math.max(8, rect.height - tipHeight - 8))}px`;
  }
  const pointers = new Map(); let pinchDistance = 0, dragged = false, hover = null;
  const distance = () => { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  function onDown(event) {
    lastInput = performance.now(); dragged = false; hover = null; controls.tooltip.hidden = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.setPointerCapture(event.pointerId); pinchDistance = distance();
  }
  function onMove(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) { if (event.pointerType !== 'touch') { hover = { x: event.clientX, y: event.clientY }; pick(event.clientX, event.clientY); } return; }
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) { yaw -= dx * 0.006; pitch = clamp(pitch + dy * 0.004, 0.25, 1.35); }
    else { const next = distance(); if (pinchDistance > 0 && next > 0) radius = clamp(radius * pinchDistance / next, initialRadius * 0.35, initialRadius * 2); pinchDistance = next; }
    lastInput = performance.now(); requestFrame();
  }
  function onUp(event) {
    const wasDown = pointers.has(event.pointerId); pointers.delete(event.pointerId); pinchDistance = distance();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (wasDown && !dragged && event.type !== 'pointercancel') { updateCamera(); pick(event.clientX, event.clientY); }
    lastInput = performance.now(); requestFrame();
  }
  function onLeave() { hover = null; if (!pointers.size) controls.tooltip.hidden = true; }
  function zoom(factor) { radius = clamp(radius * factor, initialRadius * 0.35, initialRadius * 2); lastInput = performance.now(); requestFrame(); }
  function onWheel(event) { event.preventDefault(); zoom(Math.exp(clamp(event.deltaY, -100, 100) * 0.002)); }
  function zoomIn() { zoom(0.85); } function zoomOut() { zoom(1.18); }
  function reset() { yaw = -0.35; pitch = 0.53; fitCamera(); lastInput = performance.now(); requestFrame(); }
  canvas.addEventListener('pointerdown', onDown, { passive: true }); canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerup', onUp, { passive: true }); canvas.addEventListener('pointercancel', onUp, { passive: true }); canvas.addEventListener('pointerleave', onLeave, { passive: true });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  controls.zoomIn.addEventListener('click', zoomIn); controls.zoomOut.addEventListener('click', zoomOut); controls.reset.addEventListener('click', reset);
  function onLost(event) { event.preventDefault(); suspend(); controls.onFailure(); }
  canvas.addEventListener('webglcontextlost', onLost, false);
  function dispose() {
    if (disposed) return; disposed = true; suspend();
    resizeObserver.disconnect(); viewObserver.disconnect(); document.removeEventListener('visibilitychange', onVisibility); reduced.removeEventListener('change', onMotion);
    controls.zoomIn.removeEventListener('click', zoomIn); controls.zoomOut.removeEventListener('click', zoomOut); controls.reset.removeEventListener('click', reset);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
    removeInstanced(terrain); removeInstanced(grass, true); removeInstanced(flowers); removeInstanced(stems);
    Object.values(geometries).forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose());
    scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); controls.tooltip.hidden = true; controls.moo.hidden = true;
  }
  resize();
  return { update, dispose };
}
