"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const isDev = !electron_1.app.isPackaged;
const PORT = 4000;
// ---------------------------------------------------------------------------
// Config path management
// In dev: project-root/launch.config.json (server resolves it via __dirname)
// In packaged: ~/Library/Application Support/launch/launch.config.json
// ---------------------------------------------------------------------------
function ensureConfig() {
    if (isDev)
        return; // dev server handles this itself
    const userDataDir = electron_1.app.getPath('userData');
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
        }
        else {
            fs.writeFileSync(configPath, JSON.stringify({ projects: [], links: [] }, null, 2), 'utf-8');
        }
    }
    process.env.LAUNCH_CONFIG_PATH = configPath;
}
// ---------------------------------------------------------------------------
// Start the embedded Express/WS server
// ---------------------------------------------------------------------------
function startServer() {
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
function waitForServer(url, timeoutMs = 15000) {
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
                }
                else {
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
function createWindow() {
    const win = new electron_1.BrowserWindow({
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
        electron_1.shell.openExternal(href);
        return { action: 'deny' };
    });
}
// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
electron_1.app.whenReady().then(async () => {
    startServer();
    if (!isDev) {
        // Wait for the embedded server before loading the renderer
        await waitForServer(`http://localhost:${PORT}/health`);
    }
    createWindow();
    // macOS: re-create window when dock icon is clicked and no windows are open
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    // On macOS apps conventionally stay open until the user quits explicitly
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
