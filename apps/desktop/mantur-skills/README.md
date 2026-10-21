# App-bundled production Skill adapter

English | [中文](README.zh.md)

The official production Skill 1.2.9 archive is retained in `archives/mantur-drama-visual-studio-1.2.9.zip` with SHA-256 `980bc9e9f352f1170e0bdfe641a08b7fbaf23854b9f4171d7cc80f1ba674f73b`. [patch-visual-studio.py](patch-visual-studio.py) accepts that immutable archive and a new output path. It changes only `scripts/access-base.mjs` to retain desktop-managed identity when Main supplies a private descriptor; standalone and connector behavior remain unchanged. Missing desktop authorization directs the caller to desktop sign-in rather than a global CLI account.

`source.json` pins the overlaid ZIP, its complete file inventory and the application bundle digest. Resource preparation verifies those identities offline. Main exports the exact embedded CLI entry and the existing CLI state directory, so adapters do not infer a package from a shell launcher or consult an ambient CLI. SDK and CLI overlays are reviewed together when either upstream package changes; never replace the pinned archive with an unverified download.
