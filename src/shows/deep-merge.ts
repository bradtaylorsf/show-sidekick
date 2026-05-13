type JsonObject = Record<string, unknown>;

export function deepMerge<T>(base: T, overrides: unknown): T {
  return mergeValue(base, overrides) as T;
}

function mergeValue(base: unknown, overrides: unknown): unknown {
  if (overrides === null) {
    return undefined;
  }

  if (Array.isArray(overrides)) {
    return [...overrides];
  }

  if (isPlainObject(base) && isPlainObject(overrides)) {
    const merged: JsonObject = { ...base };

    for (const [key, overrideValue] of Object.entries(overrides)) {
      const nextValue = mergeValue(merged[key], overrideValue);

      if (nextValue === undefined && overrideValue === null) {
        delete merged[key];
      } else {
        merged[key] = nextValue;
      }
    }

    return merged;
  }

  if (isPlainObject(overrides)) {
    return mergeValue({}, overrides);
  }

  if (overrides === undefined) {
    return cloneValue(base);
  }

  return overrides;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
  }

  return value;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
