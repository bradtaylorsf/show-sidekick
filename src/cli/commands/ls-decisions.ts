import type { DecisionEntry, DecisionLog } from "../../artifacts/decision-log.js";
import { readDecisionLog } from "../../decisions/store.js";
import type { CliIo, GlobalOptions } from "./stub.js";

const TABLE_COLUMNS = [
  { key: "stage", label: "stage", width: 10 },
  { key: "id", label: "id", width: 24 },
  { key: "category", label: "category", width: 28 },
  { key: "picked", label: "picked", width: 18 },
  { key: "confidence", label: "confidence", width: 10 },
  { key: "reason", label: "reason", width: 46 },
] as const;

export async function lsDecisions(target: string, options: GlobalOptions, io: CliIo): Promise<void> {
  const log = await readDecisionLog(target);

  if (options.json === true) {
    writeNdjson(log, io);
    return;
  }

  io.stdout.write(renderDecisionTable(log));
}

export function renderDecisionTable(log: DecisionLog): string {
  if (log.length === 0) {
    return "No decisions recorded.\n";
  }

  const header = TABLE_COLUMNS.map((column) => pad(column.label, column.width)).join("  ");
  const divider = TABLE_COLUMNS.map((column) => "-".repeat(column.width)).join("  ");
  const rows = log.map((decision) =>
    TABLE_COLUMNS.map((column) => pad(decisionCell(decision, column.key), column.width)).join("  "),
  );

  return [header, divider, ...rows].join("\n").concat("\n");
}

function writeNdjson(log: DecisionLog, io: CliIo): void {
  for (const decision of log) {
    io.stdout.write(`${JSON.stringify(decision)}\n`);
  }
}

function decisionCell(decision: DecisionEntry, key: (typeof TABLE_COLUMNS)[number]["key"]): string {
  switch (key) {
    case "stage":
      return decision.stage;
    case "id":
      return decision.id;
    case "category":
      return decision.category;
    case "picked":
      return decision.picked;
    case "confidence":
      return decision.confidence.toFixed(2);
    case "reason":
      return truncate(decision.reason, 46);
  }
}

function pad(value: string, width: number): string {
  const clipped = truncate(value, width);
  return clipped.padEnd(width, " ");
}

function truncate(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }

  return `${value.slice(0, Math.max(0, width - 3))}...`;
}
