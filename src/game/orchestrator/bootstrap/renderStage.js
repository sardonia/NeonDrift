import { drawTrailSegment, drawPulseTrailsFast, initSprites } from '../../render/sprites.js';
import { initBackground } from '../../render/background.js';
import { initWalls } from '../../render/walls.js';
import { initWallsGlow } from '../../render/wallsGlow.js';
import { initPaths } from '../../render/paths.js';
import { initGame } from '../../initGame.js';
import * as renderController from '../controllers/renderController.js';
import { createOffscreenRenderBridge } from '../controllers/mainRenderWorkerController.js';
import { initBorderElectricFX, resumeBorderElectricFX } from '../../render/borderElectricFX.js';
import { createSharedFrameState } from '../../core/sharedFrameState.js';

function defaultReadCssVariable(prop) {
  try {
    const win = typeof window !== 'undefined' ? window : undefined;
    const doc = typeof document !== 'undefined' ? document : undefined;
    if (!win || !doc || typeof win.getComputedStyle !== 'function') {
      return '';
    }
    const root = doc.documentElement;
    if (!root) {
      return '';
    }
    const value = win.getComputedStyle(root).getPropertyValue(prop);
    return typeof value === 'string' ? value.trim() : '';
  } catch (_) {
    return '';
  }
}

function getCanvasContext(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return null;
  }
  try {
    return canvas.getContext('2d');
  } catch (_) {
    return null;
  }
}

export function createRenderStage({ readCssVariable = defaultReadCssVariable } = {}) {
  return {
    name: 'render-setup',
    execute(acc, tools = {}) {
      const { services = {}, state = {}, shared = {} } = acc || {};
      const dom = services.dom || {};
      const constants = services.constants || {};
      const report = typeof tools.report === 'function' ? tools.report : () => {};
      const readCss = typeof readCssVariable === 'function' ? readCssVariable : defaultReadCssVariable;

      const trailsCanvas = dom.trails || null;
      const trailsCtx = getCanvasContext(trailsCanvas);

      const playerCore = readCss('--player-core') || '#ffffff';
      const playerGlow = readCss('--player-glow') || playerCore;
      const enemyCore = readCss('--enemy-core') || playerCore;
      const enemyGlow = readCss('--enemy-glow') || enemyCore;
      const playerCycleCore = readCss('--player-cycle-core') || playerCore;
      const playerCycleGlow = readCss('--player-cycle-glow') || playerGlow;
      const enemyCycleCore = readCss('--enemy-cycle-core') || enemyCore;
      const enemyCycleGlow = readCss('--enemy-cycle-glow') || enemyGlow;
      const accelCore = readCss('--accent2') || '#ffb36a';
      const accelGlow = accelCore;

      const render = {
        ...(shared.render || {}),
        drawTrailSegment,
        drawPulseTrailsFast,
        tctx: trailsCtx,
        colors: {
          playerCore,
          playerGlow,
          enemyCore,
          enemyGlow,
          playerCycleCore,
          playerCycleGlow,
          enemyCycleCore,
          enemyCycleGlow,
          accelCore,
          accelGlow
        }
      };

      render.sharedFrameState = null;
      render.sharedFrameBuffer = null;
      render.sharedFrameDescriptor = null;

      if (renderController && typeof renderController.initOffThreadWorkers === 'function') {
        render.wallWorker = {
          init: renderController.initOffThreadWorkers,
          buildWallFrames: renderController.buildWallFramesOffThread,
          buildSprites: renderController.buildSpritesOffThread
        };
      }

      const board = dom.board || null;
      const trails = dom.trails || null;
      const fx = dom.fx || null;
      const wallsGlow = dom.wallsGlow || null;
      const borderFx = dom.borderFx || null;
      const tickerHud = dom.tickerHUD || null;
      const tickerInfoCanvas = dom.tickerInfoCanvas || null;
      const tickerCanvas = dom.tickerCanvas || null;
      const tickerBorderFx = dom.tickerBorderFx || null;

      const boardCtx = getCanvasContext(board);
      const fxCtx = getCanvasContext(fx);

      render.board = board;
      render.boardCtx = boardCtx;
      render.trails = trails;
      render.tctx = trailsCtx || render.tctx || null;
      render.fx = fx;
      render.pctx = fxCtx;
      render.wallsGlow = wallsGlow;
      render.borderFx = borderFx;
      render.tickerBorderFx = tickerBorderFx;
      render.trailPlayer = state.trailPlayer;
      render.trailEnemy = state.trailEnemy;

      const { CELL, COLS, ROWS, MARGIN, SCALE, WALL_CORE, WALL_GLOW } = constants;


      const safe = (scope, fn) => {
        try {
          fn();
        } catch (error) {
          report(error, { scope });
        }
      };

      if (board && boardCtx) {
        safe('render.initBackground', () => initBackground(board, CELL, COLS, ROWS, MARGIN));
        safe('render.initWalls', () => initWalls(board, CELL, COLS, ROWS, WALL_CORE, WALL_GLOW));
      }
      if (wallsGlow) {
        safe('render.initWallsGlow', () => initWallsGlow(wallsGlow, CELL, COLS, ROWS, MARGIN, SCALE));
      }
      if (borderFx) {
        safe('render.initBorderFx', () => {
          let boardWidth = 0;
          if (board && typeof board.width === 'number') {
            boardWidth = board.width;
          } else if (typeof COLS === 'number' && typeof CELL === 'number') {
            boardWidth = COLS * CELL;
          } else if (typeof borderFx.width === 'number') {
            boardWidth = borderFx.width;
          }

          let boardHeight = 0;
          if (board && typeof board.height === 'number') {
            boardHeight = board.height;
          } else if (typeof ROWS === 'number' && typeof CELL === 'number') {
            boardHeight = ROWS * CELL;
          } else if (typeof borderFx.height === 'number') {
            boardHeight = borderFx.height;
          }

          initBorderElectricFX(borderFx, {
            boardWidth,
            boardHeight,
            baseColor: 'rgba(142, 78, 255, 0.55)',
            baseShadowColor: 'rgba(92, 34, 255, 0.78)',
            baseInnerColor: 'rgba(210, 170, 255, 0.68)',
            glowColor: 'rgba(176, 110, 255, 0.92)',
            glowSoftColor: 'rgba(122, 70, 255, 0.42)',
            coreMidColor: 'rgba(218, 190, 255, 0.92)',
            coreColor: 'rgba(244, 236, 255, 0.99)',
            coreGlowColor: 'rgba(196, 154, 255, 0.96)',
            headColor: 'rgba(240, 232, 255, 0.99)',
            headGlowColor: 'rgba(206, 170, 255, 0.94)',
            cornerRadius: 4,
            sparkPalettes: [
              {
                glow: 'rgba(176, 110, 255, 0.9)',
                glowSoft: 'rgba(122, 70, 255, 0.38)',
                coreMid: 'rgba(218, 190, 255, 0.9)',
                core: 'rgba(244, 236, 255, 0.99)',
                coreGlow: 'rgba(198, 152, 255, 0.95)',
                head: 'rgba(240, 232, 255, 0.99)',
                headGlow: 'rgba(204, 168, 255, 0.93)'
              },
              {
                glow: 'rgba(158, 122, 255, 0.9)',
                glowSoft: 'rgba(106, 80, 255, 0.4)',
                coreMid: 'rgba(210, 198, 255, 0.9)',
                core: 'rgba(238, 236, 255, 0.99)',
                coreGlow: 'rgba(186, 166, 255, 0.94)',
                head: 'rgba(234, 230, 255, 0.99)',
                headGlow: 'rgba(194, 176, 255, 0.92)'
              },
              {
                glow: 'rgba(182, 104, 255, 0.9)',
                glowSoft: 'rgba(138, 68, 255, 0.42)',
                coreMid: 'rgba(224, 184, 255, 0.9)',
                core: 'rgba(248, 240, 255, 0.99)',
                coreGlow: 'rgba(204, 148, 255, 0.94)',
                head: 'rgba(244, 232, 255, 0.99)',
                headGlow: 'rgba(210, 160, 255, 0.93)'
              }
            ],
            maxSparks: 18,
            spawnMin: 55,
            spawnMax: 150
          });
        });
      }
      if (tickerHud && tickerBorderFx) {
        safe('render.initTickerBorderFx', () => {
          const win = typeof window !== 'undefined' ? window : null;
          const computeDimensions = () => {
            let width = 0;
            let height = 0;
            try {
              if (tickerHud && typeof tickerHud.getBoundingClientRect === 'function') {
                const rect = tickerHud.getBoundingClientRect();
                if (rect) {
                  width = rect.width || 0;
                  height = rect.height || 0;
                }
              }
            } catch (_) {}
            if (!(width > 0) && tickerHud) {
              try { width = typeof tickerHud.offsetWidth === 'number' ? tickerHud.offsetWidth : width; } catch (_) {}
            }
            if (!(height > 0) && tickerHud) {
              try { height = typeof tickerHud.offsetHeight === 'number' ? tickerHud.offsetHeight : height; } catch (_) {}
            }
            if (!(width > 0)) {
              const infoWidth = tickerInfoCanvas && typeof tickerInfoCanvas.width === 'number'
                ? tickerInfoCanvas.width
                : 0;
              const marqueeWidth = tickerCanvas && typeof tickerCanvas.width === 'number'
                ? tickerCanvas.width
                : 0;
              const combined = infoWidth + marqueeWidth;
              if (combined > 0) {
                width = combined;
              }
            }
            if (!(height > 0)) {
              const infoHeight = tickerInfoCanvas && typeof tickerInfoCanvas.height === 'number'
                ? tickerInfoCanvas.height
                : 0;
              const marqueeHeight = tickerCanvas && typeof tickerCanvas.height === 'number'
                ? tickerCanvas.height
                : 0;
              height = Math.max(infoHeight, marqueeHeight, height);
            }
            width = Math.round(width || 0);
            height = Math.round(height || 0);
            return { width, height };
          };

          const applyTickerBorderFx = () => {
            const { width, height } = computeDimensions();
            if (!(width > 0) || !(height > 0)) {
              return false;
            }
            const marginY = Math.round(Math.max(18, Math.min(height * 0.8, 48)));
            const marginX = Math.round(Math.max(24, Math.min(width * 0.08, 58)));
            const canvasWidth = Math.max(1, width + (marginX * 2));
            const canvasHeight = Math.max(1, height + (marginY * 2));
            const cornerRadius = 4;
            const prevWidth = Number(tickerBorderFx.__neonBoardWidth) || 0;
            const prevHeight = Number(tickerBorderFx.__neonBoardHeight) || 0;
            const prevMarginX = Number(tickerBorderFx.__neonMarginX) || 0;
            const prevMarginY = Number(tickerBorderFx.__neonMarginY) || 0;
            const prevCanvasWidth = Number(tickerBorderFx.__neonCanvasWidth) || 0;
            const prevCanvasHeight = Number(tickerBorderFx.__neonCanvasHeight) || 0;
            const changed = width !== prevWidth
              || height !== prevHeight
              || marginX !== prevMarginX
              || marginY !== prevMarginY
              || canvasWidth !== prevCanvasWidth
              || canvasHeight !== prevCanvasHeight;
            tickerBorderFx.__neonBoardWidth = width;
            tickerBorderFx.__neonBoardHeight = height;
            tickerBorderFx.__neonMarginX = marginX;
            tickerBorderFx.__neonMarginY = marginY;
            tickerBorderFx.__neonCanvasWidth = canvasWidth;
            tickerBorderFx.__neonCanvasHeight = canvasHeight;
            tickerBorderFx.__neonCornerRadius = cornerRadius;
            if (!changed) {
              resumeBorderElectricFX(tickerBorderFx);
              return true;
            }
            if (tickerBorderFx.width !== canvasWidth) {
              tickerBorderFx.width = canvasWidth;
            }
            if (tickerBorderFx.height !== canvasHeight) {
              tickerBorderFx.height = canvasHeight;
            }
            const style = tickerBorderFx.style || null;
            if (style) {
              style.width = `${canvasWidth}px`;
              style.height = `${canvasHeight}px`;
            }
            initBorderElectricFX(tickerBorderFx, {
              boardWidth: width,
              boardHeight: height,
              marginX,
              marginY,
              cornerRadius,
              baseColor: 'rgba(255, 80, 224, 0.58)',
              baseShadowColor: 'rgba(210, 38, 188, 0.82)',
              baseInnerColor: 'rgba(255, 186, 246, 0.78)',
              glowColor: 'rgba(255, 122, 236, 0.95)',
              glowSoftColor: 'rgba(210, 50, 198, 0.48)',
              coreMidColor: 'rgba(255, 204, 244, 0.92)',
              coreColor: 'rgba(255, 242, 252, 0.99)',
              coreGlowColor: 'rgba(255, 178, 238, 0.96)',
              headColor: 'rgba(255, 236, 248, 0.99)',
              headGlowColor: 'rgba(255, 182, 240, 0.94)',
              sparkPalettes: [
                {
                  glow: 'rgba(255, 116, 234, 0.92)',
                  glowSoft: 'rgba(214, 46, 198, 0.42)',
                  coreMid: 'rgba(255, 200, 244, 0.92)',
                  core: 'rgba(255, 240, 250, 0.99)',
                  coreGlow: 'rgba(255, 176, 236, 0.96)',
                  head: 'rgba(255, 234, 248, 0.99)',
                  headGlow: 'rgba(255, 186, 242, 0.94)'
                },
                {
                  glow: 'rgba(255, 96, 210, 0.92)',
                  glowSoft: 'rgba(206, 40, 186, 0.4)',
                  coreMid: 'rgba(255, 190, 236, 0.92)',
                  core: 'rgba(255, 228, 246, 0.99)',
                  coreGlow: 'rgba(255, 168, 230, 0.95)',
                  head: 'rgba(255, 220, 244, 0.99)',
                  headGlow: 'rgba(255, 168, 232, 0.94)'
                },
                {
                  glow: 'rgba(255, 138, 238, 0.92)',
                  glowSoft: 'rgba(222, 72, 214, 0.44)',
                  coreMid: 'rgba(255, 212, 246, 0.92)',
                  core: 'rgba(255, 240, 252, 0.99)',
                  coreGlow: 'rgba(255, 184, 238, 0.95)',
                  head: 'rgba(255, 236, 252, 0.99)',
                  headGlow: 'rgba(255, 190, 244, 0.94)'
                }
              ],
              maxSparks: 8,
              spawnMin: 70,
              spawnMax: 150,
              minSpeed: 160,
              maxSpeed: 300,
              minLength: 40,
              maxLength: 110,
              minLife: 0.42,
              maxLife: 0.9,
              minWidth: 0.8,
              maxWidth: 1.6
            });
            return true;
          };

          const handleResize = () => {
            if (!win || typeof win.requestAnimationFrame !== 'function') {
              applyTickerBorderFx();
              return;
            }
            if (tickerBorderFx.__neonResizeFrame) {
              try { win.cancelAnimationFrame(tickerBorderFx.__neonResizeFrame); } catch (_) {}
            }
            tickerBorderFx.__neonResizeFrame = win.requestAnimationFrame(() => {
              tickerBorderFx.__neonResizeFrame = null;
              applyTickerBorderFx();
            });
          };

          applyTickerBorderFx();
          if (win && typeof win.requestAnimationFrame === 'function') {
            win.requestAnimationFrame(() => {
              applyTickerBorderFx();
            });
          }

          if (win && typeof win.addEventListener === 'function' && !tickerBorderFx.__neonResizeHandler) {
            tickerBorderFx.__neonResizeHandler = handleResize;
            win.addEventListener('resize', handleResize, { passive: true });
          }
        });
      }
      if (dom.paths) {
        safe('render.initPaths', () => initPaths(dom.paths, CELL, COLS, ROWS));
      }
      safe('render.initSprites', () => initSprites());

      if (board && boardCtx) {
        safe('render.initGame', () => initGame({
          board,
          trails,
          fx,
          wallsGlow,
          ctx: boardCtx,
          theme: services.theme
        }));
      }

      const offscreenBridge = createOffscreenRenderBridge({
        onError: (error) => {
          if (error) {
            report(error, { scope: 'render.offscreen' });
          }
        }
      });

      let sharedFrameState = null;
      try {
        if (typeof globalThis === 'object' && globalThis) {
          globalThis.__NEON_SHARED_FRAME_STATE__ = null;
        }
      } catch (_) {}
      const canTransfer = Boolean(
        offscreenBridge &&
        offscreenBridge.supported &&
        board && typeof board.transferControlToOffscreen === 'function'
      );

      if (canTransfer) {
        try {
          const boardSurface = board.transferControlToOffscreen();
          const trailsSurface = trails && typeof trails.transferControlToOffscreen === 'function'
            ? trails.transferControlToOffscreen()
            : null;
          const fxSurface = fx && typeof fx.transferControlToOffscreen === 'function'
            ? fx.transferControlToOffscreen()
            : null;
          const wallsGlowSurface = wallsGlow && typeof wallsGlow.transferControlToOffscreen === 'function'
            ? wallsGlow.transferControlToOffscreen()
            : null;

          const sharedFrameSupported = (() => {
            if (typeof SharedArrayBuffer !== 'function') return false;
            if (typeof Atomics !== 'object' || !Atomics) return false;
            try {
              if (typeof globalThis !== 'undefined') {
                return globalThis.crossOriginIsolated === true;
              }
            } catch (_) {
              return false;
            }
            return false;
          })();

          if (sharedFrameSupported) {
            try {
              sharedFrameState = createSharedFrameState({ capacity: 12 });
            } catch (_) {
              sharedFrameState = null;
            }
            if (sharedFrameState) {
              render.sharedFrameState = sharedFrameState;
              render.sharedFrameBuffer = sharedFrameState.buffer;
              render.sharedFrameDescriptor = sharedFrameState.descriptor;
              try {
                if (typeof globalThis === 'object' && globalThis) {
                  globalThis.__NEON_SHARED_FRAME_STATE__ = {
                    buffer: sharedFrameState.buffer,
                    frameBytes: sharedFrameState.frameBytes,
                    capacity: sharedFrameState.capacity
                  };
                }
              } catch (_) {}
            }
          }

          const pulseSpan = typeof render.PULSE_SPAN === 'number'
            ? render.PULSE_SPAN
            : (typeof constants.PULSE_SPAN === 'number' ? constants.PULSE_SPAN : undefined);

          const themeMap = {
            '--player-core': playerCore,
            '--player-glow': playerGlow,
            '--enemy-core': enemyCore,
            '--enemy-glow': enemyGlow,
            '--player-cycle-core': playerCycleCore,
            '--player-cycle-glow': playerCycleGlow,
            '--enemy-cycle-core': enemyCycleCore,
            '--enemy-cycle-glow': enemyCycleGlow,
            '--accent2': accelCore
          };

          offscreenBridge.init({
            canvases: {
              board: boardSurface,
              trails: trailsSurface,
              fx: fxSurface,
              wallsGlow: wallsGlowSurface
            },
            colors: {
              playerCore,
              playerGlow,
              enemyCore,
              enemyGlow,
              playerCycleCore,
              playerCycleGlow,
              enemyCycleCore,
              enemyCycleGlow
            },
            pulseSpan,
            trails: {
              player: Array.isArray(render.trailPlayer) ? render.trailPlayer : [],
              enemy: Array.isArray(render.trailEnemy) ? render.trailEnemy : []
            },
            constants: {
              CELL,
              COLS,
              ROWS,
              SCALE,
              ACCEL_CORE: accelCore,
              ACCEL_GLOW: accelGlow
            },
            theme: themeMap,
            frameStateBuffer: sharedFrameState ? sharedFrameState.buffer : null,
            frameStateDescriptor: sharedFrameState ? sharedFrameState.descriptor : null
          });

          const sanitiseActor = (actor, fallbackDir) => {
            if (!actor || typeof actor !== 'object') {
              return { x: 0, y: 0, dir: fallbackDir };
            }
            const rawX = Number(actor.x);
            const rawY = Number(actor.y);
            return {
              x: Number.isFinite(rawX) ? rawX : 0,
              y: Number.isFinite(rawY) ? rawY : 0,
              dir: typeof actor.dir === 'string' ? actor.dir : fallbackDir
            };
          };

          const snapshotState = (gameState) => {
            const timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function')
              ? performance.now()
              : Date.now();
            if (!gameState || typeof gameState !== 'object') {
              return {
                player: { x: 0, y: 0, dir: 'right' },
                enemy: { x: 0, y: 0, dir: 'left' },
                powerUp: null,
                timestamp,
                score: 0,
                level: 1,
                tick: 0,
                playerProgress: 0,
                enemyProgress: 0,
                boostActive: false,
                paused: true,
                centered: false,
                duration: 0,
                hudScorePending: 0,
                hudScoreCooldown: 0,
                hudScoreLastBroadcast: 0
              };
            }
            const result = {
              player: sanitiseActor(gameState.player, 'right'),
              enemy: sanitiseActor(gameState.enemy, 'left'),
              powerUp: null
            };
            const pu = gameState.powerUp;
            if (pu && typeof pu === 'object') {
              const px = Number(pu.x);
              const py = Number(pu.y);
              result.powerUp = {
                x: Number.isFinite(px) ? px : 0,
                y: Number.isFinite(py) ? py : 0,
                kind: typeof pu.kind === 'string' ? pu.kind : 'accel'
              };
            }
            result.timestamp = timestamp;
            const score = Number.isFinite(gameState.score) ? Number(gameState.score) : 0;
            result.score = score;
            result.level = Number.isFinite(gameState.level) ? Number(gameState.level) : 1;
            result.tick = Number.isFinite(gameState.tick) ? Number(gameState.tick) : 0;
            result.playerProgress = Number.isFinite(gameState.playerProgress) ? Number(gameState.playerProgress) : 0;
            result.enemyProgress = Number.isFinite(gameState.enemyProgress) ? Number(gameState.enemyProgress) : 0;
            result.boostActive = !!gameState.boostActive;
            result.paused = !(gameState && gameState.running);
            result.centered = false;
            const duration = Number.isFinite(gameState.duration) ? Number(gameState.duration) : 0;
            result.duration = duration > 0 ? duration : 0;
            result.hudScorePending = Number.isFinite(gameState.hudScorePending) ? Number(gameState.hudScorePending) : 0;
            result.hudScoreCooldown = Number.isFinite(gameState.hudScoreCooldown) ? Number(gameState.hudScoreCooldown) : 0;
            result.hudScoreLastBroadcast = Number.isFinite(gameState.hudScoreLastBroadcast)
              ? Number(gameState.hudScoreLastBroadcast)
              : score;
            return result;
          };

          render.offscreen = offscreenBridge;
          render.drawFrame = ({ gameState } = {}) => {
            const snapshot = snapshotState(gameState);
            let payload = null;
            if (sharedFrameState) {
              try {
                const commit = sharedFrameState.writeFrame(snapshot);
                if (commit && typeof commit.index === 'number') {
                  payload = {
                    shared: true,
                    index: commit.index,
                    version: commit.version
                  };
                }
              } catch (_) {
                payload = null;
              }
            }
            if (!payload) {
              payload = { state: snapshot };
            }
            offscreenBridge.postFrame(payload);
          };
          render.drawTrailSegment = (_ctx, x0, y0, x1, y1, core, glow, role) => {
            offscreenBridge.drawTrailSegment({
              from: [x0, y0],
              to: [x1, y1],
              core,
              glow,
              role
            });
          };
          render.syncTrails = (playerTrail, enemyTrail, options = {}) => {
            offscreenBridge.syncTrails({
              player: Array.isArray(playerTrail) ? playerTrail : [],
              enemy: Array.isArray(enemyTrail) ? enemyTrail : [],
              clear: options.clear !== false
            });
          };
        } catch (error) {
          report(error, { scope: 'render.offscreen.init' });
        }
      }

      return {
        shared: {
          ...shared,
          render,
          readCssVariable: readCss
        }
      };
    }
  };
}
