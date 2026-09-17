import { resolveHostOrigin } from './host-origin';
import { sanitizeTheme, themeCss } from './theme';
import { awaitApproval, PairingCancelled, postComment, startPairing, storeToken, storedToken, type PairingStart } from './pairing';
import { MAX_REVIEW_BYTES, parseReviewDocument, type ReviewDocument, type ReviewThread } from './review-document';

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
let list: HTMLElement;
let status: HTMLElement;
let preview: HTMLImageElement;
let pin: HTMLElement;
let input_: HTMLTextAreaElement;
let author: HTMLInputElement;
let contextInput: HTMLInputElement;
let saveButton: HTMLButtonElement;
let image = '';
let x = .5, y = .5;
let editing: string | null = null;
let fileHandle: FileHandle | null = null;
let online = false;
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
const button = (text: string, action: () => void | Promise<void>) => {
  const node = el('button', text); node.type = 'button';
  node.onclick = () => void Promise.resolve().then(action).catch(error => message(error instanceof Error ? error.message : String(error)));
  return node;
};
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
    if (m.op === 'open' && options) show(true);
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
  if (open) (menu.querySelector('button, a') as HTMLElement | null)?.focus();
}

/**
 * Decides whether the SDK draws its own way in. `hostClaims` is true when the Prototir player
 * has said it renders the control itself, which it does so the entry point sits with Restart
 * and Fullscreen rather than floating separately over the same view.
 */
function applyLauncher(mode: 'auto' | 'watermark' | 'host', hostClaims: boolean) {
  if (!launcher) return;
  const hidden = mode === 'host' || (mode === 'auto' && hostClaims);
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
  contextInput.value = (options.context?.() ?? '').slice(0, 500);
  message('Check the screenshot, click to place its pin, and write your comment.');
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
  if (!image || !input_.value.trim()) throw new Error('Add a screenshot and a comment first.');
  busy = true; saveButton.disabled = true;
  try {
    if (!online && options!.apiBase && options!.slug) {
      const payload = { text: input_.value.trim(), screenshot: { image, x, y, context: contextInput.value } };
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
      message('Saved in this review. Export the file to share it.');
      emit('submit', { online: false });
    }
    input_.value = ''; editing = null; setImage('');
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
    button:hover{background:var(--ptr-surface)}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--ptr-accent);outline-offset:2px}
    .launcher{position:absolute;pointer-events:auto;display:flex;flex-direction:column;align-items:stretch}
    .mark{display:inline-flex;align-items:center;gap:8px;background:var(--ptr-accent);color:var(--ptr-accent-ink);box-shadow:0 3px 20px #0004;border-color:var(--ptr-accent)}
    .mark:hover{filter:brightness(1.08)}
    .mark-dot{width:18px;height:18px;border-radius:6px;background:var(--ptr-accent-ink);opacity:.9;flex:none}
    .menu{position:absolute;left:0;min-width:max(230px,100%);display:flex;flex-direction:column;gap:6px;background:var(--ptr-background);border:1px solid var(--ptr-line);border-radius:12px;padding:8px;box-shadow:0 12px 40px #0005;transform-origin:var(--ptr-menu-origin);transition:transform 160ms cubic-bezier(.2,.8,.3,1),opacity 120ms ease}
    /* Grows out of the mark, away from the edge it sits on, so the trigger never moves and the
       motion reads as the panel unfolding from the badge rather than appearing over the game. */
    .menu[hidden]{display:flex!important;opacity:0;pointer-events:none;transform:translateY(var(--ptr-menu-shift)) scaleY(.96)}
    .menu:not([hidden]){opacity:1;transform:none}
    @media (prefers-reduced-motion:reduce){.menu{transition:none}.menu[hidden]{display:none!important}}
    .menu button,.menu a{width:100%;text-align:left;text-decoration:none;display:block}
    .menu a{font:inherit;border:1px solid var(--ptr-line-strong);background:var(--ptr-surface-raised);color:var(--ptr-ink);border-radius:8px;padding:9px 12px}
    .menu a:hover{background:var(--ptr-surface)}
    .panel{pointer-events:auto;position:absolute;inset:16px;margin:auto;width:min(920px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;background:var(--ptr-background);border:1px solid var(--ptr-line);border-radius:16px;padding:20px;box-shadow:0 12px 60px #0006}
    .bar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    h2{margin:0;font-size:22px}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:var(--ptr-muted)}
    textarea,input{font:inherit;padding:10px;border:1px solid var(--ptr-line);border-radius:7px;width:100%;background:var(--ptr-surface-raised);color:var(--ptr-ink)}
    textarea{min-height:80px;resize:vertical}label{display:block;margin-top:10px}
    .shot{position:relative;display:table;max-width:100%;margin:12px 0}.shot img{display:block;max-width:100%;max-height:420px;width:auto;height:auto}
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
  launcher.style.setProperty(atTop ? 'top' : 'bottom', `max(${offset}px, env(safe-area-inset-${atTop ? 'top' : 'bottom'}))`);
  launcher.style.setProperty(corner.endsWith('left') ? 'left' : 'right', offset + 'px');

  // The menu grows away from the mark so the trigger stays visible and the opposite edge, where
  // games put their HUD, stays clear.
  menu = el('div'); menu.className = 'menu'; menu.hidden = true;
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Prototir feedback');
  const mark = button('Feedback', () => setMenu(menu.hidden));
  mark.className = 'mark'; mark.setAttribute('aria-haspopup', 'menu');
  const dot = el('span'); dot.className = 'mark-dot'; dot.setAttribute('aria-hidden', 'true');
  mark.prepend(dot);
  menu.append(
    button('Screenshot & comment', () => { setMenu(false); show(true); void capture().catch(error => message(String(error))); }),
    button('Comments', async () => { setMenu(false); if (online) await send('browse'); else { show(true); list.scrollIntoView({ block: 'start' }); } })
  );
  if (config.prototypeUrl) {
    const link = el('a', 'Open on Prototir') as HTMLAnchorElement;
    try {
      const url = new URL(config.prototypeUrl);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('unsupported');
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      menu.append(link);
    } catch { /* A malformed link is simply not offered. */ }
  }
  // Anchored to the mark: opens downward from a top corner, upward from a bottom one.
  menu.style.setProperty('--ptr-menu-origin', atTop ? 'top center' : 'bottom center');
  menu.style.setProperty('--ptr-menu-shift', atTop ? '-8px' : '8px');
  menu.style.setProperty(atTop ? 'top' : 'bottom', 'calc(100% + 8px)');
  launcher.append(atTop ? mark : menu, atTop ? menu : mark);
  panel = el('section'); panel.className = 'panel'; panel.hidden = true; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Screenshot feedback');
  panel.append(el('h2','Screenshot feedback'));
  const bar = el('div'); bar.className = 'bar';
  bar.append(button('Close', () => show(false)), button('Capture view', capture));
  const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
  file.onchange = async () => {
    try { const selected = file.files?.[0]; if (selected) { if (selected.size > 8 * 1024 * 1024) throw new Error('Image exceeds 8 MiB.'); setImage(await compress(selected)); } }
    catch (error) { message(String(error)); } finally { file.value = ''; }
  };
  bar.append(button('Attach screenshot', () => file.click()), file);
  const load = el('input'); load.type = 'file'; load.accept = '.json'; load.hidden = true;
  load.onchange = async () => {
    try { const selected = load.files?.[0]; if (selected) { if (selected.size > MAX_REVIEW_BYTES) throw new Error('Review exceeds 8 MiB.'); importDocument(await selected.text()); fileHandle = null; } }
    catch(error) { message(String(error)); } finally { load.value = ''; }
  };
  bar.append(button('Import review', () => load.click()), load, button('Save review file', saveFile));
  const browse = button('Browse comments', async () => { if (online) await send('browse'); else list.scrollIntoView({ block:'start' }); });
  bar.append(browse);
  if (config.cloudUrl) bar.append(button('Team cloud', () => {
    const url = new URL(config.cloudUrl!);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Cloud URL must use HTTPS.');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }));
  panel.append(bar);
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
  const contextLabel = el('label','Scene / build / reproduction context'); contextLabel.append(contextInput); panel.append(contextLabel);
  input_ = el('textarea'); input_.maxLength = 2000;
  const inputLabel = el('label','Comment'); inputLabel.append(input_); panel.append(inputLabel);
  saveButton = button('Save screenshot comment', save); panel.append(saveButton);
  pairingPanel = el('div'); pairingPanel.className = 'pairing'; pairingPanel.hidden = true;
  pairingPanel.setAttribute('role', 'status'); panel.append(pairingPanel);
  status = el('p'); status.setAttribute('role','status'); panel.append(status);
  list = el('div'); panel.append(list); root.append(launcher,panel);
  // Do not let game keyboard handlers consume review text.
  for (const type of ['keydown','keyup','keypress','pointerdown','pointerup','click']) root.addEventListener(type,event => event.stopPropagation());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); show(false); mark.focus(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]),textarea,[tabindex="0"]')).filter(node => !node.hidden);
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
  if (hostOrigin && window.parent !== window) void send('hello').then((value: { mode?: string; launcher?: string } | undefined) => {
    if (token !== generation) return;
    if (value?.mode === 'disabled') { disable(); return; }
    online = true; saveButton.textContent = 'Post to comments';
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
  if (opened) options?.onOpenChange?.(false);
  if (typeof window !== 'undefined') window.removeEventListener('message',receive);
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error('Review closed.')); }
  requests.clear(); host?.remove(); options = null; online = false; opened = false; image = ''; editing = null; fileHandle = null; dirty = false; busy = false;
}
export type ReviewEvent = 'open' | 'close' | 'submit' | 'error';

export const review = {
  enable, disable,
  open: () => { if (options) show(true); },
  importDocument,
  exportDocument: () => JSON.stringify(parseReviewDocument(JSON.stringify(doc))),
  /** Engine adapters can submit an end-of-frame screenshot without JS evaluation. */
  attach: async (data: string) => { if (options) { setImage(await compress(data)); show(true); } },

  /**
   * Takes a screenshot now and opens the composer. Bind it to a key, or call it the moment the
   * game notices its own failure, so a tester is handed a report instead of having to file one.
   */
  capture: async () => { if (!options) return; show(true); await capture(); },

  /**
   * Opens the composer already filled in. `image` accepts a PNG/JPEG/WebP data URL for cases
   * where the game has a better frame than a live capture would give (the frame before a crash,
   * a rendered diff); without it the current view is captured.
   */
  compose: async (input: { text?: string; context?: string; image?: string } = {}) => {
    if (!options) return;
    show(true);
    if (input.image) setImage(await compress(input.image));
    else await capture();
    if (input.text !== undefined) input_.value = input.text.slice(0, 2000);
    // A caller-supplied context replaces the `context` callback's value for this one report.
    if (input.context !== undefined) contextInput.value = input.context.slice(0, 500);
    input_.focus();
  },

  /** Subscribes to overlay events. Returns an unsubscribe function. */
  on: (event: ReviewEvent, handler: (detail?: unknown) => void) => {
    const set = listeners.get(event) ?? new Set();
    set.add(handler); listeners.set(event, set);
    return () => { set.delete(handler); };
  }
};
