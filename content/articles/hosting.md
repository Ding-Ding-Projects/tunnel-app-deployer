# Hosting a project

Host builds your project, starts it on this computer, checks it, and only then shows a public HTTPS link.

## The steps you see

| Step | What happens |
| --- | --- |
| Inspect project | Reads the Dockerfile or Compose file and finds the web port and service. |
| Prepare tunnel helper | Uses an installed `cloudflared`, or downloads and verifies the pinned release. |
| Build app | Runs `docker build`, or `docker compose up --build` for Compose. |
| Start container | Starts an app-owned container bound to `127.0.0.1` on a free port. |
| Check local health | Requests the app over HTTP until it answers. |
| Open and verify public link | Creates a Quick Tunnel and requests the public HTTPS address. |

Each step shows its own spinner and timing. If a step fails, the message and the recovery buttons appear on that step, so you never hunt for what went wrong.

## Truthful states

The link card appears only when the backend reports a verified public address. A link printed in the tunnel's log is not enough. If the app stops answering, the link is cleared at once and the screen says so.

## Stopping

**Stop sharing…** opens a two-key confirmation, because visitors lose access immediately. Stopping removes the app-owned container, image and tunnel. Docker volumes and every container the app did not create are left alone. Closing the app also stops sharing.

## Limits of Quick Tunnels

- Up to 200 requests in flight at once.
- Server-sent events are not supported.
- There is no uptime guarantee, and each session gets a new address.

Read the provider's notes at https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

Related: safety, sessions, getting-started
