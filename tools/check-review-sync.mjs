import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// The engine SDKs and the player ship copies of this build. A stale copy silently
// disables newer protocol fields (for example the duplicate-post guard), so the
// copies are compared against dist on every test run. Refresh with `npm run sync:review`.
const destinations = [
  '../prototir-webapp/static/review-sdk/prototir.js',
  '../prototir-unity-sdk/Runtime/Review/prototir.js',
  '../prototir-godot-sdk/addons/prototir/web/prototir.js'
];
const digest = async url => createHash('sha256').update(await readFile(url)).digest('hex');
const expected = await digest(new URL('../dist/prototir.js', import.meta.url));
const stale = [];
for (const destination of destinations) {
  const target = new URL(destination, new URL('../', import.meta.url));
  try {
    if (await digest(target) !== expected) stale.push(fileURLToPath(target));
  } catch (error) {
    // A sibling repository the contributor has not cloned is skipped, not failed.
    if (error.code === 'ENOENT') continue;
    throw error;
  }
}
if (stale.length) {
  console.error('Vendored review runtime is stale. Run `npm run sync:review`:\n' + stale.map(p => '  ' + p).join('\n'));
  process.exit(1);
}
console.log('Review runtime copies match dist/prototir.js.');
