import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeMarkdown({ outDir, slug, markdown }) {
  await mkdir(outDir, { recursive: true });
  const markdownPath = path.join(outDir, `${slug}-reviews.md`);
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return markdownPath;
}

export function safeSlug(...parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "reviews";
}
