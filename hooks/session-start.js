#!/usr/bin/env node
// hit-em-with-the-docs SessionStart hook.
// No plugin-specific reconcile step — the runtime's update-check flow
// runs per the configured policy (nudge / auto / off).

import { runSessionStart } from "@theglitchking/claude-plugin-runtime";

await runSessionStart({
  packageName: "@theglitchking/hit-em-with-the-docs",
  pluginName: "hit-em-with-the-docs",
  configFile: "hit-em-with-the-docs.json",
});
