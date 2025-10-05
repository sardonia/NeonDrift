import { TOKENS } from '../../services/index.js';
import { getOptionalService } from './bootstrap.js';
import { runDiagnostic } from './diagnostics.js';
import { start as startLoopController, pause as pauseLoopController, resume as resumeLoopController } from '../controllers/loopController.js';
import { setEngineActive as controllerSetEngineActive } from '../../engine/gameController.js';

export function startLoop(opts) {
  const loopService = getOptionalService(TOKENS.LOOP);
  if (loopService && typeof loopService.start === 'function') {
    loopService.start(opts);
    return;
  }

  runDiagnostic('orchestrator.loop.start', () => startLoopController(opts), {
    context: { hasOptions: !!opts }
  });
}

export function pauseLoop() {
  const loopService = getOptionalService(TOKENS.LOOP);
  if (loopService && typeof loopService.pause === 'function') {
    loopService.pause();
    return;
  }

  runDiagnostic('orchestrator.loop.pause', () => pauseLoopController());
}

export function resumeLoop() {
  const loopService = getOptionalService(TOKENS.LOOP);
  if (loopService && typeof loopService.resume === 'function') {
    loopService.resume();
    return;
  }

  runDiagnostic('orchestrator.loop.resume', () => resumeLoopController());
}

export function setEngineActive(on, params) {
  runDiagnostic('orchestrator.engine.setActive', () => controllerSetEngineActive(on, params), {
    context: { active: !!on }
  });
}

export default {
  startLoop,
  pauseLoop,
  resumeLoop,
  setEngineActive
};
