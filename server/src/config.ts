import fs from 'fs';
import path from 'path';
import { Config } from './types.js';

// Config file lives two levels up: /Code/launch/launch.config.json
const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'launch.config.json');

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
