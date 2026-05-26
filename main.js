'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3000;
const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 500;

// ─── Ожидание готовности сервера ─────────────────────────────────────────────
function waitForServer(port, retries, callback) {
  if (retries <= 0) {
    console.error('[Electron] Сервер не запустился за отведённое время!');
    app.quit();
    return;
  }
  const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
    if (res.statusCode === 200) {
      console.log('[Electron] Сервер готов к работе.');
      callback();
    } else {
      setTimeout(() => waitForServer(port, retries - 1, callback), RETRY_INTERVAL_MS);
    }
  });
  req.on('error', () => {
    setTimeout(() => waitForServer(port, retries - 1, callback), RETRY_INTERVAL_MS);
  });
  req.setTimeout(300, () => {
    req.destroy();
    setTimeout(() => waitForServer(port, retries - 1, callback), RETRY_INTERVAL_MS);
  });
}

// ─── Запуск Express-сервера как дочернего процесса ───────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server.js');
    serverProcess = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`[Server] ${data.toString().trim()}`);
    });
    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server ERR] ${data.toString().trim()}`);
    });
    serverProcess.on('error', (err) => {
      console.error('[Server] Не удалось запустить процесс:', err);
      reject(err);
    });

    // Ждём готовности
    waitForServer(SERVER_PORT, MAX_RETRIES, resolve);
  });
}

// ─── Создание главного окна Electron ─────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Научно-образовательный комплекс: Лаборатория продовольственной безопасности',
    icon: path.join(__dirname, 'public', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    backgroundColor: '#0f172a',
    show: false
  });

  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    console.log('[Electron] Главное окно открыто.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Перехват внешних ссылок (открывать в браузере)
  const { shell } = require('electron');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Lifecycle Electron ───────────────────────────────────────────────────────
app.whenReady().then(async () => {
  console.log('[Electron] Запуск приложения...');
  try {
    await startServer();
    createMainWindow();
  } catch (err) {
    console.error('[Electron] Критическая ошибка запуска:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    console.log('[Electron] Завершение процесса сервера...');
    serverProcess.kill('SIGTERM');
  }
});

// ─── IPC обработчики ─────────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-server-port', () => SERVER_PORT);

ipcMain.handle('open-external-link', async (event, url) => {
  const { shell } = require('electron');
  await shell.openExternal(url);
});