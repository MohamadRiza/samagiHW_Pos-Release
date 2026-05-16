# Test Backend Connection Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Testing Backend Connection" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Kill any existing processes on port 5000
Write-Host "[1/4] Cleaning port 5000..." -ForegroundColor Yellow
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

# Start backend
Write-Host "[2/4] Starting backend server..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "node" -ArgumentList "backend/server.js" -PassThru -NoNewWindow
Write-Host "  Backend PID: $($backend.Id)" -ForegroundColor Gray

# Wait for backend to start
Write-Host "[3/4] Waiting for backend to initialize..." -ForegroundColor Yellow
$maxAttempts = 10
$attempt = 0
$connected = $false

while ($attempt -lt $maxAttempts -and !$connected) {
    Start-Sleep -Seconds 1
    $attempt++
    Write-Host "  Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $connected = $true
        Write-Host "`n✅ Backend is running!" -ForegroundColor Green
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
    } catch {
        # Still starting
    }
}

if ($connected) {
    Write-Host "`n[4/4] Testing debug endpoint..." -ForegroundColor Yellow
    try {
        $debugResponse = Invoke-WebRequest -Uri "http://localhost:5000/api/debug" -UseBasicParsing -TimeoutSec 2
        Write-Host "✅ Debug endpoint working" -ForegroundColor Green
        Write-Host "Debug info: $($debugResponse.Content)" -ForegroundColor Gray
    } catch {
        Write-Host "⚠️ Debug endpoint not available" -ForegroundColor Yellow
    }
    
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "   ✅ BACKEND IS WORKING!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nBackend is running on PID: $($backend.Id)" -ForegroundColor Cyan
    Write-Host "API URL: http://localhost:5000/api" -ForegroundColor Cyan
    Write-Host "Health Check: http://localhost:5000/api/health" -ForegroundColor Cyan
    
    $stop = Read-Host "`nStop backend? (y/n)"
    if ($stop -eq 'y') {
        Stop-Process -Id $backend.Id -Force
        Write-Host "Backend stopped" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n========================================" -ForegroundColor Red
    Write-Host "   ❌ BACKEND FAILED TO START!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "`nPlease check:" -ForegroundColor Yellow
    Write-Host "1. Node.js is installed" -ForegroundColor White
    Write-Host "2. Run 'cd backend && npm install'" -ForegroundColor White
    Write-Host "3. Check backend/server.js for errors" -ForegroundColor White
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ""