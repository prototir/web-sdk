import { consoleEntries } from './console-capture';
import { performanceSamples } from './performance-monitor';
import { watchedValues } from './watch';

/**
 * What a feedback report carries besides the message (§16.7): the device and moment it was sent
 * from, so a creator does not have to ask "which browser?". Prototir shows it only to the
 * prototype's owner and the report's author. Nothing here identifies the tester by name.
 */
export interface FeedbackReport {
	build?: string;
	browser: string;
	os: string;
	viewport: string;
	screen: string;
	pixelRatio: number;
	input: 'touch' | 'mouse';
	gamepads: number;
	language: string;
	cores?: number;
	memoryGb?: number;
	fps?: number;
	slowestFrameMs?: number;
	sessionSeconds: number;
	errors?: string[];
	watch?: Record<string, string>;
}

const MAX_ERRORS = 5;
const MAX_ERROR_LENGTH = 300;
const SAMPLE_MS = 500;

/** Builds the report for a comment or screenshot being sent now. */
export async function buildReport(build?: string, includeWatches = true): Promise<FeedbackReport> {
	const nav = navigator as Navigator & { deviceMemory?: number };
	const { browser, os } = describeUserAgent(nav.userAgent);
	const coarse = typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;
	const fineToo = typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches;
	const errors = consoleEntries()
		.filter(entry => entry.level === 'error')
		.slice(-MAX_ERRORS)
		.map(entry => (entry.text.length > MAX_ERROR_LENGTH ? entry.text.slice(0, MAX_ERROR_LENGTH - 1) + '…' : entry.text));
	const watch = includeWatches ? watchedValues() : {};
	const snapshot: FeedbackReport = {
		...(build ? { build: build.slice(0, 120) } : {}),
		browser,
		os,
		viewport: `${innerWidth}×${innerHeight}`,
		screen: `${screen.width}×${screen.height}`,
		pixelRatio: Math.round((devicePixelRatio || 1) * 100) / 100,
		input: coarse && !fineToo ? 'touch' : 'mouse',
		gamepads: gamepadCount(nav),
		language: nav.language || '',
		...(nav.hardwareConcurrency ? { cores: nav.hardwareConcurrency } : {}),
		...(nav.deviceMemory ? { memoryGb: nav.deviceMemory } : {}),
		sessionSeconds: Math.round(performance.now() / 1000),
		...(errors.length ? { errors } : {}),
		...(Object.keys(watch).length ? { watch } : {}),
	};
	return { ...snapshot, ...await frameRate() };
}

function gamepadCount(nav: Navigator): number {
	try { return typeof nav.getGamepads === 'function' ? Array.from(nav.getGamepads()).filter(Boolean).length : 0; }
	catch { return 0; } // Sandboxed frames may deny the Gamepad API.
}

/** The recent frame rate: from the Performance panel's samples when it is recording, else from
 *  half a second of frames counted now. */
async function frameRate(): Promise<Pick<FeedbackReport, 'fps' | 'slowestFrameMs'>> {
	const recent = performanceSamples().filter(sample => Date.now() - sample.time < 2500).slice(-8);
	if (recent.length) {
		return {
			fps: Math.round(recent.reduce((sum, sample) => sum + sample.fps, 0) / recent.length),
			slowestFrameMs: Math.round(Math.max(...recent.map(sample => sample.worstFrame))),
		};
	}
	if (typeof requestAnimationFrame !== 'function' || document.hidden) return {};
	return new Promise(resolve => {
		let frame = 0;
		let finished = false;
		const finish = (result: Pick<FeedbackReport, 'fps' | 'slowestFrameMs'>) => {
			if (finished) return;
			finished = true; cancelAnimationFrame(frame); clearTimeout(timer); resolve(result);
		};
		let frames = 0;
		let last = performance.now();
		let slowest = 0;
		const start = last;
		const step = (now: number) => {
			frames += 1;
			slowest = Math.max(slowest, now - last);
			last = now;
			if (finished) return;
			if (now - start < SAMPLE_MS) frame = requestAnimationFrame(step);
			else finish({ fps: Math.round((frames * 1000) / (now - start)), slowestFrameMs: Math.round(slowest) });
		};
		frame = requestAnimationFrame(step);
		// A frame that never arrives (a throttled background tab) must not hold the report.
		const timer = setTimeout(() => finish({}), SAMPLE_MS * 3);
	});
}

/** Browser and OS names from a user agent, without the full string (which is mostly noise). */
export function describeUserAgent(ua: string): { browser: string; os: string } {
	const version = (pattern: RegExp) => ua.match(pattern)?.[1]?.split('.')[0] ?? '';
	let browser = 'Unknown browser';
	if (/Edg(?:e|A|iOS)?\//.test(ua)) browser = `Edge ${version(/Edg(?:e|A|iOS)?\/([\d.]+)/)}`;
	else if (/OPR\//.test(ua)) browser = `Opera ${version(/OPR\/([\d.]+)/)}`;
	else if (/Firefox\/|FxiOS\//.test(ua)) browser = `Firefox ${version(/(?:Firefox|FxiOS)\/([\d.]+)/)}`;
	else if (/CriOS\//.test(ua)) browser = `Chrome ${version(/CriOS\/([\d.]+)/)}`;
	else if (/Chrome\//.test(ua)) browser = `Chrome ${version(/Chrome\/([\d.]+)/)}`;
	else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${version(/Version\/([\d.]+)/)}`;
	let os = 'Unknown OS';
	if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
	else if (/Android/.test(ua)) os = 'Android';
	else if (/CrOS/.test(ua)) os = 'ChromeOS';
	else if (/Windows/.test(ua)) os = 'Windows';
	else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
	else if (/Linux/.test(ua)) os = 'Linux';
	return { browser: browser.trim(), os };
}
