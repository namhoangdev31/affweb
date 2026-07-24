import { loadServerEnv, productionReadinessIssues } from "../src/lib/env";

const env = loadServerEnv();
const issues = productionReadinessIssues(env);

if (issues.length > 0) {
  console.error("Production environment is not ready:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log("Production environment validation passed.");
}
