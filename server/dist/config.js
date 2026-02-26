"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConfig = readConfig;
exports.writeConfig = writeConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Config file resolution:
//   1. LAUNCH_CONFIG_PATH env var (set by Electron main in packaged builds)
//   2. Default: two levels up from server/dist/ → project root
function resolveConfigPath() {
    if (process.env.LAUNCH_CONFIG_PATH) {
        return process.env.LAUNCH_CONFIG_PATH;
    }
    return path_1.default.resolve(__dirname, '..', '..', 'launch.config.json');
}
const CONFIG_PATH = resolveConfigPath();
function readConfig() {
    try {
        const raw = fs_1.default.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        // Return empty config if file is missing or malformed
        return { projects: [], links: [] };
    }
}
function writeConfig(config) {
    fs_1.default.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
