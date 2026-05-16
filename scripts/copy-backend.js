const fs = require('fs');
const path = require('path');

// Create backend/dist directory
const backendDistPath = path.join(__dirname, '../backend/dist');
if (!fs.existsSync(backendDistPath)) {
  fs.mkdirSync(backendDistPath, { recursive: true });
}

// Copy backend source files to dist
const backendSrcPath = path.join(__dirname, '../backend');
const filesToCopy = [
  'server.js',
  'config/database.js',
  'controllers',
  'models',
  'routes',
  'middleware',
  'services'
];

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const item of filesToCopy) {
  const srcPath = path.join(backendSrcPath, item);
  const destPath = path.join(backendDistPath, item);
  copyRecursive(srcPath, destPath);
}

// Copy package.json with modifications
const backendPackageJson = JSON.parse(fs.readFileSync(path.join(backendSrcPath, 'package.json'), 'utf8'));
backendPackageJson.main = 'server.js';
backendPackageJson.scripts = { start: 'node server.js' };
fs.writeFileSync(path.join(backendDistPath, 'package.json'), JSON.stringify(backendPackageJson, null, 2));

// Copy .env.example if exists
if (fs.existsSync(path.join(backendSrcPath, '.env.example'))) {
  fs.copyFileSync(path.join(backendSrcPath, '.env.example'), path.join(backendDistPath, '.env.example'));
}

// Copy node_modules? No - will be installed during build
console.log('✅ Backend copied to dist/');