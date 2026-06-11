const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;
const isDev = !app.isPackaged || process.argv.includes('--dev');

console.log('=== ELECTRON STARTUP ===');
console.log('App is packaged:', app.isPackaged);
console.log('Is Dev Mode:', isDev);
console.log('__dirname:', __dirname);
console.log('process.resourcesPath:', process.resourcesPath);

// ─── Log file helper (so you can see errors after packaging) ───────────────
function writeLog(message) {
    try {
        const logDir = app.getPath('userData');
        const logPath = path.join(logDir, 'startup.log');
        const line = `[${new Date().toISOString()}] ${message}\n`;
        fs.appendFileSync(logPath, line);
        console.log(message);
    } catch (e) {
        console.log(message);
    }
}

// ─── Prevent multiple instances ────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// ─── Find backend server.js (works both in dev and packaged) ───────────────
function getBackendPath() {
    const candidates = [];

    if (isDev) {
        // Development: backend folder next to electron folder
        candidates.push(path.join(__dirname, '../backend/server.js'));
        candidates.push(path.join(process.cwd(), 'backend/server.js'));
    } else {
        // Production (packaged): electron-builder puts files in resources/app.asar
        // But we need to look outside asar for native modules
        candidates.push(path.join(process.resourcesPath, 'app.asar', 'backend', 'dist', 'server.js'));
        candidates.push(path.join(process.resourcesPath, 'app', 'backend', 'dist', 'server.js'));
        candidates.push(path.join(__dirname, '../backend/dist/server.js'));
        candidates.push(path.join(process.resourcesPath, 'backend', 'dist', 'server.js'));
        // Fallback: non-bundled backend
        candidates.push(path.join(process.resourcesPath, 'app.asar', 'backend', 'server.js'));
        candidates.push(path.join(__dirname, '../backend/server.js'));
    }

    writeLog('Searching for backend in:');
    for (const candidate of candidates) {
        writeLog(`  Checking: ${candidate}`);
        if (fs.existsSync(candidate)) {
            writeLog(`  ✅ Found: ${candidate}`);
            return candidate;
        }
    }

    writeLog('❌ Backend not found in any candidate path');
    return null;
}

// ─── Setup environment variables ───────────────────────────────────────────
function setupEnvironment() {
    const userDataPath = app.getPath('userData');
    const isWin = process.platform === 'win32';
    const sharedDataDir = isWin ? 'C:\\SamagiHardwarePOS' : path.join(app.getPath('home'), 'SamagiHardwarePOS');

    process.env.NODE_ENV = 'production';
    process.env.PORT = '5000';
    process.env.ELECTRON_APP = 'true';
    process.env.IS_PACKAGED = String(app.isPackaged);
    process.env.USER_DATA_PATH = sharedDataDir;
    process.env.DB_PATH = path.join(sharedDataDir, 'pos_database.sqlite');
    process.env.UPLOADS_PATH = path.join(sharedDataDir, 'uploads');
    process.env.BACKUPS_PATH = path.join(sharedDataDir, 'backups');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'samagi-pos-secret-key-2024-min-32-chars-long!!';
    process.env.APP_VERSION = app.getVersion();

    // Create required directories
    const dirs = [
        sharedDataDir,
        path.join(sharedDataDir, 'uploads'),
        path.join(sharedDataDir, 'backups'),
        path.join(sharedDataDir, 'temp'),
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            writeLog(`Created directory: ${dir}`);
        }
    }

    // Helper to copy folder recursively
    const copyFolderRecursive = (src, dest) => {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyFolderRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    };

    // Migration logic: search AppData and candidate paths for the largest existing database
    const targetDbPath = process.env.DB_PATH;
    const migrationFlagPath = path.join(sharedDataDir, '.migrated');

    if (fs.existsSync(migrationFlagPath)) {
        writeLog('Migration flag file (.migrated) exists. Skipping database migration.');
    } else {
        writeLog('No migration flag file found. Running database migration scan...');
        const oldDbCandidates = [
            path.join(app.getPath('appData'), 'samagi-pos', 'pos_database.sqlite'),
            path.join(app.getPath('appData'), 'samagi-pos', 'samagi-pos', 'pos_database.sqlite'),
            path.join(app.getPath('userData'), 'pos_database.sqlite'),
            path.join(app.getPath('appData'), 'Samagi Hardware POS', 'pos_database.sqlite'),
            path.join(userDataPath, 'pos_database.sqlite'),
        ];

        // Filter duplicates and target database path to avoid checking/logging the same file multiple times
        const uniqueCandidates = [...new Set(oldDbCandidates.map(p => path.resolve(p)))].filter(
            cand => cand !== path.resolve(targetDbPath)
        );

        let bestOldDbPath = null;
        let maxBytes = 0;

        for (const cand of uniqueCandidates) {
            if (fs.existsSync(cand)) {
                try {
                    const stats = fs.statSync(cand);
                    writeLog(`Found old database candidate: ${cand} (${stats.size} bytes)`);
                    if (stats.size > maxBytes) {
                        maxBytes = stats.size;
                        bestOldDbPath = cand;
                    }
                } catch (e) {
                    writeLog(`Error checking candidate ${cand}: ${e.message}`);
                }
            }
        }

        if (bestOldDbPath) {
            try {
                let shouldCopy = true;
                if (fs.existsSync(targetDbPath)) {
                    const targetStats = fs.statSync(targetDbPath);
                    const oldStats = fs.statSync(bestOldDbPath);
                    // If target database is already larger than or equal to the candidate, do NOT copy
                    if (targetStats.size >= oldStats.size) {
                        shouldCopy = false;
                        writeLog(`Target database is already equal or larger (${targetStats.size} bytes vs old ${oldStats.size} bytes). Skipping copy.`);
                    }
                }

                if (shouldCopy) {
                    // Keep backup of any current database in target folder before migrating to prevent data damage/loss
                    if (fs.existsSync(targetDbPath)) {
                        const backupTemp = targetDbPath + '.before_migration_' + Date.now();
                        fs.renameSync(targetDbPath, backupTemp);
                        writeLog(`Backed up current database to: ${backupTemp}`);
                    }
                    
                    fs.copyFileSync(bestOldDbPath, targetDbPath);
                    writeLog(`✅ SUCCESS: Migrated database from ${bestOldDbPath} to ${targetDbPath}`);
                }

                // Copy uploads and backups folders if they exist in the old folder
                const oldParentDir = path.dirname(bestOldDbPath);
                
                const oldUploadsDir = path.join(oldParentDir, 'uploads');
                const targetUploadsDir = process.env.UPLOADS_PATH;
                if (fs.existsSync(oldUploadsDir) && !fs.existsSync(targetUploadsDir)) {
                    try {
                        fs.renameSync(oldUploadsDir, targetUploadsDir);
                        writeLog(`Migrated uploads folder to: ${targetUploadsDir}`);
                    } catch (e) {
                        try {
                            copyFolderRecursive(oldUploadsDir, targetUploadsDir);
                            writeLog(`Copied uploads folder to: ${targetUploadsDir}`);
                        } catch (copyErr) {
                            writeLog(`Uploads migration error: ${copyErr.message}`);
                        }
                    }
                }

                const oldBackupsDir = path.join(oldParentDir, 'backups');
                const targetBackupsDir = process.env.BACKUPS_PATH;
                if (fs.existsSync(oldBackupsDir) && !fs.existsSync(targetBackupsDir)) {
                    try {
                        fs.renameSync(oldBackupsDir, targetBackupsDir);
                        writeLog(`Migrated backups folder to: ${targetBackupsDir}`);
                    } catch (e) {
                        try {
                            copyFolderRecursive(oldBackupsDir, targetBackupsDir);
                            writeLog(`Copied backups folder to: ${targetBackupsDir}`);
                        } catch (copyErr) {
                            writeLog(`Backups migration error: ${copyErr.message}`);
                        }
                    }
                }

                // Write flag file upon successful migration
                fs.writeFileSync(migrationFlagPath, `migrated on ${new Date().toISOString()}`);
                writeLog(`Created migration flag file: ${migrationFlagPath}`);

            } catch (migrationErr) {
                writeLog(`❌ Migration execution error: ${migrationErr.message}`);
            }
        } else {
            // No old database found to migrate, so write flag file to skip checks on future startups
            fs.writeFileSync(migrationFlagPath, `skipped on ${new Date().toISOString()} (no old db found)`);
            writeLog(`No database to migrate. Created flag file: ${migrationFlagPath}`);
        }
    }

    // Copy initial database if user doesn't have one yet (either migrated or newly created)
    if (!fs.existsSync(targetDbPath)) {
        const sourceDbPaths = [
            path.join(process.resourcesPath, 'pos_database.sqlite'),
            path.join(__dirname, '../backend/pos_database.sqlite'),
            path.join(process.resourcesPath, 'app.asar', 'backend', 'pos_database.sqlite'),
        ];
        for (const src of sourceDbPaths) {
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, targetDbPath);
                writeLog(`Database copied from: ${src}`);
                break;
            }
        }
    }

    writeLog(`Environment set up. DB: ${process.env.DB_PATH}`);
}

// ─── Start the Express backend ─────────────────────────────────────────────
async function startBackend() {
    try {
        writeLog('--- Starting backend ---');
        setupEnvironment();

        const backendPath = getBackendPath();
        if (!backendPath) {
            writeLog('FATAL: Could not find backend server.js');
            return false;
        }

        writeLog(`Loading backend from: ${backendPath}`);

        // Clear require cache for fresh load
        Object.keys(require.cache).forEach(key => {
            if (key.includes('backend')) {
                delete require.cache[key];
            }
        });

        const backendModule = require(backendPath);

        // If backend exports startServer, call it
        if (backendModule && typeof backendModule.startServer === 'function') {
            backendModule.startServer();
            writeLog('startServer() called');
        }

        // Wait for backend to be ready
        await waitForBackend(10, 1000);

        writeLog('✅ Backend started successfully');
        return true;

    } catch (error) {
        writeLog(`❌ Backend start error: ${error.message}`);
        writeLog(error.stack || '');
        return false;
    }
}

// ─── Poll until backend HTTP is ready ─────────────────────────────────────
function waitForBackend(maxAttempts = 10, delayMs = 1000) {
    return new Promise((resolve) => {
        const http = require('http');
        let attempts = 0;

        const check = () => {
            attempts++;
            writeLog(`Waiting for backend... attempt ${attempts}/${maxAttempts}`);

            const req = http.get('http://localhost:5000/api/health', (res) => {
                writeLog(`Backend responded with status: ${res.statusCode}`);
                resolve(true);
            });

            req.on('error', () => {
                if (attempts < maxAttempts) {
                    setTimeout(check, delayMs);
                } else {
                    writeLog('Backend did not respond in time, proceeding anyway...');
                    resolve(false);
                }
            });

            req.setTimeout(delayMs - 100, () => {
                req.destroy();
            });
        };

        setTimeout(check, 500); // initial delay
    });
}

// ─── Create the main browser window ───────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
        },
        icon: path.join(__dirname, 'icon.ico'),
        title: 'Samagi Hardware POS',
        show: false,
        backgroundColor: '#f3f4f6',
    });

    if (isDev) {
        writeLog('DEV: Loading http://localhost:3003');
        mainWindow.loadURL('http://localhost:3003').catch((err) => {
            writeLog(`Failed to load dev server: ${err.message}`);
        });
        mainWindow.webContents.openDevTools();
    } else {
        const indexPath = path.join(__dirname, '../frontend/dist/index.html');
        writeLog(`PROD: Loading ${indexPath}`);

        if (fs.existsSync(indexPath)) {
            mainWindow.loadFile(indexPath).catch((err) => {
                writeLog(`Failed to load index.html: ${err.message}`);
            });
        } else {
            writeLog(`FATAL: index.html not found at ${indexPath}`);
            dialog.showErrorBox('Error', `Frontend files not found at:\n${indexPath}\n\nPlease reinstall.`);
            app.quit();
            return;
        }
    }

    mainWindow.webContents.on('console-message', (event, level, message) => {
        writeLog(`[Renderer] ${message}`);
    });

    mainWindow.once('ready-to-show', () => {
        writeLog('Window ready, showing...');
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────
ipcMain.handle('get-app-info', () => {
    return {
        success: true,
        data: {
            version: app.getVersion(),
            environment: isDev ? 'development' : 'production',
            userDataPath: app.getPath('userData'),
            appName: 'Samagi Hardware POS',
            isPackaged: app.isPackaged,
            backendRunning: true,
        },
    };
});

ipcMain.handle('check-for-updates', async () => {
    try {
        if (isDev) return { success: false, error: 'Updates disabled in dev mode' };
        autoUpdater.checkForUpdates();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('download-update', async () => {
    try {
        autoUpdater.downloadUpdate();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('install-update', async () => {
    try {
        autoUpdater.quitAndInstall();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('restart-backend', async () => {
    try {
        const started = await startBackend();
        return { success: started };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('create-desktop-backup', async () => {
    try {
        // Trigger WAL checkpoint in Express backend before copying to flush active modifications
        await new Promise((resolve) => {
            const http = require('http');
            const req = http.request({
                hostname: 'localhost',
                port: 5000,
                path: '/api/settings/checkpoint-db-internal',
                method: 'POST'
            }, (res) => {
                resolve();
            });
            req.on('error', () => {
                resolve();
            });
            req.end();
        });

        const desktopDir = app.getPath('desktop');
        const targetDir = path.join(desktopDir, 'database_posSystem');
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const backupFolder = path.join(targetDir, `Backup_${timestamp}`);
        fs.mkdirSync(backupFolder, { recursive: true });
        
        const dbPath = process.env.DB_PATH || 'C:\\SamagiHardwarePOS\\pos_database.sqlite';
        const uploadsPath = process.env.UPLOADS_PATH || 'C:\\SamagiHardwarePOS\\uploads';
        const backupsPath = process.env.BACKUPS_PATH || 'C:\\SamagiHardwarePOS\\backups';
        
        // Copy database
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, path.join(backupFolder, 'pos_database.sqlite'));
        }
        
        // Helper to copy folder recursively
        const copyFolder = (src, dest) => {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            const entries = fs.readdirSync(src, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                    copyFolder(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        };
        
        // Copy uploads
        if (fs.existsSync(uploadsPath)) {
            copyFolder(uploadsPath, path.join(backupFolder, 'uploads'));
        }
        
        // Copy backups
        if (fs.existsSync(backupsPath)) {
            copyFolder(backupsPath, path.join(backupFolder, 'backups'));
        }
        
        writeLog(`Backup created at: ${backupFolder}`);
        return {
            success: true,
            message: 'Backup created successfully on your Desktop',
            path: backupFolder
        };
    } catch (error) {
        writeLog(`Backup error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
});

// ─── Auto-updater setup ────────────────────────────────────────────────────
function setupAutoUpdater() {
    if (isDev) {
        writeLog('[Updater] Dev mode: skipping auto-update');
        return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        writeLog('[Updater] Checking for update...');
        mainWindow?.webContents?.send('update-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        writeLog(`[Updater] Update available: ${info.version}`);
        mainWindow?.webContents?.send('update-status', {
            status: 'available',
            version: info.version,
            releaseNotes: info.releaseNotes,
            releaseDate: info.releaseDate,
        });
    });

    autoUpdater.on('update-not-available', () => {
        writeLog('[Updater] No updates');
        mainWindow?.webContents?.send('update-status', { status: 'not-available' });
    });

    autoUpdater.on('download-progress', (progress) => {
        writeLog(`[Updater] Download: ${Math.round(progress.percent)}%`);
        mainWindow?.webContents?.send('update-progress', {
            percent: Math.round(progress.percent),
            transferred: progress.transferred,
            total: progress.total,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        writeLog(`[Updater] Update downloaded: ${info.version}`);
        mainWindow?.webContents?.send('update-status', {
            status: 'downloaded',
            version: info.version,
        });
    });

    autoUpdater.on('error', (err) => {
        writeLog(`[Updater] Error: ${err.message}`);
        mainWindow?.webContents?.send('update-error', { error: err.message });
    });

    // Check after 10 seconds so app fully loads first
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 10000);
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    writeLog('=== App ready ===');

    const backendStarted = await startBackend();

    if (backendStarted) {
        writeLog('Backend OK, creating window...');
        createWindow();
        setupAutoUpdater();
    } else {
        writeLog('Backend failed to start');
        const logPath = path.join(app.getPath('userData'), 'startup.log');
        dialog.showErrorBox(
            'Startup Error',
            `Failed to start the backend server.\n\nCheck the log file for details:\n${logPath}\n\nThen share this file for support.`
        );
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
});