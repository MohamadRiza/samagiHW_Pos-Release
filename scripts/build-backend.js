/**
 * build-backend.js
 * Copies backend source files into backend/dist/ for Electron packaging.
 * Run via: npm run build:backend
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'backend');
const DEST = path.join(SRC, 'dist');

console.log('Building backend...');
console.log(`  Source : ${SRC}`);
console.log(`  Output : ${DEST}`);

if (!fs.existsSync(DEST)) {
  fs.mkdirSync(DEST, { recursive: true });
}

// Backend items that must be included in dist
const itemsToCopy = [
  'config',
  'controllers',
  'middleware',
  'models',
  'routes',
  'scripts',
  'services',
  'utils',
  'create-admin.js',
  'package.json',
  'server.js'
];

for (const item of itemsToCopy) {
  const srcPath  = path.join(SRC, item);
  const destPath = path.join(DEST, item);
  
  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, destPath, { recursive: true, force: true });
    console.log(`  ✅ Copied ${item}`);
  } else {
    console.log(`  ℹ️  Skipped ${item} (not found)`);
  }
}

console.log('✅ Backend build complete →', DEST);