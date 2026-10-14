# AGENTS.md

## Scope

This repository contains a Pi extension packaged for installation through `pi install`.
Read [README.md](./README.md) before changing installation, configuration, or routing behavior.

- Keep runtime dependencies limited to Node builtins and Pi host APIs. Declare imported host packages in `peerDependencies` with `"*"`.
- Preserve provider isolation: change headers only for `thunder-forge`.
- Preserve username precedence: non-empty `PI_THUNDER_FORGE_USER`, Pi user settings, OS username. Keep the session key stable within one conversation and independent across conversations.
- Cover behavior changes with focused tests. Check real HTTP requests when changing request hooks, and native child sessions when changing subagent integration. Report unit, local HTTP, and live Thunder Forge checks separately.
- Edit this source checkout. Managed copies under `~/.pi/agent/git/` are updated through `pi update`; avoid editing them directly.
- Keep credentials, user-specific settings, and raw config dumps out of tracked files.

## Validation and Git

- Use Node.js 24 or newer. Run `npm test` and `git diff --check` before committing.
- Pull before committing or pushing. Preserve unrelated local changes; use an isolated checkout if they block integration.
- Use imperative Conventional Commit subjects and push to `origin/main` without force.
- Use `gh` for GitHub repository management.

## Versions and releases

- `package.json` is the source of truth for the package version. Use SemVer: patch for compatible fixes, minor for compatible features, major for breaking changes. During `0.x`, increment minor for breaking changes.
- Every release that changes extension behavior must increment the version. Documentation-only commits do not require a version bump or a new release.
- Before a release, run validation on a clean checkout and commit the version, implementation, tests, and documentation. The release commit's `package.json` version must exactly match the tag without its `v` prefix.
- Use annotated release tags named `vMAJOR.MINOR.PATCH`. Push the release commit first, then push that specific tag. Never move, delete, or force-update a published release tag; corrections require a new version.
- Create a release tag only as part of an actual release, not for every commit. Release completion requires verifying the remote tag target and testing standard `pi install` from that tag in an isolated Pi configuration.
- Git installs without a ref follow the remote branch. Tagged installs are pinned; upgrading them requires explicitly installing the new tag. Document this distinction in README.
