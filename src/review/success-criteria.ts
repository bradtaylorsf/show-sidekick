import type { Finding } from "../artifacts/review.js";

export type SuccessCriteriaResult = {
  findings: Finding[];
  met: number;
  total: number;
};

type UnknownRecord = Record<string, unknown>;

const COMPARISON_PATTERN = /^(>=|<=|>|<|==|=|!=)\s*(-?\d+(?:\.\d+)?)$/;

export function evaluateSuccessCriteria(criteria: unknown[], artifact: unknown, stageSlug = "artifact"): SuccessCriteriaResult {
  const findings: Finding[] = [];
  let met = 0;
  let total = 0;

  criteria.forEach((criterion, criterionIndex) => {
    if (!isRecord(criterion)) {
      return;
    }

    Object.entries(criterion).forEach(([field, expectation]) => {
      total += 1;
      const actual = resolveMetric(artifact, field);
      const satisfied = evaluatePredicate(actual, expectation);

      if (satisfied) {
        met += 1;
        return;
      }

      const location = `${stageSlug}.success_criteria[${criterionIndex}].${field}`;
      findings.push({
        severity: "critical",
        title: `Success criterion unmet: ${field}`,
        location,
        description: `Expected ${field} to satisfy ${String(expectation)}, but found ${formatActual(actual)}.`,
        proposed_fix: `Update ${stageSlug} so ${field} satisfies "${String(expectation)}"; current value is ${formatActual(
          actual,
        )} at success_criteria[${criterionIndex}].`,
        status: "pending",
      });
    });
  });

  return { findings, met, total };
}

function evaluatePredicate(actual: unknown, expectation: unknown): boolean {
  if (typeof expectation === "string") {
    const match = COMPARISON_PATTERN.exec(expectation.trim());
    if (match !== null) {
      const [, operator, expectedText] = match;
      const actualNumber = numericValue(actual);
      const expectedNumber = Number(expectedText);

      if (actualNumber === undefined) {
        return false;
      }

      switch (operator) {
        case ">=":
          return actualNumber >= expectedNumber;
        case "<=":
          return actualNumber <= expectedNumber;
        case ">":
          return actualNumber > expectedNumber;
        case "<":
          return actualNumber < expectedNumber;
        case "==":
        case "=":
          return actualNumber === expectedNumber;
        case "!=":
          return actualNumber !== expectedNumber;
        default:
          return false;
      }
    }
  }

  return actual === expectation;
}

function resolveMetric(artifact: unknown, field: string): unknown {
  const directValue = valueAtPath(artifact, field);
  if (directValue !== undefined) {
    return Array.isArray(directValue) ? directValue.length : directValue;
  }

  if (!field.endsWith("_count") || !isRecord(artifact)) {
    return undefined;
  }

  const prefix = field.slice(0, -"_count".length);
  const matchingArray = Object.entries(artifact).find(
    ([key, value]) => key.startsWith(prefix) && Array.isArray(value),
  );

  if (matchingArray === undefined || !Array.isArray(matchingArray[1])) {
    return undefined;
  }

  return matchingArray[1].length;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  return undefined;
}

function formatActual(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  return JSON.stringify(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
