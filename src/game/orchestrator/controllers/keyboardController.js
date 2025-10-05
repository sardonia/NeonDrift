import { bindInput, unbindInput } from '../../input.js';
export function initInputController(doc, ctx) {
  const api = {
    get levelTransitionPending() { return ctx.getLevelTransitionPending ? ctx.getLevelTransitionPending() : false; },
    proceedToNextLevel: ctx.proceedToNextLevel ? ctx.proceedToNextLevel.bind(ctx) : (() => {}),
    get countdownActive() { return ctx.getCountdownActive ? ctx.getCountdownActive() : false; },
    get initialStartPending() { return ctx.getInitialStartPending ? ctx.getInitialStartPending() : false; },
    clearInitialStart: ctx.clearInitialStart ? ctx.clearInitialStart.bind(ctx) : (() => {}),
    get running() { return ctx.getRunning ? ctx.getRunning() : false; },
    get gameEnded() { return ctx.getGameEnded ? ctx.getGameEnded() : false; },
    get tick() { return ctx.getTick ? ctx.getTick() : 0; },
    startRound: ctx.startRound ? ctx.startRound.bind(ctx) : (() => {}),
    startGame: ctx.startGame ? ctx.startGame.bind(ctx) : (() => {}),
    pauseGame: ctx.pauseGame ? ctx.pauseGame.bind(ctx) : (() => {}),
    get player() { return ctx.getPlayer ? ctx.getPlayer() : null; },
    isOpposite: ctx.isOpposite ? ctx.isOpposite.bind(ctx) : (() => false),
    ensureAudioUnlocked: ctx.ensureAudioUnlocked ? ctx.ensureAudioUnlocked.bind(ctx) : (async () => {})
  };
  bindInput(doc, api);
}
export function destroyInputController(doc) {
  unbindInput(doc);
}
export default { initInputController, destroyInputController };
