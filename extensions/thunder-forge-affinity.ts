import { readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

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

const RETRY_ENTRY = "thunder-forge-affinity-retry";
const MAX_REPINS = 3;

function retryAttempt(ctx: ExtensionContext): number {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.type !== "custom" || entry.customType !== RETRY_ENTRY) continue;
    const data = entry.data;
    if (!data || typeof data !== "object" || !("model" in data)
      || data.model !== ctx.model?.id || !("attempt" in data)) continue;
    if (typeof data.attempt === "number" && Number.isInteger(data.attempt)
      && data.attempt >= 0 && data.attempt <= MAX_REPINS) return data.attempt;
  }
  return 0;
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
    const attempt = retryAttempt(ctx);
    const suffix = attempt > 0 ? `:retry:${attempt}` : "";
    event.headers["X-Olla-Session-ID"] =
      `${encodeURIComponent(username)}:pi:${ctx.sessionManager.getSessionId()}${suffix}`;
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    // Pi's response hook skips non-2xx responses; finalized errors precede its retry loop.
    if (ctx.model?.provider !== "thunder-forge" || message.role !== "assistant"
      || message.provider !== "thunder-forge" || message.model !== ctx.model.id
      || message.stopReason !== "error" || message.content.length > 0) return;
    const error = message.errorMessage ?? "";
    if (!/^507\b/.test(error)
      || !/Cannot load[\s\S]*projected memory[\s\S]*memory ceiling/.test(error)) return;
    const attempt = retryAttempt(ctx);
    if (attempt >= MAX_REPINS) return;
    // Persist routing state outside model context so reload/resume keeps the successful key.
    pi.appendEntry(RETRY_ENTRY, { model: ctx.model.id, attempt: attempt + 1 });
  });
}
