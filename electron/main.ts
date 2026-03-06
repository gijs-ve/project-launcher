import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

const isDev = !app.isPackaged;
const PORT = 4000;

// ---------------------------------------------------------------------------
// Config path management
// In dev: project-root/launch.config.gizzyb (server resolves it via __dirname)
// In packaged: ~/Library/Application Support/launch/launch.config.gizzyb
// ---------------------------------------------------------------------------
function ensureConfig(): void {
  if (isDev) return; // dev server handles this itself

  const userDataDir = app.getPath('userData');

  // Ensure the userData directory exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const configPath = path.join(userDataDir, 'launch.config.gizzyb');

  if (!fs.existsSync(configPath)) {
    // Try to seed from a bundled default; otherwise start empty
    const bundled = path.join(process.resourcesPath, 'launch.config.gizzyb');
    if (fs.existsSync(bundled)) {
      fs.copyFileSync(bundled, configPath);
    } else {
      fs.writeFileSync(
        configPath,
        JSON.stringify({ projects: [], links: [] }, null, 2),
        'utf-8',
      );
    }
  }

  process.env.LAUNCH_CONFIG_PATH = configPath;
}

// ---------------------------------------------------------------------------
// Start the embedded Express/WS server
// Only called in packaged builds. In dev mode the server is started externally
// by the `electron:dev` concurrently script (npm run dev --prefix server).
// ---------------------------------------------------------------------------
function startServer(): void {
  ensureConfig();

  // Tell Express where the built React client lives so it can serve it
  process.env.ELECTRON_STATIC_DIR = path.join(process.resourcesPath, 'client');

  // node-pty unpacked path: ensure spawn-helper is executable at runtime
  // (belt-and-suspenders in case packaging didn't preserve the chmod bit)
  try {
    const prebuildsDir = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'prebuilds',
    );
    if (fs.existsSync(prebuildsDir)) {
      for (const arch of fs.readdirSync(prebuildsDir)) {
        const helper = path.join(prebuildsDir, arch, 'spawn-helper');
        if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
      }
    }
  } catch { /* non-fatal */ }

  // In packaged builds the server lives inside the asar next to electron-dist/
  const serverEntry = path.join(__dirname, '..', 'server', 'dist', 'index.js');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(serverEntry);
}

// ---------------------------------------------------------------------------
// Poll until the local server responds to /health
// ---------------------------------------------------------------------------
function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Server at ${url} did not start within ${timeoutMs}ms`));
        return;
      }

      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(attempt, 250);
        }
      }).on('error', () => {
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

// ---------------------------------------------------------------------------
// Browser window
// ---------------------------------------------------------------------------
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // Dev: load from Vite dev server (which proxies /api and /ws to Express)
  // Prod: load from the Express server which serves the built client
  const url = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`;
  win.loadURL(url);

  // Don't flash a blank window
  win.once('ready-to-show', () => win.show());

  // Open all <a target="_blank"> links in the system browser
  win.webContents.setWindowOpenHandler(({ url: href }) => {
    shell.openExternal(href);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  if (isDev) {
    // Dev: server is already started externally by `npm run dev --prefix server`.
    // Just wait until it's answering before opening the window.
    await waitForServer(`http://localhost:${PORT}/health`);
  } else {
    // Production: boot the embedded Express/WS server then wait for it.
    startServer();
    await waitForServer(`http://localhost:${PORT}/health`);
  }

  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS apps conventionally stay open until the user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
