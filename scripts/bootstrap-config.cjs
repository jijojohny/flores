/**
 * Ensures deployments.json and agent-ids.json exist for local builds.
 * Copies from *.example.json when the real file is missing (never overwrites).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function copyIfMissing(exampleName, destName) {
  const dest = path.join(root, destName);
  if (fs.existsSync(dest)) return;
  const src = path.join(root, exampleName);
  if (!fs.existsSync(src)) {
    console.warn(`[bootstrap-config] missing ${exampleName}, skip ${destName}`);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log(`[bootstrap-config] created ${destName} from ${exampleName}`);
}

copyIfMissing("deployments.example.json", "deployments.json");
copyIfMissing("agent-ids.example.json", "agent-ids.json");
