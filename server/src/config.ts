import fs from 'fs';
import path from 'path';
import { Config } from './types.js';

// Config file resolution:
//   1. LAUNCH_CONFIG_PATH env var (set by Electron main in packaged builds)
//   2. Default: two levels up from server/dist/ → project root
function resolveConfigPath(): string {
  if (process.env.LAUNCH_CONFIG_PATH) {
    return process.env.LAUNCH_CONFIG_PATH;
  }
  return path.resolve(__dirname, '..', '..', 'launch.config.json');
}

const CONFIG_PATH = resolveConfigPath();

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    // Return empty config if file is missing or malformed
    return { projects: [], links: [] };
  }
}

export function writeConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
