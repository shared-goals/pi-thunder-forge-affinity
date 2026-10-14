import { readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function configuredUsername(path: string): string | undefined {
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  const username = settings.thunderForgeAffinity?.username;
  if (username === undefined) return;
  if (typeof username !== "string" || !username.trim()) {
    throw new Error(`thunderForgeAffinity.username must be a non-empty string: ${path}`);
  }
  return username.trim();
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_headers", (event, ctx) => {
    if (ctx.model?.provider !== "thunder-forge") return;

    const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
    const username = process.env.PI_THUNDER_FORGE_USER?.trim()
      || configuredUsername(join(agentDir, "settings.json"))
      || userInfo().username;

    // Replace static headers even in sessions opened before the config change.
    for (const name of Object.keys(event.headers)) {
      if (name.toLowerCase() === "x-olla-session-id") delete event.headers[name];
    }
    event.headers["X-Olla-Session-ID"] = `${encodeURIComponent(username)}:pi:${ctx.sessionManager.getSessionId()}`;
  });
}
