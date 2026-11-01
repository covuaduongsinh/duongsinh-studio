/** Reading rows the query builder answers loosely typed: each dialect has its own ideas of booleans, dates and JSON. */
export type Row = Record<string, unknown>;

export const str = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  )
    return String(value);
  return value instanceof Date ? value.toISOString() : '';
};

export const strOrNull = (value: unknown): string | null =>
  value == null ? null : str(value);

export const num = (value: unknown, fallback = 0): number => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number)
    ? number
    : fallback;
};

export const bool = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

export const iso = (value: unknown): string | null => {
  if (value == null || value === '') return null;
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === 'number' ? value : str(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const json = (value: unknown): unknown => {
  if (typeof value !== 'string') return value ?? null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
};

export const strings = (value: unknown): string[] => {
  const parsed = json(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
};
