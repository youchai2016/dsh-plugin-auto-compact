// Compose a DSH profile with the harness's own loader and assert that this
// plugin's layer actually wins — without restarting any running host.
//
// Usage:
//   node tools/preflight.mjs [--profile <dir>] [--app-boot <lib/index.js>] [--anchor <dir>]
//
// Defaults: --profile $DSH_HOME/profiles/desktop (or $DSH_HOME/profiles/web).
// --app-boot is located automatically from candidate node_modules; when it
// cannot be found, pass the path to @deepseek-ai/dsh-app-boot/lib/index.js.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const profileDir = resolve(argOf('--profile') ?? join(home, 'profiles', 'desktop'));

function candidateNodeModules() {
  const dirs = [];
  for (let dir = process.cwd(); ; ) {
    dirs.push(join(dir, 'node_modules'));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const profiles = join(home, 'profiles');
  dirs.push(join(profiles, 'node_modules'));
  if (existsSync(profiles)) {
    for (const entry of readdirSync(profiles, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(profiles, entry.name, 'node_modules'));
    }
  }
  dirs.push(join(home, 'node_modules'));
  for (const env of ['DSH_INSTALL', 'DSH_APP_DIR', 'DSH_HARNESS_DIR']) {
    if (process.env[env]) dirs.push(join(process.env[env], 'node_modules'));
  }
  return dirs;
}

function findAppBoot() {
  const explicit = argOf('--app-boot') ?? process.env.DSH_APP_BOOT;
  if (explicit !== undefined) return resolve(explicit);
  for (const modules of candidateNodeModules()) {
    const file = join(modules, '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');
    if (existsSync(file)) return file;
  }
  throw new Error('cannot locate @deepseek-ai/dsh-app-boot/lib/index.js — pass --app-boot <path>');
}

const appBootPath = findAppBoot();
const boot = await import(pathToFileURL(appBootPath).href);
const anchors = [
  argOf('--anchor'),
  process.env.DSH_INSTALL,
  ...candidateNodeModules().map((dir) => dirname(dir)),
  profileDir,
].filter(Boolean);

let loaded;
const attempts = [];
for (const anchor of anchors) {
  try {
    const result = boot.loadProfileDirectory('dsh', profileDir, anchor);
    attempts.push(`${anchor}: ${result.layers.length} layer(s), ${result.skippedBundles.length} skipped`);
    if (result.skippedBundles.length === 0 && result.layers.length > 0) {
      loaded = result;
      console.log(`anchor used: ${anchor}`);
      break;
    }
    loaded ??= result;
  } catch (error) {
    attempts.push(`${anchor}: ${error.message}`);
  }
}
if (loaded === undefined) throw new Error(`no anchor could load the profile bundles:\n  ${attempts.join('\n  ')}`);

console.log('\nbundle layers in composition order:');
for (const layer of loaded.layers) console.log(`  - ${layer.packageName}`);
if (loaded.skippedBundles.length > 0) {
  console.log('\nskipped bundles (resolve/install these before trusting the result):');
  for (const skipped of loaded.skippedBundles) console.log(`  - ${skipped.packageName}: ${skipped.reason}`);
}

const patches = [
  ...loaded.layers.flatMap((layer) => layer.patches),
  ...boot.loadOverlayPatches('dsh', join(profileDir, 'cordis.patch.yml')),
];
const flat = [];
const walk = (rows) => {
  for (const row of rows ?? []) {
    flat.push(row);
    if (Array.isArray(row.config)) walk(row.config);
  }
};
walk(boot.composeEntries(patches));
const byId = new Map(flat.map((row) => [row.id, row]));

const fail = (message) => {
  console.error(`\nPRE-FLIGHT FAILED: ${message}`);
  process.exit(1);
};

const self = byId.get('auto-compact');
if (self?.name !== 'dsh-plugin-auto-compact') fail('the auto-compact row is missing from the composition');

const engine = byId.get('compaction-basic');
if (engine === undefined) fail('compaction-basic is missing from the composition');
if (engine.disabled === true) fail('compaction-basic is disabled — this plugin\'s layer did not win');
if (engine.config?.thresholdRatio !== 0.5) fail(`host-plane thresholdRatio is ${engine.config?.thresholdRatio}, expected 0.5`);

for (const preset of ['standard', 'cordis', 'ptc']) {
  const row = byId.get(`preset-${preset}`);
  if (row === undefined) fail(`preset-${preset} is missing from the composition`);
  const group = row.config.plugins.find((plugin) => plugin.id === 'compaction');
  const basic = group?.config?.find((plugin) => plugin.id === 'compaction-basic');
  const ratio = basic?.config?.thresholdRatio;
  if (ratio !== 0.5) fail(`preset-${preset}: compaction-basic thresholdRatio is ${ratio}, expected 0.5`);
  console.log(`  preset-${preset}: compaction-basic thresholdRatio = 0.5 (${row.config.plugins.length} plugin rows)`);
}

console.log(`\nPRE-FLIGHT OK — ${flat.length} composed rows, this plugin's layer wins.`);
