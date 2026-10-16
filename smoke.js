// Smoke test: DOM stubs + exercise input handlers, upgrade/sell, and render.
const fs = require('fs');

const ctxStub = new Proxy({}, {
  get: (t, p) => (typeof p === 'string' ? function () { return ctxStub; } : undefined),
  set: () => true,
});

function makeEl() {
  return {
    _v: undefined, children: [], style: {}, dataset: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    listeners: {},
    addEventListener(t, f) { this.listeners[t] = f; },
    appendChild(c) { this.children.push(c); },
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html; },
    textContent: '', disabled: false, className: '',
    getContext() { return ctxStub; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 720, height: 480 }; },
    width: 0, height: 0,
  };
}

const elements = {};
global.document = {
  getElementById(id) { if (!elements[id]) elements[id] = makeEl(); return elements[id]; },
  createElement() { return makeEl(); },
};
global.window = { devicePixelRatio: 1, addEventListener() {} };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};

const src = fs.readFileSync(__dirname + '/game.js', 'utf8');

const test = `
;(function () {
  resetGame();
  const canvasEl = elements['game'];
  const click = (px, py) => canvasEl.listeners.click({ clientX: px, clientY: py });

  // 1. build a gunner at tile (0,0) via a real canvas click
  selectTowerType('gunner');
  click(20, 20);
  if (game.towers.length !== 1) throw new Error('placement failed: ' + game.towers.length);
  if (game.gold !== START_GOLD - 50) throw new Error('gold not deducted: ' + game.gold);
  console.log('placement ok | gold', game.gold);

  // 2. cannot build on the road
  selectTowerType('gunner');
  click(10 * TILE + 5, 1 * TILE + 5);   // road tile (10,1)
  if (game.towers.length !== 1) throw new Error('built on road!');
  console.log('road blocked ok');

  // 3. click the placed tower to select it, upgrade twice, sell
  game.selectedType = null;
  click(20, 20);
  if (!game.selectedTower) throw new Error('tower not selected on click');
  syncUI(); // builds the info panel
  elements['upgradeBtn'].onclick();
  syncUI();
  if (game.towers[0].level !== 2) throw new Error('upgrade failed');
  console.log('upgrade ok | level', game.towers[0].level, '| gold', game.gold);

  elements['sellBtn'].onclick();
  if (game.towers.length !== 0) throw new Error('sell failed');
  console.log('sell ok | gold', game.gold);

  // 4. run a full wave with render() sprinkled in
  selectTowerType('cannon');
  click(20, 20);
  selectTowerType('frost');
  click(20, 80);
  selectTowerType('sniper');
  click(100, 20);
  game.selectedType = null;
  console.log('towers placed:', game.towers.map(t => t.type).join(','));

  startWave();
  let steps = 0;
  while (game.state === 'wave' && steps < 60 * 900) {
    update(1 / 60);
    if (steps % 30 === 0) {
      game.hover = { x: 200, y: 200, col: 5, row: 5 };
      render();          // with placement ghost active
      selectTowerType('gunner');
      render();
      game.selectedType = null;
      syncUI();
    }
    steps++;
  }
  console.log('wave', game.wave, 'ended:', game.state, '| lives', game.lives, '| gold', game.gold,
              '| enemies left', game.enemies.length, '| projectiles', game.projectiles.length);

  // 5. force game over path
  game.lives = 0;
  update(1 / 60);
  if (game.state !== 'over') throw new Error('game over not triggered');
  console.log('game over ok | overlay hidden =', elements['overlay'].classList.contains('hidden'));

  // 6. restart
  elements['restartBtn'].listeners.click();
  if (game.state !== 'idle' || game.wave !== 0 || game.towers.length !== 0) throw new Error('restart failed');
  console.log('restart ok');

  // 7. speed + pause buttons
  elements['speedBtn'].listeners.click();
  elements['pauseBtn'].listeners.click();
  console.log('speed', game.speed, '| paused', game.paused);

  console.log('ALL SMOKE TESTS PASSED');
})();
`;

try {
  eval(src + test);
} catch (err) {
  console.error('SMOKE TEST FAILED:', err.message);
  process.exit(1);
}
