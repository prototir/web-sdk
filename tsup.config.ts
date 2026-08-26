import { defineConfig } from 'tsup';

export default defineConfig({
	entry: { prototir: 'src/index.ts' },
	// IIFE for the <script> tag (attaches window.Prototir); ESM for tooling/imports.
	format: ['iife', 'esm'],
	outExtension({ format }) {
		return { js: format === 'iife' ? '.js' : '.mjs' };
	},
	dts: { entry: 'src/index.ts' },
	clean: true,
	minify: true,
	sourcemap: true
});
