export type WeightedScoreItem = {
  value: number;
  weight: number;
};

export type BucketThreshold = {
  at: number;
  label: string;
};

export function weightedScore(items: WeightedScoreItem[]): number {
  const totalWeight = sumWeights(items);
  if (totalWeight === 0) {
    return 0;
  }

  return items.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

export function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return clampMax(clampMin((value - min) / (max - min), 0), 1);
}

export function clampMin(value: number, min: number): number {
  return Math.max(value, min);
}

export function clampMax(value: number, max: number): number {
  return Math.min(value, max);
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function sumWeights(items: WeightedScoreItem[]): number {
  return items.reduce((total, item) => total + item.weight, 0);
}

export function bucketize(value: number, thresholds: BucketThreshold[], defaultLabel: string): string {
  const matchingThreshold = [...thresholds]
    .sort((left, right) => left.at - right.at)
    .filter((threshold) => value >= threshold.at)
    .at(-1);

  return matchingThreshold?.label ?? defaultLabel;
}
