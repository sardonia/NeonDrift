import { initPowerups, P as PowerNS } from '../../powerups.js';
import { createInitPowerupsBindings } from '../controllers/powerController.js';
import { drawAccelGlyph } from '../../render/fx.js';
import { drawHaloRing } from '../../render/neon.js';
import { cellCenter } from '../../utils.js';
import { updatePowerUpsUI } from '../../ui/powerupsUI.js';
import { RIBBON_CORE, RIBBON_GLOW } from '../../Constants.js';

export function createPowerupsStage({ readCssVariable } = {}) {
  return {
    name: 'powerups',
    execute(acc = {}, tools = {}) {
      const { services = {}, shared = {}, context, state } = acc;
      const report = typeof tools.report === 'function' ? tools.report : () => {};
      const render = (context && context.render) || shared.render || {};
      const dom = services.dom || {};
      const board = render.board || dom.board || null;
      const boardCtx = render.boardCtx || (board && typeof board.getContext === 'function' ? board.getContext('2d') : null);
      const constants = services.constants || {};
      const audio = services.audio || null;
      const getCss = typeof readCssVariable === 'function' ? readCssVariable : () => '';

      const usingOffscreen = !!(render && render.offscreen);

      if (!board) {
        return {};
      }

      if (!boardCtx && !usingOffscreen) {
        return {};
      }

      const accelCore = getCss('--accent2') || '#ffb36a';
      const accelGlow = accelCore;
      const CELL = constants.CELL || 1;
      const COLS = constants.COLS || 1;
      const ROWS = constants.ROWS || 1;
      const SCALE = constants.SCALE;

      const powerConsts = {
        ACCEL_CORE: accelCore,
        ACCEL_GLOW: accelGlow,
        CELL,
        COLS,
        RIBBON_CORE,
        RIBBON_GLOW,
        ROWS,
        SCALE
      };

      const safeCellCenter = (col, row) => {
        try {
          return cellCenter(col, row, CELL);
        } catch (error) {
          report(error, { scope: 'powerups.cellCenter' });
          const size = CELL || 1;
          return [col * size + size / 2, row * size + size / 2];
        }
      };

      try {
        const targetCtx = usingOffscreen ? null : boardCtx;
        const bindings = createInitPowerupsBindings({
          gameState: state,
          engineContext: context,
          ctx: targetCtx,
          cellCenter: safeCellCenter,
          drawAccelGlyph,
          drawHaloRing,
          updatePowerUpsUI,
          audio,
          consts: powerConsts
        });
        if (usingOffscreen) {
          bindings.drawPowerUp = () => {};
        }
        initPowerups(bindings);
      } catch (error) {
        report(error, { scope: 'powerups.init' });
      }

      try {
        if (PowerNS && PowerNS.consts) {
          if (PowerNS.consts.COLS == null) PowerNS.consts.COLS = COLS;
          if (PowerNS.consts.ROWS == null) PowerNS.consts.ROWS = ROWS;
        }
      } catch (error) {
        report(error, { scope: 'powerups.namespace' });
      }

      return {};
    }
  };
}
