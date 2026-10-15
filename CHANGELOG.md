# Changelog

## 0.1.3

- Rotate the affected model's affinity key after HTTP 507 model-load memory errors, at most three times per session branch.
- Persist recovery state across reload/resume and keep the selected key after successful requests.
- Leave retry scheduling to Pi and all other providers/status codes unchanged.

## 0.1.2

- Publish the Pi package with installation and configuration documentation.
- Add MIT licensing, security guidance, CI, and dependency update configuration.

The runtime header contract remains `<username>:pi:<session-uuid>`.
