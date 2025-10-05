import EventBus from './EventBus.js';
import { PayloadValidators } from './events.js';

export const bus = new EventBus({
  warnThreshold: 25,
  validators: PayloadValidators,
  diagnosticsLabel: 'eventbus'
});
export default bus;
