import assert from "node:assert/strict";
import { userInfo } from "node:os";
import test from "node:test";
import register from "../extensions/thunder-forge-affinity.ts";

test("affinity follows the Pi session and leaves other providers untouched", () => {
  let handler;
  register({ on: (name, callback) => {
    assert.equal(name, "before_provider_headers");
    handler = callback;
  } });
  const request = (sessionId, provider = "thunder-forge") => {
    const event = { headers: { "x-olla-session-id": "old-static-key", Authorization: "test" } };
    handler(event, { model: { provider }, sessionManager: { getSessionId: () => sessionId } });
    return event.headers;
  };
  const first = request("session-a");
  const username = process.env.PI_THUNDER_FORGE_USER?.trim() || userInfo().username;
  assert.deepEqual(first, {
    Authorization: "test", "X-Olla-Session-ID": `${encodeURIComponent(username)}:pi:session-a`,
  });
  assert.deepEqual(request("session-a"), first);
  assert.notEqual(request("session-b")["X-Olla-Session-ID"], first["X-Olla-Session-ID"]);
  assert.deepEqual(request("session-a", "other"), {
    "x-olla-session-id": "old-static-key", Authorization: "test",
  });
});

test("username can be configured and is safe for an HTTP header", (t) => {
  const original = process.env.PI_THUNDER_FORGE_USER;
  t.after(() => {
    if (original === undefined) delete process.env.PI_THUNDER_FORGE_USER;
    else process.env.PI_THUNDER_FORGE_USER = original;
  });
  for (const [value, expected] of [
    [undefined, encodeURIComponent(userInfo().username)],
    ["  ", encodeURIComponent(userInfo().username)],
    ["  alice  ", "alice"],
    ["я: x\r\n", "%D1%8F%3A%20x"],
  ]) {
    if (value === undefined) delete process.env.PI_THUNDER_FORGE_USER;
    else process.env.PI_THUNDER_FORGE_USER = value;
    let handler;
    register({ on: (_name, callback) => { handler = callback; } });
    const event = { headers: {} };
    handler(event, {
      model: { provider: "thunder-forge" }, sessionManager: { getSessionId: () => "session-a" },
    });
    assert.equal(event.headers["X-Olla-Session-ID"], `${expected}:pi:session-a`);
  }
});
