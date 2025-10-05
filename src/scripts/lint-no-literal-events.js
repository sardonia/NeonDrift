#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const allow = new Set(['src/game/core/events.js']);
const re = /(['"])(ROUND\.(START|PAUSE|RESUME|CRASHED|NEXT_LEVEL)|HUD\.[A-Z_]+|AUDIO\.[A-Z_]+)\1/g;
function list(d){const o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=path.join(d,e.name);if(e.isDirectory())o.push(...list(p));else if(/\.js$/.test(e.name))o.push(p);}return o;}
const bad=[];for(const f of list(root)){const r=path.relative(root,f).replace(/\\/g,'/');if(allow.has(r))continue;if(r.startsWith('public/')||r.startsWith('src/scripts/'))continue;const t=fs.readFileSync(f,'utf8');const m=t.match(re);if(m)bad.push({file:r,matches:Array.from(new Set(m))});}
if(bad.length){console.error('[lint-no-literal-events] Found string-literal events:');for(const {file,matches} of bad){console.error(' -',file,'=>',matches.join(', '));}process.exit(1);}console.log('[lint-no-literal-events] OK: no string-literal events.');