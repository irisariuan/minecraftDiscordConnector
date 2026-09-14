# Version pipeline

Steps in this directory run around every `/launcher switch` and
`/launcher pull`, so that work a version needs *done* — not just checked out —
travels with it.

Name them so they sort in the order they should be applied:

```
10-install.sh
20-build.sh
30-migrate.ts
```

Each file is **one step and handles both directions**. It is called with
`apply` or `unapply` as its first argument:

```bash
#!/bin/bash
# 20-build.sh — compile the native helper this version expects.
set -euo pipefail

case "$1" in
  apply)   bun run build:native ;;
  unapply) rm -rf bin/native ;;
esac
```

`*.ts`/`*.js` run under bun, `*.sh` under bash, anything else needs its own
executable bit and shebang. `*.md` files (like this one) are ignored, so the
directory can document itself.

## Order

1. `unapply`, in **reverse** filename order, *before* the checkout moves — so
   each step is torn down by its own version's code.
2. the checkout (plus `bun install` when the dependency manifest changed).
3. `apply`, in **ascending** filename order, from the new checkout.

## Environment

| Variable | Meaning |
| --- | --- |
| `LAUNCHER_PIPELINE_MODE` | `apply` or `unapply` (also argument 1) |
| `LAUNCHER_PIPELINE_STEP` | this step's filename |
| `LAUNCHER_REASON` | `switch`, `pull`, or `manual` |
| `LAUNCHER_FROM_REF` / `LAUNCHER_FROM_SHA` | the version being left |
| `LAUNCHER_TO_REF` / `LAUNCHER_TO_SHA` | the version being moved to |

## Rules

- **Write steps to be idempotent.** A run stops at the first failing step and
  nothing is rolled back automatically.
- A failed `unapply` aborts the switch — nothing is checked out.
- A failed `apply` leaves the checkout on the new version with the pipeline
  half-applied; fix the step and re-run `/launcher pipeline action:apply`.
- Each step gets 10 minutes before it is killed.
- A step with nothing to undo should exit 0 on `unapply`.

Run `/launcher pipeline` to see the steps and which of them are applied, or
`/launcher switch target:… pipeline:false` to move without running any.
