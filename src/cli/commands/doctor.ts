import type { Command } from "commander";
import { getProviderProfile, PAID_DEMO_PROFILE, providerProfileNames, type ProviderProfile } from "../../providers/profiles.js";
import { probe, Registry, type Availability, type Integration } from "../../registry/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

export type DoctorDeps = {
  createRegistry: () => Promise<Registry>;
  probeIntegration: (integration: Integration) => Promise<Availability>;
};

type DoctorOptions = GlobalOptions & {
  profile?: string;
};

type DoctorStatus = "ok" | "missing";

type DoctorRow = {
  event: "doctor";
  profile: string;
  check: string;
  description: string;
  status: DoctorStatus;
  reason?: string;
  setup?: string;
  tools: string[];
};

const defaultDeps: DoctorDeps = {
  createRegistry: createDefaultRegistry,
  probeIntegration: (integration) => probe(integration),
};

export function createDoctorHandler(io: CliIo, deps: DoctorDeps = defaultDeps) {
  return async (command: Command): Promise<void> => {
    const options = command.optsWithGlobals<DoctorOptions>();
    const profile = resolveProfile(options.profile);
    const registry = await deps.createRegistry();
    const rows = await checkProfile(profile, registry, deps);

    if (options.json === true) {
      for (const row of rows) {
        io.stdout.write(`${JSON.stringify(row)}\n`);
      }
      return;
    }

    io.stdout.write(formatHuman(profile, rows));
  };
}

async function createDefaultRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

function resolveProfile(slug: string | undefined = PAID_DEMO_PROFILE.slug): ProviderProfile {
  const profile = getProviderProfile(slug);
  if (profile !== undefined) {
    return profile;
  }

  throw new Error(`unknown provider profile "${slug}"; expected one of: ${providerProfileNames().join(", ")}`);
}

async function checkProfile(profile: ProviderProfile, registry: Registry, deps: DoctorDeps): Promise<DoctorRow[]> {
  const rows: DoctorRow[] = [];

  for (const check of profile.checks) {
    const missingTools = check.tool_names.filter((toolName) => registry.get(toolName) === undefined);
    if (missingTools.length > 0) {
      rows.push({
        event: "doctor",
        profile: profile.slug,
        check: check.label,
        description: check.description,
        status: "missing",
        reason: `unregistered tool: ${missingTools.join(", ")}`,
        setup: "Refresh the installed harness cache with `predit update`.",
        tools: check.tool_names,
      });
      continue;
    }

    let availability: Availability;
    try {
      availability = await deps.probeIntegration(check.integration);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      availability = { available: false, reason: `probe failed: ${message}`, fix: "manual" };
    }

    rows.push({
      event: "doctor",
      profile: profile.slug,
      check: check.label,
      description: check.description,
      status: availability.available ? "ok" : "missing",
      ...(availability.available ? {} : { reason: availability.reason, setup: check.setup }),
      tools: check.tool_names,
    });
  }

  return rows;
}

function formatHuman(profile: ProviderProfile, rows: DoctorRow[]): string {
  const lines = [`doctor: ${profile.slug} provider profile`, profile.description, ""];

  for (const row of rows) {
    lines.push(`${row.status} ${row.check} - ${row.description}`);
    if (row.reason !== undefined) {
      lines.push(`  reason: ${row.reason}`);
    }
    if (row.setup !== undefined) {
      lines.push(`  setup: ${row.setup}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
