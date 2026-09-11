# Scale

> Original standalone prototype. The maintained Scale game is now part of
> [SWE Interview Prep](https://learn.significanthobbies.com/play/scale), with its
> [integration and release history](https://github.com/Significant-Hobbies/swe-interview-prep/issues/99).
> This private personal repository preserves the earlier local work; it has no
> separate deployment or active Fleet listing.

A standalone systems engineering idle game. Grow a fictional company, diagnose
capacity pressure, try alternatives in Sandbox, and deliver engineering changes.

## Run locally

Node 24.20.0 and pnpm 10.33.2. If using mise:

```sh
mise exec node@24.20.0 -- pnpm install
mise exec node@24.20.0 -- pnpm dev
```

Development: http://127.0.0.1:5188. Production preview:

```sh
pnpm build
pnpm preview
```

Preview: http://127.0.0.1:4188. The dev and preview origins keep separate saves.

## First session

Launch the product, then watch the request path. Select the overloaded component,
open Sandbox, and compare a larger database, an optimized query path, and Redis.
Change the workload to see why one solution does not always win. Return to the
company and start a project. Space pauses/resumes; 4× accelerates company time.
The field guide explains the model and includes a confirmed start-over action.

## Verification

```sh
pnpm test
pnpm build
pnpm measure
pnpm format:check
```

Measured comparisons: [workloads.json](artifacts/verification/workloads.json).
Browser and review evidence: [verification](artifacts/verification/README.md).

## Architecture and boundaries

- React/TypeScript UI; pure game rules in `src/game`; request simulation in a Web Worker.
- Breakscale's MIT engine is vendored at a pinned commit. Its retained engine tests run alongside Scale's tests. See [notices](THIRD_PARTY_NOTICES.md).
- Game and Sandbox share the engine. Sandbox freezes company time and cannot spend company cash. Its changes are experiments; implement decisions separately after returning.
- One real second is one company hour at 1×. These clocks are not a claim about real infrastructure. Offline catch-up uses the same rules, caps at 24 company hours, stops at a service incident, then pauses for review.
- Web Locks prevent simultaneous writers. A revision check protects browsers without Web Locks. Saves are browser-local, validated, and versioned. Invalid saves are preserved until an explicit start-over action. Closing during Sandbox saves the company paused. Sandbox drafts, node positions and in-flight requests are not persisted.
- The engine restarts and warms its queues on reload/branch changes. Baseline comparison is a snapshot, not a controlled benchmark; workload comparisons can be reproduced using `pnpm measure`.
- Machine tiers map to simulated concurrency. Index optimization is a declared workload-average service-time change; cacheability/TTL tolerance are assumptions. This is not MySQL/Redis emulation, cloud sizing, real provider pricing, or a correctness proof.
- Latency distributions come from simulated requests. Component work p99 excludes local waiting; system p99 and sampled request traces expose end-to-end delay.
- This first chapter caps at 14,000 users and five intervention types. Replicas, sharding, further chapters, cloud sync, exports, arbitrary graph wiring, and learning-account integration are not implemented.

The original prototype did not modify Wars or the learning app. The later SWE
integration is maintained independently; this repository preserves the prototype.
