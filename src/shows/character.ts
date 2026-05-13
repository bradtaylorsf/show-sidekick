import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ConfigError } from "../config/errors.js";
import { loadYaml } from "../config/loader.js";
import type { LoadedShow } from "./load.js";

const CharacterReferenceSchema = z.object({
  path: z.string(),
  role: z.string().optional(),
});

export const CharacterSchema = z.object({
  slug: z.string(),
  voice_id: z.string().optional(),
  visual_description: z.string(),
  persona: z.string().optional(),
  references: z.array(CharacterReferenceSchema).default([]),
});

export type CharacterReference = z.infer<typeof CharacterReferenceSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type ResolvedCharacterReference = Omit<CharacterReference, "path"> & {
  path: string;
};

export type ResolvedCharacter = Omit<Character, "references"> & {
  charactersDir: string;
  characterDir: string;
  references: ResolvedCharacterReference[];
  referencesPaths: string[];
  characterSheet?: string;
};

export async function resolveCharacter(show: LoadedShow, slug: string): Promise<ResolvedCharacter> {
  assertSafeSlug(slug);

  if (!show.charactersDir) {
    throw new ConfigError({
      filePath: path.join(show.rootDir, "show.yaml"),
      issues: [{ path: "characters", message: "show.characters is required to resolve characters" }],
    });
  }

  const charactersDir = show.charactersDir;
  const availableCharacters = await listAvailableCharacters(charactersDir);

  if (!availableCharacters.includes(slug)) {
    throw new Error(
      `character '${slug}' not found in ${charactersDir}; available: ${formatAvailable(availableCharacters)}`,
    );
  }

  const characterDir = path.join(charactersDir, slug);
  const characterYamlPath = path.join(characterDir, "character.yaml");
  const character = (await loadYaml(characterYamlPath, CharacterSchema)) as Character;
  const references = character.references.map((reference) => ({
    ...reference,
    path: path.resolve(characterDir, reference.path),
  }));
  const characterSheetPath = path.join(characterDir, "character_sheet.md");
  const characterSheet = existsSync(characterSheetPath)
    ? await readFile(characterSheetPath, "utf8")
    : undefined;

  return {
    ...character,
    charactersDir,
    characterDir,
    references,
    referencesPaths: references.map((reference) => reference.path),
    characterSheet,
  };
}

async function listAvailableCharacters(charactersDir: string): Promise<string[]> {
  try {
    const entries = await readdir(charactersDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function formatAvailable(availableCharacters: string[]): string {
  return availableCharacters.length > 0 ? availableCharacters.join(", ") : "(none)";
}

function assertSafeSlug(slug: string): void {
  if (
    slug === "" ||
    slug === "." ||
    slug === ".." ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("\0")
  ) {
    throw new Error(`invalid character slug '${slug}'`);
  }
}
