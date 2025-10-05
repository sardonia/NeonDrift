#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..'); const cat = path.join(root,'game','core','eventCatalog.json');
function list(d){const o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=path.join(d,e.name);if(e.isDirectory())o.push(...list(p));else if(/\.(js|ts|mjs|cjs|json|md|html)$/.test(e.name))o.push(p);}return o;}
let catalog={DeprecatedSynonyms:[]}; try{ catalog=JSON.parse(fs.readFileSync(cat,'utf8')); }catch{}
const dep=catalog.DeprecatedSynonyms||[]; let depHits=[]; let show=0; let cd=0;
for(const f of list(root)){const rel=path.relative(root,f).replace(/\\/g,'/'); if(rel.startsWith('public/')||rel.startsWith('src/scripts/'))continue; const t=fs.readFileSync(f,'utf8'); for(const s of dep) if(t.includes(s)) depHits.push({file:rel,syn:s}); if(t.includes('HudChannels.SHOW_OVERLAY')) show++; if(/['"]countdown['"]/.test(t)&&/SHOW_OVERLAY/.test(t)) cd++;}
if(depHits.length){ console.error('\n[events-lint] Deprecated event synonyms detected:'); for(const {file,syn} of depHits) console.error('  -',file+':',syn); console.error('\nERROR: Remove deprecated synonyms; use HUD.SHOW_OVERLAY with type "countdown".'); process.exit(1); }
if(show && cd && !depHits.length){ console.log('[events-lint] OK: SHOW_OVERLAY("countdown") in use; no deprecated COUNTDOWN events found.'); process.exit(0); }
console.log('[events-lint] OK: No deprecated synonyms found.');