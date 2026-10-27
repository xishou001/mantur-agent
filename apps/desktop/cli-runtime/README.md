# Embedded Mantur CLI input

English | [中文](README.zh.md)

This directory pins the MIT-licensed `@manturhub/cli` 1.2.16 package from the official npm registry. The unmodified archive is 75,061 bytes with SHA-256 `a627582d1d723642fb8683d714c483c16db23b7d68098bba1c6956aaa2f9fd2c`; its 35 entries include the upstream license.

[prepare-cli.ts](../scripts/prepare-cli.ts) verifies the archive, installs only its locked production dependencies with `npm ci`, and prepares desktop resources with retained license files. The independent lock pins `@vercel/detect-agent` 1.2.1 under Apache-2.0, plus the CLI’s JSON-schema validators and `libsql` 0.5.29 with its platform-specific native dependencies. It does not change the root pnpm graph or install a global command.

The preparation applies the reviewed `desktop-stable-identity-v1` overlay to two CLI modules after archive verification. The descriptor parser requires a 64-character identity digest supplied by Main; identity binding hashes that digest instead of the per-command bridge secret. The bridge secret remains the only local command authorization capability. Missing or malformed identity fields fail closed. See the [stable identity decision](../../../.agents/notes/implemented/bug-fix/2026-10-21-stable-desktop-cli-identity.md).

Run the resource preparation from the repository root:

```sh
pnpm --dir apps/desktop run prepare:cli
```

The package and development workflows invoke this preparation before launching or packaging the desktop. The [desktop runtime](../README.md) owns launcher selection and account identity. Replacing this archive requires a reviewed source delivery, new hash, updated independent lock and CLI/broker verification; an absent npm release never selects another version.
