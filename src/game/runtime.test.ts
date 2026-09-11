import { describe, expect, it } from "vitest";
import { Engine } from "../vendor/breakscale/engine";
import { Runtime } from "./runtime";
import { freshCompany, parseSave, topology, upgrade } from "./model";
import type { Architecture, Workload } from "./model";

function measure(a: Architecture, workload: Workload, rps = 300) {
  const e = new Engine(topology(a, rps, workload), 42);
  for (let i = 0; i < 400; i++) e.advance(50);
  return e.snapshot();
}
describe("Scale engineering consequences", () => {
  const base = freshCompany().architecture;
  it("reduces database demand substantially with caching for a read-heavy workload", () => {
    const before = measure(base, "saas");
    const after = measure(upgrade(base, "cache"), "saas");
    expect(after.nodes.db.arrivalRate).toBeLessThan(
      before.nodes.db.arrivalRate * 0.5,
    );
    expect(after.system.p99).toBeLessThan(before.system.p99);
    expect(after.system.errorRate).toBeLessThan(before.system.errorRate);
  });
  it("does not teach Redis as a write-scaling solution", () => {
    const before = measure(base, "analytics");
    const after = measure(upgrade(base, "cache"), "analytics");
    expect(after.nodes.db.arrivalRate).toBeGreaterThan(
      before.nodes.db.arrivalRate * 0.85,
    );
    expect(after.system.errorRate).toBeGreaterThan(0.02);
  });
  it("adding app capacity does not remove the shared database ceiling", () => {
    const after = measure(upgrade(base, "horizontal"), "saas");
    expect(after.nodes.db.utilization).toBeGreaterThan(0.9);
    expect(after.system.errorRate).toBeGreaterThan(0.02);
  });
  it("query optimization is workload dependent and can hurt write-heavy service time", () => {
    const read = topology(upgrade(base, "index"), 100, "saas").nodes.find(
      (n) => n.id === "db",
    )!;
    const write = topology(upgrade(base, "index"), 100, "analytics").nodes.find(
      (n) => n.id === "db",
    )!;
    expect(read.config.serviceMs).toBeLessThan(15);
    expect(write.config.serviceMs).toBeGreaterThan(30);
  });
  it("same topology and seed produce repeatable measured outcomes", () => {
    expect(measure(base, "saas")).toEqual(measure(base, "saas"));
  });
});
describe("Persistent company and sandbox boundaries", () => {
  it("charges once and deploys only after engineering time", () => {
    const r = new Runtime();
    r.command({ type: "project", kind: "database" });
    expect(r.company.cash).toBe(2360);
    expect(r.company.architecture.database).toBe(0);
    r.command({ type: "project", kind: "cache" });
    expect(r.company.cash).toBe(2360);
    for (let i = 0; i < 21; i++) r.step(100);
    expect(r.company.architecture.database).toBe(1);
    expect(r.company.project).toBeNull();
  });
  it("sandbox edits and passage of time cannot mutate the company", () => {
    const r = new Runtime();
    const before = structuredClone(r.company);
    r.command({ type: "sandbox" });
    r.command({ type: "experiment", kind: "cache" });
    r.command({ type: "traffic", value: 1000 });
    for (let i = 0; i < 100; i++) r.step(100);
    expect(r.company).toEqual(before);
    expect(r.view().architecture.cache).toBe(true);
    r.command({ type: "return" });
    expect(r.view().architecture.cache).toBe(false);
    expect(r.company).toEqual(before);
  });
  it("undo and redo restore sandbox architecture without altering company", () => {
    const r = new Runtime();
    r.command({ type: "sandbox" });
    r.command({ type: "experiment", kind: "cache" });
    r.command({ type: "undo" });
    expect(r.view().architecture.cache).toBe(false);
    r.command({ type: "redo" });
    expect(r.view().architecture.cache).toBe(true);
  });
  it("offline advancement is bounded and stops when the service target is missed", () => {
    const c = freshCompany();
    c.users = 1000;
    c.savedAt = Date.now() - 3600000;
    const r = new Runtime(c);
    expect(r.company.hours).toBe(0);
    expect(r.company.paused).toBe(true);
    expect(r.offline).toContain("incident");
    const healthy = freshCompany();
    healthy.savedAt = Date.now() - 3600000;
    const resumed = new Runtime(healthy);
    expect(resumed.company.hours).toBeLessThanOrEqual(24.1);
    expect(resumed.company.hours).toBeGreaterThan(23);
    expect(resumed.company.paused).toBe(true);
  });
  it("rejects malformed, nonfinite, and unsupported saves", () => {
    expect(parseSave("{bad")).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...freshCompany(), version: 99 })),
    ).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...freshCompany(), cash: null })),
    ).toBeNull();
    const c = freshCompany();
    c.architecture.instances = 10000;
    expect(parseSave(JSON.stringify(c))).toBeNull();
    expect(parseSave(JSON.stringify(freshCompany()))?.version).toBe(1);
  });
});
