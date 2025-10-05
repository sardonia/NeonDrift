import augState from './augState.js';
import aiDebugState from './aiDebugState.js';

const debugState = {
  debugOn: false,
  chosenOpen: true,
  performance: {
    lastFrameDT: undefined,
    fpsEMA: undefined,
    tick: undefined,
    lastSubsteps: undefined,
    catchUpBudget: 0,
    catchUpDebt: 0,
    catchUpDropped: 0,
    frameOverrun: 0,
    stepTime: 0,
    drawTime: 0
  },
  aug: augState,
  ai: aiDebugState
};
export default debugState;
