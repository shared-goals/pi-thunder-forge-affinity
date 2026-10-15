import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const extension = fileURLToPath(new URL("../extensions/thunder-forge-affinity.ts", import.meta.url));
const pi = process.env.PI_BIN || "pi";

async function check(t, child) {
  const root = mkdtempSync(join(tmpdir(), "pi-affinity-http-"));
  const home = join(root, "agent");
  mkdirSync(home);
  const requests = [];
  let parentCalls = 0;
  let failures = 1;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const parent = child && body.model === "agent";
    const delegate = parent && parentCalls++ === 0;
    requests.push({ key: req.headers["x-olla-session-id"], model: body.model });
    if (!parent && failures-- > 0) {
      res.writeHead(507, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { type: "server_error", message:
        "Cannot load fixture-model: projected memory would exceed memory ceiling" } }));
      return;
    }
    const delta = delegate ? { role: "assistant", tool_calls: [{ index: 0, id: "delegate",
      type: "function", function: { name: "subagent", arguments: JSON.stringify({
        agent: "worker", task: "Reply with OK only. Do not use tools.",
        model: "thunder-forge/coder", thinking: "off", context: "fresh", async: false,
      }) } }] } : { role: "assistant", content: "OK" };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [part, finish] of [[delta, null], [{}, delegate ? "tool_calls" : "stop"]]) {
      res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk",
        choices: [{ index: 0, delta: part, finish_reason: finish }],
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } })}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  });
  t.after(() => { server.closeAllConnections(); server.close(); rmSync(root, { recursive: true }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const settings = { defaultProvider: "thunder-forge", defaultModel: child ? "agent" : "coder",
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 1 }, extensions: [extension] };
  if (child) {
    settings.extensions.push(process.env.PI_SUBAGENTS_EXTENSION);
    settings.subagents = { defaultSubagentOnlyExtensions: [extension] };
  }
  writeFileSync(join(home, "settings.json"), JSON.stringify(settings));
  writeFileSync(join(home, "models.json"), JSON.stringify({ providers: { "thunder-forge": {
    api: "openai-completions", baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    apiKey: "fixture", models: ["agent", "coder"].map((id) => ({
      id, contextWindow: 128000, maxTokens: 256, input: ["text"],
    })),
  } } }));
  async function run(extra = []) {
    const args = ["--offline", "--print", "--no-context-files", "--no-skills",
      "--no-prompt-templates", "--no-themes", ...(!child ? ["--no-tools"] : []),
      ...extra, "Say OK"];
    const proc = spawn(pi, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
      PI_CODING_AGENT_DIR: home, PI_THUNDER_FORGE_USER: "fixture" } });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => proc.kill("SIGTERM"), 45000);
    try {
      const code = await new Promise((resolve, reject) => {
        proc.on("error", reject); proc.on("close", resolve);
      });
      assert.equal(code, 0, stderr);
      assert.equal(stdout.trim(), "OK", stderr);
    } finally { clearTimeout(timeout); }
  }
  await run();
  const keys = requests.filter((r) => r.model === "coder").map((r) => r.key);
  assert.equal(keys.length, 2);
  assert.equal(keys[1], `${keys[0]}:retry:1`);
  if (child) {
    const parentKeys = requests.filter((r) => r.model === "agent").map((r) => r.key);
    assert.equal(parentKeys.length, 2);
    assert.equal(parentKeys[0], parentKeys[1]);
    assert.notEqual(parentKeys[0], keys[0]);
  } else {
    const files = [];
    function find(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) find(path);
        else if (entry.name.endsWith(".jsonl")) files.push(path);
      }
    }
    find(join(home, "sessions"));
    assert.equal(files.length, 1);
    await run(["--session", files[0]]);
    assert.equal(requests.at(-1).key, keys[1]);
  }
}

test("real Pi retries 507 with a new header and retains it on resume", (t) => check(t, false));
test("native fresh child rotates independently of its parent", {
  skip: !process.env.PI_SUBAGENTS_EXTENSION && "Set PI_SUBAGENTS_EXTENSION to pi-subagents/index.js",
}, (t) => check(t, true));
