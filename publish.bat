@echo off
title Samagi POS Publisher
color 0A

echo ========================================
echo   Samagi POS - Build & Publish
echo ========================================
echo.

:: Check GH_TOKEN
if "%GH_TOKEN%"=="" (
    echo [ERROR] GH_TOKEN not set!
    echo.
    echo Please set your GitHub token:
    echo set GH_TOKEN=ghp_your_token_here
    echo.
    pause
    exit /b 1
)

:: Show current version
for /f "tokens=2 delims=:" %%a in ('findstr /c:"\"version\"" package.json') do (
    set VERSION=%%~a
    set VERSION=!VERSION: "=!
    set VERSION=!VERSION:,=!
)
echo Current version: %VERSION%
echo.

:: Ask for new version
set /p NEW_VERSION="Enter new version (e.g., 1.0.2): "
if "%NEW_VERSION%"=="" (
    echo Version cannot be empty
    pause
    exit /b 1
)

:: Update version in package.json
echo Updating version to %NEW_VERSION%...
powershell -Command "(Get-Content package.json) -replace '\"version\": \".*\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content package.json"

:: Ask for commit message
set /p COMMIT_MSG="Commit message: "
if "%COMMIT_MSG%"=="" set COMMIT_MSG="Release v%NEW_VERSION%"

:: Git operations
echo.
echo Committing changes...
git add package.json
git commit -m "%COMMIT_MSG%"

echo.
echo Creating tag...
git tag v%NEW_VERSION%

echo.
echo Pushing to GitHub...
git push origin main
git push origin v%NEW_VERSION%

:: Build and publish
echo.
echo Building and publishing...
echo.
call npm run electron:publish

echo.
echo ========================================
echo   ✅ PUBLISH COMPLETE!
echo ========================================
echo.
echo Version %NEW_VERSION% published!
echo Users will get update notification.
echo.
pause