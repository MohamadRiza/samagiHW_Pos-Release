@echo off
echo ========================================
echo   Rebuilding and Packaging POS App
echo ========================================
echo.

echo [1/6] Installing dependencies...
call npm install --save-dev @electron/rebuild

echo.
echo [2/6] Cleaning old builds...
call npm run clean

echo.
echo [3/6] Rebuilding native modules for Electron...
call npm run postinstall

echo.
echo [4/6] Building frontend...
call npm run build:frontend

echo.
echo [5/6] Building backend...
call npm run build:backend

echo.
echo [6/6] Packaging Electron app...
call npm run electron:build

echo.
echo ========================================
echo   BUILD COMPLETE!
echo ========================================
echo.
echo The portable EXE is in the 'release' folder
echo.
pause