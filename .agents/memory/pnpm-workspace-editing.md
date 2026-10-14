---
name: pnpm workspace editing
description: Avoid workspace-manifest drift when the available pnpm version differs from the lockfile conventions.
---

When adding dependencies in this workspace, inspect `pnpm-workspace.yaml` and `pnpm-lock.yaml` after the package command. The available pnpm 10.26.1 rewrote workspace override formatting and changed a catalog specifier while adding test packages.

**Why:** those broad manifest/lock changes were unrelated to the intended dependency additions and needed manual restoration.

**How to apply:** prefer the workspace's compatible pnpm version when available; otherwise review and restore unrelated catalog, override, and comment changes before finishing.
