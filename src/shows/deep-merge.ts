type DeepMergeObjectOverride<T> = {
  [K in keyof T]?: DeepMergeOverride<T[K]> | null;
} & Record<string, unknown>;

export type DeepMergeOverride<T> =
  T extends readonly unknown[]
    ? T | null | undefined
    : T extends object
      ? DeepMergeObjectOverride<T> | null | undefined
      : T | null | undefined;

type PlainObject = Record<string, unknown>;

export function deepMerge<T>(base: T, overrides: DeepMergeOverride<T>): T {
  return mergeValue(base, overrides) as T;
}

function mergeValue(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return cloneValue(base);
  }

  if (override === null) {
    return undefined;
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const result: PlainObject = cloneValue(base) as PlainObject;

    for (const [key, overrideValue] of Object.entries(override)) {
      if (overrideValue === undefined) {
        continue;
      }

      if (overrideValue === null) {
        delete result[key];
        continue;
      }

      result[key] = mergeValue(result[key], overrideValue);
    }

    return result;
  }

  return cloneValue(override);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
    );
  }

  return value;
}

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
