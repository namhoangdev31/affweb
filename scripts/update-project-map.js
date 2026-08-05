import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import prettier from "prettier";

const root = process.cwd();
const mapPath = path.join(root, "project_map.json");
const mapData = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const SELF_HASH_PLACEHOLDER = "0".repeat(64);

function gitFiles(args) {
  const output = execFileSync("git", args, { cwd: root, encoding: "buffer" });
  return output.toString("utf8").split("\0").filter(Boolean);
}

function isMappable(relPath) {
  return !(
    relPath.startsWith(".next/") ||
    relPath.startsWith("node_modules/") ||
    relPath.startsWith(".git/") ||
    relPath.startsWith("src/generated/prisma/") ||
    relPath === ".env" ||
    relPath === ".env.local" ||
    relPath.endsWith(".log")
  );
}

const activeFiles = [
  ...new Set([
    ...gitFiles(["ls-files", "-z"]),
    ...gitFiles(["ls-files", "--others", "--exclude-standard", "-z"])
  ])
]
  .filter(isMappable)
  .filter((relPath) => fs.existsSync(path.join(root, relPath)))
  .sort();

function categoryFor(relPath) {
  if (/\.test\.[cm]?[jt]sx?$/.test(relPath) || relPath.startsWith("tests/")) return "test";
  if (relPath.startsWith("src/app/") && /\/(page|layout|route)\.tsx?$/.test(relPath)) {
    return relPath.endsWith("route.ts") ? "api-route" : "app-route";
  }
  if (relPath.startsWith("src/components/")) return "component";
  if (relPath.startsWith("src/modules/")) return "domain-module";
  if (relPath.startsWith("src/lib/")) return "library";
  if (relPath.startsWith("docs/") || relPath.endsWith(".md")) return "documentation";
  if (relPath.startsWith("prisma/")) return "database";
  if (/\.(json|ya?ml|toml)$/.test(relPath) || relPath.startsWith(".")) return "configuration";
  return "source";
}

function routeFor(relPath) {
  if (!relPath.startsWith("src/app/")) return undefined;
  const match = relPath.match(/^src\/app\/(.*)\/(?:page|route)\.tsx?$/);
  if (!match) return undefined;
  const parts = match[1]
    .split("/")
    .filter((part) => !/^\(.+\)$/.test(part))
    .map((part) => (part.startsWith("[") ? `:${part.slice(1, -1)}` : part));
  return `/${parts.join("/")}`;
}

function declarationNames(node) {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map((declaration) => (ts.isIdentifier(declaration.name) ? declaration.name.text : undefined))
      .filter(Boolean);
  }
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    node.name
  ) {
    return [node.name.text];
  }
  return [];
}

function declarationKind(node) {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  return "variable";
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function analyzeTypeScript(relPath, content) {
  const sourceFile = ts.createSourceFile(
    relPath,
    content,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports = [];
  const exports = [];
  const declarations = [];
  const functionCalls = [];

  for (const node of sourceFile.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    const names = declarationNames(node);
    const exported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
    for (const name of names) {
      declarations.push({
        name,
        kind: declarationKind(node),
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        exported,
        purpose: `${name}.`
      });
      if (exported) exports.push(name);
    }
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        exports.push(...node.exportClause.elements.map((element) => element.name.text));
      } else if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        exports.push(`* from ${node.moduleSpecifier.text}`);
      }
    }
    if (ts.isExportAssignment(node)) exports.push("default");
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sourceFile).replace(/\s+/g, " ").slice(0, 160);
      if (name && !functionCalls.includes(name)) functionCalls.push(name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const firstStatement = sourceFile.statements[0];
  const client =
    firstStatement &&
    ts.isExpressionStatement(firstStatement) &&
    ts.isStringLiteral(firstStatement.expression) &&
    firstStatement.expression.text === "use client";
  const server = imports.includes("server-only");
  return {
    runtime: client
      ? "client"
      : server
        ? "server"
        : relPath.startsWith("src/app/")
          ? "shared"
          : "node",
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
    declarations,
    functionCalls: functionCalls.slice(0, 300),
    tests: []
  };
}

function summaryFor(relPath, category, analysis) {
  const names = analysis?.exports?.filter((name) => name !== "default").slice(0, 6) ?? [];
  if (category === "test")
    return `Verifies ${path.basename(relPath).replace(/\.test\..+$/, "")} behavior.`;
  if (category === "documentation")
    return `Documents ${path.basename(relPath, path.extname(relPath))}.`;
  if (names.length > 0) return `Implements ${names.join(", ")}.`;
  if (analysis?.declarations?.length) {
    return `Implements ${analysis.declarations
      .slice(0, 4)
      .map((item) => item.name)
      .join(", ")}.`;
  }
  return `Provides ${path.basename(relPath)} project ${category.replace("-", " ")} responsibilities.`;
}

const oldFiles = mapData.files ?? {};
const nextFiles = {};
for (const relPath of activeFiles) {
  if (relPath === "project_map.json") continue;
  const absolutePath = path.join(root, relPath);
  const content = fs.readFileSync(absolutePath);
  const text = content.toString("utf8");
  const category = oldFiles[relPath]?.category ?? categoryFor(relPath);
  const analysis = /\.[cm]?[jt]sx?$/.test(relPath)
    ? analyzeTypeScript(relPath, text)
    : oldFiles[relPath]?.analysis;
  const route = routeFor(relPath) ?? oldFiles[relPath]?.route;
  nextFiles[relPath] = {
    category,
    bytes: content.length,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    summary: summaryFor(relPath, category, analysis),
    ...(route ? { route } : {}),
    ...(analysis ? { analysis } : {})
  };
}

nextFiles["project_map.json"] = {
  category: "documentation",
  bytes: 0,
  sha256: SELF_HASH_PLACEHOLDER,
  summary: "Maps repository files, architecture, invariants, routes, symbols, and hashes."
};
mapData.files = Object.fromEntries(
  Object.entries(nextFiles).sort(([left], [right]) => left.localeCompare(right))
);
mapData.project.purpose =
  "Vietnam affiliate cashback web app/PWA with master-member and standard-tenant portals, independent financial aggregates, and approval-gated payouts.";
mapData.architecture.criticalFlows.tenant =
  "MASTER tenant membership -> TENANT_MASTER ownership of one STANDARD tenant -> isolated /tenant and /<slug>/app portals -> tenant obligation/treasury/member-wallet journals -> approval-gated payout ticket.";
mapData.externalServices.payOS =
  "One shared PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY set for SaaS billing, tenant funding, and payout; each operation remains behind separate fail-closed flags.";
mapData.commands = packageData.scripts;
const envTemplate = fs.readFileSync(path.join(root, ".env.example"), "utf8");
mapData.environment.variableNames = [
  ...new Set(
    envTemplate
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean)
  )
];
mapData.project.baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8"
}).trim();
mapData.nonNegotiableInvariants = [...new Set(mapData.nonNegotiableInvariants ?? [])];
mapData.nonNegotiableInvariants = mapData.nonNegotiableInvariants.filter(
  (value) =>
    value !==
    "Tenant conversions never post platform ledger/wallet/payout; external payment confirmation is owner-scoped and audited."
);
mapData.nonNegotiableInvariants.push(
  "Tenant finance uses separate treasury/member projections and balanced append-only journals; pre-cutover external settlements are not rewritten.",
  "Tenant User payout tickets require Tenant Master approval, and Tenant Master treasury withdrawals require Owner approval before provider submission."
);
mapData.nonNegotiableInvariants = [...new Set(mapData.nonNegotiableInvariants)];
mapData.statistics = {
  ...mapData.statistics,
  mappedFiles: activeFiles.length,
  sourceFiles: activeFiles.filter((file) => file.startsWith("src/")).length,
  tests: activeFiles.filter((file) => /(?:^tests\/|\.test\.|\.spec\.)/.test(file)).length
};

async function formattedMap() {
  return prettier.format(JSON.stringify(mapData), {
    ...(await prettier.resolveConfig(mapPath)),
    filepath: mapPath
  });
}

let wroteMap = false;
for (let attempt = 0; attempt < 5; attempt += 1) {
  mapData.files["project_map.json"].sha256 = SELF_HASH_PLACEHOLDER;
  const canonical = await formattedMap();
  const bytes = Buffer.byteLength(canonical);
  if (mapData.files["project_map.json"].bytes !== bytes) {
    mapData.files["project_map.json"].bytes = bytes;
    continue;
  }
  mapData.files["project_map.json"].sha256 = crypto
    .createHash("sha256")
    .update(canonical)
    .digest("hex");
  const output = await formattedMap();
  if (Buffer.byteLength(output) !== bytes) {
    mapData.files["project_map.json"].bytes = Buffer.byteLength(output);
    continue;
  }
  fs.writeFileSync(mapPath, output);
  wroteMap = true;
  break;
}
if (!wroteMap) throw new Error("project_map.json self metadata did not stabilize");
console.log(
  `project_map.json regenerated for ${activeFiles.length} files with TypeScript AST metadata.`
);
