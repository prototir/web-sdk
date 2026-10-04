import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const outputRoot = join(root, '.cdn-dist');
const outputDir = join(outputRoot, 'sdk', `v${packageJson.version}`);
// The moving channel, e.g. /sdk/v0/: the newest release of this major version, for builds hosted
// outside Prototir that want updates without editing a version number. Kept out of .cdn-dist so
// it is uploaded with a short cache instead of the immutable one.
const major = packageJson.version.split('.')[0];
const channelRoot = join(root, '.cdn-channel');
const channelDir = join(channelRoot, 'sdk', `v${major}`);

async function filesBelow(dir) {
	const files = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await filesBelow(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

await rm(outputRoot, { recursive: true, force: true });
await rm(channelRoot, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(join(root, 'dist'), outputDir, { recursive: true });

const manifest = {};
for (const file of await filesBelow(outputDir)) {
	const key = relative(outputRoot, file).split(sep).join('/');
	const bytes = await readFile(file);
	manifest[key] = {
		bytes: bytes.length,
		integrity: `sha384-${createHash('sha384').update(bytes).digest('base64')}`
	};
}

await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(channelDir, { recursive: true });
await cp(join(root, 'dist'), channelDir, { recursive: true });
await writeFile(
	join(channelDir, 'version.json'),
	`${JSON.stringify({ version: packageJson.version }, null, 2)}
`
);
console.log(`Prepared SDK ${packageJson.version} with ${Object.keys(manifest).length} files, and channel v${major}`);
