import type { Printed } from './process.ts';

/** Only the installed instrument names a view's identity and the result bound to it. */
export const readingOf = (printed: Printed | undefined, view: string, expected?: string): { readonly identity: string; readonly text?: string } | { readonly refused: string } => {
  if (!printed || printed.code !== 0) return { refused: printed?.refusal?.['code'] ?? 'reading-identity/unavailable' };
  try {
    const value = printed.out.length === 1 ? JSON.parse(printed.out[0]!) as Record<string, unknown> : undefined;
    if (value?.['kind'] !== 'fact' || value['view'] !== view || typeof value['identity'] !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value['identity']) || (expected !== undefined && (value['identity'] !== expected || typeof value['text'] !== 'string'))) return { refused: 'reading-identity/context' };
    return { identity: value['identity'], ...(expected === undefined ? {} : { text: value['text'] as string }) };
  } catch { return { refused: 'reading-identity/format' }; }
};
