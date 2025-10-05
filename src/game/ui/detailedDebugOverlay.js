import { __getMemStats } from '../debug/metrics.js';
import * as C from '../Constants.js';
import { getService, TOKENS } from '../services/index.js';
import warnOnce from '../utils/warnOnce.js';

const HUD_DEBUG_WARN_TAG = 'debugOverlay-hud-service-missing';

function getDom() {
  try {
    const svc = typeof getService === 'function' ? getService(TOKENS.DOM) : undefined;
    if (svc) return svc;
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      return {
        board: document.getElementById('board'),
        debugPanel: document.getElementById('debugPanel'),
      };
    }
  } catch (_) {}
  warnOnce('debugOverlay-getDom', 'Failed to resolve DOM for detailedDebugOverlay');
  return {};
}

function getHudFacade() {
  try {
    const svc = getService(TOKENS.HUD);
    if (svc) return svc;
  } catch (_) {}
  return null;
}

export function initDebugOverlay({
  debugBtn,
  debugPanel,
  gameState: providedGameState,
  debugState: injectedDebugState,
  pauseGame: pauseGameFn,
  startGame: startGameFn
} = {}) {
  if (!debugBtn || !debugPanel) return;

  const debugState = injectedDebugState || {};
  const pauseGame = (typeof pauseGameFn === 'function') ? pauseGameFn : undefined;
  const startGame = (typeof startGameFn === 'function') ? startGameFn : undefined;
  let debugOn = false;
  let updateTimer = null;
  let __escOff = null;
  let resumeTimer = null;
  let didPauseForDebug = false;
  let pointerInsideOverlay = false;
  let overlayHasFocus = false;

  const isOverlayInteracting = () => pointerInsideOverlay || overlayHasFocus;

  const updateFieldText = (root, field, text) => {
    if (!root || !field) return;
    const node = root.querySelector(`[data-field="${field}"]`);
    if (node && node.textContent !== text) {
      node.textContent = text;
    }
  };

  const applyViewModelUpdates = (root, viewModel) => {
    if (!root || !viewModel || typeof viewModel !== 'object') return;

    const updateRows = (sectionKey, rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (!row || !row.key) return;
        updateFieldText(root, `${sectionKey}-${row.key}-value`, row.value);
      });
    };

    if (Array.isArray(viewModel.summaryStats)) {
      viewModel.summaryStats.forEach((stat) => {
        if (!stat || !stat.key) return;
        updateFieldText(root, `summary-${stat.key}-value`, stat.value);
      });
    }

    updateRows('cycle', viewModel.cycleRows);
    updateRows('performance', viewModel.performanceRows);
    updateRows('hud', viewModel.hudRows);
    updateRows('ai', viewModel.aiRows);
    updateRows('memory', viewModel.memRows);
    updateRows('crash', viewModel.crashRows);

    if (Array.isArray(viewModel.aiChips)) {
      viewModel.aiChips.forEach((chip) => {
        if (!chip || !chip.key) return;
        updateFieldText(root, `ai-chip-${chip.key}`, chip.label);
      });
    }

    if (Array.isArray(viewModel.candidates)) {
      viewModel.candidates.forEach((candidate) => {
        if (!candidate || !candidate.key) return;
        updateFieldText(root, `${candidate.key}-rank`, `#${candidate.rank}`);
        updateFieldText(root, `${candidate.key}-dir`, candidate.dir);
        updateRows(candidate.key, candidate.metrics);
      });
    }

    if (viewModel.status) {
      const statusNode = root.querySelector('[data-field="status-label"]');
      if (statusNode) {
        if (statusNode.textContent !== viewModel.status.label) {
          statusNode.textContent = viewModel.status.label;
        }
        statusNode.classList.toggle('debug-chip--live', !!viewModel.status.live);
      }
    }
  };

  const attachOverlayGuards = (shellNode) => {
    if (!shellNode || shellNode.__debugOverlayGuarded) return;
    shellNode.__debugOverlayGuarded = true;
    shellNode.addEventListener('mouseenter', () => {
      pointerInsideOverlay = true;
    });
    shellNode.addEventListener('mouseleave', () => {
      pointerInsideOverlay = false;
      if (!overlayHasFocus) {
        render();
      }
    });
    shellNode.addEventListener('focusin', () => {
      overlayHasFocus = true;
    });
    shellNode.addEventListener('focusout', () => {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      overlayHasFocus = !!(active && shellNode.contains(active));
      if (!overlayHasFocus && !pointerInsideOverlay) {
        render();
      }
    });
  };

  const getLiveGameState = () => {
    try {
      if (typeof providedGameState === 'function') {
        const result = providedGameState();
        if (result) return result;
      }
    } catch (_) {}
    if (providedGameState && typeof providedGameState === 'object') {
      return providedGameState;
    }
    try {
      if (typeof window !== 'undefined' && window.gameState) {
        return window.gameState;
      }
    } catch (_) {}
    return {};
  };

  function render() {
    try {
      const gs = getLiveGameState() || {};
      if (gs && gs.gameEnded) didPauseForDebug = false;
      const gp = gs.player || {};
      const ge = gs.enemy || {};
      const dbg = injectedDebugState || {};
      const A = (dbg.aug && typeof dbg.aug === 'object') ? dbg.aug : {};
      const ai = (dbg.ai && typeof dbg.ai === 'object') ? dbg.ai : {};

      const tickRaw = (typeof gs.tick !== 'undefined') ? gs.tick : '—';
      const tickVal = (tickRaw === '—') ? '—' : String(tickRaw);
      const rawScore = (typeof gs.score !== 'undefined') ? gs.score : '—';
      const scoreVal = (typeof rawScore === 'number') ? rawScore.toLocaleString() : rawScore;
      const levelRaw = (typeof gs.level !== 'undefined') ? gs.level : '—';
      const levelVal = (levelRaw === '—') ? '—' : String(levelRaw);

      // Report the enemy speed as a percentage of the player's base speed.
      // Use Constants.computeEnemySpeed(level) so overlay matches runtime exactly.
      let enemySpeedPct = '—';
      let enemySpeedDisplay = '—';
      try {
        const lvlNum = Number(levelRaw);
        if (!Number.isNaN(lvlNum)) {
          const pSpeed = (typeof C.PLAYER_BASE_SPEED === 'number') ? C.PLAYER_BASE_SPEED : 0;
          // Prefer computing the speed directly from the constants service so
          // the overlay matches the runtime behaviour.  If that fails, fall
          // back to any value mirrored on the mutable game state, and finally
          // recompute locally using the known growth curve.
          let eSpeedVal;
          if (typeof C.computeEnemySpeed === 'function') {
            const computed = C.computeEnemySpeed(lvlNum);
            if (Number.isFinite(computed)) {
              eSpeedVal = computed;
            }
          }
          if (eSpeedVal == null && typeof gs.enemySpeed === 'number' && Number.isFinite(gs.enemySpeed)) {
            eSpeedVal = gs.enemySpeed;
          }
          if (eSpeedVal == null) {
            let ratio = null;
            if (typeof C.computeEnemySpeedRatio === 'function') {
              try {
                const computedRatio = C.computeEnemySpeedRatio(lvlNum);
                if (Number.isFinite(computedRatio)) {
                  ratio = computedRatio;
                }
              } catch (_) {}
            }
            if (ratio == null && Array.isArray(C.ENEMY_SPEED_RATIOS) && C.ENEMY_SPEED_RATIOS.length) {
              const table = C.ENEMY_SPEED_RATIOS;
              const idx = Math.max(0, Math.min(table.length - 1, Math.floor(lvlNum) - 1));
              const tableRatio = table[idx];
              if (Number.isFinite(tableRatio)) {
                ratio = tableRatio;
              }
            }
            if (ratio == null) {
              const startRatio = typeof C.ENEMY_SPEED_START_RATIO === 'number'
                ? C.ENEMY_SPEED_START_RATIO
                : 0.60;
              const growth = typeof C.ENEMY_SPEED_GROWTH_PER_LEVEL === 'number'
                ? C.ENEMY_SPEED_GROWTH_PER_LEVEL
                : 0.05;
              const maxRatio = typeof C.ENEMY_SPEED_MAX_RATIO === 'number'
                ? C.ENEMY_SPEED_MAX_RATIO
                : 1.0;
              const steps = Math.max(0, Math.floor(lvlNum) - 1);
              ratio = Math.min(maxRatio, startRatio + (growth * steps));
            }
            eSpeedVal = ratio * pSpeed;
          }
          const ratio = pSpeed > 0 ? (eSpeedVal / pSpeed) : 0;
          enemySpeedPct = (ratio * 100).toFixed(0) + '%';
          enemySpeedDisplay = pSpeed > 0 ? `${enemySpeedPct} (${eSpeedVal.toFixed(3)})` : enemySpeedPct;
        }
      } catch (_e) {}

      let fpsVal = '—';
      let frameMSVal = '—';
      const perf = dbg && dbg.performance;
      let catchUpBudget = '—';
      let catchUpDebt = '—';
      let catchUpDropped = '—';
      let stepTimeStr = '—';
      let drawTimeStr = '—';
      let overrunStr = '—';
      let catchUpBudgetMs = null;
      let catchUpDebtMs = null;
      let catchUpDroppedMs = null;
      let stepTimeMs = null;
      let drawTimeMs = null;
      let overrunMs = null;
      if (perf && typeof perf === 'object') {
        if (typeof perf.fpsEMA === 'number') {
          fpsVal = perf.fpsEMA.toFixed(1);
        }
        if (typeof perf.lastFrameDT === 'number') {
          frameMSVal = perf.lastFrameDT.toFixed(2);
        }
        if (typeof perf.catchUpBudget === 'number') {
          catchUpBudgetMs = perf.catchUpBudget;
          catchUpBudget = `${catchUpBudgetMs.toFixed(2)} ms`;
        }
        if (typeof perf.catchUpDebt === 'number') {
          catchUpDebtMs = perf.catchUpDebt;
          catchUpDebt = `${catchUpDebtMs.toFixed(2)} ms`;
        }
        if (typeof perf.catchUpDropped === 'number') {
          catchUpDroppedMs = perf.catchUpDropped;
          catchUpDropped = `${catchUpDroppedMs.toFixed(2)} ms`;
        }
        if (typeof perf.stepTime === 'number') {
          stepTimeMs = perf.stepTime;
          stepTimeStr = `${stepTimeMs.toFixed(2)} ms`;
        }
        if (typeof perf.drawTime === 'number') {
          drawTimeMs = perf.drawTime;
          drawTimeStr = `${drawTimeMs.toFixed(2)} ms`;
        }
        if (typeof perf.frameOverrun === 'number') {
          overrunMs = perf.frameOverrun;
          overrunStr = `${overrunMs.toFixed(2)} ms`;
        }
      }
      if ((fpsVal === '—' || frameMSVal === '—') && Array.isArray(A.dtBuf) && A.dtBuf.length) {
        const sumDt = A.dtBuf.reduce((a, b) => a + b, 0);
        const avg = sumDt / A.dtBuf.length;
        if (frameMSVal === '—') frameMSVal = avg.toFixed(2);
        if (avg > 0 && fpsVal === '—') fpsVal = (1000 / avg).toFixed(1);
      }
      const currentFrameDelta = frameMSVal === '—' ? '—' : `${frameMSVal} ms`;
      const playerPos = (typeof gp.x !== 'undefined' && typeof gp.y !== 'undefined') ? `${gp.x}, ${gp.y}` : '—';
      const enemyPos = (typeof ge.x !== 'undefined' && typeof ge.y !== 'undefined') ? `${ge.x}, ${ge.y}` : '—';
      const playerDir = (typeof gp.dir !== 'undefined') ? gp.dir : '—';
      const enemyDir = (typeof ge.dir !== 'undefined') ? ge.dir : '—';

      const dtBuf = Array.isArray(A.dtBuf) ? A.dtBuf.slice() : [];
      let dtAvg = 0,
        dtP95 = 0,
        dtMin = 0,
        dtMax = 0,
        dtStdDev = 0;
      let dtAvgStr = '—';
      let dtP95Str = '—';
      let dtMinStr = '—';
      let dtMaxStr = '—';
      let dtStdDevStr = '—';
      if (dtBuf.length) {
        const sum = dtBuf.reduce((a, b) => a + b, 0);
        dtAvg = sum / dtBuf.length;
        const sorted = dtBuf.slice().sort((a, b) => a - b);
        const idx = Math.floor(0.95 * (sorted.length - 1));
        dtP95 = sorted[idx];
        dtMin = sorted[0];
        dtMax = sorted[sorted.length - 1];
        const variance = dtBuf.reduce((acc, sample) => acc + ((sample - dtAvg) ** 2), 0) / dtBuf.length;
        dtStdDev = Math.sqrt(variance);
        dtAvgStr = `${dtAvg.toFixed(2)} ms`;
        dtP95Str = `${dtP95.toFixed(2)} ms`;
        dtMinStr = `${dtMin.toFixed(2)} ms`;
        dtMaxStr = `${dtMax.toFixed(2)} ms`;
        dtStdDevStr = `${dtStdDev.toFixed(2)} ms`;
      }
      const jitter = (typeof A.dtJitterEMA === 'number' ? A.dtJitterEMA : 0);
      const jitterStr = `${jitter.toFixed(2)} ms`;
      const dtMisses = (typeof A.dtMisses === 'number' ? A.dtMisses : 0);
      const aiTimes = Array.isArray(A.aiTimes) ? A.aiTimes.slice() : [];
      let aiAvg = 0,
        aiP95 = 0;
      if (aiTimes.length) {
        const aiSum = aiTimes.reduce((a, b) => a + b, 0);
        aiAvg = aiSum / aiTimes.length;
        const aiSorted = aiTimes.slice().sort((a, b) => a - b);
        const aiIdx = Math.floor(0.95 * (aiSorted.length - 1));
        aiP95 = aiSorted[aiIdx];
      }
      const aiAvgStr = `${aiAvg.toFixed(2)} ms`;
      const aiP95Str = `${aiP95.toFixed(2)} ms`;
      const aiSpikes = (typeof A.aiSpikes === 'number' ? A.aiSpikes : 0);
      const cand = Array.isArray(ai.cand) ? ai.cand.slice() : [];
      try {
        cand.sort((a, b) => ((b.score || -1e9) - (a.score || -1e9)));
      } catch (_) {}
      const top = cand.slice(0, 5);
      const best = (top.length ? top[0] : null);
      const del12 = (top.length > 1 && top[0].score != null && top[1].score != null) ? (top[0].score - top[1].score) : null;
      const fmt = (v) => {
        if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '—';
        return (typeof v === 'number' ? v.toFixed(2) : String(v));
      };

      let memUsed = '—',
        memTotal = '—',
        memLimit = '—',
        canvasMB = '—';
      try {
        if (typeof performance !== 'undefined' && performance.memory) {
          const pm = performance.memory;
          if (pm.usedJSHeapSize != null) memUsed = (pm.usedJSHeapSize / 1048576).toFixed(2);
          if (pm.totalJSHeapSize != null) memTotal = (pm.totalJSHeapSize / 1048576).toFixed(2);
          if (pm.jsHeapSizeLimit != null) memLimit = (pm.jsHeapSizeLimit / 1048576).toFixed(2);
        }
        const dMem = getDom();
        const mem = __getMemStats((dMem && dMem.board) || undefined);
        if (mem && typeof mem.canvasBytes === 'number') {
          canvasMB = (mem.canvasBytes / 1048576).toFixed(2);
        }
        if ((memUsed === '—' || memTotal === '—' || memLimit === '—') && mem && mem.heap) {
          if (memUsed === '—') memUsed = (Number(mem.heap.used) / 1048576).toFixed(2);
          if (memTotal === '—') memTotal = (Number(mem.heap.total) / 1048576).toFixed(2);
          if (memLimit === '—') memLimit = (Number(mem.heap.limit) / 1048576).toFixed(2);
        }
      } catch (_) {}

      const escapeAttr = (value) => {
        if (value == null) return '';
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      };

      const tooltipAttrs = (baseClass, tooltip) => {
        const classList = [];
        if (baseClass) {
          const parts = String(baseClass).split(' ');
          for (let i = 0; i < parts.length; i += 1) {
            if (parts[i]) classList.push(parts[i]);
          }
        }
        if (tooltip) classList.push('debug-tooltip');
        const classAttr = classList.length ? ` class="${classList.join(' ')}"` : '';
        const dataAttr = tooltip ? ` data-tooltip="${escapeAttr(tooltip)}"` : '';
        const tabAttr = tooltip ? ' tabindex="0"' : '';
        return `${classAttr}${dataAttr}${tabAttr}`;
      };

      const formatMB = (value) => (value === '—' ? '—' : `${value} MB`);

      const renderGridRows = (sectionKey, rows) => rows.map((row, index) => {
        if (!row) return '';
        const labelField = row.key ? ` data-field="${sectionKey}-${row.key}-label"` : '';
        const valueField = row.key ? ` data-field="${sectionKey}-${row.key}-value"` : '';
        const labelHTML = `<div${tooltipAttrs('debug-grid-cell debug-grid-cell--label', row.tooltip)}${labelField}>${row.label}</div>`;
        const valueHTML = `<div class="debug-grid-cell debug-grid-cell--value"${valueField}>${row.value}</div>`;
        return `<div class="debug-grid-row">${labelHTML}${valueHTML}</div>`;
      }).join('');

      const summaryStats = [{
        key: 'score',
        label: 'Score',
        value: scoreVal,
        tooltip: 'Total points accumulated during the current run.'
      }, {
        key: 'level',
        label: 'Level',
        value: levelVal,
        tooltip: 'Active arena difficulty tier for the session.'
      }, {
        key: 'tick',
        label: 'Tick',
        value: tickVal,
        tooltip: 'Simulation tick count since the current run began.'
      }, {
        key: 'fps-ema',
        label: 'Frames Per Second (Exponential Moving Average)',
        value: fpsVal,
        tooltip: 'Smoothed frames-per-second measurement derived from the frame-time EMA buffer.'
      }, {
        key: 'frame-delta-current',
        label: 'Frame Delta (Current Frame)',
        value: currentFrameDelta,
        tooltip: 'Duration of the most recent rendered frame in milliseconds.'
      }, {
        key: 'enemy-speed',
        label: 'Enemy Speed',
        // Show both the percentage and the computed absolute speed value.
        value: enemySpeedDisplay,
        tooltip: 'Enemy maximum speed expressed as a percentage of the base player speed.'
      }];
      const summaryHTML = `<div class="debug-summary">${summaryStats.map((stat) => {
        const valueField = stat.key ? ` data-field="summary-${stat.key}-value"` : '';
        return `<div${tooltipAttrs('debug-stat', stat.tooltip)}><span class="debug-stat-label">${stat.label}</span><span class="debug-stat-value"${valueField}>${stat.value}</span></div>`;
      }).join('')}</div>`;

      const cycleRows = [{
        key: 'player-position',
        label: 'Player Position',
        value: playerPos,
        tooltip: 'Grid coordinates of the player at the start of this simulation cycle (x, y).'
      }, {
        key: 'player-direction',
        label: 'Player Direction',
        value: playerDir,
        tooltip: 'Current heading for the player, using cardinal direction notation.'
      }, {
        key: 'enemy-position',
        label: 'Enemy Position',
        value: enemyPos,
        tooltip: 'Grid coordinates of the pursuing enemy during the same frame.'
      }, {
        key: 'enemy-direction',
        label: 'Enemy Direction',
        value: enemyDir,
        tooltip: 'Heading selected by the enemy for the next move.'
      }];
      const cycleHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Live snapshot of spatial state for the current simulation cycle.')}>Cycle Telemetry</h3><div class="debug-grid">${renderGridRows('cycle', cycleRows)}</div></section>`;

      const loopProcessingMs = (stepTimeMs == null && drawTimeMs == null)
        ? null
        : ((stepTimeMs || 0) + (drawTimeMs || 0));
      const loopProcessingStr = loopProcessingMs == null ? '—' : `${loopProcessingMs.toFixed(2)} ms`;
      const simUtilStr = (catchUpBudgetMs && catchUpBudgetMs > 0 && stepTimeMs != null)
        ? `${((stepTimeMs / catchUpBudgetMs) * 100).toFixed(1)} %`
        : '—';
      const renderShareStr = (loopProcessingMs && loopProcessingMs > 0 && drawTimeMs != null)
        ? `${((drawTimeMs / loopProcessingMs) * 100).toFixed(1)} %`
        : '—';
      const backlogProcessed =
        (catchUpBudgetMs == null ? 0 : catchUpBudgetMs) + (catchUpDebtMs == null ? 0 : catchUpDebtMs);
      const backlogRatioStr = (backlogProcessed > 0 && catchUpDebtMs != null)
        ? `${((catchUpDebtMs / backlogProcessed) * 100).toFixed(1)} %`
        : '—';

      const perfRows = [{
        key: 'fps-ema',
        label: 'Frames Per Second (Exponential Moving Average)',
        value: fpsVal,
        tooltip: 'EMA of the instantaneous frame rate. Values below target can indicate GPU or CPU bottlenecks.'
      }, {
        key: 'frame-delta-current',
        label: 'Frame Delta (Current Frame)',
        value: currentFrameDelta,
        tooltip: 'Duration of the latest frame render. Spikes point to momentary stalls.'
      }, {
        key: 'frame-delta-avg',
        label: 'Frame Delta (Average)',
        value: dtAvgStr,
        tooltip: 'Average frame time across the rolling window captured by the debugger.'
      }, {
        key: 'frame-delta-p95',
        label: 'Frame Delta (95th Percentile)',
        value: dtP95Str,
        tooltip: 'Worst-case frame duration for 95% of samples, revealing tail latency.'
      }, {
        key: 'frame-delta-min',
        label: 'Frame Delta (Minimum)',
        value: dtMinStr,
        tooltip: 'Shortest frame observed within the rolling window, establishing the lower bound for render time.'
      }, {
        key: 'frame-delta-max',
        label: 'Frame Delta (Maximum)',
        value: dtMaxStr,
        tooltip: 'Longest frame recorded in the rolling buffer, highlighting the worst spikes the player experiences.'
      }, {
        key: 'frame-delta-stddev',
        label: 'Frame Delta (Standard Deviation)',
        value: dtStdDevStr,
        tooltip: 'Dispersion of frame timings across the sample window. Higher spread implies inconsistent pacing.'
      }, {
        key: 'missed-frames',
        label: 'Missed Frames',
        value: dtMisses,
        tooltip: 'Count of frames that exceeded the 33 ms budget within the recent sample window.'
      }, {
        key: 'jitter-ema',
        label: 'Jitter (Exponential Moving Average)',
        value: jitterStr,
        tooltip: 'Smoothed estimate of frame-to-frame timing variance.'
      }, {
        key: 'catch-up-budget',
        label: 'Runtime Tick Budget Applied',
        value: catchUpBudget,
        tooltip: 'Amount of accumulated frame time the engine advanced during this RAF turn. Values near the reference tick keep pacing smooth.'
      }, {
        key: 'catch-up-debt',
        label: 'Backlog Debt After Step',
        value: catchUpDebt,
        tooltip: 'Unprocessed accumulated frame time still waiting to be simulated after this RAF turn.'
      }, {
        key: 'catch-up-dropped',
        label: 'Dropped Backlog',
        value: catchUpDropped,
        tooltip: 'Frame time discarded because the backlog exceeded the safety cap. Persistent drops may indicate chronic slow frames.'
      }, {
        key: 'catch-up-backlog-ratio',
        label: 'Backlog Ratio',
        value: backlogRatioStr,
        tooltip: 'Debt divided by the sum of debt and processed time for this RAF turn. Values near 0% signal that the loop is keeping pace.'
      }, {
        key: 'step-time',
        label: 'Tick Execution Time',
        value: stepTimeStr,
        tooltip: 'Wall-clock time spent executing the simulation tick during the latest frame.'
      }, {
        key: 'draw-time',
        label: 'Draw Execution Time',
        value: drawTimeStr,
        tooltip: 'Wall-clock time the renderer used to paint the frame during the latest RAF turn.'
      }, {
        key: 'loop-processing',
        label: 'Loop Processing Time',
        value: loopProcessingStr,
        tooltip: 'Combined wall-clock time spent in simulation and rendering for the most recent RAF callback.'
      }, {
        key: 'simulation-utilization',
        label: 'Simulation Utilization',
        value: simUtilStr,
        tooltip: 'Simulation CPU time relative to the catch-up budget advanced this frame. Helps diagnose logic-side saturation.'
      }, {
        key: 'render-share',
        label: 'Render Share of Loop',
        value: renderShareStr,
        tooltip: 'Percentage of loop processing time consumed by rendering work. Spikes can indicate GPU-bound bottlenecks.'
      }, {
        key: 'frame-overrun',
        label: 'Frame Overrun',
        value: overrunStr,
        tooltip: 'Portion of the RAF frame delta that exceeded the amount of simulation processed. Highlights delays the loop could not make up.'
      }];
      const performanceHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Frame timing metrics that highlight rendering stability and spikes.')}>Performance</h3><div class="debug-grid">${renderGridRows('performance', perfRows)}</div></section>`;

      const aiChips = [];
      if (best) {
        aiChips.push({
          key: 'best-direction',
          label: `Best Direction ${best.dir} (Score ${fmt(best.score)})`,
          tooltip: 'Movement command with the strongest blended heuristic score this frame, balancing territory, escape routes, and survivability.'
        });
      }
      if (del12 != null) {
        aiChips.push({
          key: 'score-gap',
          label: `Top Score Gap ${fmt(del12)}`,
          tooltip: 'Absolute difference between the two highest composite scores. Wide gaps signal high confidence, while narrow gaps warn that options are nearly tied.'
        });
      }
      aiChips.push({
        key: 'evaluation-spikes',
        label: `Evaluation Spikes ${aiSpikes}`,
        tooltip: 'Count of recent frames where AI evaluation time breached the configured budget, hinting at spikes in search complexity.'
      });
      const aiChipHTML = aiChips.length ? `<div class="debug-chip-row">${aiChips.map((chip) => {
        const field = chip.key ? ` data-field="ai-chip-${chip.key}"` : '';
        return `<span${tooltipAttrs('debug-chip', chip.tooltip)}${field}>${chip.label}</span>`;
      }).join('')}</div>` : '';
      const aiRows = [{
        key: 'best',
        label: 'Best Candidate',
        value: best ? `${best.dir} (Score ${fmt(best.score)})` : '—',
        tooltip: 'Direction the decision engine will execute because it maximizes the blended heuristic analysis of territory, traps, and survivability.'
      }, {
        key: 'score-gap',
        label: 'Score Gap Between Top Candidates',
        value: del12 != null ? fmt(del12) : '—',
        tooltip: 'Absolute gap between the leading and runner-up composite scores. Near-zero implies indecision, while large values confirm a clear favorite.'
      }, {
        key: 'ai-avg',
        label: 'AI Evaluation Time (Average)',
        value: aiAvgStr,
        tooltip: 'Average milliseconds spent running heuristic generation, scoring, and tie-breaking for the recent evaluation window.'
      }, {
        key: 'ai-p95',
        label: 'AI Evaluation Time (95th Percentile)',
        value: aiP95Str,
        tooltip: '95th percentile duration for the evaluation pass, exposing occasional heavy frames caused by complex board states.'
      }, {
        key: 'ai-spikes',
        label: 'AI Spikes Detected',
        value: aiSpikes,
        tooltip: 'Number of evaluations flagged for exceeding the configured processing budget during the latest rolling buffer.'
      }];
      const aiOverviewNote = '<p class="debug-card-note">The AI snapshot summarizes how the Tron-inspired decision engine evaluated movement options during the latest frame. Each metric ties spatial heuristics, safety projections, and timing budgets together so you can connect strategic choices to performance signals.</p>';
      const aiOverviewHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Rolling measurements from the Tron decision engine for the active frame.')}>AI Snapshot</h3>${aiOverviewNote}${aiChipHTML}<div class="debug-grid">${renderGridRows('ai', aiRows)}</div></section>`;

      const candidateMetrics = [{
        key: 'score',
        label: 'Composite Score',
        tooltip: 'Weighted total produced after normalizing every heuristic. Higher values mean the engine expects stronger survival odds.'
      }, {
        key: 'area',
        label: 'Reachable Area',
        tooltip: 'Count of unique tiles the player should still access after this move, projecting short- to mid-term freedom of motion.'
      }, {
        key: 'corridor',
        label: 'Corridor Width',
        tooltip: 'Width of the safest corridor that remains immediately open, showing whether the choice squeezes the bike into a tunnel.'
      }, {
        key: 'safe2',
        label: 'Two-Step Safety',
        tooltip: 'Measure of how many safe follow-up tiles remain two moves into the future, guarding against self-traps after the first step.'
      }, {
        key: 'vor',
        label: 'Voronoi Delta',
        tooltip: 'Difference between projected player and enemy territory derived from Voronoi partitioning; positive values favor the player.'
      }, {
        key: 'mm',
        label: 'Minimax Space',
        tooltip: 'Minimax-inspired estimate that compares long-term territory control after anticipating enemy responses.'
      }];
      const aiCandidatesNote = '<p class="debug-card-note">Each candidate lists the normalized heuristics feeding the composite score so you can see which tactical factors promoted or penalized a direction.</p>';
      const candidateView = top.map((c, i) => ({
        key: `candidate-${i}`,
        rank: i + 1,
        dir: c.dir || '—',
        metrics: candidateMetrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          value: fmt(c[metric.key]),
          tooltip: metric.tooltip
        }))
      }));
      const candidateListHTML = candidateView.length ? candidateView.map((candidate) => {
        return `<div class="debug-candidate">` +
          `<div class="debug-candidate-rank" data-field="${candidate.key}-rank">#${candidate.rank}</div>` +
          `<div class="debug-candidate-body">` +
          `<div${tooltipAttrs('debug-candidate-dir', 'Direction to travel if this candidate is chosen, expressed in board-relative cardinal notation.')} data-field="${candidate.key}-dir">${candidate.dir}</div>` +
          `<div class="debug-grid debug-grid--compact">${renderGridRows(candidate.key, candidate.metrics)}</div>` +
          `</div>` +
          `</div>`;
      }).join('') : `<div class="debug-empty">No AI candidates yet</div>`;
      const aiCandidatesHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Detailed heuristic breakdown for the top-ranked movement candidates.')}>AI Candidate Evaluations</h3>${aiCandidatesNote}${candidateListHTML}</section>`;

      const memRows = [{
        key: 'heap-used',
        label: 'Heap Used',
        value: formatMB(memUsed),
        tooltip: 'Estimated JavaScript heap currently allocated.'
      }, {
        key: 'heap-total',
        label: 'Heap Total',
        value: formatMB(memTotal),
        tooltip: 'Total JavaScript heap size reserved at the moment.'
      }, {
        key: 'heap-limit',
        label: 'Heap Limit',
        value: formatMB(memLimit),
        tooltip: 'Maximum JavaScript heap available in this environment.'
      }, {
        key: 'canvas-memory',
        label: 'Canvas Memory',
        value: formatMB(canvasMB),
        tooltip: 'Approximate GPU memory consumed by the active canvas.'
      }];
      const memHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Memory usage reported by the browser and debug instrumentation.')}>Memory</h3><div class="debug-grid">${renderGridRows('memory', memRows)}</div></section>`;

      const formatHudNumber = (value) => {
        if (!Number.isFinite(value)) return '—';
        const abs = Math.abs(value);
        if (abs === 0) return '0';
        if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
        if (abs >= 10) return value.toFixed(1);
        if (abs >= 1) return value.toFixed(2);
        if (abs >= 0.01) return value.toFixed(3);
        return value.toExponential(2);
      };
      const formatHudScalar = (value) => {
        if (value == null) return '—';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'number') return formatHudNumber(value);
        if (value === '') return '—';
        return String(value);
      };
      const formatHudValue = (value, preValue) => {
        const base = formatHudScalar(value);
        if (preValue === undefined) return base;
        const pre = formatHudScalar(preValue);
        if (pre === '—' || pre === base) return base;
        return `${base} (pre-pause ${pre})`;
      };

      let hudRows = [];
      let hudHTML = '';
      try {
        let hudMetrics = null;
        try {
          const hudSvc = getHudFacade();
          if (hudSvc && typeof hudSvc.getDebugMetrics === 'function') {
            hudMetrics = hudSvc.getDebugMetrics();
          } else if (!hudSvc) {
            warnOnce(HUD_DEBUG_WARN_TAG, 'HUD service unavailable for debug overlay metrics; using fallback view.');
          } else {
            warnOnce(HUD_DEBUG_WARN_TAG, 'HUD facade missing debug metrics API; using fallback view.');
          }
        } catch (_) {}
        if (hudMetrics && typeof hudMetrics === 'object') {
          if (hudMetrics && typeof hudMetrics === 'object') {
            const ticker = hudMetrics.ticker || {};
            const worker = hudMetrics.worker || {};
            const pointer = hudMetrics.pointer || {};
            const domInfo = hudMetrics.dom || {};
            const countdown = hudMetrics.countdown || {};
            const prePauseMetrics = (hudMetrics && typeof hudMetrics.prePause === 'object') ? hudMetrics.prePause : null;
            const shouldShowPre = !!prePauseMetrics;
            const buildPreSection = (name) => {
              if (!shouldShowPre) return null;
              const section = prePauseMetrics[name];
              return (section && typeof section === 'object') ? section : null;
            };
            const preSections = shouldShowPre ? {
              ticker: buildPreSection('ticker'),
              worker: buildPreSection('worker'),
              pointer: buildPreSection('pointer'),
              dom: buildPreSection('dom'),
              countdown: buildPreSection('countdown')
            } : null;
            const getPre = (section, key) => {
              if (!preSections) return undefined;
              const bucket = preSections[section];
              if (!bucket || typeof bucket !== 'object') return undefined;
              return bucket[key];
            };
            const getPreNested = (section, path) => {
              if (!preSections) return undefined;
              let current = preSections[section];
              if (!current || typeof current !== 'object') return undefined;
              for (let i = 0; i < path.length; i += 1) {
                if (!current || typeof current !== 'object') return undefined;
                current = current[path[i]];
              }
              return current;
            };
            const formatHudField = (value, section, keyOrPath) => {
              if (!section || !preSections) return formatHudValue(value);
              let preValue;
              if (Array.isArray(keyOrPath)) {
                preValue = getPreNested(section, keyOrPath);
              } else if (typeof keyOrPath === 'string') {
                preValue = getPre(section, keyOrPath);
              }
              return formatHudValue(value, preValue);
            };
            const decodeSharedFlags = (mask) => {
              const numericMask = Number.isFinite(mask) ? mask : 0;
              const labels = [];
              if (numericMask & 1) labels.push('paused');
              if (numericMask & 2) labels.push('centered');
              return labels.length ? labels.join(', ') : 'none';
            };
            const shared = worker.sharedSnapshot || {};
            const sharedFlagsMask = Number.isFinite(shared.flags) ? shared.flags : 0;
            const sharedFlagsValue = decodeSharedFlags(sharedFlagsMask);
            const preSharedFlagsMaskRaw = shouldShowPre ? getPreNested('worker', ['sharedSnapshot', 'flags']) : undefined;
            const preSharedFlagsMask = Number.isFinite(preSharedFlagsMaskRaw) ? preSharedFlagsMaskRaw : undefined;
            const preSharedFlagsValue = preSharedFlagsMask === undefined ? undefined : decodeSharedFlags(preSharedFlagsMask);
            const rows = [
              {
                key: 'ticker-mode',
                label: 'Ticker Mode',
                value: formatHudField(ticker.mode, 'ticker', 'mode'),
                tooltip: 'Active rendering strategy for the HUD ticker marquee (worker, fallback, etc.).'
              }, {
                key: 'ticker-paused',
                label: 'Ticker Paused',
                value: formatHudField(ticker.paused, 'ticker', 'paused'),
                tooltip: 'Indicates whether the marquee animation is currently paused.'
              }, {
                key: 'ticker-centered',
                label: 'Ticker Centered',
                value: formatHudField(ticker.centered, 'ticker', 'centered'),
                tooltip: 'Shows whether the ticker text is pinned instead of scrolling.'
              }, {
                key: 'ticker-width',
                label: 'Ticker Width',
                value: formatHudField(ticker.width, 'ticker', 'width'),
                tooltip: 'Pixel width reserved for the ticker HUD container after layout.'
              }, {
                key: 'ticker-height',
                label: 'Ticker Height',
                value: formatHudField(ticker.height, 'ticker', 'height'),
                tooltip: 'Pixel height reserved for the ticker HUD container after layout.'
              }, {
                key: 'ticker-info-width',
                label: 'Info Column Width',
                value: formatHudField(ticker.infoWidth, 'ticker', 'infoWidth'),
                tooltip: 'Width of the fixed score/level panel in the ticker HUD.'
              }, {
                key: 'ticker-marquee-left',
                label: 'Marquee Offset (Left)',
                value: formatHudField(ticker.marqueeLeft, 'ticker', 'marqueeLeft'),
                tooltip: 'Current left offset applied to the marquee window within the ticker canvas.'
              }, {
                key: 'ticker-marquee-width',
                label: 'Marquee Width',
                value: formatHudField(ticker.marqueeWidth, 'ticker', 'marqueeWidth'),
                tooltip: 'Width of the marquee text strip calculated during layout.'
              }, {
                key: 'ticker-marquee-gap',
                label: 'Marquee Gap',
                value: formatHudField(ticker.marqueeGap, 'ticker', 'marqueeGap'),
                tooltip: 'Spacing between repeated marquee strings as they loop across the canvas.'
              }, {
                key: 'ticker-duration',
                label: 'Ticker Duration',
                value: formatHudField(ticker.duration, 'ticker', 'duration'),
                tooltip: 'Seconds for the marquee loop to complete a full traversal.'
              }, {
                key: 'ticker-speed',
                label: 'Ticker Speed',
                value: formatHudField(ticker.speed, 'ticker', 'speed'),
                tooltip: 'Horizontal speed applied to the marquee animation (pixels per second).'
              }, {
                key: 'ticker-offset',
                label: 'Ticker Offset',
                value: formatHudField(ticker.offset, 'ticker', 'offset'),
                tooltip: 'Current animation offset driving marquee translation.'
              }, {
                key: 'ticker-dpr',
                label: 'Device Pixel Ratio',
                value: formatHudField(ticker.dpr, 'ticker', 'dpr'),
                tooltip: 'DPR used when rasterizing ticker canvas content.'
              }, {
                key: 'ticker-score-digits',
                label: 'Score Digits',
                value: formatHudField(ticker.scoreDigits, 'ticker', 'scoreDigits'),
                tooltip: 'Digits reserved for the score column when laying out ticker metrics.'
              }, {
                key: 'ticker-level-digits',
                label: 'Level Digits',
                value: formatHudField(ticker.levelDigits, 'ticker', 'levelDigits'),
                tooltip: 'Digits reserved for the level column when laying out ticker metrics.'
              }, {
                key: 'ticker-text-length',
                label: 'Ticker Text Length',
                value: formatHudField(ticker.textLength, 'ticker', 'textLength'),
                tooltip: 'Character count of the active marquee copy.'
              }, {
                key: 'ticker-powerups',
                label: 'Powerups Visible',
                value: formatHudField(ticker.powerupCount, 'ticker', 'powerupCount'),
                tooltip: 'Number of powerup entries currently rendered in the ticker.'
              }, {
                key: 'ticker-layout-key',
                label: 'Layout Cache Key',
                value: formatHudField(ticker.layoutKey, 'ticker', 'layoutKey'),
                tooltip: 'Cache identifier describing the computed ticker layout variant.'
              }, {
                key: 'ticker-layout-dirty',
                label: 'Layout Dirty',
                value: formatHudField(ticker.layoutDirty, 'ticker', 'layoutDirty'),
                tooltip: 'Signals that the ticker needs to recompute layout before the next draw.'
              }, {
                key: 'ticker-canvas-attached',
                label: 'Canvas Attached',
                value: formatHudField(ticker.canvasAttached, 'ticker', 'canvasAttached'),
                tooltip: 'Confirms the ticker canvas DOM node is currently resolved.'
              }, {
                key: 'ticker-shell-attached',
                label: 'HUD Shell Attached',
                value: formatHudField(ticker.hudAttached, 'ticker', 'hudAttached'),
                tooltip: 'Confirms the HUD shell element is available for metric updates.'
              }, {
                key: 'marquee-cache-width',
                label: 'Marquee Cache Width',
                value: formatHudField(ticker.marqueeCacheWidth, 'ticker', 'marqueeCacheWidth'),
                tooltip: 'Width of the offscreen marquee cache surface leveraged by the HUD.'
              }, {
                key: 'marquee-cache-height',
                label: 'Marquee Cache Height',
                value: formatHudField(ticker.marqueeCacheHeight, 'ticker', 'marqueeCacheHeight'),
                tooltip: 'Height of the offscreen marquee cache surface leveraged by the HUD.'
              }, {
                key: 'marquee-cache-baseline',
                label: 'Marquee Cache Baseline',
                value: formatHudField(ticker.marqueeCacheBaseline, 'ticker', 'marqueeCacheBaseline'),
                tooltip: 'Baseline position recorded for cached marquee glyphs.'
              }, {
                key: 'worker-active',
                label: 'Ticker Worker Active',
                value: formatHudField(worker.hasWorker, 'worker', 'hasWorker'),
                tooltip: 'Whether a dedicated worker is attached to render ticker frames.'
              }, {
                key: 'worker-ready',
                label: 'Ticker Worker Ready',
                value: formatHudField(worker.ready, 'worker', 'ready'),
                tooltip: 'True when the worker handshake completed and commands are accepted.'
              }, {
                key: 'worker-queue-size',
                label: 'Worker Queue Size',
                value: formatHudField(worker.queueSize, 'worker', 'queueSize'),
                tooltip: 'Count of pending messages waiting to flush to the ticker worker.'
              }, {
                key: 'worker-animation-id',
                label: 'Animation Frame Id',
                value: formatHudField(worker.animationId, 'worker', 'animationId'),
                tooltip: 'Identifier from the active animation frame driving ticker updates.'
              }, {
                key: 'worker-needs-layout',
                label: 'Layout Pending',
                value: formatHudField(worker.needsLayout, 'worker', 'needsLayout'),
                tooltip: 'Indicates whether the ticker still has layout work queued.'
              }, {
                key: 'worker-needs-redraw',
                label: 'Redraw Pending',
                value: formatHudField(worker.needsRedraw, 'worker', 'needsRedraw'),
                tooltip: 'Indicates whether the ticker canvas is waiting on a redraw cycle.'
              }, {
                key: 'worker-fallback',
                label: 'Fallback Rendering',
                value: formatHudField(worker.fallbackMode, 'worker', 'fallbackMode'),
                tooltip: 'True when the ticker is operating in the main-thread fallback renderer.'
              }, {
                key: 'worker-shared-buffer',
                label: 'Shared Metrics Buffer',
                value: formatHudField(worker.sharedBuffer, 'worker', 'sharedBuffer'),
                tooltip: 'Confirms the SharedArrayBuffer used to broadcast HUD metrics is active.'
              }, {
                key: 'shared-score',
                label: 'Shared Score Snapshot',
                value: formatHudField(shared.score, 'worker', ['sharedSnapshot', 'score']),
                tooltip: 'Score mirrored into the shared metrics buffer for cross-thread consumers.'
              }, {
                key: 'shared-level',
                label: 'Shared Level Snapshot',
                value: formatHudField(shared.level, 'worker', ['sharedSnapshot', 'level']),
                tooltip: 'Level mirrored into the shared metrics buffer for cross-thread consumers.'
              }, {
                key: 'shared-duration',
                label: 'Shared Duration Snapshot',
                value: formatHudField(shared.duration, 'worker', ['sharedSnapshot', 'duration']),
                tooltip: 'Ticker cycle duration persisted in the shared metrics buffer.'
              }, {
                key: 'shared-flags-mask',
                label: 'Shared Flags Mask',
                value: formatHudField(sharedFlagsMask, 'worker', ['sharedSnapshot', 'flags']),
                tooltip: 'Raw flag bitmask exported with shared HUD metrics (paused, centered, etc.).'
              }, {
                key: 'shared-flags-labels',
                label: 'Shared Flags Decoded',
                value: formatHudValue(sharedFlagsValue, preSharedFlagsValue),
                tooltip: 'Human readable interpretation of the shared HUD flag mask.'
              }, {
                key: 'dom-overlay',
                label: 'Overlay DOM Attached',
                value: formatHudField(domInfo.overlay, 'dom', 'overlay'),
                tooltip: 'Whether the HUD resolved the overlay container node.'
              }, {
                key: 'dom-panel',
                label: 'Panel DOM Attached',
                value: formatHudField(domInfo.panel, 'dom', 'panel'),
                tooltip: 'Whether the HUD resolved the main panel node.'
              }, {
                key: 'dom-ticker',
                label: 'Ticker DOM Attached',
                value: formatHudField(domInfo.ticker, 'dom', 'ticker'),
                tooltip: 'Whether the ticker root element is currently resolved.'
              }, {
                key: 'dom-score',
                label: 'Score Node Attached',
                value: formatHudField(domInfo.scoreEl, 'dom', 'scoreEl'),
                tooltip: 'Whether the ticker score node is currently resolved.'
              }, {
                key: 'dom-level',
                label: 'Level Node Attached',
                value: formatHudField(domInfo.levelEl, 'dom', 'levelEl'),
                tooltip: 'Whether the ticker level node is currently resolved.'
              }, {
                key: 'dom-powerups',
                label: 'Powerups List Attached',
                value: formatHudField(domInfo.powerupsList, 'dom', 'powerupsList'),
                tooltip: 'Whether the ticker powerups list node is currently resolved.'
              }, {
                key: 'dom-canvas',
                label: 'Canvas Node Attached',
                value: formatHudField(domInfo.tickerCanvas, 'dom', 'tickerCanvas'),
                tooltip: 'Whether the ticker canvas node is currently resolved.'
              }, {
                key: 'dom-text',
                label: 'Text Node Attached',
                value: formatHudField(domInfo.tickerText, 'dom', 'tickerText'),
                tooltip: 'Whether the ticker text node is currently resolved.'
              }, {
                key: 'pointer-worker',
                label: 'Pointer Worker Active',
                value: formatHudField(pointer.hasWorker, 'pointer', 'hasWorker'),
                tooltip: 'Indicates a pointer telemetry worker is connected to the HUD.'
              }, {
                key: 'pointer-ready',
                label: 'Pointer Worker Ready',
                value: formatHudField(pointer.ready, 'pointer', 'ready'),
                tooltip: 'True when the pointer worker completed initialization.'
              }, {
                key: 'pointer-listeners',
                label: 'Pointer Listeners Attached',
                value: formatHudField(pointer.listenersAttached, 'pointer', 'listenersAttached'),
                tooltip: 'Shows whether pointer event listeners are currently registered.'
              }, {
                key: 'pointer-shared-buffer',
                label: 'Pointer Shared Buffer',
                value: formatHudField(pointer.sharedBuffer, 'pointer', 'sharedBuffer'),
                tooltip: 'Confirms the pointer telemetry SharedArrayBuffer is active.'
              }, {
                key: 'pointer-shared-flags',
                label: 'Pointer Shared Flags',
                value: formatHudField(pointer.sharedFlags, 'pointer', 'sharedFlags'),
                tooltip: 'Bitmask describing pointer shared state (listeners, worker ready, poke needed, etc.).'
              }, {
                key: 'pointer-shared-version',
                label: 'Pointer Shared Version',
                value: formatHudField(pointer.sharedVersion, 'pointer', 'sharedVersion'),
                tooltip: 'Monotonic counter incremented whenever a pointer snapshot is published to the ring buffer.'
              }, {
                key: 'pointer-shared-ready',
                label: 'Pointer Ready Slot',
                value: formatHudField(pointer.sharedReadyIndex, 'pointer', 'sharedReadyIndex'),
                tooltip: 'Index of the most recent pointer snapshot committed to the shared telemetry ring.'
              }, {
                key: 'pointer-shared-capacity',
                label: 'Pointer Ring Capacity',
                value: formatHudField(pointer.sharedCapacity, 'pointer', 'sharedCapacity'),
                tooltip: 'Configured capacity of the SharedArrayBuffer-backed pointer telemetry ring.'
              }, {
                key: 'pointer-last-type',
                label: 'Pointer Last Type',
                value: formatHudField(pointer.lastTypeLabel, 'pointer', 'lastTypeLabel'),
                tooltip: 'Most recent pointer modality observed by the HUD ticker.'
              }, {
                key: 'pointer-last-buttons',
                label: 'Pointer Buttons Mask',
                value: formatHudField(pointer.lastButtons, 'pointer', 'lastButtons'),
                tooltip: 'Button bitmask from the last pointer snapshot published to the worker.'
              }, {
                key: 'pointer-last-x',
                label: 'Pointer X',
                value: formatHudField(pointer.lastX, 'pointer', 'lastX'),
                tooltip: 'X coordinate from the last pointer snapshot published to the worker.'
              }, {
                key: 'pointer-last-y',
                label: 'Pointer Y',
                value: formatHudField(pointer.lastY, 'pointer', 'lastY'),
                tooltip: 'Y coordinate from the last pointer snapshot published to the worker.'
              }, {
                key: 'pointer-move-x',
                label: 'Pointer Movement X',
                value: formatHudField(pointer.lastMovementX, 'pointer', 'lastMovementX'),
                tooltip: 'Horizontal movement delta forwarded to the pointer worker.'
              }, {
                key: 'pointer-move-y',
                label: 'Pointer Movement Y',
                value: formatHudField(pointer.lastMovementY, 'pointer', 'lastMovementY'),
                tooltip: 'Vertical movement delta forwarded to the pointer worker.'
              }, {
                key: 'pointer-event-flags',
                label: 'Pointer Event Flags',
                value: formatHudField(pointer.lastEventFlags, 'pointer', 'lastEventFlags'),
                tooltip: 'Flags recorded for the last pointer snapshot (forced updates, etc.).'
              }, {
                key: 'pointer-speed-instant',
                label: 'Pointer Instant Velocity',
                value: formatHudField(pointer.lastInstantSpeed, 'pointer', 'lastInstantSpeed'),
                tooltip: 'Instantaneous pointer velocity in px/ms derived from the latest event.'
              }, {
                key: 'pointer-speed-smooth',
                label: 'Pointer Smoothed Velocity',
                value: formatHudField(pointer.lastSmoothSpeed, 'pointer', 'lastSmoothSpeed'),
                tooltip: 'Smoothed pointer velocity estimate maintained for worker-side heuristics.'
              }, {
                key: 'pointer-timestamp',
                label: 'Pointer Timestamp',
                value: formatHudField(pointer.lastTimestamp, 'pointer', 'lastTimestamp'),
                tooltip: 'Timestamp of the last pointer snapshot forwarded to the worker.'
              }, {
                key: 'pointer-needs-poke',
                label: 'Pointer Needs Poke',
                value: formatHudField(pointer.needsWorkerPoke, 'pointer', 'needsWorkerPoke'),
                tooltip: 'Indicates the pointer worker should be pinged due to inactivity.'
              }, {
                key: 'countdown-active',
                label: 'Countdown Active',
                value: formatHudField(countdown.timerActive, 'countdown', 'timerActive'),
                tooltip: 'Shows whether the HUD countdown overlay currently has a timer running.'
              }, {
                key: 'countdown-handlers',
                label: 'Countdown Handler Count',
                value: formatHudField(countdown.handlerCount, 'countdown', 'handlerCount'),
                tooltip: 'Number of callbacks subscribed to countdown completion events.'
              }, {
                key: 'countdown-reset-guard',
                label: 'Countdown Reset Guard',
                value: formatHudField(countdown.resetGuard, 'countdown', 'resetGuard'),
                tooltip: 'Signals that a countdown reset guard is active to prevent overlap.'
              }
            ];
            hudRows = rows;
            hudHTML = rows.length ? `<section class="debug-card"><h3${tooltipAttrs('', 'Runtime instrumentation from the HUD ticker and input workers.')}>HUD Metrics</h3><div class="debug-grid">${renderGridRows('hud', rows)}</div></section>` : '';
          }
        }
      } catch (_) {}

      let crashHTML = '';
      let crashRows = [];
      try {
        const cs = A.crashStats || {};
        const tot = cs.total || 0;
        const p = cs.player || 0;
        const e = cs.enemy || 0;
        const t = cs.tie || 0;
        const lastC = Array.isArray(cs.last) ? cs.last.slice(0, 5) : [];
        const crashListHTML = lastC.length ? `<ul class="debug-list">${lastC.map((c) => {
          const tick = (c && typeof c.tick !== 'undefined') ? c.tick : '—';
          const px = (c && typeof c.px !== 'undefined') ? c.px : '—';
          const py = (c && typeof c.py !== 'undefined') ? c.py : '—';
          const ex = (c && typeof c.ex !== 'undefined') ? c.ex : '—';
          const ey = (c && typeof c.ey !== 'undefined') ? c.ey : '—';
          return `<li>Tick ${tick}: Player (${px}, ${py}) • Enemy (${ex}, ${ey})</li>`;
        }).join('')}</ul>` : `<div class="debug-empty">No recorded crashes</div>`;
        crashRows = [{
          key: 'total',
          label: 'Total Crashes',
          value: tot,
          tooltip: 'Cumulative number of collisions detected during the run.'
        }, {
          key: 'outcome-split',
          label: 'Outcome Split (Player / Enemy / Tie)',
          value: `${p} / ${e} / ${t}`,
          tooltip: 'Breakdown of who triggered each recorded collision.'
        }];
        const crashNote = '<p class="debug-card-note">Crash telemetry helps relate defeat patterns to AI choices and movement history.</p>';
        crashHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Historical collision data between the player and enemy.')}>Crash Log</h3>` +
          `${crashNote}` +
          `<div class="debug-grid">${renderGridRows('crash', crashRows)}</div>` +
          `<div class="debug-section">` +
          `<div class="debug-section-title">Recent</div>` +
          `${crashListHTML}` +
          `</div>` +
          `</section>`;
      } catch (_) {
        crashHTML = `<section class="debug-card"><h3${tooltipAttrs('', 'Historical collision data between the player and enemy.')}>Crash Log</h3><div class="debug-empty">No crash data</div></section>`;
      }

      const running = !!gs.running;
      const gameEnded = !!gs.gameEnded;
      const statusLabel = gameEnded ? 'Game Over' : (didPauseForDebug ? 'Debug Pause' : (running ? 'Running' : 'Paused'));
      const statusLive = (!gameEnded && (running || didPauseForDebug));
      const statusClass = statusLive ? ' debug-chip--live' : '';

      const viewModel = {
        status: { label: statusLabel, live: statusLive },
        summaryStats,
        cycleRows,
        performanceRows: perfRows,
        hudRows,
        aiRows,
        memRows,
        crashRows,
        aiChips,
        candidates: candidateView,
      };

      const rowGroups = [{
        key: 'core-systems',
        label: 'Core Systems',
        cards: [cycleHTML, performanceHTML, hudHTML, memHTML],
      }, {
        key: 'ai-diagnostics',
        label: 'AI Diagnostics',
        cards: [aiOverviewHTML, aiCandidatesHTML],
      }, {
        key: 'event-history',
        label: 'Event History',
        cards: [crashHTML],
      }];

      const rowsHTML = `<div class="debug-rows">${rowGroups.map((group) => {
        const cardsHTML = group.cards.filter(Boolean).join('');
        if (!cardsHTML) return '';
        return `<div class="debug-row" data-group="${group.key}">` +
          `<div class="debug-row-header"><h2 class="debug-row-title">${group.label}</h2></div>` +
          `<div class="debug-row-cards">${cardsHTML}</div>` +
          `</div>`;
      }).join('')}</div>`;

      const prevShell = debugPanel.querySelector('.debug-overlay-shell');
      const prevScrollTop = prevShell ? prevShell.scrollTop : (debugPanel.scrollTop || 0);
      const prevScrollLeft = prevShell ? prevShell.scrollLeft : (debugPanel.scrollLeft || 0);

      const overlayContent = `<header class="debug-header">` +
        `<div>` +
        `<div class="debug-title">Neon Debug Console</div>` +
        `<div class="debug-subtitle">Realtime diagnostics • Press Esc to close</div>` +
        `</div>` +
        `<div class="debug-header-actions">` +
        `<span class="debug-chip${statusClass}" data-field="status-label">${statusLabel}</span>` +
        `</div>` +
        `</header>` +
        `${summaryHTML}` +
        `${rowsHTML}`;

      let shell = prevShell;
      if (!shell) {
        debugPanel.innerHTML = '<div class="debug-overlay-shell"><div class="debug-overlay-content"></div></div>';
        shell = debugPanel.querySelector('.debug-overlay-shell');
      }

      if (shell && !shell.querySelector('.debug-overlay-content')) {
        shell.innerHTML = '<div class="debug-overlay-content"></div>';
      }

      const contentNode = shell ? shell.querySelector('.debug-overlay-content') : null;
      attachOverlayGuards(shell);

      if (contentNode && isOverlayInteracting()) {
        applyViewModelUpdates(contentNode, viewModel);
        return;
      }
      if (contentNode) {
        contentNode.innerHTML = overlayContent;
      } else if (shell) {
        shell.innerHTML = overlayContent;
      } else {
        debugPanel.innerHTML = overlayContent;
      }

      if (shell) {
        shell.scrollTop = prevScrollTop;
        shell.scrollLeft = prevScrollLeft;
      } else {
        debugPanel.scrollTop = prevScrollTop;
        debugPanel.scrollLeft = prevScrollLeft;
      }
    } catch (err) {
      debugPanel.innerHTML = '<div style="padding:6px; opacity:.8;">Debug unavailable</div>';
    }
  }

  function hidePanel() {
    try {
      debugPanel.style.display = 'none';
    } catch (_e) {}
    debugOn = false;
    debugState.debugOn = debugOn;
    pointerInsideOverlay = false;
    overlayHasFocus = false;
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
    if (__escOff) {
      try {
        document.removeEventListener('keydown', __escOff);
      } catch {}
      __escOff = null;
    }
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    const shouldResume = didPauseForDebug;
    didPauseForDebug = false;
    if (shouldResume && typeof startGame === 'function') {
      const gs = getLiveGameState();
      if (!(gs && gs.gameEnded)) {
        resumeTimer = setTimeout(() => {
          resumeTimer = null;
          try {
            startGame();
          } catch (_) {}
        }, 1000);
      }
    }
  }

  function showPanel() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    try {
      debugPanel.style.display = 'flex';
    } catch (_e) {}
    debugOn = true;
    debugState.debugOn = debugOn;
    pointerInsideOverlay = false;
    overlayHasFocus = false;
    const gs = getLiveGameState();
    const shouldPause = !!(gs && gs.running && !gs.gameEnded);
    if (shouldPause && typeof pauseGame === 'function') {
      try {
        pauseGame();
        didPauseForDebug = true;
      } catch (_) {
        didPauseForDebug = false;
      }
    } else {
      didPauseForDebug = false;
    }
    render();
    if (!updateTimer) {
      updateTimer = setInterval(render, 250);
    }
    if (!__escOff) {
      __escOff = (e) => {
        if (e.key === 'Escape') {
          hidePanel();
        }
      };
      try {
        document.addEventListener('keydown', __escOff);
      } catch {}
    }
  }

  debugBtn.addEventListener('click', () => {
    if (debugOn) {
      hidePanel();
    } else {
      showPanel();
    }
  });
}
