/**
 * build-backend.js
 * Copies backend files into backend/dist/ for Electron packaging.
 * Run via: npm run build:backend
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'backend');
const DEST = path.join(SRC, 'dist');

// Folders/files to SKIP when copying
const SKIP = new Set([
  'node_modules',
  'dist',
  '.env',
  '.git',
  '*.log',
  'temp',
]);

function shouldSkip(name) {
  if (SKIP.has(name)) return true;
  if (name.endsWith('.log')) return true;
  return false;
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue;

    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log('Building backend...');
console.log(`  Source : ${SRC}`);
console.log(`  Output : ${DEST}`);

// Clean dist
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
}

// Copy backend source → dist
copyDir(SRC, DEST);

// Copy node_modules into dist so native modules are available
const srcModules  = path.join(SRC, 'node_modules');
const destModules = path.join(DEST, 'node_modules');

if (fs.existsSync(srcModules)) {
  console.log('  Copying node_modules (this may take a minute)...');
  copyDir(srcModules, destModules);
  console.log('  node_modules copied.');
} else {
  console.warn('  ⚠️  backend/node_modules not found — run "cd backend && npm install" first.');
}

console.log('✅ Backend build complete →', DEST);