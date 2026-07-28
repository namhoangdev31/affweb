import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const mapPath = path.join(process.cwd(), "project_map.json");
if (!fs.existsSync(mapPath)) {
  console.error("project_map.json not found!");
  process.exit(1);
}

const mapData = JSON.parse(fs.readFileSync(mapPath, "utf8"));

// 1. Get tracked + valid untracked files
const gitFiles = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const untrackedFiles = execSync("git ls-files --others --exclude-standard", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const activeFiles = new Set(
  [...gitFiles, ...untrackedFiles].filter((f) => {
    if (f.startsWith(".next/") || f.startsWith("node_modules/") || f.startsWith(".git/"))
      return false;
    if (f === ".env" || f === ".env.local" || f.endsWith(".log")) return false;
    if (f.startsWith("src/generated/prisma")) return false;
    return true;
  })
);

let updatedCount = 0;
let newCount = 0;

// Update existing entries and remove deleted ones
for (const relPath of Object.keys(mapData.files)) {
  if (!activeFiles.has(relPath)) {
    delete mapData.files[relPath];
    continue;
  }

  const absPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(absPath)) {
    delete mapData.files[relPath];
    continue;
  }

  const content = fs.readFileSync(absPath);
  const bytes = content.length;
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");

  if (mapData.files[relPath].sha256 !== sha256 || mapData.files[relPath].bytes !== bytes) {
    mapData.files[relPath].sha256 = sha256;
    mapData.files[relPath].bytes = bytes;
    updatedCount++;
  }
}

// Add newly created files with rich metadata
for (const relPath of activeFiles) {
  if (mapData.files[relPath]) continue;

  const absPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(absPath)) continue;

  const contentStr = fs.readFileSync(absPath, "utf8");
  const bytes = Buffer.byteLength(contentStr, "utf8");
  const sha256 = crypto.createHash("sha256").update(contentStr).digest("hex");

  let category = "source";
  if (relPath.startsWith("src/app")) category = "app-route";
  else if (relPath.startsWith("src/components")) category = "component";
  else if (relPath.startsWith("src/modules")) category = "module";
  else if (relPath.startsWith("src/lib")) category = "utility";
  else if (relPath.startsWith("tests/")) category = "test";
  else if (relPath.startsWith("docs/")) category = "documentation";
  else if (relPath.startsWith("prisma/")) category = "database";

  let summary = `File ${path.basename(relPath)}`;
  if (relPath === "tests/e2e/authenticated-user-flow.spec.ts") {
    summary =
      "Authenticated Playwright E2E test suite for protected app surfaces, link redirects, internal tools, and API boundaries.";
  }

  const fileEntry = {
    category,
    bytes,
    sha256,
    summary
  };

  if (relPath.endsWith(".ts") || relPath.endsWith(".tsx")) {
    const imports = [];
    const importRegex =
      /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|[\w$]+))*\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = importRegex.exec(contentStr)) !== null) {
      if (match[1] && !imports.includes(match[1])) imports.push(match[1]);
    }

    fileEntry.analysis = {
      runtime: relPath.startsWith("src/app/") ? "shared" : "node",
      imports,
      exports: [],
      declarations: []
    };
  }

  mapData.files[relPath] = fileEntry;
  newCount++;
}

fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2));
console.log(
  `✓ project_map.json updated cleanly: ${updatedCount} files updated, ${newCount} new files added.`
);
