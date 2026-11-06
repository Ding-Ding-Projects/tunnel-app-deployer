# Getting started

Install Docker, open the app, pick a project and press Host. The first-run tour checks your computer for you.

## What you need

- **Docker Desktop or Docker Engine**, running. The app checks for it on every launch and from **Check again** on the Host screen.
- **Docker Compose v2** if you host a Compose project. It ships with Docker Desktop.
- **The tunnel helper** (`cloudflared`). If it is not installed, the app downloads a pinned official release the first time you host and checks its SHA-256 hash before using it. Nothing is installed system-wide.

## The first-run tour

The tour has three steps:

1. **Language and voice.** Choose English, Cantonese or bilingual, and how playful the wording should be.
2. **A real check.** The app asks Docker and the tunnel helper whether they are ready and shows the answers.
3. **Done.** You land on the Host screen.

You can skip the tour at any step and run it again from **Settings › About › Run the welcome tour again**.

## Your first link

1. On **Host**, choose **Dockerfile** or **Compose**.
2. Press the large picker and choose the file.
3. For Compose, pick the web service. Leave the port empty unless the app cannot detect it.
4. Press **Host app** and watch each step finish.
5. When the link card appears, press **Copy link**.

Related: hosting, getting-around, languages
