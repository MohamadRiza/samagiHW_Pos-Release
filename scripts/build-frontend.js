const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔨 Building frontend for production...');

const frontendDir = path.join(__dirname, '../frontend');

// Check if frontend exists
if (!fs.existsSync(frontendDir)) {
  console.error('❌ Frontend directory not found!');
  process.exit(1);
}

// Clean previous build
const distPath = path.join(frontendDir, 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
}

// Build frontend with Vite
try {
  execSync('npm run build', { 
    cwd: frontendDir, 
    stdio: 'inherit' 
  });
  console.log('✅ Frontend build complete!');
} catch (error) {
  console.error('❌ Frontend build failed:', error.message);
  process.exit(1);
}