import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Load the actual modules with controlled browser dependencies and a deterministic clock.
async function load(name, globals = {}, dependencies = {}) {
  const source = await readFile(new URL('../src/' + name + '.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, console, Error, ...globals, require: name => {
    assert.ok(name in dependencies, 'Unexpected dependency: ' + name);
    return dependencies[name];
  } });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const warnings = [];
const watch = await load('watch', { console: { warn: message => warnings.push(message) } });
let reads = 0;
let hp = 5;
const read = () => { reads++; return hp; };
const oldStop = watch.watch('hp', read);
const stop = watch.watch('hp', read);
oldStop();
assert.equal(reads, 0, 'registration must not evaluate readers');
assert.deepEqual(plain(watch.watchedValues()), { hp: '5' }, 'stale disposer must not remove replacement');
hp = 0;
const snapshot = watch.watchedValues();
hp = 10;
assert.equal(snapshot.hp, '0', 'reports keep the captured state');
stop();
assert.equal(watch.hasWatches(), false);
let changed = 0;
const unsubscribe = watch.onWatchesChanged(() => changed++);
watch.watch('bad name', read);
assert.equal(changed, 0);
watch.watch('__proto__', () => 'safe');
watch.watch('long', () => 'x'.repeat(500));
watch.watch('throws', () => { throw new Error('reader failed'); });
const circular = {}; circular.self = circular;
watch.watch('object', () => circular);
const values = watch.watchedValues();
assert.equal(values.__proto__, 'safe');
assert.equal(values.long.length, 200);
assert.equal(values.throws, 'error: reader failed');
assert.equal(values.object, '[object Object]');
for (let i = 4; i < 20; i++) watch.watch('v' + i, () => i);
watch.watch('overflow', read);
assert.equal(Object.keys(watch.watchedValues()).length, 20);
assert.equal(reads, 2, 'overflow registration must be ignored');
assert.equal(warnings.length, 2);
unsubscribe();
watch.unwatch('__proto__');
assert.equal(changed, 20);

let now = 0;
let raf = 0;
let cancelled = 0;
let cleared = 0;
let timeout;
let frames = [];
let entries = Array.from({ length: 7 }, (_, i) => ({ level: 'error', text: String(i).repeat(400) }));
const globals = {
  navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0 Safari/537.36',
    language: 'en', hardwareConcurrency: 8, deviceMemory: 8,
    getGamepads() { throw new Error('permissions policy'); } },
  innerWidth: 800, innerHeight: 600, screen: { width: 1920, height: 1080 }, devicePixelRatio: 2,
  performance: { now: () => now }, document: { hidden: false },
  matchMedia: query => ({ matches: query.includes('coarse') }),
  requestAnimationFrame: callback => { raf = callback; return 1; },
  cancelAnimationFrame: () => cancelled++,
  setTimeout: callback => { timeout = callback; return 2; }, clearTimeout: () => cleared++
};
const report = await load('report', globals, {
  './watch': watch, './console-capture': { consoleEntries: () => entries },
  './performance-monitor': { performanceSamples: () => frames }
});
watch.watch('hp', () => hp);
const pending = report.buildReport('build-2');
hp = 0;
now = 250; raf(now);
now = 500; raf(now);
const result = await pending;
assert.equal(result.watch.hp, '10', 'state is sampled before waiting for frames');
assert.equal(result.browser, 'Chrome 140');
assert.equal(result.os, 'Windows');
assert.equal(result.build, 'build-2');
assert.equal(result.gamepads, 0, 'denied gamepad access must not discard diagnostics');
assert.equal(result.input, 'touch');
assert.equal(result.viewport, '800×600');
assert.equal(result.errors.length, 5);
assert.ok(result.errors.every(value => value.length === 300));
assert.equal(result.fps, 4);
assert.equal(result.slowestFrameMs, 250);
assert.equal(cancelled, 1);
assert.equal(cleared, 1);
frames = [{ time: Date.now(), fps: 59.7, worstFrame: 23.2 }];
const recent = await report.buildReport(undefined, false);
assert.equal(recent.fps, 60);
assert.equal(recent.slowestFrameMs, 23);
assert.equal(recent.watch, undefined, 'disabled Watch must omit values');
frames = [{ time: Date.now() - 10000, fps: 1, worstFrame: 1000 }];
const throttled = report.buildReport();
timeout();
assert.equal((await throttled).fps, undefined, 'stale samples and a missing frame must not hold feedback');
assert.equal(cancelled, 2);
assert.deepEqual(plain(report.describeUserAgent('Mozilla/5.0 (iPhone) FxiOS/130.0 Safari/605')), { browser: 'Firefox 130', os: 'iOS' });
console.log('Feedback diagnostics: watch limits, disposal, capture timing, browser metadata and frame timeout passed.');
