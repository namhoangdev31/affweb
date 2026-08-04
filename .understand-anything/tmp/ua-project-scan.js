import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import prettier from "prettier";

const CORE_PACKAGE_ROOT =
  "/Users/hoangnam/.codex/understand-anything/understand-anything-plugin/package.json";

const LANGUAGE_BY_EXTENSION = new Map([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".java", "java"],
  [".rb", "ruby"],
  [".cpp", "cpp"],
  [".cc", "cpp"],
  [".cxx", "cpp"],
  [".h", "cpp"],
  [".hpp", "cpp"],
  [".c", "c"],
  [".cs", "csharp"],
  [".swift", "swift"],
  [".kt", "kotlin"],
  [".php", "php"],
  [".vue", "vue"],
  [".svelte", "svelte"],
  [".sh", "shell"],
  [".bash", "shell"],
  [".md", "markdown"],
  [".rst", "markdown"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".json", "json"],
  [".toml", "toml"],
  [".sql", "sql"],
  [".graphql", "graphql"],
  [".gql", "graphql"],
  [".proto", "protobuf"],
  [".tf", "terraform"],
  [".tfvars", "terraform"],
  [".html", "html"],
  [".htm", "html"],
  [".css", "css"],
  [".scss", "css"],
  [".sass", "css"],
  [".less", "css"],
  [".xml", "xml"],
  [".cfg", "config"],
  [".ini", "config"],
  [".env", "config"]
]);

const INFRA_BASENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Jenkinsfile",
  "Procfile",
  "Vagrantfile",
  ".gitlab-ci.yml"
]);

const RESOLUTION_SUFFIXES = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.js",
  "/index.tsx",
  "/index.jsx",
  ".py",
  ".go",
  ".rs",
  ".rb"
];

function normalizeRelative(filePath) {
  return filePath.split(path.sep).join("/").replace(/^\.\//, "");
}

function safeRead(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function discoverWithGit(projectRoot) {
  try {
    const output = execFileSync("git", ["-C", projectRoot, "ls-files", "-z"], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return output.split("\0").filter(Boolean).map(normalizeRelative);
  } catch {
    return null;
  }
}

function discoverRecursively(projectRoot) {
  const results = [];

  function walk(currentDirectory) {
    let entries = [];
    try {
      entries = readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        results.push(normalizeRelative(path.relative(projectRoot, absolutePath)));
      }
    }
  }

  walk(projectRoot);
  return results;
}

function isBaselineIgnored(filePath) {
  const normalized = normalizeRelative(filePath);
  const parts = normalized.split("/");
  const basename = parts.at(-1) ?? "";
  const lowerBasename = basename.toLowerCase();
  const extension = path.posix.extname(lowerBasename);
  const dependencySegments = new Set([
    "node_modules",
    ".git",
    "vendor",
    "venv",
    ".venv",
    "__pycache__"
  ]);
  const buildSegments = new Set([
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".cache",
    ".turbo",
    "target",
    "obj"
  ]);
  const binaryExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp3",
    ".mp4",
    ".pdf",
    ".zip",
    ".tar",
    ".gz"
  ]);

  if (parts.some((segment) => dependencySegments.has(segment))) {
    return true;
  }
  if (parts.slice(0, -1).some((segment) => buildSegments.has(segment))) {
    return true;
  }
  if (
    lowerBasename.endsWith(".lock") ||
    ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"].includes(lowerBasename)
  ) {
    return true;
  }
  if (binaryExtensions.has(extension)) {
    return true;
  }
  if (
    lowerBasename.endsWith(".min.js") ||
    lowerBasename.endsWith(".min.css") ||
    lowerBasename.endsWith(".map") ||
    /\.generated\.[^.]+$/i.test(basename)
  ) {
    return true;
  }
  if (parts.includes(".idea") || parts.includes(".vscode")) {
    return true;
  }
  if (
    basename === "LICENSE" ||
    basename === ".gitignore" ||
    basename === ".editorconfig" ||
    basename === ".prettierrc" ||
    basename.startsWith(".eslintrc") ||
    lowerBasename.endsWith(".log")
  ) {
    return true;
  }
  return false;
}

async function filterDiscoveredFiles(projectRoot, originalFiles) {
  const baselineFiles = originalFiles.filter((filePath) => !isBaselineIgnored(filePath));
  const projectIgnorePath = path.join(projectRoot, ".understand-anything", ".understandignore");
  const rootIgnorePath = path.join(projectRoot, ".understandignore");

  if (!existsSync(projectIgnorePath) && !existsSync(rootIgnorePath)) {
    return { files: baselineFiles, filteredByIgnore: 0 };
  }

  try {
    const packageRequire = createRequire(CORE_PACKAGE_ROOT);
    const coreEntry = packageRequire.resolve("@understand-anything/core");
    const { createIgnoreFilter } = await import(pathToFileURL(coreEntry).href);
    const ignoreFilter = createIgnoreFilter(projectRoot);
    const files = originalFiles.filter((filePath) => !ignoreFilter.isIgnored(filePath));
    const baselineRemoved = originalFiles.length - baselineFiles.length;
    const unifiedRemoved = originalFiles.length - files.length;

    return {
      files,
      filteredByIgnore: Math.max(0, unifiedRemoved - baselineRemoved)
    };
  } catch {
    const activePatterns = safeRead(
      existsSync(projectIgnorePath) ? projectIgnorePath : rootIgnorePath
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (activePatterns.length > 0) {
      throw new Error(
        "Cannot apply active .understandignore patterns without @understand-anything/core"
      );
    }
    return {
      files: baselineFiles,
      filteredByIgnore: originalFiles.length - baselineFiles.length
    };
  }
}

function detectLanguage(filePath) {
  const basename = path.posix.basename(filePath);
  if (basename === "Dockerfile") {
    return "dockerfile";
  }
  if (basename === "Makefile") {
    return "makefile";
  }
  if (basename === "Jenkinsfile") {
    return "jenkinsfile";
  }
  if (basename === ".env" || basename.startsWith(".env.")) {
    return "config";
  }
  return LANGUAGE_BY_EXTENSION.get(path.posix.extname(basename).toLowerCase()) ?? "unknown";
}

function detectCategory(filePath) {
  const normalized = normalizeRelative(filePath);
  const lowerPath = normalized.toLowerCase();
  const basename = path.posix.basename(normalized);
  const lowerBasename = basename.toLowerCase();
  const extension = path.posix.extname(lowerBasename);

  if ([".md", ".rst", ".txt"].includes(extension) && basename !== "LICENSE") {
    return "docs";
  }

  if (
    INFRA_BASENAMES.has(basename) ||
    lowerBasename.startsWith("docker-compose.") ||
    [".tf", ".tfvars"].includes(extension) ||
    lowerPath.startsWith(".github/workflows/") ||
    lowerPath.startsWith(".circleci/") ||
    lowerBasename.endsWith(".k8s.yaml") ||
    lowerBasename.endsWith(".k8s.yml") ||
    lowerPath.includes("/k8s/") ||
    lowerPath.startsWith("k8s/") ||
    lowerPath.includes("/kubernetes/") ||
    lowerPath.startsWith("kubernetes/")
  ) {
    return "infra";
  }

  if (
    [".yaml", ".yml", ".json", ".toml", ".xml", ".cfg", ".ini", ".env"].includes(extension) ||
    lowerBasename === "tsconfig.json" ||
    lowerBasename === "package.json" ||
    lowerBasename === "pyproject.toml" ||
    basename === "Cargo.toml" ||
    basename === "go.mod" ||
    basename === ".env" ||
    basename.startsWith(".env.")
  ) {
    return "config";
  }

  if (
    [".sql", ".graphql", ".gql", ".proto", ".prisma", ".csv"].includes(extension) ||
    lowerBasename.endsWith(".schema.json")
  ) {
    return "data";
  }
  if ([".sh", ".bash", ".ps1", ".bat"].includes(extension)) {
    return "script";
  }
  if ([".html", ".htm", ".css", ".scss", ".sass", ".less"].includes(extension)) {
    return "markup";
  }
  return "code";
}

function countLines(filePath) {
  try {
    const result = spawnSync("wc", ["-l", filePath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    if (result.status !== 0) {
      return 0;
    }
    const match = result.stdout.match(/^\s*(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

function addFramework(frameworks, framework) {
  if (framework) {
    frameworks.add(framework);
  }
}

function detectPackageFrameworks(packageJson, frameworks) {
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };
  const knownFrameworks = new Map([
    ["react", "React"],
    ["vue", "Vue"],
    ["svelte", "Svelte"],
    ["@angular/core", "Angular"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["koa", "Koa"],
    ["next", "Next.js"],
    ["nuxt", "Nuxt"],
    ["vite", "Vite"],
    ["vitest", "Vitest"],
    ["jest", "Jest"],
    ["mocha", "Mocha"],
    ["tailwindcss", "Tailwind CSS"],
    ["prisma", "Prisma"],
    ["typeorm", "TypeORM"],
    ["sequelize", "Sequelize"],
    ["mongoose", "Mongoose"],
    ["redux", "Redux"],
    ["zustand", "Zustand"],
    ["mobx", "MobX"]
  ]);

  for (const [dependency, framework] of knownFrameworks) {
    if (Object.hasOwn(dependencies, dependency)) {
      addFramework(frameworks, framework);
    }
  }
}

function detectNamedFrameworks(content, knownFrameworks, frameworks) {
  const lowerContent = content.toLowerCase();
  for (const [needle, displayName] of knownFrameworks) {
    if (lowerContent.includes(needle.toLowerCase())) {
      addFramework(frameworks, displayName);
    }
  }
}

function parseTomlName(content, sectionName) {
  const sectionPattern = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = content.match(new RegExp(`\\[${sectionPattern}\\]([\\s\\S]*?)(?=\\n\\[|$)`, "i"));
  return section?.[1].match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1] ?? "";
}

function detectFrameworks(projectRoot, discoveredPaths) {
  const discovered = new Set(discoveredPaths);
  const frameworks = new Set();
  let packageJson = {};
  let projectName = "";
  let rawDescription = "";
  let goModule = "";

  if (discovered.has("package.json")) {
    try {
      packageJson = JSON.parse(safeRead(path.join(projectRoot, "package.json")));
      projectName =
        typeof packageJson.name === "string" && packageJson.name ? packageJson.name : "";
      rawDescription = typeof packageJson.description === "string" ? packageJson.description : "";
      detectPackageFrameworks(packageJson, frameworks);
    } catch {
      packageJson = {};
    }
  }

  if (discovered.has("tsconfig.json")) {
    addFramework(frameworks, "TypeScript");
  }

  const cargoContent = discovered.has("Cargo.toml")
    ? safeRead(path.join(projectRoot, "Cargo.toml"))
    : "";
  if (cargoContent) {
    addFramework(frameworks, "Rust");
    if (!projectName) {
      projectName = parseTomlName(cargoContent, "package");
    }
    detectNamedFrameworks(
      cargoContent,
      [
        ["actix-web", "Actix Web"],
        ["axum", "Axum"],
        ["rocket", "Rocket"],
        ["diesel", "Diesel"],
        ["tokio", "Tokio"],
        ["serde", "Serde"],
        ["warp", "Warp"]
      ],
      frameworks
    );
  }

  const goModContent = discovered.has("go.mod") ? safeRead(path.join(projectRoot, "go.mod")) : "";
  if (goModContent) {
    addFramework(frameworks, "Go");
    goModule = goModContent.match(/^\s*module\s+(\S+)/m)?.[1] ?? "";
    if (!projectName && goModule) {
      projectName = goModule.split("/").at(-1) ?? "";
    }
    detectNamedFrameworks(
      goModContent,
      [
        ["github.com/gin-gonic/gin", "Gin"],
        ["github.com/labstack/echo", "Echo"],
        ["github.com/gofiber/fiber", "Fiber"],
        ["github.com/go-chi/chi", "Chi"],
        ["gorm.io/gorm", "GORM"]
      ],
      frameworks
    );
  }

  const pythonFrameworks = [
    ["django", "Django"],
    ["djangorestframework", "Django REST Framework"],
    ["fastapi", "FastAPI"],
    ["flask", "Flask"],
    ["sqlalchemy", "SQLAlchemy"],
    ["alembic", "Alembic"],
    ["celery", "Celery"],
    ["pydantic", "Pydantic"],
    ["uvicorn", "Uvicorn"],
    ["gunicorn", "Gunicorn"],
    ["aiohttp", "aiohttp"],
    ["tornado", "Tornado"],
    ["starlette", "Starlette"],
    ["pytest", "pytest"],
    ["hypothesis", "Hypothesis"],
    ["channels", "Django Channels"]
  ];
  const pythonConfigFiles = [
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "Pipfile"
  ].filter((filePath) => discovered.has(filePath));
  if (pythonConfigFiles.length > 0) {
    addFramework(frameworks, "Python");
    for (const filePath of pythonConfigFiles) {
      const content = safeRead(path.join(projectRoot, filePath));
      detectNamedFrameworks(content, pythonFrameworks, frameworks);
      if (filePath === "pyproject.toml" && !projectName) {
        projectName = parseTomlName(content, "project") || parseTomlName(content, "tool.poetry");
      }
      if (filePath === "pyproject.toml" && /\[tool\.pytest\.ini_options\]/i.test(content)) {
        addFramework(frameworks, "pytest");
      }
      if (filePath === "pyproject.toml" && /\[tool\.django\]/i.test(content)) {
        addFramework(frameworks, "Django");
      }
    }
  }

  if (discovered.has("Gemfile")) {
    addFramework(frameworks, "Ruby");
    detectNamedFrameworks(
      safeRead(path.join(projectRoot, "Gemfile")),
      [
        ["rails", "Rails"],
        ["railties", "Railties"],
        ["sinatra", "Sinatra"],
        ["grape", "Grape"],
        ["rspec", "RSpec"],
        ["sidekiq", "Sidekiq"],
        ["activerecord", "Active Record"],
        ["actionpack", "Action Pack"],
        ["devise", "Devise"],
        ["pundit", "Pundit"]
      ],
      frameworks
    );
  }

  for (const jvmConfig of ["pom.xml", "build.gradle", "build.gradle.kts"]) {
    if (!discovered.has(jvmConfig)) {
      continue;
    }
    addFramework(frameworks, "JVM");
    detectNamedFrameworks(
      safeRead(path.join(projectRoot, jvmConfig)),
      [
        ["spring-boot", "Spring Boot"],
        ["spring-web", "Spring Web"],
        ["spring-data", "Spring Data"],
        ["quarkus", "Quarkus"],
        ["micronaut", "Micronaut"],
        ["hibernate", "Hibernate"],
        ["jakarta", "Jakarta"],
        ["junit", "JUnit"],
        ["ktor", "Ktor"]
      ],
      frameworks
    );
  }

  if (discovered.has("Dockerfile")) {
    addFramework(frameworks, "Docker");
  }
  if (discovered.has("docker-compose.yml") || discovered.has("docker-compose.yaml")) {
    addFramework(frameworks, "Docker Compose");
  }
  if (discoveredPaths.some((filePath) => filePath.endsWith(".tf"))) {
    addFramework(frameworks, "Terraform");
  }
  if (
    discoveredPaths.some(
      (filePath) =>
        filePath.startsWith(".github/workflows/") &&
        (filePath.endsWith(".yml") || filePath.endsWith(".yaml"))
    )
  ) {
    addFramework(frameworks, "GitHub Actions");
  }
  if (discovered.has(".gitlab-ci.yml")) {
    addFramework(frameworks, "GitLab CI");
  }
  if (discovered.has("Jenkinsfile")) {
    addFramework(frameworks, "Jenkins");
  }

  return {
    frameworks: [...frameworks].sort(),
    projectName: projectName || path.basename(projectRoot),
    rawDescription,
    goModule
  };
}

function resolveCandidate(importerPath, specifier, discovered) {
  const importerDirectory = path.posix.dirname(importerPath);
  const rawCandidate = specifier.startsWith("@/")
    ? path.posix.join("src", specifier.slice(2))
    : specifier.startsWith("./") || specifier.startsWith("../")
      ? normalizeRelative(path.posix.normalize(path.posix.join(importerDirectory, specifier)))
      : null;
  if (!rawCandidate) return null;
  if (rawCandidate === ".." || rawCandidate.startsWith("../")) {
    return null;
  }

  const hasExtension = path.posix.extname(rawCandidate) !== "";
  const candidates = hasExtension
    ? [rawCandidate]
    : RESOLUTION_SUFFIXES.map((suffix) => `${rawCandidate}${suffix}`);
  for (const candidate of candidates) {
    if (discovered.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractJavaScriptImports(content) {
  const imports = [];
  const fromPattern = /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"'`]+)["']/g;
  const requirePattern = /\brequire\s*\(\s*["']([^"'`]+)["']\s*\)/g;
  let match;
  while ((match = fromPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requirePattern.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function extractPythonImports(content) {
  const imports = [];
  const fromPattern = /^\s*from\s+(\.+)([\w.]*)\s+import\s+([^\n#]+)/gm;
  let match;
  while ((match = fromPattern.exec(content)) !== null) {
    const dots = match[1].length;
    const modulePath = match[2].replace(/\./g, "/");
    const prefix = "../".repeat(Math.max(0, dots - 1));
    if (modulePath) {
      imports.push(`${prefix}./${modulePath}`);
      continue;
    }
    const importedNames = match[3]
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/i)[0])
      .filter((name) => /^\w+$/.test(name));
    for (const importedName of importedNames) {
      imports.push(`${prefix}./${importedName}`);
    }
  }
  return imports;
}

function extractRubyImports(content) {
  const imports = [];
  const pattern = /\brequire_relative\s+["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const specifier = match[1];
    imports.push(specifier.startsWith(".") ? specifier : `./${specifier}`);
  }
  return imports;
}

function resolveGoImports(content, importerPath, goModule, discovered) {
  if (!goModule) {
    return [];
  }
  const results = new Set();
  const stringPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = stringPattern.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath !== goModule && !importPath.startsWith(`${goModule}/`)) {
      continue;
    }
    const relativeDirectory = importPath.slice(goModule.length).replace(/^\//, "");
    const candidates = [...discovered]
      .filter(
        (filePath) => path.posix.dirname(filePath) === relativeDirectory && filePath.endsWith(".go")
      )
      .sort();
    for (const candidate of candidates) {
      if (candidate !== importerPath) {
        results.add(candidate);
      }
    }
  }
  return [...results].sort();
}

function resolveRustImports(content, importerPath, discovered) {
  const results = new Set();
  const importerDirectory = path.posix.dirname(importerPath);
  const crateRoot = importerPath.startsWith("src/") ? "src" : importerDirectory;
  const usePattern = /\buse\s+(crate|super)::([\w:]+)/g;
  const modPattern = /^\s*mod\s+(\w+)\s*;/gm;
  let match;

  while ((match = usePattern.exec(content)) !== null) {
    const base = match[1] === "crate" ? crateRoot : path.posix.dirname(importerDirectory);
    const modulePath = match[2].split("::").join("/");
    for (const candidate of [`${base}/${modulePath}.rs`, `${base}/${modulePath}/mod.rs`].map(
      normalizeRelative
    )) {
      if (discovered.has(candidate)) {
        results.add(candidate);
        break;
      }
    }
  }
  while ((match = modPattern.exec(content)) !== null) {
    for (const candidate of [
      `${importerDirectory}/${match[1]}.rs`,
      `${importerDirectory}/${match[1]}/mod.rs`
    ].map(normalizeRelative)) {
      if (discovered.has(candidate)) {
        results.add(candidate);
        break;
      }
    }
  }
  return [...results].sort();
}

function buildImportMap(projectRoot, fileRecords, goModule) {
  const discovered = new Set(fileRecords.map((file) => file.path));
  const importMap = {};

  for (const file of fileRecords) {
    if (file.fileCategory !== "code") {
      importMap[file.path] = [];
      continue;
    }

    const extension = path.posix.extname(file.path).toLowerCase();
    const content = safeRead(path.join(projectRoot, file.path));
    let resolved = [];

    if ([".ts", ".tsx", ".js", ".jsx"].includes(extension)) {
      resolved = extractJavaScriptImports(content)
        .map((specifier) => resolveCandidate(file.path, specifier, discovered))
        .filter(Boolean);
    } else if (extension === ".py") {
      resolved = extractPythonImports(content)
        .map((specifier) => resolveCandidate(file.path, specifier, discovered))
        .filter(Boolean);
    } else if (extension === ".go") {
      resolved = resolveGoImports(content, file.path, goModule, discovered);
    } else if (extension === ".rs") {
      resolved = resolveRustImports(content, file.path, discovered);
    } else if (extension === ".rb") {
      resolved = extractRubyImports(content)
        .map((specifier) => resolveCandidate(file.path, specifier, discovered))
        .filter(Boolean);
    }

    importMap[file.path] = [...new Set(resolved)].sort();
  }

  return importMap;
}

function estimateComplexity(totalFiles) {
  if (totalFiles <= 30) {
    return "small";
  }
  if (totalFiles <= 150) {
    return "moderate";
  }
  if (totalFiles <= 500) {
    return "large";
  }
  return "very-large";
}

async function main() {
  const projectRootArgument = process.argv[2];
  const outputPathArgument = process.argv[3];
  if (!projectRootArgument || !outputPathArgument) {
    throw new Error("Usage: node ua-project-scan.js <project-root> <output-json>");
  }

  const projectRoot = path.resolve(projectRootArgument);
  const outputPath = path.resolve(outputPathArgument);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Cannot access project directory: ${projectRoot}`);
  }

  const discoveredWithGit = discoverWithGit(projectRoot);
  const originalFiles = (discoveredWithGit ?? discoverRecursively(projectRoot))
    .filter((filePath) => filePath && filePath !== ".")
    .filter((filePath) => {
      try {
        return statSync(path.join(projectRoot, filePath)).isFile();
      } catch {
        return false;
      }
    });
  const uniqueOriginalFiles = [...new Set(originalFiles)].sort();
  const { files: filteredFiles, filteredByIgnore } = await filterDiscoveredFiles(
    projectRoot,
    uniqueOriginalFiles
  );
  const sortedFiles = [...new Set(filteredFiles)].sort();

  const fileRecords = sortedFiles.map((filePath) => ({
    path: filePath,
    language: detectLanguage(filePath),
    sizeLines: countLines(path.join(projectRoot, filePath)),
    fileCategory: detectCategory(filePath)
  }));
  const languages = [
    ...new Set(
      fileRecords.map((file) => file.language).filter((language) => language !== "unknown")
    )
  ].sort();
  const { frameworks, projectName, rawDescription, goModule } = detectFrameworks(
    projectRoot,
    sortedFiles
  );
  const readmeHead = sortedFiles.includes("README.md")
    ? safeRead(path.join(projectRoot, "README.md")).split(/\r?\n/).slice(0, 10).join("\n")
    : "";
  const importMap = buildImportMap(projectRoot, fileRecords, goModule);
  const result = {
    scriptCompleted: true,
    name: projectName,
    rawDescription,
    readmeHead,
    languages,
    frameworks,
    files: fileRecords,
    totalFiles: fileRecords.length,
    filteredByIgnore,
    estimatedComplexity: estimateComplexity(fileRecords.length),
    importMap
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  const formatted = await prettier.format(JSON.stringify(result), {
    ...(await prettier.resolveConfig(outputPath)),
    filepath: outputPath
  });
  writeFileSync(outputPath, formatted, "utf8");
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Project scan failed: ${message}\n`);
    process.exitCode = 1;
  });
