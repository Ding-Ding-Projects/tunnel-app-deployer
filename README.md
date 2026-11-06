# Tunnel App Deployer

A local desktop application that turns a Dockerfile or Docker Compose project into a shareable Cloudflare Quick Tunnel link.

[Documentation and walkthrough](https://ding-ding-projects.github.io/tunnel-app-deployer/) · [Designer handoff](HANDOFF.md)

## Host in one click

Choose a local project, select its web entry point if needed, and press **Host**. The application builds and starts the containers, checks local health, starts a Quick Tunnel, and returns a verified HTTPS link. No AWS account, Cloudflare account, or custom domain is required.

The application runs on your computer. The link lasts only while your computer, containers and tunnel are running, and changes when a new tunnel is created. Anyone with the link can access the application; authentication inside your application remains intact. Quick Tunnels are intended for development and sharing, have no uptime guarantee, support up to 200 in-flight requests, and do not support server-sent events. See [Cloudflare's documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Development status

Desktop and hosting implementation are in progress. No native Windows release or live tunnel has been verified yet. Documentation is a guide to the intended workflow, not proof of a running deployment.

## Development

Requires Node.js 24 and a running Docker installation with Compose v2. The desktop manages its own tunnel process. Missing supported tunnel binaries are intended to be downloaded from a pinned official release and verified by SHA-256. The application must not install Docker silently, accept elevation prompts, or change unrelated containers.

Source responsibilities: `src/backend/` for hosting; `src/main.js` and `src/preload.js` for desktop integration; `src/renderer/` for the interface; `docs/` for the published documentation. Run the available package scripts after the desktop implementation is integrated.
