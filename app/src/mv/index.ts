import type { Registry } from '../engine/engine';

// every non-underscore module in scenes/ is a scene, keyed by file name
const mods = import.meta.glob(['./scenes/*.ts', '!./scenes/_*.ts']);

export const registry: Registry = Object.fromEntries(
  Object.entries(mods).map(([path, load]) => [path.slice('./scenes/'.length, -3), load as Registry[string]]),
);
