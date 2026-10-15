// Structural regression tests for the generated patch layer. They run with no
// dependencies installed, so `npm test` works in a bare clone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
const manifest = JSON.parse(read('package.json'));
const patch = read('cordis.patch.yml');

/** Split the generated file into its leading block and one block per preset. */
function presetBlocks() {
  const parts = patch.split(/^# ── preset: (\w+).*$/m);
  const blocks = {};
  for (let i = 1; i < parts.length; i += 2) blocks[parts[i]] = parts[i + 1];
  return blocks;
}

test('the package is a DSH bundle that ships a patch layer', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(statSync(join(ROOT, 'cordis.patch.yml')).isFile());
  assert.ok(manifest.files.includes('cordis.patch.yml'));
  assert.equal(manifest.license, 'MIT');
});

test('no @deepseek-ai peer dependency, so DSH never gates this package', () => {
  // DSH evaluates declared peers against the running harness version and refuses
  // to load a bundle that disagrees; this plugin must stay ungated.
  for (const field of ['peerDependencies', 'dependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      assert.ok(!name.startsWith('@deepseek-ai/'), `${field} must not declare ${name}`);
    }
  }
});

test('the patch contributes exactly the five intended rows', () => {
  for (const id of ['compaction-basic', 'preset-standard', 'preset-cordis', 'preset-ptc']) {
    assert.match(patch, new RegExp(`^- id: ${id}$`, 'm'), `row ${id} is missing`);
  }
  // The plugin's own host row is inserted, so it sits inside the insert list.
  assert.match(
    patch,
    new RegExp(`^- insert:\\n {4}- id: auto-compact\\n {6}name: ${manifest.name}$`, 'm'),
  );
  assert.equal(patch.match(/^- id: /gm).length, 4, 'exactly four root rows are expected');
});

test('every compaction engine is turned on with thresholdRatio 0.5', () => {
  assert.equal(patch.match(/thresholdRatio: 0\.5/g)?.length, 4, 'host plane + three presets');
  assert.ok(!/thresholdRatio: 0\.8/.test(patch), 'the upstream default must not survive');
  assert.match(patch, /^- id: compaction-basic\n {2}name: '@deepseek-ai\/dsh-compaction-basic'\n {2}disabled: false$/m);
  for (const [preset, block] of Object.entries(presetBlocks())) {
    assert.match(block, /- id: compaction-basic/, `${preset}: compaction-basic row missing`);
    assert.equal(
      block.match(/thresholdRatio: 0\.5/g)?.length,
      1,
      `${preset}: exactly one threshold must be set`,
    );
  }
  assert.deepEqual(Object.keys(presetBlocks()).sort(), ['cordis', 'ptc', 'standard']);
});

test('the retention policy stays below the threshold DSH validates', () => {
  const ratio = Number(patch.match(/retainRatio: ([\d.]+)/)[1]);
  const threshold = Number(patch.match(/thresholdRatio: ([\d.]+)/)[1]);
  assert.ok(ratio < threshold, 'DSH rejects retainRatio >= thresholdRatio');
});

test('the locale dictionaries carry the card copy the Plugins page renders', () => {
  for (const language of ['en', 'zh']) {
    const dictionary = JSON.parse(read('locale', `${language}.json`));
    assert.equal(typeof dictionary.meta.title, 'string');
    assert.ok(dictionary.meta.title.length > 0);
    assert.equal(typeof dictionary.meta.description, 'string');
    assert.ok(dictionary.meta.description.length > 0);
  }
});

test('the declared icon exists and stays inside the size DSH accepts', () => {
  const icon = manifest.icon;
  assert.match(icon, /\.svg$/);
  const file = join(ROOT, icon);
  assert.ok(statSync(file).isFile());
  assert.ok(statSync(file).size < 256 * 1024, 'DSH rejects icons above 256 KiB');
});

test('the host half is a loadable cordis plugin', async () => {
  const module = await import(new URL('../lib/index.js', import.meta.url).href);
  assert.equal(typeof module.apply, 'function');
  assert.equal(typeof module.name, 'string');
  assert.ok(Array.isArray(module.inject));
});

test('the README stays concise and keeps answering the three questions', () => {
  const readme = read('README.md');
  const lines = readme.split('\n').length;
  // Detail belongs in docs/HOW-IT-WORKS.md; the README is the three-answer summary.
  assert.ok(lines <= 120, `README grew to ${lines} lines — move detail into docs/HOW-IT-WORKS.md`);
  for (const heading of ['## 1. 这个插件干什么', '## 2. 为什么需要它（痛点）', '## 3. 怎么用']) {
    assert.ok(readme.includes(heading), `README must keep the heading: ${heading}`);
  }
  assert.ok(readme.includes('docs/HOW-IT-WORKS.md'), 'README must link the detail doc');
  assert.ok(statSync(join(ROOT, 'docs', 'HOW-IT-WORKS.md')).isFile());
});
