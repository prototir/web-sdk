import type { PrototirSdk } from './index';

/**
 * The Prototir SDK already running on this page, if another copy got there first.
 *
 * On Prototir the page loads the current SDK from `/prototir.js`, so new tools reach a published
 * prototype without a rebuild. A build that also bundles `@prototir/web-sdk` from npm would
 * otherwise start a second, frozen copy: two console recorders, two message listeners, and the old
 * one replacing the live one on `window.Prototir`. Instead every copy that finds one already
 * running defers to it: `import { Prototir }` then returns the live instance, and this copy starts
 * nothing of its own. Evaluated before any module that starts listening or recording.
 */
export const runningInstance: PrototirSdk | undefined =
	typeof window !== 'undefined'
		? (window as unknown as { Prototir?: PrototirSdk }).Prototir
		: undefined;

/** Whether this copy is the one that runs: in a browser, and first on the page. */
export const isActiveCopy = typeof window !== 'undefined' && runningInstance === undefined;
