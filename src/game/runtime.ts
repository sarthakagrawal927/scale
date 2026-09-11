import { Engine } from "../vendor/breakscale/engine";
import type { SimSnapshot } from "../vendor/breakscale/types";
import {
  available,
  cost,
  DECISIONS,
  engineeringCost,
  freshCompany,
  log,
  revenue,
  topology,
  traffic,
  upgrade,
  WORKLOADS,
} from "./model";
import type { Architecture, Company, Upgrade, Workload } from "./model";

export type Command =
  | { type: "init"; company: Company | null }
  | { type: "pause" }
  | { type: "speed"; value: number }
  | { type: "launch" }
  | { type: "growth" }
  | { type: "project"; kind: Upgrade }
  | { type: "sandbox" }
  | { type: "return" }
  | { type: "reset-sandbox" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "experiment"; kind: Upgrade }
  | { type: "workload"; value: Workload }
  | { type: "traffic"; value: number }
  | { type: "reset-company" };
export interface View {
  company: Company;
  snapshot: SimSnapshot;
  architecture: Architecture;
  rps: number;
  workload: Workload;
  sandbox: boolean;
  speed: number;
  paused: boolean;
  baseline: SimSnapshot["system"] | null;
  canUndo: boolean;
  canRedo: boolean;
  notice: string;
  offline: string;
}
interface Experiment {
  architecture: Architecture;
  rps: number;
  workload: Workload;
}
export class Runtime {
  company = freshCompany();
  engine = new Engine(
    topology(
      this.company.architecture,
      traffic(this.company),
      this.company.workload,
    ),
    42,
  );
  sandbox: Experiment | null = null;
  history: Experiment[] = [];
  future: Experiment[] = [];
  baseline: SimSnapshot["system"] | null = null;
  speed = 1;
  sandboxPaused = false;
  notice = "";
  offline = "";
  private lastIncident = -100;
  private simulationAge = 0;
  constructor(company: Company | null = null) {
    if (company) this.company = structuredClone(company);
    this.rebuild();
    this.warm();
    if (company && !company.paused) {
      const away = Math.max(0, Date.now() - company.savedAt);
      if (away > 15000) {
        const cap = Math.min(24, away / 1000);
        let progressed = 0;
        while (progressed < cap) {
          const s = this.engine.snapshot();
          if (
            s.system.errorRate > 0.02 ||
            s.system.p99 > 500 ||
            this.company.cash <= 0
          )
            break;
          this.step(100);
          progressed += 0.1;
        }
        this.offline = `While you were away, ${progressed.toFixed(1)} company hours passed. ${progressed < cap ? "Progress stopped at a service incident." : "Offline progress is capped at one company day."} Your company is paused for review.`;
        this.company.paused = true;
      }
    }
  }
  private warm() {
    for (let i = 0; i < 160; i++) this.engine.advance(50);
    this.simulationAge = 8;
  }
  private rebuild() {
    const a = this.sandbox?.architecture ?? this.company.architecture;
    this.engine = new Engine(
      topology(
        a,
        this.sandbox?.rps ?? traffic(this.company),
        this.sandbox?.workload ?? this.company.workload,
        this.sandbox ? 1 : Math.min(1, this.company.cacheAge / 8),
      ),
      42,
    );
    this.simulationAge = 0;
  }
  step(ms: number) {
    if (this.sandbox ? this.sandboxPaused : this.company.paused) return;
    const count = this.speed;
    for (let i = 0; i < count; i++) {
      this.engine.advance(ms);
      this.simulationAge += ms / 1000;
      if (this.sandbox) continue;
      const c = this.company;
      const hours = ms / 1000;
      const s = this.engine.snapshot();
      const healthy = s.system.errorRate < 0.02 && s.system.p99 < 500;
      c.hours += hours;
      if (c.growth && healthy)
        c.users = Math.min(
          14000,
          c.users * Math.exp((Math.log(1.18) * hours) / 24),
        );
      c.cash +=
        ((revenue(c) * (1 - Math.min(1, s.system.errorRate)) -
          cost(c.architecture) -
          engineeringCost(c)) *
          hours) /
        720;
      if (c.architecture.cache) c.cacheAge += hours;
      if (c.project) {
        c.project.remaining -= hours;
        if (c.project.remaining <= 0) {
          const d = DECISIONS.find((d) => d.id === c.project?.kind)!;
          c.architecture = upgrade(c.architecture, d.id);
          c.project = null;
          log(
            c,
            `${d.title}: deployed`,
            d.id === "cache"
              ? "Redis is warming. Watch cache hits grow over the next 8 company hours."
              : "The change is live. Compare throughput, waiting requests and tail latency.",
            "good",
          );
          this.engine.setTopology(
            topology(
              c.architecture,
              traffic(c),
              c.workload,
              Math.min(1, c.cacheAge / 8),
            ),
          );
        }
      }
      this.engine.updateNodeConfig("users", { rps: traffic(c) });
      if (c.architecture.cache)
        this.engine.updateNodeConfig("cache", {
          hitRate:
            WORKLOADS[c.workload].cacheable *
            WORKLOADS[c.workload].read *
            Math.min(1, c.cacheAge / 8),
        });
      if (
        !healthy &&
        c.hours - this.lastIncident > 12 &&
        this.simulationAge > 5
      ) {
        const bottleneck = Object.entries(s.nodes)
          .filter(([id]) => id !== "users")
          .sort(
            (a, b) =>
              b[1].queued - a[1].queued || b[1].utilization - a[1].utilization,
          )[0];
        if (bottleneck) {
          const name =
            bottleneck[0] === "db"
              ? "MySQL"
              : bottleneck[0] === "app"
                ? "App server"
                : bottleneck[0];
          log(
            c,
            `${name} is under pressure`,
            `${bottleneck[1].queued} requests waiting; ${Math.round(bottleneck[1].utilization * 100)}% concurrency utilization. System p99 ${Math.round(s.system.p99)}ms, ${(s.system.errorRate * 100).toFixed(1)}% errors. Organic growth pauses while the service target is missed.`,
            "warn",
          );
          this.lastIncident = c.hours;
        }
      }
      if (c.cash <= 0) {
        c.cash = 0;
        c.paused = true;
        log(
          c,
          "Runway exhausted",
          "The company is paused. Explore alternatives in Sandbox, or start a new company from the guide.",
          "warn",
        );
        break;
      }
    }
  }
  command(command: Exclude<Command, { type: "init" }>) {
    this.notice = "";
    const c = this.company;
    switch (command.type) {
      case "pause":
        if (this.sandbox) this.sandboxPaused = !this.sandboxPaused;
        else if (c.cash > 0) c.paused = !c.paused;
        break;
      case "speed":
        this.speed = [1, 4].includes(command.value) ? command.value : 1;
        break;
      case "growth":
        if (!this.sandbox) c.growth = !c.growth;
        break;
      case "launch":
        if (!this.sandbox && !c.launched && c.cash >= 100) {
          c.cash -= 100;
          c.users *= 3;
          c.launched = true;
          log(
            c,
            "Your launch found its audience",
            "Traffic grew 3×. Marketing cost $100. Follow the request path to see where the pressure lands.",
            "warn",
          );
          this.engine.updateNodeConfig("users", { rps: traffic(c) });
        }
        break;
      case "project": {
        const d = DECISIONS.find((d) => d.id === command.kind);
        if (
          this.sandbox ||
          !d ||
          c.project ||
          !available(c.architecture, d.id)
        ) {
          this.notice = "Finish the current project before starting another.";
          break;
        }
        if (c.cash < d.upfront) {
          this.notice = "There is not enough cash to start this project.";
          break;
        }
        c.cash -= d.upfront;
        c.project = { kind: d.id, remaining: d.hours, total: d.hours };
        log(
          c,
          `${d.title}: started`,
          `${d.hours} company hours to deploy. $${d.upfront} setup cost; engineering burns $600/mo while active.`,
        );
        break;
      }
      case "sandbox":
        if (!this.sandbox) {
          this.baseline = structuredClone(this.engine.snapshot().system);
          this.sandbox = {
            architecture: { ...c.architecture },
            rps: traffic(c),
            workload: c.workload,
          };
          this.history = [];
          this.future = [];
          this.sandboxPaused = false;
          this.rebuild();
          this.warm();
        }
        break;
      case "return":
        this.sandbox = null;
        this.history = [];
        this.future = [];
        this.rebuild();
        this.warm();
        break;
      case "reset-sandbox":
        if (this.sandbox) {
          this.record();
          this.sandbox = {
            architecture: { ...c.architecture },
            rps: traffic(c),
            workload: c.workload,
          };
          this.rebuild();
          this.warm();
        }
        break;
      case "undo":
        if (this.sandbox && this.history.length) {
          this.future.push(structuredClone(this.sandbox));
          this.sandbox = this.history.pop()!;
          this.rebuild();
          this.warm();
        }
        break;
      case "redo":
        if (this.sandbox && this.future.length) {
          this.history.push(structuredClone(this.sandbox));
          this.sandbox = this.future.pop()!;
          this.rebuild();
          this.warm();
        }
        break;
      case "experiment":
        if (
          this.sandbox &&
          available(this.sandbox.architecture, command.kind)
        ) {
          this.record();
          this.sandbox.architecture = upgrade(
            this.sandbox.architecture,
            command.kind,
          );
          this.rebuild();
          this.warm();
        }
        break;
      case "traffic":
        if (this.sandbox && Number.isFinite(command.value)) {
          this.record();
          this.sandbox.rps = Math.max(10, Math.min(5000, command.value));
          this.rebuild();
          this.warm();
        }
        break;
      case "workload":
        if (this.sandbox && command.value in WORKLOADS) {
          this.record();
          this.sandbox.workload = command.value;
          this.rebuild();
          this.warm();
        }
        break;
      case "reset-company":
        this.company = freshCompany();
        this.sandbox = null;
        this.baseline = null;
        this.history = [];
        this.future = [];
        this.offline = "";
        this.lastIncident = -100;
        this.rebuild();
        this.warm();
        break;
    }
  }
  private record() {
    if (this.sandbox) {
      this.history.push(structuredClone(this.sandbox));
      this.history = this.history.slice(-30);
      this.future = [];
    }
  }
  view(): View {
    return {
      company: structuredClone(this.company),
      snapshot: this.engine.snapshot(),
      architecture: this.sandbox?.architecture ?? this.company.architecture,
      rps: this.sandbox?.rps ?? traffic(this.company),
      workload: this.sandbox?.workload ?? this.company.workload,
      sandbox: !!this.sandbox,
      speed: this.speed,
      paused: this.sandbox ? this.sandboxPaused : this.company.paused,
      baseline: this.baseline,
      canUndo: !!this.history.length,
      canRedo: !!this.future.length,
      notice: this.notice,
      offline: this.offline,
    };
  }
}
