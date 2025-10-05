import { el as DOM } from '../dom.js';
import debugState from './debugController.js';
import augState from './augState.js';
import aiDebugState from './aiDebugState.js';
import { corridorAhead } from '../utils.js';
import { V, isBlocked, floodFillArea, corridorWidth, hasTwoStepEscape, voronoiDelta, minMaxSpace } from '../../ai/TronAI.js';
export function onFrameDebug(dt){
  try { if (typeof lastFrameDT!=='undefined') lastFrameDT = dt; } catch(e){}
  try { if (typeof fpsEMA!=='undefined') fpsEMA = fpsEMA*0.9 + ((dt>0)? (1000/dt):0)*0.1; } catch(e){}
  try {
    const A = augState;
    if (!A.startedRafMon) A.startedRafMon = true;
    const ts0 = (typeof A.lastRaf === 'number' ? A.lastRaf : 0);
    const ts = ts0 + (isFinite(dt)?dt:0);
    if (typeof window.loop === 'function') window.loop(ts);
  } catch(e){}
}
export function __fmtBytesExact(n){
  try { return (n|0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); } catch(e){ return String(n); }
}
export function __fmtMB(n){
  try { return (n/1048576).toFixed(2) + ' MB'; } catch(e){ return String(n); }
}
export function __typedBytes(w,h,bytesPer){ return (w|0)*(h|0)*(bytesPer|0); }
export function __estCanvasBytes(canvas){
  try{ const w = canvas.width|0, h = canvas.height|0; return __typedBytes(w,h,4); } catch(e){ return 0; }
}
export function __getMemStats(canvas){
  try {
    const A = augState;
    A.canvasBytes = __estCanvasBytes(canvas);
    return { canvasBytes: A.canvasBytes };
  }
  catch(e){ return { canvasBytes:0 }; }
}
export function __computeRowsForDir(dirName, grid, enemy, player){
  try{
    if(!dirName || !V[dirName] || !enemy || !player || !grid) return null;
    const [dx,dy] = V[dirName];
    const nx = enemy.x + dx, ny = enemy.y + dy;
    if (isBlocked(grid, nx, ny)) return null;
    try { if (typeof __olBegin==='function') __olBegin(grid); } catch(e){}
    let out = null;
    try {
      try { if (typeof __olMark==='function') __olMark(enemy.x, enemy.y, grid[0].length); } catch(e){}
      const area     = floodFillArea(grid, nx, ny);
      const corridor = corridorWidth(grid, nx, ny, dirName);
      const safe2    = hasTwoStepEscape(grid, nx, ny, dirName) ? 1 : 0;
      const vor      = voronoiDelta(grid, nx, ny, enemy, player);
      const mm       = (typeof minMaxSpace === 'function') ? minMaxSpace(grid, nx, ny, dirName) : 0;
      const parts = { area, corridor, safe2, vor, mm };
      const score = Object.values(parts).reduce((a,b)=>a+(+b||0), 0);
      out = { dir:dirName, score, ...parts };
    } finally { try { if (typeof __olEnd==='function') __olEnd(); } catch(e){} }
    return out;
  } catch(e){ return null; }
}
export function renderChosenMoveBreakdown({ grid, enemy, player, Weights }){
  try {
    const fmt = (n)=> (typeof n==='number' ? n.toFixed(2) : String(n));
    const W = (typeof Weights!=='undefined' && Weights) ? Weights : {};
    let chosenBreak = `<details id="dbgChosenBreak" style="margin:-4px 0 4px 0;">
      <summary style="cursor:pointer; opacity:.9;">Chosen move breakdown</summary>
      <div style="opacity:.75; margin:6px 2px;">No AI data yet... start the round and the breakdown will populate.</div>
    </details>`;
    const dirs = ['up','right','down','left'];
    const rows = [];
    for (const d of dirs){
      const c = __computeRowsForDir(d, grid, enemy, player);
      if (!c) continue;
      const ws = (W.area||1)*c.area + (W.corridor||1)*c.corridor + (W.safe2||1)*c.safe2 + (W.vor||1)*c.vor + (W.mm||1)*c.mm;
      rows.push({ d, c:{...c, score: ws} });
    }
    if (rows.length){
      rows.sort((a,b)=> b.c.score - a.c.score);
      const top = rows[0];
      const htmlRows = rows.map(({d,c}) => `
        <div class="debug-row"><div>${d}</div><div>${fmt(c.score)}</div></div>
        <div class="debug-grid" style="opacity:.85;margin:-2px 0 6px 0;">
          <div>Area</div><div>${fmt(c.area)}</div>
          <div>Corridor</div><div>${fmt(c.corridor)}</div>
          <div>VorΔ</div><div>${fmt(c.vor)}</div>
          <div>MM</div><div>${fmt(c.mm)}</div>
        </div>`).join("");
      chosenBreak = `<details id="dbgChosenBreak" open style="margin:-4px 0 4px 0;">
        <summary style="cursor:pointer; opacity:.9;">Chosen move breakdown</summary>
        <div style="font-size:12px; opacity:.85;">Top: <b>${top.d}</b> (score ${fmt(top.c.score)})</div>
        ${htmlRows}
      </details>`;
    }
    return chosenBreak;
  } catch(e){
    return `<details id="dbgChosenBreak"><summary>Chosen move breakdown</summary><div>error</div></details>`;
  }
}
const { debugPanel } = DOM;
function renderDebug(){
  const el = debugPanel;
  try {
    const __on = (typeof debugOn !== 'undefined'
      ? debugOn
      : (typeof debugState.debugOn === 'boolean' ? debugState.debugOn : false));
    if (!el || !__on) return;
    let __chosenWasOpen;
    if (typeof debugState.chosenOpen === 'boolean') {
      __chosenWasOpen = debugState.chosenOpen;
    } else {
      __chosenWasOpen = true;
    }
    try {
      const prevChosen = el.querySelector('#dbgChosenBreak');
      __chosenWasOpen = !!(prevChosen && prevChosen.open);
    } catch(e){}
    const ai = aiDebugState;
    const cand = Array.isArray(ai.cand) ? ai.cand.slice() : [];
    try { cand.sort((a,b)=> ((b.score||-1e9) - (a.score||-1e9))); } catch(e){}
    const top = cand.slice(0, 5);
    const best = (top.length? top[0] : null);
    const fmt = (v)=> (v==null || (typeof v==='number' && !Number.isFinite(v)) ? '—' : (typeof v==='number'? v.toFixed(2) : String(v)));
    const candHTML = top.map((c,i)=>`
      <div class="debug-kv"><div>#${i+1} ${c.dir}</div><div>${fmt(c.score)}</div></div>
      <div class="debug-grid" style="opacity:.85;margin:-2px 0 6px 0;">
        <div>Area</div><div>${fmt(c.area)}</div>
        <div>Corridor</div><div>${fmt(c.corridor)}</div>
        <div>VorΔ</div><div>${fmt(c.vor)}</div>
        <div>MM</div><div>${fmt(c.mm)}</div>
      </div>`).join("");
    const now = new Date();
    const ts = now.toLocaleTimeString() + '.' + String(now.getMilliseconds()).padStart(3,'0');
    const memRaw = __getMemStats();
    const mem = (memRaw && typeof memRaw === 'object') ? memRaw : {};
    if (!mem.heap || typeof mem.heap !== 'object') {
      mem.heap = { used: 0, total: 0, delta: 0, limit: 0 };
    } else {
      mem.heap.used  = Number(mem.heap.used ) || 0;
      mem.heap.total = Number(mem.heap.total) || 0;
      mem.heap.delta = Number(mem.heap.delta) || 0;
      mem.heap.limit = Number(mem.heap.limit) || 0;
    }
    if (!mem.pools || typeof mem.pools !== 'object') {
      mem.pools = {};
    }
    const poolDefaults = {
      nrbfs: 0,
      overlay: 0,
      sprites: 0,
      walls: 0,
      wallFrames: 0,
      perFrame: 0,
      canvases: 0,
      spriteCount: 0
    };
    for (const k in poolDefaults) {
      if (!Object.prototype.hasOwnProperty.call(mem.pools, k) || !Number.isFinite(mem.pools[k])) {
        mem.pools[k] = poolDefaults[k];
      }
    }
    const d = mem.heap.delta;
    const deltaStr = (d==null? '—' : ((d>0? '+' : '') + (Math.floor(Math.abs(d))).toLocaleString('en-US') + ' B'));
    const del12 = (top.length>1 && top[0].score!=null && top[1].score!=null) ? (top[0].score - top[1].score) : null;
    const del13 = (top.length>2 && top[0].score!=null && top[2].score!=null) ? (top[0].score - top[2].score) : null;
    let chosenBreak = '';
    try {
      const W = (typeof Weights!=='undefined') ? Weights : {};
      chosenBreak = `<details id="dbgChosenBreak" style="margin-top:6px;"><summary style="cursor:pointer; opacity:.9;">Chosen move breakdown</summary>
        <div style="opacity:.75; margin:6px 2px;">No AI data yet — start the round and the breakdown will populate.</div></details>`;
      function __computeRowsForDir(dirName){
        try{
          if(!dirName || !V[dirName] || !enemy || !player || !grid) return null;
          const [dx,dy] = V[dirName];
          const nx = enemy.x + dx, ny = enemy.y + dy;
          if (isBlocked(grid, nx, ny)) return null; 
          __olBegin(grid);
          try {
            __olMark(enemy.x, enemy.y, grid[0].length);
            const area     = floodFillArea(grid, nx, ny);
            const corridor = corridorWidth(grid, nx, ny, dirName);
            const safe2    = hasTwoStepEscape(grid, nx, ny, dirName) ? 1 : 0;
            const straight = (dirName === enemy.dir) ? 1 : 0;
            const vor      = voronoiDelta(grid, nx, ny, player.x, player.y);
            const r        = rays(grid, nx, ny);
            const primary  = (dirName==='up'?r.up:dirName==='down'?r.down:dirName==='left'?r.left:r.right);
            const lateral  = (dirName==='up'||dirName==='down') ? (r.left + r.right) : (r.up + r.down);
            const rayScore = (W.RAY_BIAS||0) * (primary - 0.25*lateral);
            const chaseD     = bfsDistance(grid, nx, ny, player.x, player.y);
            const turnPoint  = lastFreeAhead(grid, player.x, player.y, player.dir);
            const interceptD = bfsDistance(grid, nx, ny, turnPoint.x, turnPoint.y);
            let losBonus = 0;
            if(lineClear(grid, nx, ny, player.x, player.y)) losBonus += (W.LOS||0) * 0.6;
            const predicted = predictPlayerPath(grid, player, (W.PREDICT_K||6));
            const pTarget   = predicted[predicted.length-1] || player;
            if (lineClear(grid, nx, ny, pTarget.x, pTarget.y)){
              let closing = 0;
              if (ny===pTarget.y){
                if (pTarget.x < nx && dirName==='left')  closing = 1;
                if (pTarget.x > nx && dirName==='right') closing = 1;
              } else if (nx===pTarget.x){
                if (pTarget.y < ny && dirName==='up')    closing = 1;
                if (pTarget.y > ny && dirName==='down')  closing = 1;
              }
              losBonus += (W.LOS||0) * (1 + 0.4*closing);
            }
            const pNextX = player.x + V[player.dir][0], pNextY = player.y + V[player.dir][1];
            const pNext  = (!isBlocked(grid,pNextX,pNextY)) ? {x:pNextX,y:pNextY} : {x:player.x,y:player.y};
            const gates  = openNeighbors(grid, pNext.x, pNext.y);
            const tight  = Math.max(0, (3 - Math.min(3, gates)) / 3);
            const gateBonus = (W.GATE||0) * tight * Math.max(0, 10 - Math.min(chaseD, interceptD));
            const aiSnap = aiDebugState;
            const fromCand = (Array.isArray(aiSnap.cand) ? aiSnap.cand.find(c=>c.dir===dirName) : null) || null;
            const mm       = (fromCand && Number.isFinite(fromCand.mm)) ? fromCand.mm :
                             minimaxScore(grid, {x:enemy.x, y:enemy.y, dir:dirName}, {x:player.x, y:player.y, dir:player.dir}, dirName, W);
            const ribbon   = (fromCand && Number.isFinite(fromCand.ribbonScore)) ? fromCand.ribbonScore : 0;
            const rayC     = (fromCand && Number.isFinite(fromCand.rayScore)) ? fromCand.rayScore : rayScore;
            const antiOsc  = (fromCand && Number.isFinite(fromCand.antiOsc)) ? fromCand.antiOsc : 0;
            const loop     = (fromCand && Number.isFinite(fromCand.loop)) ? fromCand.loop : 0;
            const rows = [
              ['AREA',           area*(W.AREA||0)],
              ['CORRIDOR',       corridor*(W.CORRIDOR||0)],
              ['TWOSTEP',        safe2*(W.TWOSTEP||0)],
              ['STRAIGHT',       straight*(W.STRAIGHT||0)],
              ['VORONOI',        vor*(W.VORONOI||0)],
              ['-CHASE*d',       (Number.isFinite(chaseD)? -(W.CHASE||0)*chaseD : 0)],
              ['-INTERCEPT*d',   (Number.isFinite(interceptD)? -(W.INTERCEPT||0)*interceptD : 0)],
              ['LOS',            losBonus],
              ['GATE',           gateBonus],
              ['RIBBON',         ribbon],
              ['MINIMAX',        mm],
              ['RAY',            rayC],
              ['ANTI-OSC',       antiOsc],
              ['-LOOP',          -loop]
            ];
            return rows;
          } finally { __olEnd(); }
        } catch(e){
          return null;
        }
      }
      const aiSnap = aiDebugState;
      const chosenDir = (aiSnap.best || (enemy && enemy.dir) || 'right');
      let contrib = __computeRowsForDir(chosenDir);
      if (!contrib){
        const order = ['up','right','down','left'];
        for (const d of order){ contrib = __computeRowsForDir(d); if (contrib) break; }
      }
      if (contrib && contrib.length){
        const sumAbs = contrib.reduce((s,x)=>s+Math.abs(Number(x[1])||0), 0) || 1;
        const rows = contrib.map(([k,v])=>`<div>${k}</div><div>${(Number.isFinite(v)? v.toFixed(2):'—')} (${(Math.abs(v)/sumAbs*100).toFixed(1)}%)</div>`).join('');
        chosenBreak = `<details id="dbgChosenBreak" style="margin-top:6px;"><summary style="cursor:pointer; opacity:.9;">Chosen move breakdown</summary>
          <div class="debug-grid" style="margin-top:6px;">${rows}</div></details>`;
      }
    } catch(e){}
    let legalCount = cand.length;
    let blockedN = null, nextX = null, nextY = null;
    try {
      if (best && typeof enemy!=='undefined'){
        const dx = V[best.dir][0], dy = V[best.dir][1];
        nextX = enemy.x + dx; nextY = enemy.y + dy;
        let count=0;
        for (const [adx,ady] of Object.values(V)){
          if (isBlocked(grid, nextX+adx, nextY+ady)) count++;
        }
        blockedN = count;
      }
    } catch(e){}
    let predK = null, interceptD = null, losNow = null, losTarget = null;
    try {
      const predicted = predictPlayerPath(grid, player, (Weights && Weights.PREDICT_K) || 6);
      predK = (predicted && predicted.length ? predicted.length-1 : 0);
      const pTarget = predicted[predicted.length-1] || player;
      if (best && nextX!=null){
        interceptD = bfsDistance(grid, nextX, nextY, pTarget.x, pTarget.y);
      }
      losNow = lineClear(grid, enemy.x, enemy.y, player.x, player.y);
      if (pTarget) losTarget = lineClear(grid, enemy.x, enemy.y, pTarget.x, pTarget.y);
    } catch(e){}
    let twoStep = null, deadEnd = null, gateTight = null, vorNorm = null;
    try {
      if (best && nextX!=null){
        twoStep = hasTwoStepEscape(grid, nextX, nextY, best.dir);
        deadEnd = corridorWidth(grid, nextX, nextY, best.dir);
      }
      const pnx = player.x + V[player.dir][0], pny = player.y + V[player.dir][1];
      try {
        const gates = openNeighbors(grid, inBounds(pnx,pny,grid[0].length,grid.length) && !grid[pny][pnx] ? pnx : player.x,
                                            inBounds(pnx,pny,grid[0].length,grid.length) && !grid[pny][pnx] ? pny : player.y);
        gateTight = Math.max(0, (3 - Math.min(3, gates)) / 3);
      } catch(e){}
      let free=0;
      for (let y=0;y<grid.length;y++){ for (let x=0;x<grid[0].length;x++){ if (!grid[y][x]) free++; } }
      const vdelta = voronoiDelta(grid, enemy.x, enemy.y, player.x, player.y);
      vorNorm = (free>0 ? vdelta/free : 0);
    } catch(e){}
    let mmWorst = null, mmArg = null;
    try {
      if (best){
        const optionsP = [player.dir, leftOf(player.dir), rightOf(player.dir)].filter(d=> d !== opposite(player.dir));
        let worst=+Infinity, arg=null;
        for (const pDir of optionsP){
          __olPush();
          try {
            const sim = simulateOne(grid, player, enemy, pDir, best.dir);
            let val = 0;
            if (sim.enemyDead && !sim.playerDead)      val = -9999;
            else if (sim.playerDead && !sim.enemyDead) val =  9999;
            else if (sim.playerDead && sim.enemyDead)  val = -1500;
            else {
              const aArea = floodFillArea(sim.g, sim.ai.x, sim.ai.y);
              const pArea = floodFillArea(sim.g, sim.player.x, sim.player.y);
              const pSafe = hasTwoStepEscape(sim.g, sim.player.x, sim.player.y, sim.player.dir) ? 1 : 0;
              const W = Weights||{};
              val = (aArea - pArea) * (W.MINIMAX||0) - pSafe * (W.PLAYER_SAFETY||0);
            }
            if (val < worst){ worst = val; arg = pDir; }
          } finally { __olEnd(); }
        }
        mmWorst = worst; mmArg = arg;
      }
    } catch(e){}
    const A = augState;
    const p50 = __q(A.aiTimes, 50), p95 = __q(A.aiTimes, 95), p99 = __q(A.aiTimes, 99);
    const frames = A.dtBuf.slice();
    const dtP95 = __q(frames, 95), dtAvg = (frames.length? (__sum(frames)/frames.length) : 0);
    const jitter = A.dtJitterEMA;
    const catchPct = (A.substepsBuf.length ? A.substepsBuf.filter(v=>v>1).length / A.substepsBuf.length : 0);
    const lat50 = __q(A.inputLatency, 50), lat95 = __q(A.inputLatency, 95);
    try {
      if (typeof A.render.lastTick === 'undefined') {
        A.render.lastTick = tick;
      }
      if (tick !== A.render.lastTick){
        A.render.blitsBuf.push(A.render.blitsThisTick);
        if (A.render.blitsBuf.length > 240) A.render.blitsBuf.shift();
        A.render.blitsThisTick = 0;
        A.render.lastTick = tick;
      }
    } catch(e){}
    const blitsAvg = (A.render.blitsBuf.length? (__sum(A.render.blitsBuf)/A.render.blitsBuf.length) : 0);
    const perfHTML = [
      '<h3>Performance</h3>',
      '<div class="debug-grid">',
        '<div>Updated</div><div>' + ts + '</div>',
        '<div>FPS</div><div>' + (fpsEMA||0).toFixed(1) + '</div>',
        '<div>Frame ms</div><div>' + (lastFrameDT||0).toFixed(1) + '</div>',
        '<div>Tick</div><div>' + (typeof debugState.performance.tick !== 'undefined' ? debugState.performance.tick : 0) + '</div>',
        '<div>Substeps</div><div>' + (typeof debugState.performance.lastSubsteps !== 'undefined' ? debugState.performance.lastSubsteps : 0) + '</div>',
      '</div>'
    ].join('');
    let gameExtras = '';
    try {
      const totalCells = (grid && grid.length && grid[0]) ? (grid.length * grid[0].length) : 0;
      let filled = 0;
      if (totalCells){
        for (let y=0;y<grid.length;y++){ for (let x=0;x<grid[0].length;x++){ if (grid[y][x]) filled++; } }
      }
      const fillPct = totalCells? (filled/totalCells) : 0;
      const trailP = (typeof trailPlayer!=='undefined' && trailPlayer ? Math.max(0, trailPlayer.length-1) : 0);
      const trailE = (typeof trailEnemy!=='undefined' && trailEnemy ? Math.max(0, trailEnemy.length-1) : 0);
      const outsP  = openNeighbors(grid, player.x, player.y);
      const outsE  = openNeighbors(grid, enemy.x,  enemy.y);
      const corrP  = corridorAhead(grid, player.x, player.y, player.dir);
      const corrE  = corridorAhead(grid, enemy.x,  enemy.y,  enemy.dir);
      const headMan = Math.abs(player.x-enemy.x) + Math.abs(player.y-enemy.y);
      let headBfs = bfsDistance(grid, enemy.x, enemy.y, player.x, player.y);
      if (!Number.isFinite(headBfs)) headBfs = '∞';
      let puD = null;
      try { if (powerUp) { puD = bfsDistance(grid, player.x, player.y, powerUp.x, powerUp.y); if (!Number.isFinite(puD)) puD = '∞'; } } catch(e){}
      const levelSec = (typeof debugState.performance.tick !== 'undefined' ? ( (typeof TICK_MS!=='undefined'?TICK_MS:80) * debugState.performance.tick )/1000 : 0);
      const mins = Math.floor(levelSec/60);
      const secs = Math.floor(levelSec % 60);
      const mmss = String(mins) + ':' + String(secs).padStart(2,'0');
      const bagCount = (typeof powerBag!=='undefined' && Array.isArray(powerBag)) ? powerBag.length : 0;
      gameExtras = [
        '<div class="debug-grid" style="margin-top:6px;">',
          '<div>Level time</div><div>' + mmss + '</div>',
          '<div>Grid filled</div><div>' + (fillPct*100).toFixed(1) + '%</div>',
          '<div>Trail len P/E</div><div>' + trailP + ' / ' + trailE + '</div>',
          '<div>Outs P/E</div><div>' + outsP + ' / ' + outsE + '</div>',
          '<div>Corridor P/E</div><div>' + corrP + ' / ' + corrE + '</div>',
          '<div>Head dist (man/BFS)</div><div>' + headMan + ' / ' + headBfs + '</div>',
          (puD!=null? ('<div>Power-up dist</div><div>' + puD + '</div>') : ''),
          '<div>Power bag</div><div>' + bagCount + '</div>',
        '</div>'
      ].join('');
    } catch(e){}
    const gameHTML = [
      '<div class="debug-section"><h3>Game</h3>',
        '<div class="debug-grid">',
          '<div>Level</div><div>' + (typeof LEVEL!=='undefined'?LEVEL:1) + '</div>',
          '<div>Score</div><div>' + (typeof score!=='undefined'?score:0) + '</div>',
          '<div>EnemySpeed</div><div>' + (typeof ENEMY_SPEED!=='undefined' && ENEMY_SPEED!=null? Number(ENEMY_SPEED).toFixed(2): "") + '</div>',
          '<div>Player</div><div>(' + player.x + ',' + player.y + ') ' + player.dir + (boostActive?'  ⚡':'') + '</div>',
          '<div>Enemy</div><div>(' + enemy.x + ',' + enemy.y + ') ' + enemy.dir + '</div>',
        '</div>',
        gameExtras,
      '</div>'
    ].join('');
    const aiHTML = [
      '<div class="debug-section"><h3>AI</h3>',
        '<div class="debug-grid">',
          '<div>Best</div><div>' + (ai.best||'?') + ' (' + (ai.bestScore!=null?Number(ai.bestScore).toFixed(2):'') + ')</div>',
          '<div>Cands</div><div>' + (cand.length) + '</div>',
          '<div>Δ#1-#2</div><div>' + fmt(del12) + '</div>',
          '<div>Δ#1-#3</div><div>' + fmt(del13) + '</div>',
          (blockedN!=null? ('<div>Blocked@next</div><div>'+blockedN+'/4</div>') : ''),
          (legalCount!=null? ('<div>Legal moves</div><div>'+legalCount+'</div>') : ''),
          (predK!=null? ('<div>Predict K</div><div>'+predK+'</div>') : ''),
          (interceptD!=null && isFinite(interceptD)? ('<div>Intercept d</div><div>'+interceptD+'</div>') : ''),
          (losNow!=null? ('<div>LOS now/target</div><div>'+ (losNow?'✓':'×') + ' / ' + (losTarget?'✓':'×') + '</div>') : ''),
          (twoStep!=null? ('<div>Two-step escape</div><div>'+ (twoStep?'✓':'×') + '</div>') : ''),
          (deadEnd!=null? ('<div>Dead-end dist</div><div>'+deadEnd+'</div>') : ''),
          (gateTight!=null? ('<div>Gate tightness</div><div>'+ (gateTight.toFixed(2)) + '</div>') : ''),
          (vorNorm!=null? ('<div>Voronoi norm</div><div>'+ fmt(vorNorm) + '</div>') : ''),
          (mmWorst!=null? ('<div>Minimax worst</div><div>'+ fmt(mmWorst) + (mmArg? (' @ '+mmArg):'') + '</div>') : ''),
        '</div>',
        (candHTML ? '<div style="margin-top:6px;">' + candHTML + '</div>' : ''),
        '<div class="debug-grid" style="margin-top:6px;">',
          '<div>AI ms p50/p95/p99</div><div>'+ fmt(p50) +' / '+ fmt(p95) +' / '+ fmt(p99) +'</div>',
          '<div>AI spikes (&gt;2ms)</div><div>'+ (A.aiSpikes|0) + '</div>',
        '</div>',
        chosenBreak,
      '</div>'
    ].join('');
    const memHTML = [
      '<div class="debug-section"><h3>Memory</h3>',
        '<div class="debug-grid">',
          '<div>Heap Used</div><div>' + __fmtMB(mem.heap.used) + ' (' + __fmtBytesExact(mem.heap.used) + ') Δ ' + deltaStr + '</div>',
          '<div>Heap Total</div><div>' + __fmtMB(mem.heap.total) + ' (' + __fmtBytesExact(mem.heap.total) + ')</div>',
          '<div>Heap Limit</div><div>' + __fmtMB(mem.heap.limit) + ' (' + __fmtBytesExact(mem.heap.limit) + ')</div>',
        '</div>',
        '<div class="debug-grid" style="margin-top:6px;">',
          '<div>NRBFS pool</div><div>' + __fmtMB(mem.pools.nrbfs) + ' (' + __fmtBytesExact(mem.pools.nrbfs) + ')</div>',
          '<div>Overlay pool</div><div>' + __fmtMB(mem.pools.overlay) + ' (' + __fmtBytesExact(mem.pools.overlay) + ')</div>',
          '<div>Sprites ~</div><div>' + __fmtMB(mem.pools.sprites) + ' (' + __fmtBytesExact(mem.pools.sprites) + '), ' + (mem.pools.spriteCount||0) + ' bitmaps</div>',
          '<div>Wall frames ~</div><div>' + __fmtMB(mem.pools.walls) + ' (' + __fmtBytesExact(mem.pools.walls) + ')' + (mem.pools.wallFrames? (' ['+mem.pools.wallFrames+'×'+__fmtMB(mem.pools.perFrame)+']') : '') + '</div>',
          '<div>Live canvases ~</div><div>' + __fmtMB(mem.pools.canvases) + ' (' + __fmtBytesExact(mem.pools.canvases) + ')</div>',
        '</div>',
      '</div>'
    ].join('');
    const gamePlusHTML = (function(){
      const fs = augState;
      const power = fs.power, cr = fs.crashStats;
      const blAvg = (fs.render && fs.render.blitsBuf.length ? (__sum(fs.render.blitsBuf)/fs.render.blitsBuf.length) : 0);
      const fxArea = fs.render.fxArea || 0;
      const boostPct = (fs.allFrames ? fs.boostOnFrames/fs.allFrames : 0);
      const subCatch = (fs.substepsBuf.length ? fs.substepsBuf.filter(v=>v>1).length / fs.substepsBuf.length : 0);
      const lastCrashes = (cr.last||[]).map(c=>`(${c.px},${c.py}) / (${c.ex},${c.ey}) @${c.tick||'?'}`).join('<br/>');
      const pMed = __q(power.timesToPickup, 50);
      const p95 = __q(power.timesToPickup, 95);
      const dtBuf = fs.dtBuf||[];
      return [
        '<div class="debug-section"><h3>Game+</h3>',
          '<div class="debug-grid">',
            '<div>rAF avg/p95 (ms)</div><div>'+ (dtBuf.length? ( (dtAvg).toFixed(2)+' / '+(dtP95).toFixed(2) ) : '—') +'</div>',
            '<div>Jitter (EMA)</div><div>'+ (jitter||0).toFixed(2) + '</div>',
            '<div>Missed frames (&gt;33ms)</div><div>'+ (fs.dtMisses|0) + '</div>',
            '<div>Catch-up substeps</div><div>'+ __fmtPct(subCatch) + '</div>',
            '<div>Input latency p50/p95</div><div>'+ (lat50?lat50.toFixed(1):'—')+' / '+(lat95?lat95.toFixed(1):'—')+' ms</div>',
            '<div>Blits/tick (avg)</div><div>'+ (blAvg?blAvg.toFixed(2):'—') + '</div>',
            '<div>FX clear area (px²)</div><div>'+ (fxArea|0) + '</div>',
            '<div>Power-ups (spawns/pickups)</div><div>'+ (power.spawns|0)+' / '+(power.pickups|0) + '</div>',
            '<div>Time-to-pickup p50/p95</div><div>'+ (pMed? pMed.toFixed(0)+' / '+p95.toFixed(0)+' ms' : '—') + '</div>',
            '<div>Boost duty</div><div>'+ __fmtPct(boostPct) + '</div>',
            '<div>Crashes (you/enemy/tie)</div><div>'+ (cr.player|0)+' / '+(cr.enemy|0)+' / '+(cr.tie|0) + '</div>',
          '</div>',
          (lastCrashes? '<div style="opacity:.8; margin-top:4px;">Last crashes:<br/>' + lastCrashes + '</div>' : ''),
          '<div class="debug-grid" style="margin-top:6px;">',
            '<div>Features</div><div>'+ (augState.featureFlags.offscreenCanvas?'OffscreenCanvas ': '') + (augState.featureFlags.imageBitmap? 'ImageBitmap ':'') + (augState.featureFlags.worker? 'Worker':'' ) +'</div>',
          '</div>',
        '</div>'
      ].join('');
    })();
    el.innerHTML = [ perfHTML, gameHTML, gamePlusHTML, aiHTML, memHTML ].join('');
    try {
      const ch = el.querySelector('#dbgChosenBreak');
      if (ch) {
        const was = (typeof debugState.chosenOpen === 'boolean') ? debugState.chosenOpen : true;
        ch.open = was;
        ch.addEventListener('toggle', ()=>{
          debugState.chosenOpen = ch.open;
        }, { once:false });
      }
    } catch(e){}
  } catch(e){
    try {
      if (el) {
        el.innerHTML = '<div style="padding:6px; opacity:.8;">Debug info unavailable in this build.</div>';
      }
    } catch(_e){}
  }
}
export { renderDebug };
