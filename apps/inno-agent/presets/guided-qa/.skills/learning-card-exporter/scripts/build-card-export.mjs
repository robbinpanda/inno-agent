#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = resolve(scriptDirectory, "..");
const templateDirectory = join(skillDirectory, "assets", "card-export");
const workspaceRoot = resolve(process.argv[2] || process.cwd());
const cardRoot = join(workspaceRoot, "learning-cards");
const outputDirectory = join(workspaceRoot, "card-export");
const DATA_START_MARKER = "<!-- CARD_EXPORT_DATA_START -->";
const DATA_END_MARKER = "<!-- CARD_EXPORT_DATA_END -->";

const CARD_SOURCES = [
  { directory: "knowledge", type: "knowledge_card" },
  { directory: "problems", type: "problem_card" },
];

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
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
    sections,
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

function serializeForJavaScript(value) {
  return JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

async function build() {
  const { cards, warnings } = await readCards();
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cards,
    warnings,
  };

  const template = await readFile(join(templateDirectory, "index.html"), "utf8");
  const dataStart = template.indexOf(DATA_START_MARKER);
  const dataEnd = template.indexOf(DATA_END_MARKER);
  if (dataStart < 0 || dataEnd <= dataStart) {
    throw new Error("Card export template is missing its embedded-data markers");
  }

  const embeddedData = [
    DATA_START_MARKER,
    '<script id="card-export-data">',
    `window.CARD_EXPORT_DATA = ${serializeForJavaScript(payload)};`,
    "</script>",
    DATA_END_MARKER,
  ].join("\n");
  const html = `${template.slice(0, dataStart)}${embeddedData}${template.slice(
    dataEnd + DATA_END_MARKER.length,
  )}`;

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "index.html"), html, "utf8");
  await rm(join(outputDirectory, "cards-data.js"), { force: true });

  const knowledgeCount = cards.filter((card) => card.type === "knowledge_card").length;
  const problemCount = cards.filter((card) => card.type === "problem_card").length;
  console.log(`Learning-card export page refreshed: ${join(outputDirectory, "index.html")}`);
  console.log(`Cards: ${cards.length} total, ${knowledgeCount} knowledge, ${problemCount} problem`);
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

await build();
