# Local verification — 2026-09-11

## Automated

- `pnpm test`: 299 passing tests across 13 files. Includes 10 Scale-specific
  tests and retained upstream simulation suites.
- `pnpm build`: TypeScript and production build passed.
- `pnpm measure`: seed 42, 300 offered requests/s, 20 simulation seconds,
  50ms steps. Numeric outputs are in `workloads.json`.

At the same workload and traffic, Redis reduced SaaS database arrival rate from
307/s to 78/s and errors from 38.8% to 0%. For write-heavy analytics it left
database demand at 287/s versus 289/s and did not resolve overload. Adding an
app instance left the database saturated in both workloads. These are model
measurements, not hardware benchmarks or real cloud claims.

## Browser

Verified against production preview at http://127.0.0.1:4188 through CUA:

- Launched a 200-user company, paying $100 and tripling its audience.
- Observed MySQL at 100% utilization, 60 waiting requests, and 21% system errors.
- Branched into Sandbox without altering company time, cash, or architecture.
- Added Redis: observed zero errors and reduced database demand. Undo removed
  the cache; redo restored it.
- Switched to write-heavy analytics: cache hits fell to 3.6%, MySQL saturated,
  and errors returned to 18% at the same 225 offered requests/s.
- Returned to the unchanged company, paid $80 for the 18-hour Redis project,
  and verified deployment in the journal. Growth resumed, reaching 1,376 users;
  the app server then became the next bottleneck. The database had no queued
  requests in that later state.
- Reloaded the company: cash $2,665, 1,376 users, day 7, and deployed Redis
  survived. Transient simulation measurements were reconstructed as documented.
- Opened a second tab: it was blocked with a clear close-other-tab/reload message.
- Dragged an app node by 45px × 30px: measured rendered movement matched, with
  camera/selection preserved.
- Inspected 390, 768, 1440px layouts. Phone uses a readable vertical graph;
  tablet uses wrapped rows. Named navigation survives collapsed labels.

Screenshots are in `../design/`. Independent design and quality review reports
are stored there. The initial detector ran once and reported no findings;
human/code/browser review nevertheless found defects that were corrected.

## Limits

No production deployment, real cloud parity, real device test, assistive
technology session, or long-duration soak test is claimed. The preview remains
an early local product with the scope in README.md. Responsive browser overrides
are evidence of layout, not physical-device performance.
