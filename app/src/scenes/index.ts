import type { Registry } from '../engine/engine';

// every non-underscore module in this folder is a scene, keyed by file name
const mods = import.meta.glob(['./*.ts', '!./_*.ts', '!./index.ts']);

export const registry: Registry = Object.fromEntries(
  Object.entries(mods).map(([path, load]) => [path.slice(2, -3), load as Registry[string]]),
);
