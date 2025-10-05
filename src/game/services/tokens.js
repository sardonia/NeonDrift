const createToken = (description) => (typeof Symbol === 'function' ? Symbol(description) : Object.freeze({ description }));

export const BUS = createToken('bus');
export const AUDIO = createToken('audio');
export const CONSTANTS = createToken('constants');
export const COLLISIONS = createToken('collisions');
export const DEBUG_STATE = createToken('debugState');
export const DOM = createToken('dom');
export const HUD = createToken('hud');
export const INPUT = createToken('input');
export const LOOP = createToken('loop');
export const RNG = createToken('rng');
export const THEME = createToken('theme');
export const UI = createToken('ui');

export const TOKENS = Object.freeze({
  BUS,
  AUDIO,
  CONSTANTS,
  COLLISIONS,
  DEBUG_STATE,
  DOM,
  HUD,
  INPUT,
  LOOP,
  RNG,
  THEME,
  UI
});

export default TOKENS;
