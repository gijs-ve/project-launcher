import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

const isDev = !app.isPackaged;
const PORT = 4000;

// ---------------------------------------------------------------------------
// Config path management
// In dev: project-root/launch.config.json (server resolves it via __dirname)
// In packaged: ~/Library/Application Support/launch/launch.config.json
// ---------------------------------------------------------------------------
function ensureConfig(): void {
  if (isDev) return; // dev server handles this itself

  const userDataDir = app.getPath('userData');

  // Ensure the userData directory exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const configPath = path.join(userDataDir, 'launch.config.json');

  if (!fs.existsSync(configPath)) {
    // Try to seed from a bundled default; otherwise start empty
    const bundled = path.join(process.resourcesPath, 'launch.config.json');
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
// ---------------------------------------------------------------------------
function startServer(): void {
  ensureConfig();

  if (!isDev) {
    // Tell Express to serve the built React client as static files
    process.env.ELECTRON_STATIC_DIR = path.join(process.resourcesPath, 'client');
  }

  // In dev use the compiled server output; in packaged it lives next to us
  const serverEntryDev = path.resolve(__dirname, '..', 'server', 'dist', 'index.js');
  const serverEntryProd = path.join(__dirname, '..', 'server', 'dist', 'index.js');
  const serverEntry = isDev ? serverEntryDev : serverEntryProd;

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
  startServer();

  if (!isDev) {
    // Wait for the embedded server before loading the renderer
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
