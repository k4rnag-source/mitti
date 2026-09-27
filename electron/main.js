const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage
} = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const isSmoke = process.argv.includes('--smoke');
const earlyLog = path => {
  try {
    fs.mkdirSync(path.dirname(path), { recursive: true });
    fs.appendFileSync(path, '[' + new Date().toISOString() + '] ' + arguments[1] + '\\n');
  } catch {}
};
const EARLY_LOG = require('path').join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'Mitti', 'early.log');

process.on('uncaughtException', err => earlyLog(EARLY_LOG, 'uncaughtException: ' + (err.stack || err.message)));
process.on('unhandledRejection', err => earlyLog(EARLY_LOG, 'unhandledRejection: ' + String(err)));
if (isSmoke) {
  app.disableHardwareAcceleration();
}
earlyLog(EARLY_LOG, 'main module loaded');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2'
};

let win = null;
let tray = null;
let probe = null;
let probeBuffer = '';
let movementTimer = null;
let interactionTimer = null;
let state = 'roam';
let paused = false;
let sleeping = false;
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let target = null;
let targetDisplayId = null;
let speed = 95;
let actionAt = 0;
let stateUntil = 0;
let currentYaw = 0;
let probeData = null;
let lastInteractive = false;
let staticServer = null;
let staticPort = 0;

const LOG_DIR = path.join(app.getPath('localAppData'), 'Mitti');
const LOG_FILE = path.join(LOG_DIR, 'runtime.log');
const READY_FILE = path.join(LOG_DIR, 'renderer-ready.txt');

function log(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function now() {
  return Date.now();
}

function getUnionBounds() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map(d => d.bounds.x));
  const top = Math.min(...displays.map(d => d.bounds.y));
  const right = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
  return { left, top, right, bottom };
}

function clampTarget(x, y) {
  const display = screen.getAllDisplays().find(d =>
    x >= d.workArea.x &&
    x < d.workArea.x + d.workArea.width &&
    y >= d.workArea.y &&
    y < d.workArea.y + d.workArea.height
  ) || screen.getPrimaryDisplay();

  const pad = 18;
  return {
    x: Math.round(Math.max(display.workArea.x + pad, Math.min(x, display.workArea.x + display.workArea.width - win.getBounds().width - pad))),
    y: Math.round(Math.max(display.workArea.y + pad, Math.min(y, display.workArea.y + display.workArea.height - win.getBounds().height - pad))),
    displayId: display.id
  };
}

function chooseRoamTarget() {
  if (!win) return;
  const displays = screen.getAllDisplays();
  const current = screen.getDisplayMatching(win.getBounds());
  let display = current;

  if (displays.length > 1 && Math.random() < 0.32) {
    const others = displays.filter(d => d.id !== current.id);
    display = others[Math.floor(Math.random() * others.length)] || current;
  }

  const marginX = 24;
  const marginY = 36;
  const x = random(
    display.workArea.x + marginX,
    display.workArea.x + Math.max(marginX, display.workArea.width - win.getBounds().width - marginX)
  );
  const y = random(
    display.workArea.y + marginY,
    display.workArea.y + Math.max(marginY, display.workArea.height - win.getBounds().height - marginY)
  );

  const c = clampTarget(x, y);
  target = { x: c.x, y: c.y };
  targetDisplayId = c.displayId;
  speed = random(55, 125);
  state = 'roam';
  actionAt = now() + random(1200, 2600);
  sendState({ state, moving: true, yaw: currentYaw });
}

function validForegroundWindow() {
  if (!probeData || !probeData.visible || probeData.minimized) return false;
  if (!probeData.bounds || probeData.bounds.width < 260 || probeData.bounds.height < 160) return false;
  const title = String(probeData.title || '').toLowerCase();
  const cls = String(probeData.className || '');
  if (title === 'program manager' || cls === 'Progman' || cls === 'WorkerW' || cls === 'Shell_TrayWnd') return false;
  if (String(probeData.process || '').toLowerCase().includes('mitti')) return false;
  return true;
}

function choosePerchTarget() {
  if (!win || !validForegroundWindow()) return false;
  const r = probeData.bounds;
  const wb = win.getBounds();
  const minX = r.x + 14;
  const maxX = r.x + r.width - wb.width - 14;
  if (maxX < minX) return false;

  const x = random(minX, maxX);
  const y = r.y - wb.height + 6;
  const c = clampTarget(x, y);
  target = { x: c.x, y: c.y, displayId: c.displayId };
  speed = random(110, 165);
  state = 'perch-approach';
  actionAt = now() + random(900, 1500);
  sendState({ state, moving: true, yaw: currentYaw, perch: true });
  return true;
}

function startStateDecision(force = false) {
  if (!win || paused || dragging) return;
  const t = now();
  if (!force && t < actionAt) return;

  if (sleeping) return;

  const r = Math.random();
  if (validForegroundWindow() && r < 0.18) {
    if (choosePerchTarget()) {
      stateUntil = t + random(5500, 11000);
      return;
    }
  }

  if (r < 0.31) {
    state = 'sit';
    stateUntil = t + random(2500, 6500);
    actionAt = stateUntil;
    sendState({ state, moving: false, yaw: currentYaw });
    return;
  }

  if (r < 0.40) {
    state = 'look';
    stateUntil = t + random(1600, 3600);
    actionAt = stateUntil;
    sendState({ state, moving: false, yaw: currentYaw });
    return;
  }

  if (r < 0.48) {
    sleeping = true;
    state = 'sleep';
    stateUntil = t + random(11000, 23000);
    actionAt = stateUntil;
    sendState({ state, moving: false, yaw: currentYaw });
    return;
  }

  if (!target || t > actionAt + 5000) {
    chooseRoamTarget();
  } else {
    actionAt = t + random(500, 1800);
  }
}

function finishPerch() {
  state = 'sit';
  stateUntil = now() + random(4500, 9500);
  sendState({ state, moving: false, yaw: currentYaw, perch: true });
}

function moveTowardTarget() {
  if (!win || !target || paused || dragging) return;
  const b = win.getBounds();
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 5) {
    if (state === 'perch-approach') {
      finishPerch();
    } else {
      state = 'roam';
      actionAt = now() + random(900, 2400);
      sendState({ state, moving: false, yaw: currentYaw });
    }
    return;
  }

  const dt = 0.05;
  const step = Math.min(dist, speed * dt);
  const nx = dx / dist;
  const ny = dy / dist;
  win.setPosition(Math.round(b.x + nx * step), Math.round(b.y + ny * step), false);

  if (Math.abs(dx) > 2) {
    currentYaw = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  sendState({
    state,
    moving: true,
    yaw: currentYaw,
    cursor: screen.getCursorScreenPoint()
  });
}

function wakeUp() {
  sleeping = false;
  state = 'look';
  stateUntil = now() + 2200;
  actionAt = stateUntil;
  sendState({ state: 'look', moving: false, yaw: currentYaw });
}

function sendState(extra = {}) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('mitti-state', {
    state,
    paused,
    sleeping,
    ...extra
  });
}

function updateMouseInteractivity() {
  if (!win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const b = win.getBounds();

  const localX = cursor.x - b.x;
  const localY = cursor.y - b.y;
  // The actual GLB occupies the center/lower part of the window.
  const overPet =
    localX >= 55 &&
    localX <= b.width - 55 &&
    localY >= 70 &&
    localY <= b.height - 18;

  if (overPet !== lastInteractive) {
    lastInteractive = overPet;
    win.setIgnoreMouseEvents(!overPet, { forward: true });
  }
}

function beginDrag(point) {
  if (!win) return;
  dragging = true;
  paused = true;
  dragOffset = point;
  win.setIgnoreMouseEvents(false);
  sendState({ state: 'drag', moving: false, yaw: currentYaw });
}

function endDrag() {
  dragging = false;
  paused = false;
  target = null;
  actionAt = now() + 700;
  if (win) win.setIgnoreMouseEvents(true, { forward: true });
  sendState({ state: 'look', moving: false, yaw: currentYaw });
}

function startProbe() {
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'MittiProbe', 'MittiWindowProbe.exe')
    : path.join(__dirname, 'resources', 'MittiProbe', 'MittiWindowProbe.exe');

  if (!fs.existsSync(helper)) {
    log('Foreground helper not found: ' + helper);
    return;
  }

  try {
    probe = spawn(helper, ['--watch'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    probe.stdout.on('data', data => {
      probeBuffer += data.toString();
      const lines = probeBuffer.split(/\r?\n/);
      probeBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          probeData = JSON.parse(line);
        } catch {}
      }
    });
    probe.on('error', err => log('Foreground helper error: ' + err.message));
    probe.on('exit', code => log('Foreground helper exited: ' + code));
  } catch (e) {
    log('Foreground helper start failed: ' + e.message);
  }
}


function startStaticServer() {
  return new Promise((resolve, reject) => {
    const root = app.getAppPath();

    staticServer = http.createServer((req, res) => {
      try {
        const raw = decodeURIComponent((req.url || '/').split('?')[0]);
        const safePath = raw === '/' ? '/renderer/index.html' : raw;
        const filePath = path.normalize(path.join(root, safePath));

        if (!filePath.toLowerCase().startsWith(root.toLowerCase() + path.sep) &&
            filePath.toLowerCase() !== root.toLowerCase()) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          fs.createReadStream(filePath).pipe(res);
        });
      } catch (err) {
        res.writeHead(500);
        res.end('Server error');
      }
    });

    staticServer.on('error', reject);
    staticServer.listen(0, '127.0.0.1', () => {
      staticPort = staticServer.address().port;
      log('Local renderer server listening on 127.0.0.1:' + staticPort);
      resolve();
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 430,
    height: 350,
    minWidth: 430,
    minHeight: 350,
    maxWidth: 430,
    maxHeight: 350,
    frame: false,
    transparent: !isSmoke,
    backgroundColor: isSmoke ? '#20252b' : '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, 'floating');
  if (!isSmoke) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    log('did-fail-load: ' + errorCode + ' ' + errorDescription + ' ' + validatedURL);
  });
  win.webContents.on('preload-error', (_, preloadPath, error) => {
    log('preload-error: ' + preloadPath + ' ' + error);
  });
  win.webContents.on('console-message', (_, level, message, line, sourceId) => {
    log('console[' + level + '] ' + message + ' @ ' + sourceId + ':' + line);
  });
  win.webContents.on('did-finish-load', () => {
    log('Renderer document finished loading.');
    win.showInactive();
  });

  win.loadURL('http://127.0.0.1:' + staticPort + '/renderer/index.html');
  if (isSmoke) win.show();
  win.once('ready-to-show', () => {
    const d = screen.getPrimaryDisplay();
    const wb = win.getBounds();
    win.setPosition(
      Math.round(d.workArea.x + d.workArea.width * 0.62 - wb.width / 2),
      Math.round(d.workArea.y + d.workArea.height - wb.height - 24),
      false
    );
    win.showInactive();
    win.setIgnoreMouseEvents(true, { forward: true });
    chooseRoamTarget();
  });

  win.on('closed', () => {
    win = null;
  });

  screen.on('display-added', () => {
    actionAt = 0;
  });
  screen.on('display-removed', () => {
    actionAt = 0;
  });
  screen.on('display-metrics-changed', () => {
    actionAt = 0;
  });
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" rx="14" fill="#111820"/>
    <path d="M17 40c-3-12 5-22 17-22 7 0 12 3 15 7l7-6-3 12c2 8-3 19-16 21-10 2-18-3-20-12z" fill="#1b2028"/>
    <circle cx="39" cy="29" r="3" fill="#f1f5f9"/>
    <circle cx="40" cy="29" r="1.3" fill="#0b0d0f"/>
    <path d="M21 22l-7-8 2 13M49 22l8-7-4 13" stroke="#0b0d0f" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  );
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Mitti — Desktop Labrador');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Call Mitti', click: () => callMitti() },
    { label: paused ? 'Resume' : 'Pause', click: () => setPaused(!paused) },
    { label: 'Sleep', click: () => { sleeping = true; state = 'sleep'; stateUntil = now() + 18000; sendState({ state, moving: false, yaw: currentYaw }); } },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath }) },
    { label: 'Exit Mitti', click: () => app.quit() }
  ]));
  tray.on('double-click', () => callMitti());
}

function setPaused(value) {
  paused = !!value;
  sendState({ moving: false, state: paused ? 'pause' : state, yaw: currentYaw });
}

function callMitti() {
  if (!win) return;
  paused = false;
  sleeping = false;
  state = 'look';
  const d = screen.getPrimaryDisplay();
  const wb = win.getBounds();
  win.setPosition(
    Math.round(d.workArea.x + (d.workArea.width - wb.width) / 2),
    Math.round(d.workArea.y + d.workArea.height - wb.height - 26),
    false
  );
  actionAt = now() + 900;
  sendState({ state: 'look', moving: false, yaw: 0, called: true });
}

function registerShortcuts() {
  globalShortcut.register('Ctrl+Alt+M', callMitti);
  globalShortcut.register('Ctrl+Alt+P', () => setPaused(!paused));
  globalShortcut.register('Ctrl+Alt+S', () => { sleeping = true; state = 'sleep'; stateUntil = now() + 18000; sendState({ state, moving: false, yaw: currentYaw }); });
  globalShortcut.register('Ctrl+Alt+Q', () => app.quit());
}

async function main() {
  await app.whenReady();
  app.setAppUserModelId('com.mitti.desktop');
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });

  await startStaticServer();
  earlyLog(EARLY_LOG, 'app ready');
  createWindow();
  if (!isSmoke) {
    createTray();
    registerShortcuts();
    startProbe();
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }

  movementTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;

    if (dragging) {
      const cursor = screen.getCursorScreenPoint();
      win.setPosition(
        Math.round(cursor.x - dragOffset.x),
        Math.round(cursor.y - dragOffset.y),
        false
      );
      return;
    }

    if (paused) return;

    const t = now();

    if (sleeping) {
      if (t >= stateUntil) wakeUp();
      return;
    }

    if ((state === 'sit' || state === 'look') && t >= stateUntil) {
      chooseRoamTarget();
      return;
    }

    if (state === 'perch-approach' || state === 'roam') {
      moveTowardTarget();
    }

    startStateDecision(false);
  }, 50);

  interactionTimer = setInterval(updateMouseInteractivity, 80);

  app.on('activate', () => {
    if (win) win.showInactive();
  });
}

ipcMain.on('renderer-ready', (_, kind) => {
  log('Renderer ready: ' + kind);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(READY_FILE, kind + '\n' + new Date().toISOString());
  } catch {}
});

ipcMain.on('renderer-error', (_, message) => log('Renderer error: ' + message));
ipcMain.on('drag-start', (_, point) => beginDrag(point));
ipcMain.on('drag-end', endDrag);

app.on('window-all-closed', e => e.preventDefault());

app.on('before-quit', () => {
  clearInterval(movementTimer);
  clearInterval(interactionTimer);
  globalShortcut.unregisterAll();
  if (probe && !probe.killed) probe.kill();
  if (tray) tray.destroy();
  if (staticServer) {
    try { staticServer.close(); } catch {}
  }
});

main().catch(err => {
  log('Fatal startup error: ' + (err.stack || err.message));
  app.quit();
});
