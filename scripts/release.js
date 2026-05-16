const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  log(`> ${command}`, 'cyan');
  try {
    return execSync(command, { 
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      ...options 
    });
  } catch (error) {
    log(`Error: ${error.message}`, 'red');
    if (!options.ignoreError) process.exit(1);
    return null;
  }
}

async function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function checkGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  log('\n========================================', 'blue');
  log('     Samagi POS Release Builder', 'cyan');
  log('========================================\n', 'blue');
  
  // Check if root is a git repository
  if (!checkGitRepo()) {
    log('❌ Root directory is not a git repository!', 'red');
    log('\nPlease run these commands first:', 'yellow');
    log('  git init', 'cyan');
    log('  git remote add origin https://github.com/MohamadRiza/samagiHW_Pos-Release.git', 'cyan');
    log('  git add .', 'cyan');
    log('  git commit -m "Initial commit"', 'cyan');
    log('  git push -u origin main', 'cyan');
    log('\nOr run the setup-git-release.bat script.\n', 'yellow');
    process.exit(1);
  }
  
  // Check for GH_TOKEN
  if (!process.env.GH_TOKEN) {
    log('⚠️  GH_TOKEN environment variable not set!', 'yellow');
    log('Please set it with: set GH_TOKEN=ghp_xxxxxxxxxxxx', 'yellow');
    const proceed = await prompt('Continue anyway? (y/N): ');
    if (proceed.toLowerCase() !== 'y') {
      process.exit(1);
    }
  }
  
  // Get new version
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const currentVersion = packageJson.version;
  
  log(`\nCurrent version: ${currentVersion}`, 'yellow');
  const newVersion = await prompt('Enter new version (e.g., 1.0.2): ');
  
  if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
    log('Invalid version format. Use semantic versioning (e.g., 1.0.2)', 'red');
    process.exit(1);
  }
  
  if (newVersion === currentVersion) {
    log('Version must be different from current version!', 'red');
    process.exit(1);
  }
  
  // Ask what changed
  log('\nWhat changed in this release?', 'yellow');
  const changeTypes = [
    '1 - Bug fix',
    '2 - New feature', 
    '3 - Performance improvement',
    '4 - Security update',
    '5 - Multiple changes'
  ];
  changeTypes.forEach(t => log(t, 'cyan'));
  const changeType = await prompt('\nSelect change type (1-5): ');
  
  const releaseNotes = await prompt('Release notes (brief description): ');
  
  // Update version in package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  log(`\n✅ Updated version to ${newVersion}`, 'green');
  
  // Create CHANGELOG entry
  const changelogPath = path.join(__dirname, '../CHANGELOG.md');
  const date = new Date().toISOString().split('T')[0];
  const changelogEntry = `\n## [${newVersion}] - ${date}\n\n### Changes\n- ${releaseNotes}\n`;
  if (fs.existsSync(changelogPath)) {
    const existing = fs.readFileSync(changelogPath, 'utf8');
    fs.writeFileSync(changelogPath, changelogEntry + existing);
  } else {
    fs.writeFileSync(changelogPath, `# Changelog\n${changelogEntry}`);
  }
  
  // Commit changes
  log('\n📦 Committing version change...', 'cyan');
  exec('git add package.json CHANGELOG.md');
  exec(`git commit -m "Release v${newVersion}: ${releaseNotes}"`);
  
  // Create git tag
  log('\n🏷️  Creating git tag...', 'cyan');
  exec(`git tag v${newVersion}`);
  
  // Push changes
  log('\n📤 Pushing to GitHub...', 'cyan');
  exec('git push origin main');
  exec(`git push origin v${newVersion}`);
  
  // Build frontend first
  log('\n🔨 Building frontend...', 'cyan');
  exec('npm run frontend:build');
  
  // Copy backend to dist
  log('\n📋 Copying backend files...', 'cyan');
  exec('npm run copy:backend');
  
  // Build and publish
  log('\n🚀 Building and publishing Electron app...', 'cyan');
  exec('npm run electron:publish');
  
  log('\n========================================', 'green');
  log('     ✅ Release Complete!', 'green');
  log('========================================', 'green');
  log(`\n✅ Version ${newVersion} has been published to GitHub Releases.`, 'cyan');
  log('📱 Users will be notified of the update when they start the app.\n', 'cyan');
  
  rl.close();
}

main().catch(error => {
  log(`\n❌ Release failed: ${error.message}`, 'red');
  process.exit(1);
});