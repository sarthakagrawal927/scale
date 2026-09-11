import { createServer } from "vite";
import { writeFile, mkdir } from "node:fs/promises";
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { Engine } = await server.ssrLoadModule(
    "/src/vendor/breakscale/engine.ts",
  );
  const { topology, freshCompany, upgrade, cost } =
    await server.ssrLoadModule("/src/game/model.ts");
  const rows = [];
  for (const workload of ["saas", "analytics"]) {
    for (const intervention of [
      "baseline",
      "database",
      "index",
      "cache",
      "horizontal",
    ]) {
      const a =
        intervention === "baseline"
          ? freshCompany().architecture
          : upgrade(freshCompany().architecture, intervention);
      const e = new Engine(topology(a, 300, workload), 42);
      for (let i = 0; i < 400; i++) e.advance(50);
      const s = e.snapshot();
      rows.push({
        workload,
        intervention,
        offered: 300,
        goodput: Math.round(s.system.goodputRps),
        p99: Math.round(s.system.p99),
        errorPercent: Math.round(s.system.errorRate * 1000) / 10,
        dbQps: Math.round(s.nodes.db.arrivalRate),
        dbBusy: Math.round(s.nodes.db.utilization * 100),
        costPerMonth: Math.round(cost(a)),
      });
    }
  }
  await mkdir("artifacts/verification", { recursive: true });
  await writeFile(
    "artifacts/verification/workloads.json",
    JSON.stringify(
      {
        seed: 42,
        durationSeconds: 20,
        stepMs: 50,
        note: "Synthetic calibrated model; not hardware benchmarks.",
        rows,
      },
      null,
      2,
    ),
  );
  console.table(rows);
} finally {
  await server.close();
}
