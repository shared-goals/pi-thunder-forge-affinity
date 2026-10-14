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
  let handler;
  register({ on: (name, callback) => {
    assert.equal(name, "before_provider_headers");
    handler = callback;
  } });
  return {
    settings(username) {
      writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
        thunderForgeAffinity: { username },
      }));
    },
    request(sessionId = "session-a", provider = "thunder-forge") {
      const event = { headers: { "x-olla-session-id": "old", Authorization: "test" } };
      handler(event, {
        model: { provider }, sessionManager: { getSessionId: () => sessionId },
      });
      return event.headers;
    },
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
