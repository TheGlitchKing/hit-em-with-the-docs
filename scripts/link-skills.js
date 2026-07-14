#!/usr/bin/env node
// Postinstall — delegates to @theglitchking/claude-plugin-runtime.
// Links the bundled skill (skills/documentation-lifecycle) into
// .claude/skills/ for npm installs; plugin installs get it automatically via
// the plugin's skills/ dir. The runtime also writes the default update-policy
// config and registers the SessionStart hook in .claude/settings.json (with
// plugin-vs-npm dedup).

import { runPostinstall } from "@theglitchking/claude-plugin-runtime";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  runPostinstall({
    packageName: "@theglitchking/hit-em-with-the-docs",
    pluginName: "hit-em-with-the-docs",
    configFile: "hit-em-with-the-docs.json",
    skillsDir: "skills",
    packageRoot,
    hookCommand:
      "node ./node_modules/@theglitchking/hit-em-with-the-docs/hooks/session-start.js",
  });
} catch (err) {
  console.warn(`[hit-em-with-the-docs] postinstall failed: ${err?.message || err}`);
}
