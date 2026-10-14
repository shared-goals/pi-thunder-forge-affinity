import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_headers", (event, ctx) => {
    if (ctx.model?.provider !== "thunder-forge") return;

    // Replace static headers even in sessions opened before the config change.
    for (const name of Object.keys(event.headers)) {
      if (name.toLowerCase() === "x-olla-session-id") delete event.headers[name];
    }
    event.headers["X-Olla-Session-ID"] = `user:pi:${ctx.sessionManager.getSessionId()}`;
  });
}
