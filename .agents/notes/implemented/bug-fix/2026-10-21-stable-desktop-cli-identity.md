# Agent Note: Keep desktop CLI identity stable across command leases

Status: implemented

English | [中文](2026-10-21-stable-desktop-cli-identity.zh.md)

## Problem

The upstream CLI binds saved calls to the desktop bridge secret. Main intentionally creates a fresh secret for each command, so a later confirmation can reject the same signed-in account. Updating the production skill without its embedded CLI also leaves incompatible versions.

## Decision

Main adds a domain-separated SHA-256 digest of the selected origin, environment, and active credential to each broker descriptor. It carries no authorization power. Per-command capabilities remain random, scoped, expiring, and independently revoked. The descriptor IPC parser requires the digest.

The application pins the official CLI 1.2.10 archive and applies an explicit two-module overlay during resource preparation. CLI descriptor validation requires the digest, and call identity derives from it instead of the command capability. Reauthorization or credential rotation invalidates prior call identity. The application bundles the verified public production skill 1.2.9; user or project files are not rewritten.

This supplements the [browser account decision](../architecture/2026-09-08-browser-account-authorization.md). Its Main ownership, private descriptor, logout and transport rules remain active; no earlier note is fully superseded.

## Alternatives considered

Reusing command secrets would widen command lifetimes and weaken revocation. Ignoring identity comparisons would permit confirmations from another credential. Updating only the global CLI would not change the application's pinned launcher. An implicit CLI fallback would hide incompatibility.

## Consequences

The overlay must be reviewed when the upstream CLI changes. Existing approvals derived from temporary secrets require a new quote and explicit confirmation. No paid operation is replayed or migrated automatically. Package startup verifies the pinned archive and overlay identity.

## Verification

Real CLI and broker tests prove independent command capabilities share call identity, reauthorization changes identity, invalid descriptors reject before any API request, and ambient credentials cannot replace managed authorization. Resource tests verify the immutable archive, unmodified files, skill inventory and private launcher. Packaged startup and native Windows checks exercise generated resources without paid requests.
