#!/usr/bin/env node
// Verify that orchestrator exposes shutdown() and that it calls UI dispose + DI reset.
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const file = path.join(root, 'game', 'orchestrator.js');
if (!fs.existsSync(file)) { console.error('[lint-shutdown] ERROR: orchestrator.js not found'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');
if (!/export\s+function\s+shutdown\s*\(/.test(src)) {
  console.error('[lint-shutdown] ERROR: export function shutdown() not found in orchestrator.js');
  process.exit(1);
}
const shutdownBlock = src.split(/export\s+function\s+shutdown\s*\(/)[1] || '';
if (!/disposeHudSubscriptions\s*\(/.test(shutdownBlock)) {
  console.error('[lint-shutdown] ERROR: shutdown() must call disposeHudSubscriptions()');
  process.exit(1);
}
if (!/resetServices\s*\(/.test(shutdownBlock)) {
  console.error('[lint-shutdown] ERROR: shutdown() must call resetServices()');
  process.exit(1);
}
console.log('[lint-shutdown] OK: shutdown() disposes HUD and services.');
