import assert from "node:assert/strict";
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
  assert.deepEqual(first, { Authorization: "test", "X-Olla-Session-ID": "user:pi:session-a" });
  assert.deepEqual(request("session-a"), first);
  assert.notEqual(request("session-b")["X-Olla-Session-ID"], first["X-Olla-Session-ID"]);
  assert.deepEqual(request("session-a", "other"), {
    "x-olla-session-id": "old-static-key", Authorization: "test",
  });
});
