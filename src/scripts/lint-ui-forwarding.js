#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const candidates = [
  path.resolve(__dirname, '..', 'orchestrator', 'controllers', 'uiController.js'),
  path.resolve(__dirname, '..', 'game', 'orchestrator', 'controllers', 'uiController.js')
];
const uiPath = candidates.find(p => fs.existsSync(p));
if(!uiPath){ console.error('[ui-lint] ERROR: uiController.js not found'); process.exit(1); }
let src=''; try{ src=fs.readFileSync(uiPath,'utf8'); } catch{ console.error('[ui-lint] ERROR: cannot read', uiPath); process.exit(1); }
const m = src.match(/showCountdown\s*\(([^)]*)\)\s*\{[\s\S]*?\}/);
if(!m){ console.error('[ui-lint] ERROR: uiController.showCountdown method not found.'); process.exit(1); }
const sig = m[1], body = m[0];
if(!/\.\.\.\s*args/.test(sig)){ console.error('[ui-lint] ERROR: showCountdown must use rest args: (...args)'); process.exit(1); }
if(!/showCountdown\s*\(\s*\.\.\.\s*args\s*\)/.test(body)){ console.error('[ui-lint] ERROR: showCountdown must forward args: showCountdown(...args)'); process.exit(1); }
console.log('[ui-lint] OK: uiController.showCountdown forwards all args.');