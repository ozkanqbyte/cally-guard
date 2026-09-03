/**
 * Zero-dependency .env loader. Reads `services/guard/.env` (if present) and
 * fills in any process.env keys that aren't already set. Lets the demos run as
 * plain `node live-demo.mjs` with no keys to paste on the command line — the
 * #1 source of "LLM: BAĞLANAMADI" (a half-copied key).
 *
 *   import './src/dotenv.mjs';   // side-effect: loads before anything reads env
 *
 * Format: KEY=value per line. `#` comments and blank lines ignored. Surrounding
 * single/double quotes on the value are stripped. Existing env vars always win.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAMES = ['.env', 'local.keys']; // local.keys = same format, for when .env is awkward to create
const CANDIDATES = [];
for (const dir of [resolve(HERE, '..'), process.cwd()]) {
  for (const name of NAMES) CANDIDATES.push(resolve(dir, name));
}

let loaded = '';
for (const path of CANDIDATES) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
  loaded = path;
  break;
}

export const dotenvPath = loaded;
