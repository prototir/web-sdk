export const REVIEW_FORMAT = 'prototir-review';
export const MAX_REVIEW_BYTES = 8 * 1024 * 1024;
export interface ReviewNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}
export interface ReviewThread extends ReviewNote {
  image: string;
  x: number;
  y: number;
  context: string;
  resolved: boolean;
  replies: ReviewNote[];
}
export interface ReviewDocument {
  format: typeof REVIEW_FORMAT;
  version: 1;
  id: string;
  project: string;
  build: string;
  threads: ReviewThread[];
}

/** Data-only format. Never accepts remote image URLs or executable imported HTML. */
export function parseReviewDocument(input: string): ReviewDocument {
  if (new TextEncoder().encode(input).length > MAX_REVIEW_BYTES) throw new Error('Review exceeds 8 MiB.');
  const data = JSON.parse(input);
  const string = (v: unknown, max: number, name: string): string => {
    if (typeof v !== 'string' || v.length > max) throw new Error(`Invalid ${name}.`);
    return v;
  };
  const id = (v: unknown) => {
    const value = string(v, 64, 'ID');
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) throw new Error('Invalid ID.');
    return value;
  };
  const seen = new Set<string>();
  const note = (v: any): ReviewNote => {
    const key = id(v?.id);
    if (seen.has(key)) throw new Error('Duplicate note ID.');
    seen.add(key);
    const createdAt = string(v.createdAt, 40, 'date');
    if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid date.');
    const text = string(v.text, 2000, 'comment');
    if (!text.trim()) throw new Error('Comment cannot be empty.');
    return { id: key, text, author: string(v.author, 80, 'author'), createdAt };
  };
  if (data?.format !== REVIEW_FORMAT || data.version !== 1 || !Array.isArray(data.threads) || data.threads.length > 100)
    throw new Error('Unsupported review format or too many screenshots (maximum 100).');
  if (!string(data.project, 120, 'project').trim()) throw new Error('Project is required.');
  return {
    format: REVIEW_FORMAT, version: 1, id: id(data.id),
    project: string(data.project, 120, 'project'), build: string(data.build, 120, 'build'),
    threads: data.threads.map((thread: any) => {
      const base = note(thread);
      const image = string(thread.image, 1_400_000, 'image');
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('Invalid screenshot.');
      if (![thread.x, thread.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1))
        throw new Error('Invalid screenshot pin.');
      if (!Array.isArray(thread.replies) || thread.replies.length > 100 || typeof thread.resolved !== 'boolean')
        throw new Error('Invalid thread.');
      return { ...base, image, x: thread.x, y: thread.y, context: string(thread.context, 500, 'context'),
        resolved: thread.resolved, replies: thread.replies.map(note) };
    })
  };
}
