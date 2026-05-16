@echo off
echo ========================================
echo  Setting up Git for Release Management
echo ========================================
echo.

cd /d "D:\A-Nexasoft Projects\H.Ruzaik's Hardware Shop POS\pos-system"

:: Check if .git exists
if exist ".git" (
    echo Git repository already initialized.
) else (
    echo Initializing git repository...
    git init
    echo ✅ Git initialized
)

:: Check if remote exists
git remote get-url origin > nul 2>&1
if errorlevel 1 (
    echo.
    echo Adding remote for release repository...
    git remote add origin https://github.com/MohamadRiza/samagiHW_Pos-Release.git
    echo ✅ Remote added
) else (
    echo Remote already exists: 
    git remote -v
)

:: Create .gitignore if not exists
if not exist ".gitignore" (
    echo Creating .gitignore...
    (
        echo node_modules/
        echo backend/node_modules/
        echo frontend/node_modules/
        echo release/
        echo dist/
        echo *.log
        echo .DS_Store
        echo *.sqlite-shm
        echo *.sqlite-wal
        echo temp/
        echo backups/
        echo .env
    ) > .gitignore
    echo ✅ .gitignore created
)

:: Add all files
echo.
echo Adding files to git...
git add .

:: Commit
echo.
echo Committing files...
git commit -m "Initial commit - POS System v1.0.0"

:: Push
echo.
echo Pushing to GitHub...
git push -u origin main

echo.
echo ========================================
echo  ✅ Setup Complete!
echo ========================================
echo.
pause