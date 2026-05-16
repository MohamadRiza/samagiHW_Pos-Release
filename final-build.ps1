# Complete Build and Package Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Building POS Application" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$rootDir = "D:\A-Nexasoft Projects\H.Ruzaik's Hardware Shop POS\pos-system"
Set-Location $rootDir

# Step 1: Kill processes on port 5000
Write-Host "[1/8] Cleaning up port 5000..." -ForegroundColor Yellow
$connections = netstat -ano | findstr :5000 | findstr LISTENING
if ($connections) {
    $pids = $connections -replace '.*\s+(\d+)$', '$1' | Select-Object -Unique
    foreach ($pid in $pids) {
        if ($pid -match '^\d+$') {
            taskkill /F /PID $pid 2>$null
            Write-Host "  Killed process $pid" -ForegroundColor Gray
        }
    }
}
Start-Sleep -Seconds 2

# Step 2: Clean old builds
Write-Host "[2/8] Cleaning old builds..." -ForegroundColor Yellow
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force frontend/dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend/dist -ErrorAction SilentlyContinue
Write-Host "  Cleaned release, frontend/dist, backend/dist" -ForegroundColor Gray

# Step 3: Install dependencies if needed
Write-Host "[3/8] Checking dependencies..." -ForegroundColor Yellow
if (!(Test-Path "node_modules")) {
    Write-Host "  Installing root dependencies..." -ForegroundColor Gray
    npm install
}
if (!(Test-Path "frontend/node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Gray
    cd frontend
    npm install
    cd $rootDir
}
if (!(Test-Path "backend/node_modules")) {
    Write-Host "  Installing backend dependencies..." -ForegroundColor Gray
    cd backend
    npm install
    cd $rootDir
}
Write-Host "  Dependencies OK" -ForegroundColor Gray

# Step 4: Build frontend
Write-Host "[4/8] Building frontend..." -ForegroundColor Yellow
cd frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    exit 1
}
cd $rootDir
Write-Host "✅ Frontend built successfully" -ForegroundColor Green

# Step 5: Build backend
Write-Host "[5/8] Building backend..." -ForegroundColor Yellow
npm run build:backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Backend built successfully" -ForegroundColor Green

# Step 6: Test backend
Write-Host "[6/8] Testing backend connection..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "node" -ArgumentList "backend/dist/server.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 5

$backendWorking = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 5
    $backendWorking = $true
    Write-Host "✅ Backend is responding" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Backend test failed, but continuing..." -ForegroundColor Yellow
}
Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue

# Step 7: Package Electron app
Write-Host "[7/8] Packaging Electron app..." -ForegroundColor Yellow
npm run electron:build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Electron packaging failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Electron app packaged successfully" -ForegroundColor Green

# Step 8: Find and display the built executable
Write-Host "[8/8] Build complete!" -ForegroundColor Yellow
$exeFile = Get-ChildItem -Path "release" -Filter "*Portable*.exe" | Select-Object -First 1

if ($exeFile) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "   ✅ BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`n📦 Executable: $($exeFile.FullName)" -ForegroundColor Cyan
    Write-Host "📊 Size: $([math]::Round($exeFile.Length / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "📁 Location: release\" -ForegroundColor Cyan
    
    # Create a shortcut on desktop
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "Samagi POS.lnk"
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = $exeFile.FullName
    $Shortcut.WorkingDirectory = $rootDir
    $Shortcut.Save()
    Write-Host "`n📌 Desktop shortcut created: $shortcutPath" -ForegroundColor Cyan
    
    $run = Read-Host "`nRun the app now? (y/n)"
    if ($run -eq 'y') {
        Write-Host "Starting POS System..." -ForegroundColor Yellow
        Start-Process $exeFile.FullName
    }
} else {
    Write-Host "❌ Could not find built executable!" -ForegroundColor Red
    Write-Host "`nChecking release folder contents:" -ForegroundColor Yellow
    Get-ChildItem -Path "release" -Recurse | Select-Object FullName, Length
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   Build Process Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
Write-Host "1. If app shows white screen, press F12 to open DevTools" -ForegroundColor White
Write-Host "2. Check Console tab for errors" -ForegroundColor White
Write-Host "3. Verify backend is running: http://localhost:5000/api/health" -ForegroundColor White
Write-Host ""