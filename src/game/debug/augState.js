const augState = {
  dtBuf: [],
  lastDt: null,
  fpsEMA: 0,
  dtJitterEMA: 0,
  dtMisses: 0,
  dtMissWindow: 0,
  aiTimes: [],
  aiSpikes: 0,
  crashStats: { total: 0, tie: 0, enemy: 0, player: 0, last: [] },
  render: {
    fxArea: 0,
    blitsBuf: [],
    blitsThisTick: 0,
  },
  featureFlags: {
    offscreenCanvas: false,
    imageBitmap: false,
    worker: false,
  },
  canvasBytes: 0,
  substepsBuf: [],
  inputLatency: [],
  allFrames: 0,
  boostOnFrames: 0,
  power: {
    spawns: 0,
    pickups: 0,
    timesToPickup: [],
  },
};
export default augState;
