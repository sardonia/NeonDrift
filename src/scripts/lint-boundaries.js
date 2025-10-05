#!/usr/bin/env node
/**
 * slice 22: lint-boundaries
 * Fails if files outside src/game/** import from controllers/engine/internal.
 * Allowed: imports from src/game/index or src/game/Game.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

const CONTEXT = {
  restrictedSegments: ['controllers', 'engine', 'internal'],
  allowGameImports: [path.join('src','game','index'), path.join('src','game','Game')]
};

function isInside(p, dir) {
  const rel = path.relative(dir, p);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function listFiles(dir, exts) {
  const out = [];
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (exts.includes(path.extname(ent.name))) out.push(p);
    }
  })(dir);
  return out;
}

function hasRestrictedSegment(p) {
  const parts = p.split(path.sep);
  return parts.some(seg => CONTEXT.restrictedSegments.includes(seg));
}

function normalizeTarget(importerFile, raw) {
  if (!raw) return null;
  // Ignore packages (no '/' or starts with @scope but no local path)
  if (!raw.startsWith('.') && !raw.startsWith('/')) return null;
  const resolved = path.resolve(path.dirname(importerFile), raw);
  // Strip extension fallback
  const tryPaths = [resolved, resolved + '.js', resolved + '.ts', resolved + '.mjs', resolved + '.cjs', path.join(resolved, 'index.js'), path.join(resolved, 'index.ts')];
  for (const p of tryPaths) { if (fs.existsSync(p)) return p; }
  return resolved;
}

function isAllowedFacadeTarget(targetAbs) {
  const rel = path.relative(PROJECT_ROOT, targetAbs).replace(/\\/g,'/');
  return CONTEXT.allowGameImports.some(allow => rel === allow + '.js' || rel === allow + '.ts' || rel === allow);
}

function scan() {
  const files = listFiles(SRC_DIR, ['.js', '.ts']);
  const violations = [];
  const importRe = /(?:import\s+[^'"]*from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;

  for (const file of files) {
    const relFile = path.relative(PROJECT_ROOT, file).replace(/\\/g,'/');
    const isGame = relFile.startsWith('src/game/');
    const src = fs.readFileSync(file, 'utf8');
    importRe.lastIndex = 0;
    let m;
    while ((m = importRe.exec(src))) {
      const spec = m[1] || m[2];
      const target = normalizeTarget(file, spec);
      if (!target) continue;
      const relTarget = path.relative(PROJECT_ROOT, target).replace(/\\/g,'/');

      if (isAllowedFacadeTarget(target)) {
        continue; // always allowed
      }

      if (hasRestrictedSegment(relTarget)) {
        if (!isGame) {
          violations.push({
            file: relFile,
            import: spec,
            resolved: relTarget
          });
        }
      }
    }
  }
  return violations;
}

(function main(){
  try {
    const v = scan();
    if (v.length) {
      console.error('\nBoundary violations detected:');
      for (const x of v) {
        console.error(`- {file} imports "{import}" -> {resolved}`.replace('{file}', x.file).replace('{import}', x.import).replace('{resolved}', x.resolved));
      }
      console.error('\nRule: Only src/game/** may import controllers/engine/internal. Others must go via src/game/Game or src/game/index.');
      process.exit(1);
    } else {
      console.log('Boundary check passed.');
    }
  } catch (err) {
    console.error('Boundary checker failed:', err && err.stack || err);
    process.exit(2);
  }
})();
