#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = resolve(scriptDirectory, "..");
const templateDirectory = join(skillDirectory, "assets", "card-export");
const workspaceRoot = resolve(process.argv[2] || process.cwd());
const cardRoot = join(workspaceRoot, "learning-cards");
const outputDirectory = join(workspaceRoot, "card-export");
const WORKSPACE_ID = "preset-guided-qa";
const CONFIG_RESOURCE_ROOT = "card-export";
const STATIC_ASSETS = ["index.html", "app.css", "app.js"];

const CARD_SOURCES = [
  { directory: "knowledge", type: "knowledge_card" },
  { directory: "problems", type: "problem_card" },
];

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function previewText(sections) {
  const source = sections.find((section) => section.markdown)?.markdown || "";
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`$>|[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function stripYamlValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function serializeForJavaScript(value) {
  return JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function cardChunkName(sourcePath) {
  return `${createHash("sha256").update(sourcePath).digest("hex").slice(0, 20)}.js`;
}

function parseCard(markdown, fallbackType, sourcePath, updatedAt) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const frontmatter = {};
  let body = normalized;

  if (frontmatterMatch) {
    for (const line of frontmatterMatch[1].split("\n")) {
      const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        frontmatter[match[1]] = stripYamlValue(match[2]);
      }
    }
    body = normalized.slice(frontmatterMatch[0].length);
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title =
    normalizeText(frontmatter.title) ||
    normalizeText(titleMatch?.[1]) ||
    sourcePath.split("/").pop()?.replace(/\.md$/i, "") ||
    "未命名卡片";

  const sections = [];
  const headingPattern = /^##\s+(.+?)\s*$/gm;
  const headings = Array.from(body.matchAll(headingPattern));
  for (let index = 0; index < headings.length; index += 1) {
    const sectionMatch = headings[index];
    const contentStart = sectionMatch.index + sectionMatch[0].length;
    const contentEnd = headings[index + 1]?.index ?? body.length;
    sections.push({
      label: normalizeText(sectionMatch[1]),
      markdown: normalizeText(body.slice(contentStart, contentEnd)),
    });
  }

  const declaredType =
    frontmatter.type === "knowledge_card" || frontmatter.type === "problem_card"
      ? frontmatter.type
      : fallbackType;

  return {
    id: sourcePath,
    type: declaredType,
    title,
    updatedAt,
    sourcePath,
    preview: previewText(sections),
    markdown: normalized,
  };
}

async function readCards() {
  const cards = [];
  const warnings = [];

  for (const source of CARD_SOURCES) {
    const directory = join(cardRoot, source.directory);
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        warnings.push(`${source.directory}: ${error.message}`);
      }
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }

      const absolutePath = join(directory, entry.name);
      const sourcePath = relative(workspaceRoot, absolutePath).replaceAll("\\", "/");
      try {
        const [markdown, fileStat] = await Promise.all([
          readFile(absolutePath, "utf8"),
          stat(absolutePath),
        ]);
        cards.push(parseCard(markdown, source.type, sourcePath, fileStat.mtime.toISOString()));
      } catch (error) {
        warnings.push(`${sourcePath}: ${error.message}`);
      }
    }
  }

  cards.sort((left, right) => {
    const timeDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return timeDifference || left.title.localeCompare(right.title, "zh-CN");
  });

  return { cards, warnings };
}

async function build() {
  const { cards, warnings } = await readCards();
  const manifestCards = cards.map(({ markdown, ...card }) => {
    const chunkName = cardChunkName(card.sourcePath);
    return {
      ...card,
      chunkPath: `${CONFIG_RESOURCE_ROOT}/cards/${chunkName}`,
    };
  });
  const manifest = {
    schemaVersion: 2,
    workspaceId: WORKSPACE_ID,
    generatedAt: new Date().toISOString(),
    cards: manifestCards,
    warnings,
  };

  await mkdir(outputDirectory, { recursive: true });
  const cardChunkDirectory = join(outputDirectory, "cards");
  await rm(cardChunkDirectory, { recursive: true, force: true });
  await mkdir(cardChunkDirectory, { recursive: true });
  await Promise.all(
    STATIC_ASSETS.map((asset) =>
      copyFile(join(templateDirectory, asset), join(outputDirectory, asset)),
    ),
  );
  await Promise.all([
    writeFile(
      join(outputDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      join(outputDirectory, "manifest.js"),
      `window.CARD_EXPORT_MANIFEST = ${serializeForJavaScript(manifest)};\n`,
      "utf8",
    ),
    ...cards.map((card) => {
      const chunkPath = join(cardChunkDirectory, cardChunkName(card.sourcePath));
      const chunk = [
        "window.CARD_EXPORT_CARD_CHUNKS = window.CARD_EXPORT_CARD_CHUNKS || Object.create(null);",
        `window.CARD_EXPORT_CARD_CHUNKS[${serializeForJavaScript(card.id)}] = ${serializeForJavaScript(card.markdown)};`,
        "",
      ].join("\n");
      return writeFile(chunkPath, chunk, "utf8");
    }),
  ]);
  await rm(join(outputDirectory, "cards-data.js"), { force: true });

  const knowledgeCount = manifestCards.filter((card) => card.type === "knowledge_card").length;
  const problemCount = manifestCards.filter((card) => card.type === "problem_card").length;
  console.log(`Learning-card export workspace refreshed: ${outputDirectory}`);
  console.log(
    `Cards: ${manifestCards.length} total, ${knowledgeCount} knowledge, ${problemCount} problem`,
  );
  console.log(
    "Card bodies remain in learning-cards/*.md; portable browser chunks are loaded only when exporting.",
  );
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

await build();
