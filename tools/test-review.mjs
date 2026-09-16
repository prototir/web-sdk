import assert from 'node:assert/strict';
import { parseReviewDocument, MAX_REVIEW_BYTES } from '../dist/prototir.mjs';

const fixture = () => ({format:'prototir-review',version:1,id:'document',project:'orbit',build:'v1',threads:[{
  id:'note',text:'The exit is unclear.',author:'Tester',createdAt:'2026-09-16T12:00:00Z',
  image:'data:image/png;base64,iVBORw0KGgo=',x:.25,y:.75,context:'Scene 2, seed 73',resolved:false,
  replies:[{id:'reply',text:'Fixed in v2.',author:'Creator',createdAt:'2026-09-16T13:00:00Z'}]
}]});
assert.deepEqual(parseReviewDocument(JSON.stringify(fixture())), fixture());
for (const mutate of [
  d => d.version = 2,
  d => d.project = '',
  d => d.threads[0].image = 'https://tracker.invalid/x.png',
  d => d.threads[0].image = 'data:image/svg+xml;base64,PHN2Zz4=',
  d => d.threads[0].x = -1,
  d => d.threads[0].y = '0.5',
  d => d.threads[0].text = ' ',
  d => d.threads[0].replies[0].id = 'note',
  d => d.threads[0].createdAt = 'bad date',
  d => d.threads[0].resolved = 'true',
  d => d.threads = Array(101).fill(d.threads[0])
]) { const doc = fixture(); mutate(doc); assert.throws(() => parseReviewDocument(JSON.stringify(doc))); }
assert.throws(() => parseReviewDocument(' '.repeat(MAX_REVIEW_BYTES + 1)), /8 MiB/);
const extra = fixture(); extra.script = '<script>alert(1)</script>';
assert.equal(parseReviewDocument(JSON.stringify(extra)).script, undefined);
console.log('Review format: round trip, limits, duplicates, remote/executable image rejection passed.');
