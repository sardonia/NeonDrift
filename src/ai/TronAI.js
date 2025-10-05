import aiDebugState from '../game/debug/aiDebugState.js';
import debugState from '../game/debug/debugController.js';
let TronAIImpl;
(function(global){
       "use strict";
       let minMaxSpace;
       const DIRS = ['up','right','down','left'];
       const V = { up:[0,-1], right:[1,0], down:[0,1], left:[-1,0] };
       function leftOf(d){ return DIRS[(DIRS.indexOf(d)+3)%4]; }
       function rightOf(d){ return DIRS[(DIRS.indexOf(d)+1)%4]; }
       function opposite(d){ return DIRS[(DIRS.indexOf(d)+2)%4]; }
       function inBounds(x,y,w,h){ return x>=0 && x<w && y>=0 && y<h; }
function isBlocked(grid,x,y){
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  if (!inBounds(x,y,W,H)) return true;
  return !__nrPassable(grid, x, y, W);
}
       function cloneGrid(g){
         const h = g.length, w = g[0].length;
         const out = new Array(h);
         for(let y=0;y<h;y++){ out[y] = g[y].slice(); }
         return out;
       }
const __NRBFS = {
  cap: 0,
  qx: null,
  qy: null,
  dist: null,
  seen: null,
  owner: null,
  stamp: 1
};
function __nrbfsEnsure(W, H) {
  const n = W * H;
  if (!__NRBFS.qx || __NRBFS.cap < n) {
    __NRBFS.cap = n;
    __NRBFS.qx = new Int16Array(n);
    __NRBFS.qy = new Int16Array(n);
    __NRBFS.dist = new Int32Array(n);
    __NRBFS.seen = new Uint32Array(n);  
    __NRBFS.owner = new Int8Array(n);   
  }
  __NRBFS.stamp = (__NRBFS.stamp + 1) >>> 0;
  if (__NRBFS.stamp === 0) {
    __NRBFS.seen.fill(0);
    __NRBFS.stamp = 1;
  }
  return __NRBFS;
}
function __nrIdx(x, y, W) { return y * W + x; }
var __OL = { W:0, H:0, cnt:null, touched:null, n:0, frames:null, sp:0 };
function __olEnsure(W, H){
  if (!__OL.cnt || __OL.W !== W || __OL.H !== H){
    __OL.W = W; __OL.H = H;
    __OL.cnt = new Uint16Array(W*H);
    const cap = Math.min(W*H, 65536);
    __OL.touched = new Int32Array(cap);
    __OL.n = 0;
    __OL.frames = new Int32Array(128);
    __OL.sp = 0;
  }
}
function __olBegin(grid){
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  __olEnsure(W, H);
  if (__OL.sp >= __OL.frames.length) {
    const bigger = new Int32Array(__OL.frames.length * 2);
    bigger.set(__OL.frames);
    __OL.frames = bigger;
  }
  __OL.frames[__OL.sp++] = __OL.n;
}
function __olPush(){ 
  if (__OL.sp >= __OL.frames.length) {
    const bigger = new Int32Array(__OL.frames.length * 2);
    bigger.set(__OL.frames);
    __OL.frames = bigger;
  }
  __OL.frames[__OL.sp++] = __OL.n; 
}
function __olEnd(){
  if (!__OL.frames || __OL.sp <= 0) { __OL.sp = 0; return; }
  const start = __OL.frames[--__OL.sp] >>> 0;
  for(let i=__OL.n-1; i>=start; --i){
    const idx = __OL.touched[i];
    const c = __OL.cnt[idx];
    if (c) __OL.cnt[idx] = c - 1;
  }
  __OL.n = start;
}
function __olMark(x, y, W){
  if (x<0 || y<0 || x>=W || y>=__OL.H) return;
  const idx = (y*W + x) | 0;
  __OL.cnt[idx] = (__OL.cnt[idx] + 1) | 0;
  if (__OL.n < __OL.touched.length){
    __OL.touched[__OL.n++] = idx;
  } else {
    __OL.touched[__OL.n-1] = -1;
  }
}
function __olBlocked(x, y, W){
  if (!__OL.cnt || W !== __OL.W) return false;
  const idx = (y*W + x) | 0;
  return __OL.cnt[idx] > 0;
}
function __olReset(){
  if (!__OL.cnt) return;
  for(let i=__OL.n-1; i>=0; --i){
    const idx = __OL.touched[i];
    if (idx >= 0) __OL.cnt[idx] = 0;
  }
  __OL.n = 0;
  __OL.sp = 0;
}
function __nrGet(grid, x, y, W) {
  const row = grid[y];
  if (Array.isArray(row)) return row[x];
  return grid[y * W + x];
}
function __nrPassable(grid, x, y, W) {
  if (__olBlocked(x, y, W)) return false;
  return !__nrGet(grid, x, y, W);
}
const __NR_DX = new Int8Array([0, 1, 0, -1]);
const __NR_DY = new Int8Array([-1, 0, 1, 0]);
function floodFillArea(grid, sx, sy) {
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return 0;
  if (!H || !W) return 0;
  if (!__nrPassable(grid, sx, sy, W)) return 0;
  const C = __nrbfsEnsure(W, H);
  const stamp = C.stamp;
  const qx = C.qx, qy = C.qy, seen = C.seen;
  let head = 0, tail = 0, count = 0;
  const sIdx = __nrIdx(sx, sy, W);
  qx[tail] = sx; qy[tail] = sy; tail = (tail + 1) | 0;
  seen[sIdx] = stamp;
  count++;
  while (head !== tail) {
    const x = qx[head], y = qy[head];
    head = (head + 1) | 0;
    for (let i = 0; i < 4; i++) {
      const nx = x + __NR_DX[i], ny = y + __NR_DY[i];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nIdx = __nrIdx(nx, ny, W);
      if (seen[nIdx] === stamp) continue;
      if (!__nrPassable(grid, nx, ny, W)) continue;
      seen[nIdx] = stamp;
      qx[tail] = nx; qy[tail] = ny; tail = (tail + 1) | 0;
      count++;
    }
  }
  return count;
}
function bfsDistance(grid, sx, sy, tx, ty) {
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return Infinity;
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return Infinity;
  if (!H || !W) return Infinity;
  if (!__nrPassable(grid, sx, sy, W)) return Infinity;
  if (!__nrPassable(grid, tx, ty, W)) return Infinity;
  if (sx === tx && sy === ty) return 0;
  const C = __nrbfsEnsure(W, H);
  const stamp = C.stamp;
  const qx = C.qx, qy = C.qy, seen = C.seen, dist = C.dist;
  let head = 0, tail = 0;
  const sIdx = __nrIdx(sx, sy, W);
  qx[tail] = sx; qy[tail] = sy; tail = (tail + 1) | 0;
  seen[sIdx] = stamp;
  dist[sIdx] = 0;
  while (head !== tail) {
    const x = qx[head], y = qy[head];
    head = (head + 1) | 0;
    const base = __nrIdx(x, y, W);
    const d = dist[base] + 1;
    for (let i = 0; i < 4; i++) {
      const nx = x + __NR_DX[i], ny = y + __NR_DY[i];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const idx = __nrIdx(nx, ny, W);
      if (seen[idx] === stamp) continue;
      if (!__nrPassable(grid, nx, ny, W)) continue;
      dist[idx] = d;
      if (nx === tx && ny === ty) return d;
      seen[idx] = stamp;
      qx[tail] = nx; qy[tail] = ny; tail = (tail + 1) | 0;
    }
  }
  return Infinity;
}
function voronoiDelta(grid, ax, ay, px, py) {
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  if (!H || !W) return 0;
  if (ax < 0 || ay < 0 || ax >= W || ay >= H) return 0;
  if (px < 0 || py < 0 || px >= W || py >= H) return 0;
  if (!__nrPassable(grid, ax, ay, W) || !__nrPassable(grid, px, py, W)) return 0;
  const C = __nrbfsEnsure(W, H);
  const stamp = C.stamp;
  const qx = C.qx, qy = C.qy, seen = C.seen, dist = C.dist, owner = C.owner;
  let head = 0, tail = 0;
  let idxA = __nrIdx(ax, ay, W);
  let idxP = __nrIdx(px, py, W);
  qx[tail] = ax; qy[tail] = ay; tail = (tail + 1) | 0;
  seen[idxA] = stamp; dist[idxA] = 0; owner[idxA] = 0;
  if (!(ax === px && ay === py)) {
    qx[tail] = px; qy[tail] = py; tail = (tail + 1) | 0;
    const stP = __nrIdx(px, py, W);
    seen[stP] = stamp; dist[stP] = 0; owner[stP] = 1;
  }
  let aCount = 0, pCount = 0;
  while (head !== tail) {
    const x = qx[head], y = qy[head];
    head = (head + 1) | 0;
    const base = __nrIdx(x, y, W);
    const d = dist[base];
    const own = owner[base];
    for (let i = 0; i < 4; i++) {
      const nx = x + __NR_DX[i], ny = y + __NR_DY[i];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const idx = __nrIdx(nx, ny, W);
      if (!__nrPassable(grid, nx, ny, W)) continue;
      if (seen[idx] !== stamp) {
        seen[idx] = stamp;
        dist[idx] = d + 1;
        owner[idx] = own;
        qx[tail] = nx; qy[tail] = ny; tail = (tail + 1) | 0;
      } else {
        if (dist[idx] === d + 1 && owner[idx] !== own) {
          owner[idx] = -1; 
        }
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (seen[idx] !== stamp) continue;
      const o = owner[idx];
      if (o === 0) aCount++;
      else if (o === 1) pCount++;
    }
  }
  return (aCount - pCount);
}
       function corridorWidth(grid, sx, sy, dir){
         const [dx,dy] = V[dir];
         let x = sx, y = sy, len = 0;
         while(true){
           x += dx; y += dy;
           if(isBlocked(grid,x,y)) break;
           len++;
         }
         return len;
       }
       function hasTwoStepEscape(grid, x, y, dirFrom){
         const dirs = [dirFrom, leftOf(dirFrom), rightOf(dirFrom)];
         for(const d1 of dirs){
           const [dx1,dy1] = V[d1];
           const nx = x+dx1, ny = y+dy1;
           if(isBlocked(grid,nx,ny)) continue;
           const was = grid[y][x]; grid[y][x] = true;
           const options = [d1, leftOf(d1), rightOf(d1)].some(d2=>{
             const [dx2,dy2] = V[d2];
             const nnx = nx+dx2, nny = ny+dy2;
             return !isBlocked(grid,nnx,nny);
           });
           grid[y][x] = was;
           if(options) return true;
         }
         return false;
       }
function rays(grid, x, y){
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  const res = { up:0, right:0, down:0, left:0 };
  for(let yy=y-1; yy>=0; yy--){ if(!__nrPassable(grid, x, yy, W)) break; res.up++; }
  for(let yy=y+1; yy<H; yy++){ if(!__nrPassable(grid, x, yy, W)) break; res.down++; }
  for(let xx=x-1; xx>=0; xx--){ if(!__nrPassable(grid, xx, y, W)) break; res.left++; }
  for(let xx=x+1; xx<W; xx++){ if(!__nrPassable(grid, xx, y, W)) break; res.right++; }
  return res;
}
function lineClear(grid, x0, y0, x1, y1){
  const H = grid.length >>> 0;
  const W = H ? (grid[0].length >>> 0) : 0;
  if(x0===x1){
    const [a,b] = y0<y1 ? [y0+1,y1] : [y1+1,y0];
    for(let y=a;y<b;y++){ if(!__nrPassable(grid, x0, y, W)) return false; }
    return true;
  }
  if(y0===y1){
    const [a,b] = x0<x1 ? [x0+1,x1] : [x1+1,x0];
    for(let x=a;x<b;x++){ if(!__nrPassable(grid, x, y0, W)) return false; }
    return true;
  }
  return false;
}
       function lastFreeAhead(grid, sx, sy, dir, maxSteps=99){
         const [dx,dy] = V[dir];
         let x=sx, y=sy, steps=0, lastX=sx, lastY=sy;
         while(steps<maxSteps){
           const nx=x+dx, ny=y+dy;
           if(isBlocked(grid,nx,ny)) break;
           lastX = nx; lastY = ny;
           x = nx; y = ny; steps++;
         }
         return { x:lastX, y:lastY, steps };
       }
       function openNeighbors(grid, x, y){
         let n=0;
         for(const [dx,dy] of Object.values(V)){
           const nx=x+dx, ny=y+dy;
           if(inBounds(nx,ny,grid[0].length,grid.length) && !grid[ny][nx]) n++;
         }
         return n;
       }
       const Memory = {
         w:0, h:0,
         recent: [],
         recentDirs: [],
         N: 12,
         playerRibbon:null,
         enemyRibbon:null,
         prevPlayer:null,
         prevAI:null
       };
       function ensureMemory(grid){
         const h=grid.length, w=grid[0].length;
         if(Memory.w!==w || Memory.h!==h || !Memory.playerRibbon || !Memory.enemyRibbon){
           Memory.w=w; Memory.h=h;
           Memory.playerRibbon = Array(h).fill(0).map(()=>Array(w).fill(false));
           Memory.enemyRibbon  = Array(h).fill(0).map(()=>Array(w).fill(false));
           Memory.recent.length = 0;
           Memory.recentDirs.length = 0;
           Memory.prevPlayer = Memory.prevAI = null;
         }
       }
       function markRibbonFromLast(grid, ai, player){
         ensureMemory(grid);
         const w=Memory.w, h=Memory.h;
         if(Memory.prevPlayer){
           const {x,y} = Memory.prevPlayer;
           if(inBounds(x,y,w,h) && grid[y][x]) Memory.playerRibbon[y][x] = true;
         }
         if(Memory.prevAI){
           const {x,y} = Memory.prevAI;
           if(inBounds(x,y,w,h) && grid[y][x]) Memory.enemyRibbon[y][x] = true;
         }
         Memory.prevPlayer = {x:player.x, y:player.y};
         Memory.prevAI     = {x:ai.x, y:ai.y};
       }
       function ribbonAdjacency(ribbon, x, y){
         let n=0;
         for(const [dx,dy] of Object.values(V)){
           const nx=x+dx, ny=y+dy;
           if(inBounds(nx,ny,Memory.w,Memory.h) && ribbon[ny][nx]) n++;
         }
         return n;
       }
       function predictPlayerPath(grid, player, steps=6){
         const path = [{ x: player.x, y: player.y, dir: player.dir }];
         let x=player.x, y=player.y, dir=player.dir;
         for(let k=0;k<steps;k++){
           const opts = [dir, leftOf(dir), rightOf(dir)];
           let best=null, bestScore=-Infinity;
           for(const d of opts){
             const [dx,dy] = V[d];
             const nx=x+dx, ny=y+dy;
             if(isBlocked(grid,nx,ny)) continue;
             const widthScore = corridorWidth(grid, nx, ny, d);
             const straight = (d===dir) ? 1 : 0;
             const score = widthScore + straight*0.5;
             if(score>bestScore){ bestScore=score; best=d; }
           }
           if(!best) break;
           const [dx,dy]=V[best];
           x+=dx; y+=dy; dir=best;
           path.push({ x, y, dir });
         }
         return path;
       }
function simulateOne(g, p, a, pDir, aDir){
  const w = g[0].length, h = g.length;
  const player = { x:p.x, y:p.y, dir:pDir };
  const ai     = { x:a.x, y:a.y, dir:aDir };
  const pd = V[pDir], ad = V[aDir];
  const pnx = player.x + pd[0], pny = player.y + pd[1];
  const enx = ai.x + ad[0],     eny = ai.y + ad[1];
  let playerDead = false, enemyDead = false;
  if(!inBounds(pnx,pny,w,h) || isBlocked(g, pnx, pny)) playerDead = true;
  if(!inBounds(enx,eny,w,h) || isBlocked(g, enx, eny)) enemyDead = true;
  if(!playerDead && !enemyDead && pnx===enx && pny===eny){ playerDead = enemyDead = true; }
  if(!playerDead && !enemyDead && pnx===a.x && pny===a.y && enx===p.x && eny===p.y){ playerDead = enemyDead = true; }
  if(!playerDead && !enemyDead && pnx===a.x && pny===a.y){ playerDead = true; }
  if(!playerDead && !enemyDead && enx===p.x && eny===p.y){ enemyDead = true; }
  if(!playerDead) __olMark(player.x, player.y, w);
  if(!enemyDead)  __olMark(ai.x, ai.y, w);
  if(!playerDead){ player.x = pnx; player.y = pny; }
  if(!enemyDead){  ai.x = enx; ai.y = eny; }
  return { g, player, ai, playerDead, enemyDead };
}
function minimaxScore(g, ai0, p0, aDir, weights){
  const optionsP = [p0.dir, leftOf(p0.dir), rightOf(p0.dir)].filter(d => d !== opposite(p0.dir));
  let worst = +Infinity;
  for(const pDir of optionsP){
    __olPush();
    try {
    const sim = simulateOne(g, p0, ai0, pDir, aDir);
    let branchVal = 0;
    if(sim.enemyDead && !sim.playerDead){
      branchVal = -9999;
    } else if(sim.playerDead && !sim.enemyDead){
      branchVal = 9999;
    } else if(sim.playerDead && sim.enemyDead){
      branchVal = -1500;
    } else {
      const aArea = floodFillArea(sim.g, sim.ai.x, sim.ai.y);
      const pArea = floodFillArea(sim.g, sim.player.x, sim.player.y);
      const pSafe = hasTwoStepEscape(sim.g, sim.player.x, sim.player.y, sim.player.dir) ? 1 : 0;
      branchVal = (aArea - pArea) * weights.MINIMAX - pSafe * weights.PLAYER_SAFETY;
    }
    if(branchVal < worst) worst = branchVal;
        } finally { __olEnd(); }
    if (worst === -9999) {  }
  }
  return (Number.isFinite(worst) ? worst : 0);
}
       const Weights = {
         AREA: 2.1, CORRIDOR: 0.9, TWOSTEP: 3.6, STRAIGHT: 0.04, VORONOI: 1.0,
         CHASE: 1.5, INTERCEPT: 1.2, LOS: 2.0, GATE: 1.2,
         RIBBON_HUG: 0.9, MY_RIBBON_AVOID: 1.1,
         MINIMAX: 0.09, PLAYER_SAFETY: 22,
         RAY_BIAS: 0.35, ANTI_OSC: 2.8, LOOP_PENALTY: 0.12, PREDICT_K: 6
       };
       function chooseAIMove({ grid, ai, player }){
         __olReset();
         markRibbonFromLast(grid, ai, player);
         var __dbgTick = (typeof debugState.performance.tick !== 'undefined'
           ? debugState.performance.tick
           : 0);
         var __dbgAI = aiDebugState;
         __dbgAI.tick = __dbgTick;
         __dbgAI.ai = { x: ai.x, y: ai.y, dir: ai.dir };
         __dbgAI.player = { x: player.x, y: player.y, dir: player.dir };
         __dbgAI.cand = [];
const candidates = [ai.dir, leftOf(ai.dir), rightOf(ai.dir)];
         let best = null, bestScore = -Infinity;
         const px = player.x, py = player.y, pDir = player.dir;
         const predicted = predictPlayerPath(grid, player, Weights.PREDICT_K);
         const pTarget   = predicted[predicted.length-1];
         const turnPoint = lastFreeAhead(grid, px, py, pDir);
         const lastDir = Memory.recentDirs[Memory.recentDirs.length-1] || ai.dir;
         const last2   = Memory.recentDirs[Memory.recentDirs.length-2] || lastDir;
         for(const dir of candidates){
           const [dx,dy] = V[dir];
           const nx = ai.x + dx, ny = ai.y + dy;
           if(isBlocked(grid,nx,ny)) continue;
           __olBegin(grid);
           try {
           __olMark(ai.x, ai.y, grid[0].length);
           const safe2    = hasTwoStepEscape(grid, nx, ny, dir) ? 1 : 0;
           const area     = floodFillArea(grid, nx, ny);
           const corridor = corridorWidth(grid, nx, ny, dir);
           const straight = (dir === ai.dir) ? 1 : 0;
           const vor      = voronoiDelta(grid, nx, ny, px, py);
           const r = rays(grid, nx, ny);
           const rayScore = Weights.RAY_BIAS * (
             (dir==='up'?r.up:dir==='down'?r.down:dir==='left'?r.left:r.right)
             - 0.25 * ((dir==='up'||dir==='down') ? (r.left + r.right) : (r.up + r.down))
           );
           const chaseD     = bfsDistance(grid, nx, ny, px, py);
           const interceptD = bfsDistance(grid, nx, ny, turnPoint.x, turnPoint.y);
           let losBonus = 0;
           if(lineClear(grid, nx, ny, px, py))   losBonus += Weights.LOS * 0.6;
           if(lineClear(grid, nx, ny, pTarget.x, pTarget.y)){
             let closing = 0;
             if(ny===pTarget.y){
               if(pTarget.x < nx && dir==='left')  closing = 1;
               if(pTarget.x > nx && dir==='right') closing = 1;
             } else if(nx===pTarget.x){
               if(pTarget.y < ny && dir==='up')    closing = 1;
               if(pTarget.y > ny && dir==='down')  closing = 1;
             }
             losBonus += Weights.LOS * (1 + 0.4*closing);
           }
           const pNextX = px + V[pDir][0], pNextY = py + V[pDir][1];
           const pNext = (!isBlocked(grid,pNextX,pNextY)) ? { x: pNextX, y: pNextY } : { x: px, y: py };
           const gates = openNeighbors(grid, pNext.x, pNext.y);
           const tightness = Math.max(0, (3 - Math.min(3, gates)) / 3);
           const gateBonus = Weights.GATE * tightness * Math.max(0, 10 - Math.min(chaseD, interceptD));
           const hug = ribbonAdjacency(Memory.playerRibbon, nx, ny);
           const selfAdj = ribbonAdjacency(Memory.enemyRibbon, nx, ny);
           const ribbonScore = Weights.RIBBON_HUG * Math.min(2, hug) - Weights.MY_RIBBON_AVOID * Math.max(0, selfAdj-1);
           const mm = minimaxScore(grid, {x:ai.x, y:ai.y, dir}, {x:px,y:py,dir:pDir}, dir, Weights);
           let antiOsc = 0;
           if(lastDir && last2){
             const L = leftOf(lastDir), R = rightOf(lastDir);
             if(dir===L && lastDir===R) antiOsc -= Weights.ANTI_OSC;
             if(dir===R && lastDir===L) antiOsc -= Weights.ANTI_OSC;
           }
           let loop = 0;
           for(const [rx,ry] of Memory.recent){
             const manh = Math.abs(nx-rx) + Math.abs(ny-ry);
             if(manh<=1) loop += 1;
             else if(manh===2) loop += 0.5;
           }
           loop *= Weights.LOOP_PENALTY;
           let score = 0;
           score += area*Weights.AREA + corridor*Weights.CORRIDOR + safe2*Weights.TWOSTEP + straight*Weights.STRAIGHT + vor*Weights.VORONOI;
           if(Number.isFinite(chaseD))     score += -Weights.CHASE * chaseD;
           if(Number.isFinite(interceptD)) score += -Weights.INTERCEPT * interceptD;
           score += losBonus + gateBonus + ribbonScore + mm + rayScore + antiOsc - loop;
           let blockedNeighbors = 0;
           for(const [adx,ady] of Object.values(V)){ if(isBlocked(grid, nx+adx, ny+ady)) blockedNeighbors++; }
           if(blockedNeighbors >= 3) score -= 7;
           try { 
  __dbgAI.cand.push({
    dir: dir,
    score: (Number.isFinite(+score)? Number((+score).toFixed(2)) : null),
    area: (typeof area!=='undefined'? area : null),
    corridor: (typeof corridor!=='undefined'? corridor : null),
    vor: (typeof vor!=='undefined'? vor : null),
    straight: (typeof straight!=='undefined'? straight : null),
    safe2: (typeof safe2!=='undefined'? safe2 : null),
    mm: (typeof mm!=='undefined'? mm : null),
    rayScore: (typeof rayScore!=='undefined'? rayScore : null),
    antiOsc: (typeof antiOsc!=='undefined'? antiOsc : null),
    loop: (typeof loop!=='undefined'? loop : null),
    chaseD: (typeof chaseD!=='undefined' && Number.isFinite(chaseD)? chaseD : null),
    interceptD: (typeof interceptD!=='undefined' && Number.isFinite(interceptD)? interceptD : null),
    losBonus: (typeof losBonus!=='undefined'? losBonus : null),
    gateBonus: (typeof gateBonus!=='undefined'? gateBonus : null),
    ribbonScore: (typeof ribbonScore!=='undefined'? ribbonScore : null)
  }); 
} catch(e){}
           if(score > bestScore){ bestScore = score; best = dir; }
}
           finally { __olEnd(); }
}
         if(!best){
           const h = grid.length, w = grid[0].length;
           for(const name of DIRS){
             const [dx,dy] = V[name];
             const nx = ai.x+dx, ny = ai.y+dy;
             if(inBounds(nx,ny,w,h) && !grid[ny][nx]){ best = name; break; }
           }
         }
         if(best){
           Memory.recentDirs.push(best);
           if(Memory.recentDirs.length > Memory.N) Memory.recentDirs.shift();
           Memory.recent.push([ai.x, ai.y]);
           if(Memory.recent.length > Memory.N) Memory.recent.shift();
         }
         if (__OL && (__OL.sp!==0 || __OL.n!==0)) __olReset();
         try {
           __dbgAI.best = best;
           __dbgAI.bestScore = bestScore;
         } catch (e) {
         }
         return best || ai.dir;
       }
       function setWeights(partial){ Object.assign(Weights, partial||{}); }
       TronAIImpl = {
         chooseAIMove,
         setWeights,
         _internals: {
           DIRS,
           V,
           leftOf,
           rightOf,
           opposite,
           rays,
           isBlocked,
           floodFillArea,
           corridorWidth,
           hasTwoStepEscape,
           voronoiDelta,
           minMaxSpace
         }
       };
     })(window);
export const TronAI = TronAIImpl;
export const DIRS = TronAIImpl ? TronAIImpl._internals.DIRS : undefined;
export const V = TronAIImpl ? TronAIImpl._internals.V : undefined;
export const leftOf = TronAIImpl ? TronAIImpl._internals.leftOf : undefined;
export const rightOf = TronAIImpl ? TronAIImpl._internals.rightOf : undefined;
export const opposite = TronAIImpl ? TronAIImpl._internals.opposite : undefined;
export const rays = TronAIImpl ? TronAIImpl._internals.rays : undefined;
export const isBlocked = TronAIImpl ? TronAIImpl._internals.isBlocked : undefined;
export const floodFillArea = TronAIImpl ? TronAIImpl._internals.floodFillArea : undefined;
export const corridorWidth = TronAIImpl ? TronAIImpl._internals.corridorWidth : undefined;
export const hasTwoStepEscape = TronAIImpl ? TronAIImpl._internals.hasTwoStepEscape : undefined;
export const voronoiDelta = TronAIImpl ? TronAIImpl._internals.voronoiDelta : undefined;
export const minMaxSpace = TronAIImpl ? TronAIImpl._internals.minMaxSpace : undefined;
