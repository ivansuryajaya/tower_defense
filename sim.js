// Headless simulation: stub DOM, load game.js, auto-play waves, print balance.
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
  const MODE = process.env.MODE || 'mixed';

  // candidate build spots: buildable tiles touching the road, ranked by exposure
  const spots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (pathSet.has(c + ',' + r)) continue;
      let near = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (pathSet.has((c + dc) + ',' + (r + dr))) near++;
      }
      if (near > 0) spots.push({ c, r, near });
    }
  }
  spots.sort((a, b) => b.near - a.near);

  const order = MODE === 'gun'
    ? ['gunner', 'gunner', 'gunner', 'gunner']
    : ['gunner', 'gunner', 'cannon', 'frost', 'sniper', 'cannon', 'gunner', 'sniper'];
  let spotIdx = 0, orderIdx = 0, built = 0;

  function tryBuild() {
    if (built >= MAX_TOWERS) return false;
    let attempts = 0;
    while (attempts++ < 40) {
      const type = order[orderIdx % order.length];
      const info = TOWER_TYPES[type];
      if (game.gold < info.cost) return false;
      // find next free spot
      while (spotIdx < spots.length && towerAt(spots[spotIdx].c, spots[spotIdx].r)) spotIdx++;
      if (spotIdx >= spots.length) return false;
      game.selectedType = type;
      tryPlace(spots[spotIdx].c, spots[spotIdx].r);
      built++;
      spotIdx++; orderIdx++;
    }
    return false;
  }

  function upgradeAll() {
    const limit = MODE === 'casual' ? 5 : game.towers.length;
    let n = 0;
    for (const t of game.towers.slice()) {
      if (n >= limit) break;
      if (MODE === 'casual' && game.gold < 260) break; // casual players hoard gold
      game.selectedTower = t;
      while (true) {
        const next = TOWER_TYPES[t.type].levels[t.level];
        if (!next || game.gold < next.cost) break;
        upgradeSelected();
        if (MODE === 'casual') break; // one level at a time
      }
      n++;
    }
    game.selectedTower = null;
  }

  const MAX_TOWERS = MODE === 'casual' ? 22 : 200;

  const log = [];
  const DT = 1 / 60;
  let steps = 0;

  while (game.state !== 'over' && game.state !== 'won' && steps < 60 * 60 * 20) {
    // between waves: spend gold, then start next wave
    while (tryBuild()) { /* build as much as possible */ }
    upgradeAll();
    startWave();

    // run the wave
    while (game.state === 'wave' && steps < 60 * 60 * 20) {
      // keep spending during the wave too (early call is allowed once queue empties)
      if (game.gold > 400) tryBuild();
      update(DT);
      steps++;
      if (steps % 600 === 0) upgradeAll();
      if (game.state !== 'wave') break;
      // if the wave drags on (enemies stuck), force early-call next wave
      if (game.queue.length === 0 && game.enemies.length > 0 && steps % 7200 === 0) {
        startWave();
      }
    }
    if (game.state === 'over' || game.state === 'won') break;
    log.push({ wave: game.wave, gold: game.gold, lives: game.lives, towers: game.towers.length, kills: game.kills, score: game.score });
  }

  console.log('wave | gold | lives | towers | kills');
  for (const l of log) {
    console.log(String(l.wave).padStart(4) + ' | ' + String(l.gold).padStart(5) + ' | ' + String(l.lives).padStart(5) + ' | ' + String(l.towers).padStart(6) + ' | ' + String(l.kills).padStart(5));
  }
  console.log('FINAL:', game.state, '| wave', game.wave, '| gold', game.gold, '| lives', game.lives, '| score', game.score, '| towers built', built);

  // sanity checks
  const bad = game.towers.some(t => !isFinite(t.x) || !isFinite(t.y));
  console.log('NaN check (towers):', bad ? 'FAIL' : 'ok');
})();
`;

eval(src + test);
