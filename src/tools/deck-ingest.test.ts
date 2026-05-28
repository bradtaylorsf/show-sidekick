import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import deckIngest, { type DeckIngestInput } from "./deck-ingest.js";
import type { ToolContext, ToolLogger } from "../registry/tool.js";

const pdfFixture = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 2 >>\nendobj\n%%EOF\n");
const pptxFixture = Buffer.from("PK\u0003\u0004ppt/slides/slide1.xml ppt/slides/slide2.xml");

const scratchDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describe("deck_ingest", () => {
  it("registers the deck ingestion capability", () => {
    expect(deckIngest.name).toBe("deck_ingest");
    expect(deckIngest.capability).toBe("deck_ingest");
    expect(deckIngest.integration).toMatchObject({ kind: "library", package: "node:fs" });
    expect(deckIngest.supports).toContain("direct-download-url");
  });

  it("ingests a local PDF from an absolute path outside the project root", async () => {
    const { projectRoot, externalRoot } = await tempWorkspace();
    const sourcePath = path.join(externalRoot, "source.pdf");
    await writeFile(sourcePath, pdfFixture);

    const result = await execute({ source: sourcePath, output_dir: "work/decks" }, projectRoot);

    expect(result).toMatchObject({
      file_type: "pdf",
      source: { kind: "local", source_path: sourcePath },
      byte_size: pdfFixture.length,
      page_or_slide_count: 2,
      warnings: [],
    });
    expect(result.file_path.startsWith(`${projectRoot}${path.sep}`)).toBe(true);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(readFile(result.file_path, "utf8")).resolves.toContain("%PDF-");
  });

  it("ingests a local PPTX and reports slide count when known", async () => {
    const { projectRoot } = await tempWorkspace();
    const sourcePath = path.join(projectRoot, "inputs", "demo.pptx");
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, pptxFixture);

    const result = await execute({ source: "inputs/demo.pptx", output_dir: "work/decks" }, projectRoot);

    expect(result.file_type).toBe("pptx");
    expect(result.page_or_slide_count).toBe(2);
    expect(path.basename(result.file_path)).toBe("demo.pptx");
  });

  it("downloads a direct deck URL into the project workspace", async () => {
    const { projectRoot } = await tempWorkspace();
    const fetchMock = vi.fn(async () => {
      return new Response(pdfFixture, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute({ source: "https://example.com/downloads/demo.pdf", output_dir: "downloads" }, projectRoot);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      file_type: "pdf",
      source: { kind: "url", source_url: "https://example.com/downloads/demo.pdf" },
      page_or_slide_count: 2,
    });
    expect(result.file_path).toBe(path.join(projectRoot, "downloads", "demo.pdf"));
    await expect(stat(result.file_path)).resolves.toMatchObject({ size: pdfFixture.length });
  });

  it("rejects unsupported local deck extensions before writing output", async () => {
    const { projectRoot } = await tempWorkspace();
    const sourcePath = path.join(projectRoot, "slides.key");
    await writeFile(sourcePath, "not a supported deck");

    await expect(execute({ source: "slides.key", output_dir: "work/decks" }, projectRoot)).rejects.toMatchObject({
      reason: "unsupported_extension",
    });
    await expect(stat(path.join(projectRoot, "work"))).rejects.toThrow();
  });

  it("rejects unsupported URL extensions before any network call", async () => {
    const { projectRoot } = await tempWorkspace();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      execute({ source: "https://example.com/downloads/slides.txt", output_dir: "downloads" }, projectRoot),
    ).rejects.toMatchObject({ reason: "unsupported_extension" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated Google Slides links before any network call", async () => {
    const { projectRoot } = await tempWorkspace();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      execute(
        { source: "https://docs.google.com/presentation/d/abc123/edit#slide=id.p", output_dir: "downloads" },
        projectRoot,
      ),
    ).rejects.toMatchObject({ reason: "authenticated_url_unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects SharePoint deck links before any network call", async () => {
    const { projectRoot } = await tempWorkspace();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      execute(
        { source: "https://contoso.sharepoint.com/:p:/r/sites/demo/Shared%20Documents/deck.pptx", output_dir: "downloads" },
        projectRoot,
      ),
    ).rejects.toMatchObject({ reason: "authenticated_url_unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-downloadable URL responses", async () => {
    const { projectRoot } = await tempWorkspace();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("<html>sign in</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }),
    );

    await expect(
      execute({ source: "https://example.com/shared/deck", output_dir: "downloads" }, projectRoot),
    ).rejects.toMatchObject({ reason: "non_downloadable_url" });
  });

  it("rejects output directories outside the project root", async () => {
    const { projectRoot, scratchRoot } = await tempWorkspace();
    const sourcePath = path.join(projectRoot, "source.pdf");
    await writeFile(sourcePath, pdfFixture);

    await expect(
      execute({ source: "source.pdf", output_dir: path.join(scratchRoot, "outside") }, projectRoot),
    ).rejects.toThrow(/inside project root/u);
  });

  it("rejects extension and magic-byte mismatches", async () => {
    const { projectRoot } = await tempWorkspace();
    const sourcePath = path.join(projectRoot, "source.pdf");
    await writeFile(sourcePath, "not really a PDF");

    await expect(execute({ source: "source.pdf", output_dir: "work/decks" }, projectRoot)).rejects.toMatchObject({
      reason: "type_mismatch",
    });
  });
});

async function execute(input: DeckIngestInput, projectRoot: string) {
  return deckIngest.execute(input, context(projectRoot));
}

async function tempWorkspace(): Promise<{ scratchRoot: string; projectRoot: string; externalRoot: string }> {
  const scratchRoot = await mkdtemp(path.join(tmpdir(), "show-sidekick-deck-ingest-"));
  scratchDirs.push(scratchRoot);
  const projectRoot = path.join(scratchRoot, "project");
  const externalRoot = path.join(scratchRoot, "external");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(externalRoot, { recursive: true });
  return { scratchRoot, projectRoot, externalRoot };
}

function context(projectRoot: string): ToolContext {
  return {
    projectRoot,
    logger: logger(),
  };
}

function logger(): ToolLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}
