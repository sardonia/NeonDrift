export type MutableRef<T = any> = {
  current: T | null;
};

export type SafeInvoker = (fn: Function, label?: string) => void;

export interface StartRoundFlowTransitions {
  toCountdown?: () => void;
}

export interface TickDependencies {
  audio?: {
    crash?: (payload?: any) => void;
    cutAll?: () => void;
    stopEngines?: () => void;
    killEngines?: () => void;
  } | null;
  draw: (args?: any) => void;
  gameOver?: (message?: string) => void;
  resetPowerUps?: (options?: { clearPickup?: boolean }) => void;
  updateScore?: (score: number) => void;
  hidePausePanel?: () => void;
  showPausePanel?: () => void;
  panel?: any;
  overlay?: any;
  proceedToNextLevel?: (options?: any) => any;
  LEVEL?: number;
  MAX_LEVEL?: number;
  COLS?: number;
  preset?: string;
  interval?: MutableRef<any> | { clear: () => void } | null;
  trailPlayer?: any;
  trailEnemy?: any;
  keysHeld?: Record<string, any>;
}

export interface RoundLevelResult {
  newLevel?: number;
  newEnemySpeed?: number;
}

export interface StartRoundFlowOptions {
  intervalRef: MutableRef<any>;
  resetLevel1?: boolean;
  playerEngineRef: MutableRef<any>;
  enemyEngineRef: MutableRef<any>;
  startGame?: () => void;
  transitions?: StartRoundFlowTransitions;
  transitionToCountdown?: () => void;
  safe?: SafeInvoker;
}

export interface ProceedToNextLevelFlowOptions {
  safe?: SafeInvoker;
}

export interface StartGameFullOptions {
  draw?: (args?: any) => void;
  gameOver?: (message?: string) => void;
  resetPowerUps?: (options?: { clearPickup?: boolean }) => void;
  updateScore?: (score: number) => void;
  hidePausePanel?: () => void;
  showPausePanel?: () => void;
  panel?: any;
  overlay?: any;
  proceedToNextLevel?: () => void;
  preset?: string;
  onFrame?: (dt: number) => void;
}

export interface StartRoundOptions {
  resetLevel1?: boolean;
  onStartGame?: () => void;
  transitions?: StartRoundFlowTransitions;
  transitionToCountdown?: () => void;
}

export interface ProceedToNextLevelOptions {
  onStartGame?: () => void;
}
