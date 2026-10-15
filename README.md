# Pi Thunder Forge Affinity

[![CI](https://github.com/shared-goals/pi-thunder-forge-affinity/actions/workflows/ci.yml/badge.svg)](https://github.com/shared-goals/pi-thunder-forge-affinity/actions/workflows/ci.yml)

## About

A small [Pi](https://github.com/earendil-works/pi) extension that adds
`X-Olla-Session-ID` to requests for the exact provider ID `thunder-forge`:

```text
<username>:pi:<session-uuid>
```

The same conversation keeps the same key. New conversations, including native
Pi subagent sessions, use their own session IDs. [Olla](https://github.com/thushan/olla)
scopes affinity to the requested model separately.

## Quick start

### 1. Install

```bash
pi install https://github.com/shared-goals/pi-thunder-forge-affinity
```

For a pinned release:

```bash
pi install https://github.com/shared-goals/pi-thunder-forge-affinity@v0.1.3
```

### 2. Configure the username

Add this block to Pi's user settings, normally `~/.pi/agent/settings.json`:

```json
{
  "thunderForgeAffinity": {
    "username": "alice"
  }
}
```

Keep the existing `thunder-forge` provider configuration in `models.json`.
The extension does not configure endpoints, credentials, models, or thinking.

### 3. Reload Pi

Run `/reload` in an open Pi session. A new Pi process loads the package on startup.

## Configuration and header contract

Username priority, from highest to lowest:

1. Non-empty `PI_THUNDER_FORGE_USER` environment variable.
2. `thunderForgeAffinity.username` in Pi's user `settings.json`.
3. The OS account username from `os.userInfo().username`.

For a per-process override:

```bash
PI_THUNDER_FORGE_USER=bob pi
```

`PI_CODING_AGENT_DIR` changes the user settings directory. Project `.pi/settings.json`
files do not override the username. Settings are read before each provider request;
restart Pi to change its inherited environment.

The extension:

- changes headers only for provider ID `thunder-forge`;
- trims the username and percent-encodes it with `encodeURIComponent`;
- replaces existing `X-Olla-Session-ID` headers under any capitalization;
- preserves every other header;
- uses Pi's current session ID instead of generating a new ID per request.

A configured username must be a non-empty string. Invalid settings raise a hook
error; Pi handles that error and may continue the request without affinity.
The header is routing metadata, not authentication. Its username remains readable
and may appear in gateway logs; use a pseudonym when appropriate.

## Subagents

Native background children discover installed packages unless their extension
policy disables normal discovery. Foreground children require explicit loading.

For explicit child loading, find the installed package directory with `pi list`
and add its absolute extension path to Pi's user settings:

```json
{
  "subagents": {
    "defaultSubagentOnlyExtensions": [
      "/absolute/package/path/extensions/thunder-forge-affinity.ts"
    ]
  }
}
```

Agent-specific or project-specific subagent settings can override this default.
A child must load the extension to receive its own affinity key. External CLI/job
agents use their own runner configuration and are outside this Pi hook's scope.

## Olla routing

```text
Pi -> Thunder Forge edge -> Olla -> inference endpoints
 |                           |
 `- sends session header     `- owns pinning and repinning
```

Enable Olla sticky sessions with `session_header` as a key source and preserve the
header through each proxy hop. Inspect `X-Olla-Endpoint`, `X-Olla-Sticky-Session`,
and `X-Olla-Sticky-Key-Source` response headers to verify routing.

Distinct keys allow conversations to be balanced independently; they do not
require different nodes. Affinity does not guarantee a cache hit after eviction,
restart, TTL expiry, failover, or a changed prompt prefix.

## Recovery after HTTP 507

An HTTP 507 model-load memory error advances the affected model's key to
`<username>:pi:<session-uuid>:retry:1`, then `:retry:2` and `:retry:3` on subsequent
matching errors. Other models and sessions keep their own keys. Successful requests
keep the selected key; session metadata preserves it across reload and resume.
The limit is three rotations per model on the active session branch, not three
rotations after every successful request.

The extension does not issue or schedule retries. Enable Pi's retry policy to let
its next attempt use the new key; a later manual request also uses that key.
It recognizes finalized assistant errors beginning with HTTP status 507 and the
oMLX "Cannot load", "projected memory", and "memory ceiling" diagnostics, only when
no response content was generated. Unrelated 507 errors and partial responses do
not change affinity. Pi's HTTP response hook skips non-2xx responses, so recovery
uses the finalized error event before Pi's agent-level retry loop.

A new key requests a fresh Olla selection; it cannot force a different node,
reserve capacity, or free memory. If every eligible node lacks memory, requests
can still fail. No affinity state is changed for other HTTP status codes.

## Updating and removal

Update this package, then run `/reload`:

```bash
pi update https://github.com/shared-goals/pi-thunder-forge-affinity
```

A tagged install stays pinned. To upgrade it, repeat `pi install` with the new tag.

To uninstall:

```bash
pi remove https://github.com/shared-goals/pi-thunder-forge-affinity
```

Also remove this package's entry from `subagents.defaultSubagentOnlyExtensions`
if explicit child loading was configured, then run `/reload`.

## Requirements

- Node.js 24 or newer.
- Pi with `before_provider_headers`, `message_end`, and session metadata APIs; tested with Pi 1.2.0.
- A configured `thunder-forge` provider.
- A downstream router that consumes `X-Olla-Session-ID`.

## Development

```bash
npm test
npm run test:integration # requires an installed Pi CLI
git diff --check
```

Tests cover username precedence, header encoding and validation, per-session
stability, independent conversations, isolation from other providers, and bounded
507 recovery with reload/resume persistence.
CI runs the unit suite on Node.js 24. Integration tests use a local HTTP fixture,
not a live inference service. Set `PI_BIN` for a non-default Pi executable and
`PI_SUBAGENTS_EXTENSION` to the installed `pi-subagents/index.js` to also verify a
native fresh child. Without that optional path the child check is skipped.

## Versioning and security

Versions follow [Semantic Versioning](https://semver.org/). `package.json` contains
the version; annotated release tags use `vMAJOR.MINOR.PATCH` and are immutable.
See [CHANGELOG.md](./CHANGELOG.md) and [SECURITY.md](./SECURITY.md).

## Related documentation

- [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- [Pi extension API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts)
- [Pi subagents](https://github.com/nicobailon/pi-subagents)
- [Olla sticky sessions](https://thushan.github.io/olla/concepts/sticky-sessions/)
- [Thunder Forge](https://github.com/shared-goals/thunder-forge)

## License

[MIT](./LICENSE)
