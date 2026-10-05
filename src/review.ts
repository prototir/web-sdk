import { resolveHostOrigin, resolveHostProject } from './host-origin';
import { sanitizeTheme, themeCss } from './theme';
import { awaitApproval, PairingCancelled, postComment, startPairing, storeToken, storedToken, type PairingStart } from './pairing';
import { MAX_REVIEW_BYTES, parseReviewDocument, type ReviewDocument, type ReviewThread } from './review-document';
import { clearConsole, consoleEntries, consoleText, installConsoleCapture, onConsoleEntry, uninstallConsoleCapture, type ConsoleEntry } from './console-capture';
import { onPerformanceSample, performanceSamples, performanceSummary, startPerformance, stopPerformance } from './performance-monitor';

/** The testing tools the "Feedback & tools" control offers (§16.7). */
export type ReviewTool = 'screenshot' | 'comment' | 'console' | 'performance';
const ALL_TOOLS: ReviewTool[] = ['screenshot', 'comment', 'console', 'performance'];

export interface ReviewOptions {
  project: string;
  build?: string;
  corner?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  offset?: number;
  capture?: () => Promise<Blob | string>;
  context?: () => string;
  onOpenChange?: (open: boolean) => void;
  /**
   * Who draws the way in.
   * - `auto` (default): the Prototir player draws it when hosted there, otherwise the SDK does.
   * - `watermark`: always draw the Prototir mark, which opens a small menu.
   * - `host`: never draw one; the surrounding app calls `review.open()`.
   */
  launcher?: 'auto' | 'watermark' | 'host';
  /** The panel floats over someone else's game, so it follows the player by default. */
  theme?: 'auto' | 'light' | 'dark';
  /** Where "Open on Prototir" points from a self-hosted build. */
  prototypeUrl?: string;
  /** A developer-owned fullscreen container containing both canvas and overlay. */
  container?: HTMLElement;
  cloudUrl?: string;
  /**
   * Lets a build post to Prototir without being hosted there: a native game, or a page you host
   * yourself. Both are required - the API to talk to, and the prototype it belongs to. Without
   * them the panel still works and saves review files, which is the offline floor.
   */
  apiBase?: string;
  slug?: string;
  /**
   * Which tools testers get. All are on by default; switch any off, or pass `false` for none:
   * `tools: { console: false }`. Console recording starts when the SDK loads, so turning the
   * Console tool off also stops recording.
   */
  tools?: false | Partial<Record<ReviewTool, boolean>>;
}
type FileHandle = { createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> };
let options: ReviewOptions | null = null;
let doc: ReviewDocument;
let root: ShadowRoot;
let host: HTMLElement;
let panel: HTMLElement;
let launcher: HTMLElement;
let style: HTMLStyleElement;
let baseCss = '';
const listeners = new Map<string, Set<(detail: any) => void>>();
let menu: HTMLElement;
let mark: HTMLButtonElement;
let enabledTools: ReviewTool[] = [...ALL_TOOLS];
let toolButtons: Partial<Record<ReviewTool, HTMLButtonElement>> = {};
let consolePanel: HTMLElement | null = null;
/** Holds the Console and Performance panels in one column, away from the control. */
let toolStack: HTMLElement | null = null;
let performancePanel: HTMLElement | null = null;
let stopConsoleWatch: (() => void) | null = null;
let stopPerformanceWatch: (() => void) | null = null;
/** A console log or performance summary attached to the comment being written. */
let attachment = '';
let attachmentNote: HTMLElement;
/** Writing a comment with no screenshot (the Comment tool, or an attachment). */
let commentMode = false;
let attachmentKind: 'console' | 'performance' = 'console';
let list: HTMLElement;
let status: HTMLElement;
let preview: HTMLImageElement;
let pin: HTMLElement;
let input_: HTMLTextAreaElement;
let author: HTMLInputElement;
let contextInput: HTMLInputElement;
let saveButton: HTMLButtonElement;
let fallbackAttach: HTMLButtonElement;
let selectTool: (tool: 'screenshot' | 'files') => void = () => {};
let image = '';
let x = .5, y = .5;
let editing: string | null = null;
let fileHandle: FileHandle | null = null;
let online = false;
let hostComposer = false;
let hostOpened = false;
let opened = false;
let hostOrigin = '';
let serial = 0;
let generation = 0;
let busy = false;
let dirty = false;
let submission = { payload: '', id: '' };
let pairingPanel!: HTMLElement;
let pairingAbort: AbortController | null = null;
let draftQueue = Promise.resolve();
const requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const uid = () => crypto.randomUUID();
const message = (text: string) => { if (status) status.textContent = text; };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const node = document.createElement(tag); node.textContent = text; return node;
};
/** Copies text from a click, inside a prototype's frame. The asynchronous clipboard API is usually
 * blocked there: the frame is on an untrusted origin and is deliberately not granted
 * `clipboard-write`, which would let any prototype overwrite people's clipboards. The legacy copy
 * command still works for the click that asked for it, so it is the fallback. Resolves to whether
 * the text was copied. */
export async function copyText(text: string): Promise<boolean> {
  // Asking a frame that is not allowed only earns a console violation, so check the policy first
  // where the browser exposes it.
  const policy = (document as Document & { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } });
  const allowed = (policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature('clipboard-write') ?? true;
  if (allowed && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* blocked after all; fall back */ }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(area);
  const focused = document.activeElement as HTMLElement | null;
  area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  area.remove();
  focused?.focus?.();
  return copied;
}

/** A Copy button that says whether it worked. */
const copyButton = (text: () => string) => {
  const copy = button('Copy', async () => {
    copy.textContent = (await copyText(text())) ? 'Copied' : 'Copy failed';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
  return copy;
};

const button = (text: string, action: () => void | Promise<void>) => {
  const node = el('button', text); node.type = 'button';
  node.onclick = () => void Promise.resolve().then(action).catch(error => message(error instanceof Error ? error.message : String(error)));
  return node;
};
const toolIcon = (node: HTMLElement, paths: string[]) => {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(name, value);
  for (const data of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data); icon.append(path);
  }
  node.prepend(icon);
  return icon;
};
const cameraIcon = ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z', 'M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6'];
// Lucide icons, inlined so the overlay never fetches anything.
const feedbackIcon = ['M22 17a2 2 0 0 1-2 2H6.83a2 2 0 0 0-1.41.59l-2.2 2.2A.71.71 0 0 1 2 21.29V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z', 'M12 7v6', 'M9 10h6'];
const commentIcon = ['M22 17a2 2 0 0 1-2 2H6.83a2 2 0 0 0-1.41.59l-2.2 2.2A.71.71 0 0 1 2 21.29V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'];
const terminalIcon = ['m7 11 2-2-2-2', 'M11 13h4', 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'];
const activityIcon = ['M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'];
const closePaths = ['M18 6 6 18', 'm6 6 12 12'];

// From the moment the SDK loads, so an early error is already there when someone opens Console.
if (typeof window !== 'undefined') installConsoleCapture();
function send(op: string, payload: unknown = {}): Promise<any> {
  if (!hostOrigin || window.parent === window) return Promise.reject(new Error('No Prototir host.'));
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('Prototir did not confirm saving. Check comments before retrying. Your draft is still here.')); }, op === 'create' || op === 'export' ? 180000 : 15000);
    requests.set(id, { resolve, reject, timer });
    window.parent.postMessage({ source: 'prototir', v: 1, type: 'review', op, id, payload }, hostOrigin);
  });
}
function receive(event: MessageEvent) {
  if (event.source !== window.parent || event.origin !== hostOrigin) return;
  const m = event.data;
  if (m?.source !== 'prototir' || m.v !== 1) return;
  // The Prototir player owns the entry point on its own surfaces, so it opens the panel from
  // its chrome rather than the SDK floating a second button over the same view.
  if (m.type === 'review:command') {
    if ((m.op === 'open' || m.op === 'capture') && options) void openScreenshot().catch(captureError);
    // The host's own "Feedback & tools" control (the embed badge, the player's menu) drives the
    // panels here, because the console and the frames being measured live in this frame.
    else if (m.op === 'comment' && options) void openComment().catch(captureError);
    else if (m.op === 'tool' && options && (m.tool === 'console' || m.tool === 'performance'))
      setToolPanel(m.tool, m.on === true, false);
    else if (m.op === 'state' && options && hostComposer) hostState(m.open === true);
    else if (m.op === 'submitted' && options && hostComposer) {
      setImage(''); input_.value = ''; submission = { payload: '', id: '' };
      emit('submit', { online: true });
    }
    else if (m.op === 'close' && options) show(false);
    return;
  }
  if (m.type !== 'review:result') return;
  const pending = requests.get(m.id);
  if (!pending) return;
  clearTimeout(pending.timer); requests.delete(m.id);
  if (m.error) pending.reject(new Error(String(m.error))); else pending.resolve(m.value);
}
async function draftStore(value?: ReviewDocument): Promise<ReviewDocument | undefined> {
  if (!options) return;
  const key = options.project + ':' + (options.build ?? '');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('prototir-review-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('drafts', value ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('drafts');
      const operation = value ? store.put(value, key) : store.get(key);
      transaction.oncomplete = () => { resolve(value ? undefined : operation.result); db.close(); };
      transaction.onabort = transaction.onerror = () => { reject(transaction.error); db.close(); };
    };
  });
}
function changed() {
  const snapshot = parseReviewDocument(JSON.stringify(doc));
  dirty = true;
  const token = generation;
  draftQueue = draftQueue.then(async () => {
    if (generation !== token) return;
    try { await draftStore(snapshot); }
    catch { message('Browser draft storage unavailable. Save a review file to keep your work.'); }
  });
  window.dispatchEvent(new CustomEvent('prototir-review-change'));
}
function show(open: boolean) {
  if (opened === open) return;
  opened = open;
  panel.hidden = !open;
  if (open) {
    document.exitPointerLock?.();
    options?.onOpenChange?.(true);
    emit('open');
    (panel.querySelector('button') as HTMLButtonElement)?.focus();
  } else { options?.onOpenChange?.(false); emit('close'); }
}
/** Notifies listeners without letting one bad handler break the overlay. */
function emit(event: string, detail?: unknown) {
  for (const handler of listeners.get(event) ?? []) {
    try { handler(detail); } catch { /* A subscriber's failure is not the overlay's problem. */ }
  }
}

function setMenu(open: boolean) {
  if (!menu) return;
  menu.hidden = !open;
  mark?.setAttribute('aria-expanded', String(open));
  if (open) (menu.querySelector('button, a') as HTMLElement | null)?.focus();
}

/** An icon for a tool row, a heading or a close button. */
function svgIcon(paths: string[], className = ''): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(name, value);
  if (className) icon.setAttribute('class', className);
  for (const data of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data); icon.append(path);
  }
  return icon;
}

/** A Console or Performance switch in the control: pressed while its panel is open. */
function setToolPressed(tool: 'console' | 'performance', on: boolean) {
  const node = toolButtons[tool];
  if (!node) return;
  node.setAttribute('aria-pressed', String(on));
  const state = node.querySelector('.tool-state');
  if (state) state.textContent = on ? 'On' : 'Off';
}

/**
 * Opens or closes the Console or Performance panel. `fromHere` is a click inside this frame:
 * the host's control is then told, so its switch shows the same state.
 */
function setToolPanel(tool: 'console' | 'performance', on: boolean, fromHere: boolean) {
  if (!options || !enabledTools.includes(tool)) return;
  if (tool === 'console') {
    if (on) openConsolePanel(); else closeConsolePanel();
  } else if (on) openPerformancePanel(); else closePerformancePanel();
  setToolPressed(tool, on);
  if (fromHere && online) void send('tool', { tool, on }).catch(() => {});
}

function toolPanel(title: string, icon: string[], onClose: () => void): { panel: HTMLElement; body: HTMLElement; actions: HTMLElement } {
  const node = el('section'); node.className = 'tool-panel'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-label', title);
  const head = el('div'); head.className = 'tool-panel-head';
  const heading = el('strong', title); heading.prepend(svgIcon(icon, 'tool-icon'));
  const actions = el('div'); actions.className = 'tool-panel-actions';
  const close = button('', onClose); close.className = 'icon-button'; close.setAttribute('aria-label', 'Close ' + title); close.title = 'Close';
  close.append(svgIcon(closePaths));
  head.append(heading, close);
  const body = el('div'); body.className = 'tool-panel-body';
  node.append(head, body, actions);
  return { panel: node, body, actions };
}

function consoleLine(entry: ConsoleEntry): HTMLElement {
  const line = el('div'); line.className = 'console-line lv-' + entry.level;
  const time = el('span', new Date(entry.time).toISOString().slice(11, 19)); time.className = 'console-time';
  line.append(time, document.createTextNode(' ' + entry.text));
  return line;
}

function openConsolePanel() {
  if (consolePanel) return;
  const { panel: node, body, actions } = toolPanel('Console', terminalIcon, () => setToolPanel('console', false, true));
  node.classList.add('console-panel');
  const lines = el('div'); lines.className = 'console-lines'; lines.setAttribute('role', 'log');
  const render = () => {
    const entries = consoleEntries();
    lines.replaceChildren(...(entries.length ? entries.map(consoleLine) : [el('p', 'Nothing logged yet.')]));
    lines.scrollTop = lines.scrollHeight;
  };
  render();
  // New lines are added at most once a frame, however fast the game logs.
  let queued = false;
  stopConsoleWatch = onConsoleEntry(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; if (consolePanel) render(); });
  });
  actions.append(copyButton(consoleText), button('Clear', () => { clearConsole(); }), button('Attach to comment', () => attach(consoleText(), 'console')));
  body.append(lines);
  consolePanel = node; panelColumn().append(node);
}

function panelColumn(): HTMLElement {
  if (!toolStack) { toolStack = el('div'); toolStack.className = 'tool-stack'; root.append(toolStack); }
  toolStack.classList.toggle('on-left', launcher.classList.contains('at-right'));
  return toolStack;
}

function closeConsolePanel() {
  stopConsoleWatch?.(); stopConsoleWatch = null;
  consolePanel?.remove(); consolePanel = null;
}

function openPerformancePanel() {
  if (performancePanel) return;
  const { panel: node, body, actions } = toolPanel('Performance', activityIcon, () => setToolPanel('performance', false, true));
  node.classList.add('performance-panel');
  const canvas = el('canvas'); canvas.width = 560; canvas.height = 180; canvas.className = 'performance-chart';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Frame rate over the last minute');
  const stats = el('p'); stats.className = 'performance-stats'; stats.setAttribute('role', 'status');
  const draw = () => {
    const samples = performanceSamples();
    const latest = samples[samples.length - 1];
    stats.textContent = latest
      ? `${latest.fps.toFixed(0)} fps · slowest frame ${latest.worstFrame.toFixed(0)} ms${latest.memory !== undefined ? ` · ${latest.memory.toFixed(0)} MB` : ''}`
      : 'Recording…';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const styles = getComputedStyle(node);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const top = Math.max(80, ...samples.map(sample => sample.fps) ) * 1.1;
    ctx.strokeStyle = styles.getPropertyValue('--ptr-line').trim() || '#888'; ctx.lineWidth = 1;
    for (const mark of [30, 60]) {
      const y = height - (mark / top) * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      ctx.fillStyle = styles.getPropertyValue('--ptr-muted').trim() || '#888'; ctx.font = '20px system-ui'; ctx.fillText(String(mark), 4, y - 4);
    }
    ctx.strokeStyle = styles.getPropertyValue('--ptr-accent').trim() || '#2563eb'; ctx.lineWidth = 3;
    ctx.beginPath();
    samples.forEach((sample, index) => {
      const x = (index / Math.max(samples.length - 1, 1)) * width, y = height - (sample.fps / top) * height;
      if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  stopPerformanceWatch = onPerformanceSample(draw);
  startPerformance();
  draw();
  actions.append(copyButton(performanceSummary), button('Attach to comment', () => attach(performanceSummary(), 'performance')));
  body.append(canvas, stats);
  performancePanel = node; panelColumn().append(node);
}

function closePerformancePanel() {
  stopPerformance();
  stopPerformanceWatch?.(); stopPerformanceWatch = null;
  performancePanel?.remove(); performancePanel = null;
}

/** Starts a comment carrying `text` (a console log or a performance summary). A message is
 *  still required: the attachment never goes out on its own. */
async function attach(text: string, kind: 'console' | 'performance') {
  if (!text.trim()) throw new Error('Nothing to attach yet.');
  attachmentKind = kind;
  await openComment({ console: text });
}

/** A comment without a screenshot: the Comment tool, or one carrying an attachment. */
async function openComment(input: { console?: string } = {}) {
  if (!options || !connected()) return;
  if (hostComposer) { await send('compose', { text: '', ...(input.console ? { console: input.console } : {}) }); return; }
  commentMode = true; setImage(''); attachment = input.console ?? '';
  selectTool('screenshot');
  show(true);
  input_.focus();
}

function showAttachment() {
  if (!attachmentNote) return;
  const lines = attachment ? attachment.split('\n').length : 0;
  attachmentNote.hidden = !attachment;
  const what = attachmentKind === 'performance' ? 'performance summary' : 'console log';
  attachmentNote.textContent = attachment ? `Attached: ${what}, ${lines} ${lines === 1 ? 'line' : 'lines'}. Shared with your message; check it for private information.` : '';
}

/**
 * Decides whether the SDK draws its own way in. `hostClaims` is true when the Prototir player
 * has said it renders the control itself, which it does so the entry point sits with Restart
 * and Fullscreen rather than floating separately over the same view.
 */
/** Feedback reaches Prototir: hosted there (the player answered hello), or a self-hosted build
 *  given the API and its prototype, which posts through pairing. */
function connected(): boolean {
  return online || Boolean(options?.apiBase && options?.slug);
}

/** Lucide's chevron-down, the accordion icon the website uses; CSS turns it to match the menu. */
function chevron(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'mark-chevron', 'aria-hidden': 'true' }))
    svg.setAttribute(name, value);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  svg.append(path);
  return svg;
}

function applyLauncher(mode: 'auto' | 'watermark' | 'host', hostClaims: boolean) {
  if (!launcher) return;
  // Offline review files (the local document you save and import) are paused as a product
  // decision (2026-10-04, PLAN): without a way to reach Prototir, no feedback is offered at all.
  const hidden = !connected() || mode === 'host' || (mode === 'auto' && hostClaims);
  launcher.hidden = hidden;
  if (hidden) setMenu(false);
}

function showPin() {
  pin.style.left = `${x * 100}%`; pin.style.top = `${y * 100}%`;
  pin.hidden = !image;
}
function setImage(value: string) {
  image = value; preview.src = value; preview.hidden = !value; showPin();
}
async function compress(source: Blob | string): Promise<string> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    if (typeof source === 'string' && !/^data:image\/(png|jpeg|webp);base64,/.test(source))
      throw new Error('Capture must return an image Blob or data URL.');
    const img = new Image(); img.src = url; await img.decode();
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 32_000_000)
      throw new Error('Screenshot dimensions are too large.');
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = el('canvas'); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image processing unavailable.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', .82);
    if (result.length > 1_400_000) throw new Error('Screenshot is too large. Attach a smaller image.');
    return result;
  } finally { if (typeof source !== 'string') URL.revokeObjectURL(url); }
}
async function capture() {
  if (!options) return;
  const token = generation;
  let source: Blob | string;
  if (options.capture) source = await options.capture();
  else {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Automatic capture is not configured. Attach a screenshot instead.');
    // Capture in the next frame. Engines can supply an end-of-frame callback for exact rendering.
    source = await new Promise<string>((resolve, reject) => requestAnimationFrame(() => {
      try { resolve(canvas.toDataURL('image/png')); } catch (error) { reject(error); }
    }));
  }
  const compressed = await compress(source);
  if (token !== generation || !options) return;
  setImage(compressed);
  fallbackAttach.hidden = true;
  contextInput.value = (options.context?.() ?? '').slice(0, 500);
  message('Check the screenshot, click to place its pin, and write your comment.');
}
function hostState(open: boolean) {
  if (hostOpened === open) return;
  hostOpened = open;
  if (open) document.exitPointerLock?.();
  options?.onOpenChange?.(open);
  emit(open ? 'open' : 'close');
}
function captureError(error: unknown) {
  if (!options) return;
  selectTool('screenshot'); show(true);
  message(error instanceof Error ? error.message : String(error));
  fallbackAttach.hidden = false;
  if (hostComposer) {
    preview.parentElement!.hidden = true; contextInput.closest('details')!.hidden = true;
    input_.parentElement!.hidden = true; saveButton.hidden = true;
  }
}
async function handoff() {
  if (!options || !hostComposer || !image) return;
  show(false);
  await send('compose', { text: input_.value, screenshot: { image, x, y, context: contextInput.value } });
}
async function openScreenshot(input: { text?: string; context?: string; image?: string } = {}) {
  if (!options) return;
  commentMode = false; attachment = '';
  const token = generation;
  selectTool('screenshot');
  if (!hostComposer) show(true);
  if (input.image) {
    const compressed = await compress(input.image);
    if (token !== generation || !options) return;
    setImage(compressed);
  } else await capture();
  if (token !== generation || !options) return;
  if (input.text !== undefined) input_.value = input.text.slice(0, 2000);
  if (input.context !== undefined) contextInput.value = input.context.slice(0, 500);
  if (hostComposer) await handoff();
  else input_.focus();
}
function render() {
  list.replaceChildren();
  if (!doc.threads.length) list.append(el('p', 'No saved screenshots yet.'));
  for (const thread of doc.threads) {
    const item = el('article');
    const heading = el('strong', (thread.resolved ? 'Resolved · ' : '') + thread.author + ' (local identity)');
    const thumb = el('img'); thumb.src = thread.image; thumb.alt = 'Saved screenshot'; thumb.loading = 'lazy';
    const frame = el('div'); frame.className = 'shot'; frame.append(thumb);
    const marker = el('span', '1'); marker.className = 'pin'; marker.style.left = thread.x * 100 + '%'; marker.style.top = thread.y * 100 + '%'; frame.append(marker);
    item.append(heading, frame, el('p', thread.text), el('small', thread.context));
    for (const reply of thread.replies) item.append(el('p', reply.author + ': ' + reply.text));
    const reply = el('textarea'); reply.maxLength = 2000; reply.placeholder = 'Reply to this screenshot'; reply.setAttribute('aria-label', 'Reply');
    item.append(reply, button('Add reply', () => {
      if (!reply.value.trim()) return;
      if (thread.replies.length >= 100) throw new Error('Reply limit reached.');
      const next = { ...thread, replies: [...thread.replies, { id: uid(), text: reply.value.trim(), author: author.value.trim() || 'Tester', createdAt: new Date().toISOString() }] };
      doc = parseReviewDocument(JSON.stringify({ ...doc, threads: doc.threads.map(t => t.id === thread.id ? next : t) }));
      changed(); render();
    }), button('Edit', () => {
      editing = thread.id; input_.value = thread.text; contextInput.value = thread.context;
      x = thread.x; y = thread.y; setImage(thread.image); input_.focus();
    }), button(thread.resolved ? 'Reopen' : 'Resolve', () => {
      thread.resolved = !thread.resolved; changed(); render();
    }));
    list.append(item);
  }
}
/**
 * Signs the build in, showing the code and QR while the tester approves in a browser.
 *
 * The composed draft is deliberately untouched throughout: the tester pressed Post, got sent on an
 * errand, and must come back to a finished action rather than an empty form.
 */
async function pairThenRetry(): Promise<string | null> {
  const { apiBase, slug } = options!;
  if (!apiBase || !slug) return null;

  pairingAbort?.abort();
  const abort = pairingAbort = new AbortController();
  let start: PairingStart;
  try {
    start = await startPairing(apiBase, slug, navigator.userAgent.slice(0, 120));
  } catch (error) {
    message(error instanceof Error ? error.message : 'Could not start signing in.');
    return null;
  }

  showPairing(start, () => abort.abort());
  // A build that can reach a browser opens it directly on a link that already carries the code,
  // so the tester lands on one Approve button instead of typing anything.
  try { window.open(start.verificationUrl, '_blank', 'noopener,noreferrer'); } catch { /* headset, console */ }

  try {
    const token = await awaitApproval(apiBase, slug, start, abort.signal);
    storeToken(slug, token);
    return token;
  } catch (error) {
    if (!(error instanceof PairingCancelled))
      message(error instanceof Error ? error.message : 'Signing in failed.');
    return null;
  } finally {
    if (pairingAbort === abort) pairingAbort = null;
    pairingPanel.hidden = true;
  }
}

function showPairing(start: PairingStart, cancel: () => void) {
  pairingPanel.replaceChildren();
  pairingPanel.hidden = false;
  pairingPanel.append(el('strong', 'Sign in to post this'));
  pairingPanel.append(el('p', 'Approve this build in your browser, then come back. Your screenshot and comment are kept.'));
  if (start.qrSvgDataUrl) {
    const qr = el('img');
    qr.src = start.qrSvgDataUrl;
    qr.alt = 'Scan to approve on your phone';
    qr.className = 'qr';
    pairingPanel.append(qr);
  }
  const code = el('p', start.code); code.className = 'code';
  pairingPanel.append(el('small', 'Or enter this code at ' + start.verificationUrl.split('?')[0]), code);
  pairingPanel.append(button('Cancel', cancel));
}

async function save() {
  if (busy) return;
  // A message is always required; a screenshot only when this is a screenshot comment.
  if (!input_.value.trim()) throw new Error('Write a comment first: a screenshot or a log is shared with a message.');
  if (!commentMode && !image) throw new Error('Add a screenshot first.');
  busy = true; saveButton.disabled = true;
  try {
    if (!online && options!.apiBase && options!.slug) {
      const payload = {
        text: input_.value.trim(),
        ...(image ? { screenshot: { image, x, y, context: contextInput.value } } : {}),
        ...(attachment ? { console: attachment } : {}),
      };
      const serialized = JSON.stringify(payload);
      if (submission.payload !== serialized) submission = { payload: serialized, id: uid() };
      const body = { ...payload, clientId: submission.id };

      let token = storedToken(options!.slug!);
      if (!token) token = await pairThenRetry();
      if (!token) { message('Not signed in. You can still save a review file.'); return; }

      let result = await postComment(options!.apiBase!, options!.slug!, token, body);
      if (!result.ok && result.revoked) {
        // The pairing was revoked or expired. Ask once more rather than telling the tester to
        // work out what happened, then post the same held draft.
        storeToken(options!.slug!, null);
        const fresh = await pairThenRetry();
        if (fresh) result = await postComment(options!.apiBase!, options!.slug!, fresh, body);
      }
      if (!result.ok) { message(result.error ?? 'Your comment was not posted.'); return; }

      submission = { payload: '', id: '' };
      message('Posted to the prototype’s comments.');
      emit('submit', { online: true });
    } else if (online) {
      const payload = { text: input_.value.trim(), screenshot: { image, x, y, context: contextInput.value } };
      const serialized = JSON.stringify(payload);
      if (submission.payload !== serialized) submission = { payload: serialized, id: uid() };
      await send('create', { ...payload, clientId: submission.id });
      submission = { payload: '', id: '' };
      message('Posted to the prototype’s comments.');
      emit('submit', { online: true });
    } else {
      const old = doc.threads.find(t => t.id === editing);
      const thread: ReviewThread = { id: old?.id ?? uid(), author: old?.author ?? (author.value.trim() || 'Tester'),
        createdAt: old?.createdAt ?? new Date().toISOString(), text: input_.value.trim(), image, x, y,
        context: contextInput.value, resolved: old?.resolved ?? false, replies: old?.replies ?? [] };
      const next = { ...doc, threads: old ? doc.threads.map(t => t.id === old.id ? thread : t) : [...doc.threads, thread] };
      doc = parseReviewDocument(JSON.stringify(next)); changed(); render();
      message('Saved in this review. Open Review files from Feedback to export it.');
      emit('submit', { online: false });
    }
    input_.value = ''; editing = null; setImage(''); attachment = ''; showAttachment();
    if (commentMode) show(false);
  } finally { busy = false; saveButton.disabled = false; }
}
async function saveFile() {
  const text = JSON.stringify(parseReviewDocument(JSON.stringify(doc)));
  const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FileHandle> }).showSaveFilePicker;
  if (picker && window.top === window) {
    fileHandle ??= await picker({ suggestedName: 'feedback.prototir-review.json', types: [{ description: 'Prototir review', accept: { 'application/json': ['.json'] } }] });
    const writable = await fileHandle.createWritable(); await writable.write(text); await writable.close();
    message('Review file saved.');
  } else if (online) {
    await send('export', { document: doc });
    message('Review download requested.');
  } else {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = 'feedback.prototir-review.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000); message('Review downloaded. Import it to continue editing.');
  }
}
function enable(config: ReviewOptions) {
  disable();
  if (!config.project || config.project.length > 120) throw new Error('Review needs a stable project ID (1–120 characters).');
  options = config;
  doc = { format: 'prototir-review', version: 1, id: uid(), project: config.project, build: config.build ?? '', threads: [] };
  const token = generation;
  host = el('div'); host.dataset.prototirReview = 'true';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  (config.container ?? document.body).append(host); root = host.attachShadow({ mode: 'open' });
  const css = style = el('style');
  baseCss = `
    :host{font:14px/1.45 system-ui,sans-serif;color:var(--ptr-ink)}
    *{box-sizing:border-box} [hidden]{display:none!important}
    button{font:inherit;border:1px solid var(--ptr-line-strong);background:var(--ptr-surface-raised);color:var(--ptr-ink);border-radius:8px;padding:9px 12px;cursor:pointer}
    button:hover{background:var(--ptr-surface)}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--ptr-accent);outline-offset:2px}
    .launcher{position:absolute;pointer-events:auto;display:flex;flex-direction:column;align-items:stretch}
    /* "Feedback & tools": one bordered control whose tools unfold inside the same border, like the
       Prototir badge's control on an embed. No floating menu. */
    .dock{display:flex;flex-direction:column;min-width:210px;border:1px solid var(--ptr-line-strong);border-radius:12px;background:var(--ptr-surface-raised);box-shadow:0 3px 20px #0003;overflow:hidden}
    .dock-head{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:0;background:transparent;color:var(--ptr-muted);font-weight:600;text-align:left}
    .dock-head:hover{background:transparent;color:var(--ptr-ink)}
    .dock-head .dock-label{flex:1}
    .dock-head svg,.tool svg{display:block;width:16px;height:16px;flex:none}
    .dock-tools{display:grid;gap:2px;padding:6px}
    .dock-tools+.dock-head,.dock-head+.dock-tools{border-top:1px solid var(--ptr-line)}
    .tool{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;border:0;border-radius:9px;background:transparent;color:var(--ptr-ink);font-weight:600;text-align:left;padding:8px 12px}
    .tool svg{width:20px!important;height:20px!important}
    .tool .tool-state{margin-left:auto;font-weight:500;font-size:12px;color:var(--ptr-muted)}
    .tool[aria-pressed=true] .tool-state{color:var(--ptr-accent)}
    a.tool{text-decoration:none;border-radius:8px}a.tool:hover{background:var(--ptr-surface)}
    .tool-stack{position:absolute;top:16px;bottom:16px;right:16px;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;gap:12px;width:min(560px,calc(100% - 32px));pointer-events:none}
    .tool-stack.on-left{right:auto;left:16px}
    .tool-panel{pointer-events:auto;position:relative;flex:none;display:flex;flex-direction:column;background:var(--ptr-background);border:1px solid var(--ptr-line-strong);border-radius:12px;box-shadow:0 12px 40px #0005;overflow:hidden}
    .tool-panel-head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-bottom:1px solid var(--ptr-line)}
    .tool-panel-head strong{display:flex;align-items:center;gap:8px;flex:1}
    .tool-icon{width:16px;height:16px}
    .tool-panel-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;padding:8px 12px;border-top:1px solid var(--ptr-line)}.tool-panel-actions button{padding:5px 9px;font-size:12px}
    .icon-button{display:grid;place-items:center;width:30px;height:30px;padding:0}.icon-button svg{width:16px;height:16px}
    .console-panel{order:1;flex:0 1 auto;min-height:0;max-height:460px}
    .panel{z-index:2}
    .tool-panel-body{display:flex;flex-direction:column;min-height:0;flex:1}
    .console-lines{flex:1;min-height:0;overflow:auto;padding:8px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
    .console-time{color:var(--ptr-muted)}.lv-warn{color:#b7791f}.lv-error{color:#d23a3a}.lv-debug{color:var(--ptr-muted)}
    .performance-panel{order:0;align-self:flex-end;width:min(340px,100%)}
    .tool-stack.on-left .performance-panel{align-self:flex-start}
    .panel.compact{inset:auto 0;top:50%;transform:translateY(-50%);margin:0 auto;width:min(560px,calc(100% - 32px))}
    .performance-chart{display:block;width:100%;height:auto;padding:8px 12px 0}
    .performance-stats{margin:6px 12px 10px;font-size:12px;color:var(--ptr-muted)}
        .attachment-note{margin:10px 0 0;padding:8px 10px;border:1px solid var(--ptr-line);border-radius:8px;background:var(--ptr-surface);font-size:12px;color:var(--ptr-muted)}
    /* The accordion chevron: it points the way the menu opens (up from a bottom corner, down from
       a top one) and turns around while the menu is open. */
    .mark-chevron{width:16px;height:16px;flex:none;transition:transform 160ms ease;transform:rotate(180deg)}
    .launcher.at-top .mark-chevron,.dock-head[aria-expanded="true"] .mark-chevron{transform:none}
    .launcher.at-top .dock-head[aria-expanded="true"] .mark-chevron{transform:rotate(180deg)}
    .panel{pointer-events:auto;position:absolute;inset:16px;margin:auto;width:min(920px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;background:var(--ptr-background);border:1px solid var(--ptr-line);border-radius:16px;padding:20px;box-shadow:0 12px 60px #0006}
    .panel.online{width:min(640px,calc(100% - 32px))}
    .panel.online .review-submit{position:sticky;bottom:0;z-index:1;margin-top:8px;box-shadow:0 8px 0 8px var(--ptr-background)}
    .panel-close{position:absolute;top:8px;right:8px;display:grid;place-items:center;width:36px;height:36px;padding:0}
    .panel-close svg{display:block;width:18px;height:18px}
    .bar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    details{margin:12px 0}summary{cursor:pointer;color:var(--ptr-muted)}
    .context-disclosure>summary{display:flex;align-items:center;gap:6px;min-height:28px;list-style:none;border-radius:4px}
    .context-disclosure>summary::-webkit-details-marker{display:none}
    .context-disclosure>summary:hover{color:var(--ptr-ink)}
    .disclosure-chevron{display:block;width:16px;height:16px;flex:none;transition:transform 180ms cubic-bezier(.2,.8,.3,1)}
    .context-disclosure>summary[aria-expanded=true] .disclosure-chevron{transform:rotate(90deg)}
    .context-body{display:flow-root}
    @media (prefers-reduced-motion:reduce){.disclosure-chevron{transition:none}}
    h2{margin:0;padding-right:36px;font-size:22px}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:var(--ptr-muted)}
    textarea,input{font:inherit;padding:10px;border:1px solid var(--ptr-line);border-radius:7px;width:100%;background:var(--ptr-surface-raised);color:var(--ptr-ink)}
    textarea{min-height:80px;resize:vertical}label{display:block;margin-top:10px}
    .shot{position:relative;display:table;max-width:100%;margin:12px 0}.shot img{display:block;max-width:100%;max-height:420px;width:auto;height:auto}
    .panel.online .shot{margin:12px auto}.panel.online .shot img{max-height:min(38dvh,280px)}
    .pin{position:absolute;transform:translate(-50%,-50%);border-radius:50%;width:26px;height:26px;display:grid;place-items:center;background:var(--ptr-accent);color:var(--ptr-accent-ink);border:2px solid var(--ptr-background);pointer-events:none}
    article{margin-top:16px;padding-top:16px;border-top:1px solid var(--ptr-line)}article button{margin:6px 6px 0 0}
    [role=status]{min-height:24px;color:var(--ptr-muted)}
    .pairing{margin-top:14px;padding:14px;border:1px solid var(--ptr-line);border-radius:12px;background:var(--ptr-surface);display:grid;gap:8px;justify-items:start}
    .pairing .qr{width:168px;height:168px;background:#fff;border-radius:8px;padding:6px}
    .pairing .code{font:600 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;margin:0}
    @media(max-width:560px){.panel{inset:8px;width:calc(100% - 16px);max-height:calc(100% - 16px);padding:14px}}
  `;
  css.textContent = themeCss(config.theme ?? 'auto') + baseCss;
  root.append(css);
  // The way in. On Prototir the player draws its own control beside Restart and Fullscreen, so
  // a second floating button there would read as a bug; everywhere else the SDK draws the
  // Prototir mark, and that mark doubles as the menu (it is also the attribution badge).
  launcher = el('div'); launcher.className = 'launcher';
  const corner = ['bottom-left','bottom-right','top-left','top-right'].includes(config.corner ?? '') ? config.corner! : 'bottom-left';
  const offset = Math.max(8, Math.min(200, config.offset ?? 16));
  const atTop = corner.startsWith('top');
  launcher.classList.toggle('at-top', atTop);
  launcher.style.setProperty(atTop ? 'top' : 'bottom', `max(${offset}px, env(safe-area-inset-${atTop ? 'top' : 'bottom'}))`);
  launcher.style.setProperty(corner.endsWith('left') ? 'left' : 'right', offset + 'px');

  launcher.classList.toggle('at-right', corner.endsWith('right'));
  enabledTools = config.tools === false ? [] : ALL_TOOLS.filter(tool => (config.tools as Partial<Record<ReviewTool, boolean>> | undefined)?.[tool] !== false);
  if (!enabledTools.includes('console')) uninstallConsoleCapture();
  // The control: a "Feedback & tools" row that unfolds the tools inside the same border. The
  // tools sit on the side away from the edge, so the row itself never moves.
  const dock = el('div'); dock.className = 'dock';
  menu = el('div'); menu.className = 'dock-tools'; menu.hidden = true;
  menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Feedback & tools');
  mark = button('', () => setMenu(menu.hidden));
  mark.className = 'dock-head'; mark.setAttribute('aria-expanded', 'false');
  const label = el('span', 'Feedback & tools'); label.className = 'dock-label';
  mark.append(svgIcon(feedbackIcon), label, chevron());
  const tool = (name: string, icon: string[], action: () => void | Promise<void>, toggle = false) => {
    const node = button(name, action); node.className = 'tool';
    node.prepend(svgIcon(icon));
    if (toggle) { node.setAttribute('aria-pressed', 'false'); const state = el('span', 'Off'); state.className = 'tool-state'; node.append(state); }
    menu.append(node);
    return node;
  };
  toolButtons = {};
  if (enabledTools.includes('screenshot')) toolButtons.screenshot = tool('Screenshot', cameraIcon, () => { setMenu(false); void openScreenshot().catch(captureError); });
  if (enabledTools.includes('comment')) toolButtons.comment = tool('Comment', commentIcon, () => { setMenu(false); void openComment().catch(captureError); });
  if (enabledTools.includes('console')) toolButtons.console = tool('Console', terminalIcon, () => setToolPanel('console', !consolePanel, true), true);
  if (enabledTools.includes('performance')) toolButtons.performance = tool('Performance', activityIcon, () => setToolPanel('performance', !performancePanel, true), true);
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); setMenu(false); mark.focus(); } });
  if (config.prototypeUrl) {
    const link = el('a', 'Open on Prototir') as HTMLAnchorElement;
    try {
      const url = new URL(config.prototypeUrl);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('unsupported');
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'tool';
      menu.append(link);
    } catch { /* A malformed link is simply not offered. */ }
  }
  dock.append(atTop ? mark : menu, atTop ? menu : mark);
  launcher.append(dock);
  panel = el('section'); panel.className = 'panel'; panel.hidden = true; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Screenshot feedback');
  const close = button('', () => show(false)); close.className = 'panel-close';
  close.setAttribute('aria-label', 'Close feedback'); close.title = 'Close feedback';
  const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  closeIcon.setAttribute('viewBox', '0 0 24 24'); closeIcon.setAttribute('fill', 'none');
  closeIcon.setAttribute('stroke', 'currentColor'); closeIcon.setAttribute('stroke-width', '2');
  closeIcon.setAttribute('stroke-linecap', 'round'); closeIcon.setAttribute('stroke-linejoin', 'round');
  closeIcon.setAttribute('aria-hidden', 'true');
  for (const pathData of ['M18 6 6 18', 'm6 6 12 12']) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData); closeIcon.append(path);
  }
  close.append(closeIcon);
  const panelTitle = el('h2','Screenshot feedback');
  panel.append(close, panelTitle);
  const bar = el('div'); bar.className = 'bar';
  const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
  file.onchange = async () => {
    try { const selected = file.files?.[0]; if (selected) { if (selected.size > 8 * 1024 * 1024) throw new Error('Image exceeds 8 MiB.'); const token = generation; const compressed = await compress(selected); if (token !== generation || !options) return; setImage(compressed); fallbackAttach.hidden = true; if (hostComposer) await handoff(); } }
    catch (error) { message(String(error)); } finally { file.value = ''; }
  };
  panel.append(file);
  const load = el('input'); load.type = 'file'; load.accept = '.json'; load.hidden = true;
  load.onchange = async () => {
    try { const selected = load.files?.[0]; if (selected) { if (selected.size > MAX_REVIEW_BYTES) throw new Error('Review exceeds 8 MiB.'); importDocument(await selected.text()); fileHandle = null; } }
    catch(error) { message(String(error)); } finally { load.value = ''; }
  };
  bar.append(button('Import review', () => load.click()), load, button('Save review file', saveFile));
  if (config.cloudUrl) bar.append(button('Team cloud', () => {
    const url = new URL(config.cloudUrl!);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Cloud URL must use HTTPS.');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }));
  fallbackAttach = button('Attach a screenshot instead', () => file.click());
  fallbackAttach.hidden = true;
  panel.append(bar, fallbackAttach);
  const frame = el('div'); frame.className = 'shot';
  preview = el('img'); preview.alt = 'Screenshot to annotate'; preview.hidden = true;
  preview.tabIndex = 0; preview.setAttribute('role','button'); preview.setAttribute('aria-label','Place pin: click or use arrow keys');
  preview.onclick = event => {
    const rect = preview.getBoundingClientRect();
    x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)); showPin();
  };
  preview.onkeydown = event => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    x = Math.max(0,Math.min(1,x + (event.key==='ArrowRight'?.02:event.key==='ArrowLeft'?-.02:0)));
    y = Math.max(0,Math.min(1,y + (event.key==='ArrowDown'?.02:event.key==='ArrowUp'?-.02:0))); showPin();
  };
  pin = el('span','1'); pin.className = 'pin'; pin.hidden = true; frame.append(preview,pin); panel.append(frame);
  author = el('input'); author.maxLength = 80; author.value = 'Tester';
  const authorLabel = el('label','Name in exported files (unverified)'); authorLabel.append(author); panel.append(authorLabel);
  contextInput = el('input'); contextInput.maxLength = 500;
  const contextLabel = el('label','Scene / build / reproduction context'); contextLabel.append(contextInput);
  const contextDetails = el('details'); const contextSummary = el('summary','Add context (optional)');
  contextDetails.className = 'context-disclosure';
  // Lucide ChevronRight, matching the webapp's disclosure marker without a network dependency.
  toolIcon(contextSummary, ['m9 18 6-6-6-6']).classList.add('disclosure-chevron');
  contextSummary.setAttribute('aria-expanded', 'false');
  const contextBody = el('div'); contextBody.className = 'context-body'; contextBody.inert = true;
  contextBody.append(contextLabel);
  contextDetails.append(contextSummary, contextBody); panel.append(contextDetails);
  let contextExpanded = false;
  let contextAnimation: Animation | null = null;
  contextSummary.addEventListener('click', event => {
    // Native summary keyboard activation still sends a click. Keep details open during closing
    // so its body can shrink, then restore native collapsed semantics at the end.
    event.preventDefault();
    // Closed details can retain layout bounds in Chromium even though their content is hidden.
    const height = contextDetails.open ? contextBody.getBoundingClientRect().height : 0;
    const opacity = getComputedStyle(contextBody).opacity;
    contextAnimation?.cancel(); contextAnimation = null;
    contextExpanded = !contextExpanded;
    contextSummary.setAttribute('aria-expanded', String(contextExpanded));
    if (!contextExpanded && contextBody.contains(root.activeElement)) contextSummary.focus();
    contextBody.inert = !contextExpanded;
    contextDetails.open = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !contextBody.animate) {
      contextDetails.open = contextExpanded; contextBody.style.removeProperty('overflow'); return;
    }
    contextBody.style.overflow = 'hidden';
    const animation = contextAnimation = contextBody.animate([
      { height: `${height}px`, opacity: height ? opacity : '0' },
      { height: `${contextExpanded ? contextBody.scrollHeight : 0}px`, opacity: contextExpanded ? '1' : '0' }
    ], { duration: 180, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
    animation.onfinish = () => {
      if (contextAnimation !== animation) return;
      contextDetails.open = contextExpanded; contextAnimation = null; animation.cancel();
      contextBody.style.removeProperty('overflow');
    };
  });
  input_ = el('textarea'); input_.maxLength = 2000;
  const inputLabel = el('label','Your message (required)'); inputLabel.append(input_); panel.append(inputLabel);
  input_.required = true;
  attachmentNote = el('p'); attachmentNote.className = 'attachment-note'; attachmentNote.hidden = true; panel.append(attachmentNote);
  saveButton = button('Save screenshot comment', save); saveButton.className = 'review-submit'; panel.append(saveButton);
  pairingPanel = el('div'); pairingPanel.className = 'pairing'; pairingPanel.hidden = true;
  pairingPanel.setAttribute('role', 'status'); panel.append(pairingPanel);
  status = el('p'); status.setAttribute('role','status'); panel.append(status);
  list = el('div'); panel.append(list); root.append(launcher,panel);
  selectTool = tool => {
    const files = tool === 'files' && !online;
    panelTitle.textContent = files ? 'Review files' : commentMode ? 'Comment' : 'Screenshot feedback';
    panel.classList.toggle('compact', commentMode && !files);
    bar.hidden = !files; authorLabel.hidden = !files; list.hidden = !files;
    frame.hidden = files || commentMode; contextDetails.hidden = files || commentMode; inputLabel.hidden = files;
    saveButton.hidden = files; fallbackAttach.hidden = true;
    saveButton.textContent = online || connected() ? 'Post comment' : 'Save screenshot comment';
    showAttachment();
  };
  selectTool('screenshot');
  // Do not let game keyboard handlers consume review text.
  for (const type of ['keydown','keyup','keypress','pointerdown','pointerup','click']) root.addEventListener(type,event => event.stopPropagation());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); show(false); if (!launcher.hidden) mark.focus(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]),textarea,[tabindex="0"],summary')).filter(node => !node.closest('[hidden],[inert]') && node.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  render();
  void draftStore().then(value => { if (token === generation && value && !dirty) { doc = parseReviewDocument(JSON.stringify(value)); render(); } }).catch(() => {});
  try {
    hostOrigin = resolveHostOrigin('');
  } catch { hostOrigin = ''; }
  window.addEventListener('message',receive);
  // Off Prototir the build's own call is the last word. On Prototir the dashboard wins, so a
  // creator can switch feedback off live without shipping a new build.
  applyLauncher(config.launcher ?? 'auto', false);
  if (hostOrigin && window.parent !== window) void send('hello', { tools: enabledTools }).then((value: { mode?: string; launcher?: string; composer?: string; composerOpen?: boolean } | undefined) => {
    if (token !== generation) return;
    if (value?.mode === 'disabled') { disable(); return; }
    online = true; hostComposer = value?.composer === 'host';
    if (hostComposer) {
      const wasOpen = opened; show(false); hostState(value?.composerOpen === true);
      if (wasOpen) void (image ? handoff() : openScreenshot()).catch(captureError);
    }
    saveButton.textContent = 'Post to comments';
    panel.classList.add('online'); selectTool('screenshot');
    // The host knows its own live tokens, so the panel can match the page it floats over at no
    // network cost. Values are colour-validated before reaching the stylesheet.
    const hostTheme = sanitizeTheme((value as { theme?: unknown } | undefined)?.theme);
    if (Object.keys(hostTheme).length) style.textContent = themeCss(config.theme ?? 'auto', hostTheme) + baseCss;
    applyLauncher(config.launcher ?? 'auto', value?.launcher !== 'sdk');
    message('Screenshot comments are visible to everyone who can access this prototype.');
  }).catch(() => message('Local review mode. Save a file to share feedback.'));
}
function importDocument(text: string) {
  const imported = parseReviewDocument(text);
  if (options && imported.project !== options.project) throw new Error('This review belongs to a different project.');
  doc = imported; changed(); render();
  message('Imported review. Local author names are unverified; build: ' + doc.build);
}
function disable() {
  generation++;
  if (opened || hostOpened) options?.onOpenChange?.(false);
  if (typeof window !== 'undefined') window.removeEventListener('message',receive);
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error('Review closed.')); }
  closeConsolePanel(); closePerformancePanel(); toolStack = null;
  requests.clear(); host?.remove(); options = null; online = false; hostComposer = false; hostOpened = false; opened = false; image = ''; editing = null; fileHandle = null; dirty = false; busy = false;
}
export type ReviewEvent = 'open' | 'close' | 'submit' | 'error';

/**
 * Turns feedback on without the creator writing anything, when the host has told the frame which
 * prototype it is showing.
 *
 * Adding the SDK used to give you nothing here: `enable()` had to be called with a project id,
 * and a creator who never called it had no feedback entry point at all and no sign that one was
 * missing. Hosted on Prototir the id is knowable, so the sensible default is on.
 *
 * Deliberately silent and deliberately last: an explicit `enable()` from the build replaces this
 * wholesale, because `enable()` disables whatever came before it.
 */
function enableFromHost() {
  if (options) return; // The build already asked for something specific.
  const project = resolveHostProject();
  if (!project) return; // Self-hosted, or a host that does not say. Opt-in as before.
  try {
    enable({ project });
  } catch {
    // Never let a default get in the way of the game starting.
  }
}

if (typeof window !== 'undefined') {
  // Not before there is a body to attach to. This SDK is normally loaded from <head> with no
  // `defer`, so on a microtask `document.body` is still null and `enable()` dies half-built: it
  // has already set `options` and `doc` by then, so the SDK looks enabled while no overlay
  // exists and the hello that makes the host show its own Feedback control is never sent. The
  // symptom is a page reporting feedback as on with no way to reach it.
  //
  // Still deferred rather than immediate, so a build calling enable() in its own top-level code
  // wins without this one being built and torn down first.
  const start = () => {
    void Promise.resolve().then(enableFromHost);
  };
  if (typeof document === 'undefined') {
    // Nothing to draw into and no event that will say otherwise.
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

export const review = {
  enable, disable,
  open: () => { if (options && connected()) { if (hostComposer) void openScreenshot().catch(captureError); else { selectTool('screenshot'); show(true); } } },
  importDocument,
  exportDocument: () => JSON.stringify(parseReviewDocument(JSON.stringify(doc))),
  /** Engine adapters can submit an end-of-frame screenshot without JS evaluation. */
  attach: async (data: string) => openScreenshot({ image: data }),

  /**
   * Takes a screenshot now and opens the composer. Bind it to a key, or call it the moment the
   * game notices its own failure, so a tester is handed a report instead of having to file one.
   */
  capture: async () => { if (connected()) await openScreenshot(); },

  /**
   * Opens the composer already filled in. `image` accepts a PNG/JPEG/WebP data URL for cases
   * where the game has a better frame than a live capture would give (the frame before a crash,
   * a rendered diff); without it the current view is captured.
   */
  compose: async (input: { text?: string; context?: string; image?: string } = {}) => openScreenshot(input),

  /** Opens a comment without a screenshot. */
  comment: async () => openComment(),

  /** Shows or hides the Console or Performance panel. */
  tool: (tool: 'console' | 'performance', on: boolean) => setToolPanel(tool, on, true),

  /** The recorded console as plain text (the last ~300 entries). */
  consoleText: () => consoleText(),

  /** Subscribes to overlay events. Returns an unsubscribe function. */
  on: (event: ReviewEvent, handler: (detail?: unknown) => void) => {
    const set = listeners.get(event) ?? new Set();
    set.add(handler); listeners.set(event, set);
    return () => { set.delete(handler); };
  }
};
