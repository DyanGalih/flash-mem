let toonModulePromise: Promise<typeof import('@toon-format/toon')> | null = null;

async function loadToonModule(): Promise<typeof import('@toon-format/toon')> {
  if (!toonModulePromise) {
    toonModulePromise = import('@toon-format/toon');
  }

  return toonModulePromise;
}

export async function encodeToon(value: unknown): Promise<string> {
  const { encode } = await loadToonModule();
  return encode(value);
}

export async function decodeToon<T = unknown>(value: string): Promise<T> {
  const { decode } = await loadToonModule();
  return decode(value, { strict: true }) as T;
}
