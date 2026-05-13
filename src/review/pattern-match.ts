import type { Finding, FindingSeverity } from "../artifacts/review.js";

type UnknownRecord = Record<string, unknown>;

const ARRAY_LOCATION_PATTERN = /^(?:(?<artifact>[A-Za-z0-9_-]+)\.)?(?<arrayPath>[A-Za-z0-9_.-]+)\[(?<index>\d+)\](?:\.(?<fieldPath>.*))?$/;

export function findSameClassInstances(criticalFinding: Finding, artifact: unknown): Finding[] {
  if (criticalFinding.severity !== "critical") {
    return [];
  }

  const match = ARRAY_LOCATION_PATTERN.exec(criticalFinding.location);
  const groups = match?.groups;
  if (groups === undefined) {
    return [];
  }

  const arrayPath = groups.arrayPath;
  const originalIndex = Number(groups.index);
  const fieldPath = groups.fieldPath ?? "";
  const arrayValue = valueAtPath(artifact, arrayPath);
  if (!Array.isArray(arrayValue)) {
    return [];
  }

  const originalItem = arrayValue[originalIndex];
  return arrayValue.flatMap((candidate, candidateIndex) => {
    if (candidateIndex === originalIndex) {
      return [];
    }

    if (!matchesSameDefectClass(originalItem, candidate, fieldPath)) {
      return [];
    }

    const location = `${groups.artifact === undefined ? "" : `${groups.artifact}.`}${arrayPath}[${candidateIndex}]${
      fieldPath.length > 0 ? `.${fieldPath}` : ""
    }`;

    return [sameClassFinding(criticalFinding, location, fieldPath)];
  });
}

function matchesSameDefectClass(originalItem: unknown, candidate: unknown, fieldPath: string): boolean {
  if (hasInvalidTiming(originalItem)) {
    return hasInvalidTiming(candidate);
  }

  if (fieldPath.length === 0) {
    return false;
  }

  const originalValue = valueAtPath(originalItem, fieldPath);
  if (!isMissingValue(originalValue)) {
    return false;
  }

  return isMissingValue(valueAtPath(candidate, fieldPath));
}

function sameClassFinding(original: Finding, location: string, fieldPath: string): Finding {
  return {
    severity: original.severity as FindingSeverity,
    title: `${original.title} (same-class follow-up)`,
    location,
    description: `${original.description} Same-class scan found another instance at ${location}.`,
    proposed_fix:
      fieldPath.length > 0
        ? `At ${location}, add a valid "${fieldPath}" value matching the same schema rule before checkpointing.`
        : `At ${location}, set end_s to a value greater than start_s by at least 0.1 seconds before checkpointing.`,
    status: "pending",
  };
}

function hasInvalidTiming(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.start_s === "number" && typeof value.end_s === "number" && value.end_s <= value.start_s;
}

function valueAtPath(value: unknown, path: string): unknown {
  if (path.length === 0) {
    return value;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function isMissingValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
