import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/prototir.js', import.meta.url), 'utf8');
const sent = [];
const listeners = [];
const parent = { postMessage: (message, origin) => sent.push({ message, origin }) };
const window = {
  parent,
  location: { href: 'https://prototype.prttr.com/?prototir_origin=https%3A%2F%2Fprototir.com' },
  addEventListener: (type, listener) => {
    if (type === 'message') listeners.push(listener);
  }
};

const context = vm.createContext({
  window,
  URL,
  URLSearchParams,
  TextEncoder,
  setTimeout,
  clearTimeout,
  console
});
vm.runInContext(source, context);

const sdk = window.Prototir;
assert.ok(sdk, 'IIFE build must expose window.Prototir');
sdk.ready();
sdk.event(' Level_Complete ', { level: 2 });
sdk.score(1200);
assert.deepEqual(
  JSON.parse(JSON.stringify(sent.slice(0, 3))),
  [
    { message: { source: 'prototir', v: 1, type: 'ready' }, origin: 'https://prototir.com' },
    {
      message: { source: 'prototir', v: 1, type: 'event', name: 'level_complete', data: { level: 2 } },
      origin: 'https://prototir.com'
    },
    { message: { source: 'prototir', v: 1, type: 'score', value: 1200 }, origin: 'https://prototir.com' }
  ]
);

assert.throws(() => sdk.event('contains spaces'), /Event names/);
assert.throws(() => sdk.score(Number.NaN), /finite/);
assert.throws(() => sdk.storage.get(''), /Storage keys/);
await assert.rejects(sdk.storage.set('large', 'x'.repeat(64 * 1024 + 1)), /64 KiB/);

const stored = sdk.storage.get('difficulty');
const storageMessage = sent.at(-1).message;
listeners[0]({
  source: parent,
  data: { source: 'prototir', v: 1, type: 'storage:result', id: storageMessage.id, value: 'hard' }
});
assert.equal(await stored, 'hard');

const generated = sdk.ai.generate({ prompt: 'A short quest', maxTokens: 20 });
const aiMessage = sent.at(-1).message;
listeners[0]({
  source: parent,
  data: { source: 'prototir', v: 1, type: 'ai:result', id: aiMessage.id, text: 'Find the beacon.' }
});
assert.equal(await generated, 'Find the beacon.');
await assert.rejects(sdk.ai.generate({ prompt: '' }), (error) => error.code === 'invalid_prompt');

const firstGenerator = sdk.rng('daily');
const secondGenerator = sdk.rng('daily');
const first = Array.from({ length: 4 }, () => firstGenerator());
const second = Array.from({ length: 4 }, () => secondGenerator());
assert.deepEqual(first, second);

// Host origin resolution is shared with the review overlay, so both stay online on the
// same URLs. Engine exports that drop the query string supply the origin in the hash.
for (const [href, expected] of [
  ['https://p.prttr.com/?prototir_origin=https%3A%2F%2Fprototir.com', 'https://prototir.com'],
  ['https://p.prttr.com/#prototir_origin=https%3A%2F%2Fprototir.com', 'https://prototir.com'],
  ['https://p.prttr.com/?prototir_origin=https%3A%2F%2Fa.com#prototir_origin=https%3A%2F%2Fb.com', 'https://a.com'],
  ['https://p.prttr.com/', '*'],
  ['https://p.prttr.com/?prototir_origin=javascript%3Aalert(1)', '*'],
  ['https://p.prttr.com/?prototir_origin=not-a-url', '*']
]) {
  window.location.href = href;
  sdk.ready();
  assert.equal(sent.at(-1).origin, expected, `origin for ${href}`);
}

// Feedback now switches itself on when the host names the prototype, so the SDK reaches for the
// DOM during start-up where it never used to. A build embedded somewhere without a usable
// document must still start: a default that can stop a game from running is worse than no
// default at all.
//
// This proves the SDK loads and the game can still report. It does NOT prove the try/catch
// around the default, because a promise rejecting inside a vm context never reaches this
// process: removing that catch leaves this passing. The resolver below is the part that is
// genuinely covered.
{
  const started = [];
  const bare = {
    parent: { postMessage: (message) => started.push(message) },
    location: { href: 'https://p.prttr.com/?prototir_origin=https%3A%2F%2Fprototir.com&prototir_slug=rims-viewer' },
    addEventListener: () => {}
  };
  const sandbox = vm.createContext({
    window: bare,
    URL,
    URLSearchParams,
    TextEncoder,
    setTimeout,
    clearTimeout,
    console
  });
  vm.runInContext(source, sandbox);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(bare.Prototir, 'the SDK must load even where feedback cannot draw itself');
  bare.Prototir.ready();
  assert.equal(started.at(-1)?.type, 'ready', 'the game must still be able to report');
}

// What the host is allowed to say, and what the SDK refuses to believe. A slug arrives in a URL
// anyone can edit, so the bound that `enable()` enforces is applied before it gets there.
{
  const { resolveHostProject } = await import('../dist/prototir.mjs');
  // The ESM build reads the real global, not the vm sandbox's stand-in.
  const previous = globalThis.window;
  for (const [href, expected] of [
    ['https://p.prttr.com/?prototir_slug=rims-viewer', 'rims-viewer'],
    ['https://p.prttr.com/#prototir_slug=rims-viewer', 'rims-viewer'],
    ['https://p.prttr.com/?prototir_slug=%20%20', null],
    ['https://p.prttr.com/', null],
    [`https://p.prttr.com/?prototir_slug=${'x'.repeat(121)}`, null],
    [`https://p.prttr.com/?prototir_slug=${'x'.repeat(120)}`, 'x'.repeat(120)]
  ]) {
    globalThis.window = { location: { href } };
    assert.equal(resolveHostProject(), expected, `slug for ${href}`);
  }
  globalThis.window = previous;
}

console.log('Web SDK protocol and validation checks passed.');
