#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..');
function list(d){const o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=path.join(d,e.name);if(e.isDirectory())o.push(...list(p));else if(/\.js$/.test(e.name))o.push(p);}return o;}
function stmtAt(t,i){let s=i;while(s>0&&t[s-1]!=='\n'&&t[s-1]!==';')s--;let e=i;while(e<t.length&&t[e]!=='\n'&&t[e]!==';')e++;return t.slice(s,e);}
const offenders=[]; for(const f of list(root)){const rel=path.relative(root,f).replace(/\\/g,'/'); if(rel.startsWith('public/')||rel.startsWith('src/scripts/'))continue; if(rel==='src/game/core/bus.js')continue; const txt=fs.readFileSync(f,'utf8'); let idx=0; while((idx=txt.indexOf('.on(',idx))!==-1){ const st=stmtAt(txt,idx); const bef=st.slice(0,st.indexOf('.on(')); const ok=(bef.includes('='))||(bef.includes('.push('))||(/\breturn\b/.test(bef)); if(!ok) offenders.push({file:rel,statement:st.trim()}); idx+=4; } }
if(offenders.length){ console.error('[lint-subs] Subscriptions must capture the off() function returned by .on(...)'); for(const {file,statement} of offenders){ console.error(' -',file,'=>',statement); } process.exit(1); }
console.log('[lint-subs] OK: all subscriptions capture off() handles.');