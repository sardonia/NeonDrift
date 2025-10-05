#!/usr/bin/env node
// Ensure FSM guardrails exist in orchestrator state machine
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const candidates = [
  path.join(root, 'src', 'game', 'orchestrator', 'stateMachine.js'),
  path.join(root, 'game', 'orchestrator', 'stateMachine.js')
];
const file = candidates.find(p => fs.existsSync(p));
if (!file) {
  console.error('[lint-fsm] ERROR: orchestrator stateMachine.js not found');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
if (!/AllowedTransitions/.test(src)) {
  console.error('[lint-fsm] ERROR: AllowedTransitions not found in stateMachine.js');
  process.exit(1);
}
if (!/_setState\s*\(/.test(src)) {
  console.error('[lint-fsm] ERROR: _setState() not found in stateMachine.js');
  process.exit(1);
}
console.log('[lint-fsm] OK: FSM guardrails present.');
