import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Generated distribution assets: run after building this SDK. No remote installs or uploads.
const destinations = [
  '../prototir-webapp/static/review-sdk/prototir.js',
  '../prototir-unity-sdk/Runtime/Review/prototir.js',
  '../prototir-godot-sdk/addons/prototir/web/prototir.js'
];
const source = new URL('../dist/prototir.js', import.meta.url);
for (const destination of destinations) {
  const target = new URL(destination, new URL('../', import.meta.url));
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(source, target);
  console.log(fileURLToPath(target));
}
console.log('SHA-256:', createHash('sha256').update(await readFile(source)).digest('hex'));
