import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import test from "node:test";
import register from "../extensions/thunder-forge-affinity.ts";

function fixture(t) {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-affinity-test-"));
  const original = {
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    PI_THUNDER_FORGE_USER: process.env.PI_THUNDER_FORGE_USER,
  };
  process.env.PI_CODING_AGENT_DIR = agentDir;
  delete process.env.PI_THUNDER_FORGE_USER;
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(agentDir, { recursive: true, force: true });
  });
  const handlers = {};
  const entries = new Map();
  const context = (sessionId, provider, model) => ({
    model: { provider, id: model },
    sessionManager: {
      getSessionId: () => sessionId,
      getBranch: () => entries.get(sessionId) ?? [],
    },
  });
  let activeSession;
  const api = {
    on: (name, callback) => { handlers[name] = callback; },
    appendEntry(customType, data) {
      const branch = entries.get(activeSession) ?? [];
      branch.push({ type: "custom", customType, data });
      entries.set(activeSession, branch);
    },
  };
  register(api);
  return {
    settings(username) {
      writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
        thunderForgeAffinity: { username },
      }));
    },
    request(sessionId = "session-a", provider = "thunder-forge", model = "coder") {
      const event = { headers: { "x-olla-session-id": "old", Authorization: "test" } };
      activeSession = sessionId;
      handlers.before_provider_headers(event, context(sessionId, provider, model));
      return event.headers;
    },
    response(status, sessionId = "session-a", provider = "thunder-forge", model = "coder", overrides = {}) {
      activeSession = sessionId;
      handlers.message_end({ message: {
        role: "assistant", provider, model, content: [],
        stopReason: status === 200 ? "stop" : "error",
        errorMessage: `${status}: Cannot load fixture-model: projected memory would exceed memory ceiling`,
        ...overrides,
      } }, context(sessionId, provider, model));
    },
    reload() { register(api); },
  };
}

test("affinity is stable per session and leaves other providers untouched", (t) => {
  const f = fixture(t);
  f.settings("alice");
  const first = f.request();
  assert.deepEqual(first, {
    Authorization: "test", "X-Olla-Session-ID": "alice:pi:session-a",
  });
  assert.deepEqual(f.request(), first);
  assert.notEqual(f.request("session-b")["X-Olla-Session-ID"], first["X-Olla-Session-ID"]);
  assert.deepEqual(f.request("session-a", "other"), {
    "x-olla-session-id": "old", Authorization: "test",
  });
});

test("environment overrides Pi settings, with OS username as fallback", (t) => {
  const f = fixture(t);
  const key = () => f.request()["X-Olla-Session-ID"];
  assert.equal(key(), `${encodeURIComponent(userInfo().username)}:pi:session-a`);
  f.settings("  configured  ");
  assert.equal(key(), "configured:pi:session-a");
  process.env.PI_THUNDER_FORGE_USER = "  override  ";
  assert.equal(key(), "override:pi:session-a");
  process.env.PI_THUNDER_FORGE_USER = " ";
  assert.equal(key(), "configured:pi:session-a");
});

test("settings usernames are validated and encoded for HTTP", (t) => {
  const f = fixture(t);
  f.settings("  я: x\r\n  ");
  assert.equal(f.request()["X-Olla-Session-ID"], "%D1%8F%3A%20x:pi:session-a");
  for (const username of ["", " ", 123, null]) {
    f.settings(username);
    assert.throws(() => f.request(), /username must be a non-empty string/);
  }
  process.env.PI_THUNDER_FORGE_USER = "override";
  assert.equal(f.request()["X-Olla-Session-ID"], "override:pi:session-a");
});

test("507 rotates affinity at most three times and success preserves the selected key", (t) => {
  const f = fixture(t);
  f.settings("alice");
  for (const status of [200, 400, 429, 500, 502, 503]) f.response(status);
  assert.equal(f.request()["X-Olla-Session-ID"], "alice:pi:session-a");
  for (let attempt = 1; attempt <= 3; attempt++) {
    f.response(507);
    const key = `alice:pi:session-a:retry:${attempt}`;
    assert.equal(f.request()["X-Olla-Session-ID"], key);
    f.response(200);
    assert.equal(f.request()["X-Olla-Session-ID"], key);
  }
  f.response(507);
  assert.equal(f.request()["X-Olla-Session-ID"], "alice:pi:session-a:retry:3");
  f.reload();
  assert.equal(f.request()["X-Olla-Session-ID"], "alice:pi:session-a:retry:3");
});

test("507 recovery is isolated by provider, session and model", (t) => {
  const f = fixture(t);
  f.settings("alice");
  f.response(507, "session-a", "other");
  assert.equal(f.request()["X-Olla-Session-ID"], "alice:pi:session-a");
  f.response(507);
  assert.equal(f.request()["X-Olla-Session-ID"], "alice:pi:session-a:retry:1");
  assert.equal(f.request("session-b")["X-Olla-Session-ID"], "alice:pi:session-b");
  assert.equal(f.request("session-a", "thunder-forge", "agent")["X-Olla-Session-ID"],
    "alice:pi:session-a");
});

test("unrelated capacity errors, aborted and partial responses never rotate affinity", (t) => {
  const f = fixture(t);
  f.settings("alice");
  for (const overrides of [
    { errorMessage: "507: disk storage is full" },
    { errorMessage: "500: Cannot load model: projected memory exceeds memory ceiling" },
    { stopReason: "aborted" },
    { model: "agent" },
    { content: [{ type: "text", text: "Partial answer" }] },
  ]) f.response(507, "session-a", "thunder-forge", "coder", overrides);
  assert.equal(f.request()["X-Olla-Session-ID"], "alice:pi:session-a");
});
