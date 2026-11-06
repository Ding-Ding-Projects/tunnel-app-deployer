# Installing and updates

## Install

Download **Tunnel-App-Deployer-Setup-x.y.z.exe** from the latest release and run it. It installs for your Windows account only, with no administrator prompt, and adds Start menu and desktop shortcuts. Uninstall it from **Settings › Apps** in Windows.

The installer is unsigned. Windows may show an unknown-publisher or SmartScreen warning.

## Automatic updates

An installed copy checks the release feed in the background shortly after it starts and then every four hours. When a newer version is found it downloads quietly. When it is ready, a banner offers **Restart to update** or **Later**. Nothing restarts without your choice, and a running tunnel is stopped cleanly first.

The banner says the update is unsigned. The download is checked against the hash in the release feed, which proves it is intact. It does not prove who published it.

**Settings › About** shows the update state and has **Check for updates**. Copies that were not installed with the installer, such as a development build, say that updates are unavailable.

## Code names

Every release is named after a dim sum dish from the public dim sum photo catalogue, shown in **Settings › About** with its photo. A dish is never reused.

Related: about, settings, safety
