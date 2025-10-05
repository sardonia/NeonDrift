#!/usr/bin/env node
// Fail on imports from core/bus.js (legacy shim). Use DI or core/bus-instance.js.
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const re = /from\s+['\"](?:\.\.\/)*core\/bus\.js['\"];?/;
function list(d){const o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=path.join(d,e.name);if(e.isDirectory())o.push(...list(p));else if(/\.js$/.test(e.name))o.push(p);}return o;}
const bad=[]; for(const f of list(root)){const rel=path.relative(root,f).replace(/\\/g,'/'); if(rel.startsWith('public/')||rel.startsWith('src/scripts/')) continue; const t=fs.readFileSync(f,'utf8'); if(re.test(t)) bad.push(rel);}
if(bad.length){ console.error('[lint-no-bus-shim] Found imports from core/bus.js (legacy):'); for(const f of bad){ console.error(' -', f); } process.exit(1); }
console.log('[lint-no-bus-shim] OK: no core/bus.js imports.');