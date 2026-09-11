import { defaultConfig } from "../vendor/breakscale/presets";
import type { SimNode, Topology } from "../vendor/breakscale/types";

export type Workload = "saas" | "analytics";
export type Upgrade = "app" | "horizontal" | "database" | "index" | "cache";
export interface Architecture {
  app: number;
  instances: number;
  database: number;
  indexed: boolean;
  cache: boolean;
}
export interface Project {
  kind: Upgrade;
  remaining: number;
  total: number;
}
export interface JournalEntry {
  id: number;
  hour: number;
  title: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
}
export interface Company {
  version: 1;
  hours: number;
  users: number;
  cash: number;
  architecture: Architecture;
  workload: Workload;
  project: Project | null;
  events: JournalEntry[];
  launched: boolean;
  growth: boolean;
  paused: boolean;
  cacheAge: number;
  savedAt: number;
}
export interface Decision {
  id: Upgrade;
  title: string;
  subtitle: string;
  hours: number;
  upfront: number;
  benefit: string;
  tradeoff: string;
}
export const DECISIONS: Decision[] = [
  {
    id: "database",
    title: "Upgrade MySQL",
    subtitle: "More room on one machine",
    hours: 2,
    upfront: 40,
    benefit:
      "Doubles concurrent database work. Useful for both reads and writes.",
    tradeoff:
      "Recurring cost grows faster than capacity. Write contention remains.",
  },
  {
    id: "index",
    title: "Optimize the query path",
    subtitle: "Do less work per request",
    hours: 36,
    upfront: 120,
    benefit:
      "Profiles and indexes the repeated read path. Largest benefit for read-heavy traffic.",
    tradeoff: "Takes engineering time. Index maintenance adds write work.",
  },
  {
    id: "cache",
    title: "Introduce Redis",
    subtitle: "Keep repeat reads off MySQL",
    hours: 18,
    upfront: 80,
    benefit:
      "Serves eligible repeat reads from memory. Warms gradually after deployment.",
    tradeoff:
      "Adds $180/mo. Low-cacheability workloads benefit less. Assumes eligible reads tolerate a 30-second TTL.",
  },
  {
    id: "app",
    title: "Upgrade the app server",
    subtitle: "More compute, same architecture",
    hours: 1,
    upfront: 20,
    benefit: "Doubles application concurrency without adding another service.",
    tradeoff:
      "Does not increase database capacity. Larger machines become expensive.",
  },
  {
    id: "horizontal",
    title: "Add an app instance",
    subtitle: "Spread requests across servers",
    hours: 8,
    upfront: 60,
    benefit:
      "Adds an application instance and a load balancer on the first rollout.",
    tradeoff: "Adds running cost. All instances still share the same database.",
  },
];
export const WORKLOADS = {
  saas: {
    label: "Read-heavy SaaS",
    read: 0.9,
    cacheable: 0.82,
    description: "Repeated dashboard reads. Eventual freshness is acceptable.",
  },
  analytics: {
    label: "Write-heavy analytics",
    read: 0.2,
    cacheable: 0.12,
    description:
      "Frequent event ingestion. Most work cannot be served from a cache.",
  },
};
export const freshCompany = (): Company => ({
  version: 1,
  hours: 0,
  users: 200,
  cash: 2400,
  architecture: {
    app: 0,
    instances: 1,
    database: 0,
    indexed: false,
    cache: false,
  },
  workload: "saas",
  project: null,
  events: [
    {
      id: 0,
      hour: 0,
      title: "A small beginning",
      detail:
        "200 people use your product. One app server and MySQL. See how far a simple system can go.",
      tone: "good",
    },
  ],
  launched: false,
  growth: true,
  paused: false,
  cacheAge: 0,
  savedAt: Date.now(),
});
export const revenue = (c: Company) => c.users * 2.5;
export const traffic = (c: Company) => Math.min(5000, c.users * 0.35);
export const cost = (a: Architecture) =>
  24 * 2.6 ** a.app * a.instances +
  45 * 2.8 ** a.database +
  (a.instances > 1 ? 20 : 0) +
  (a.cache ? 180 : 0);
export const engineeringCost = (c: Company) => (c.project ? 600 : 0);
export function upgrade(a: Architecture, kind: Upgrade): Architecture {
  const n = { ...a };
  if (kind === "app") n.app = Math.min(3, n.app + 1);
  if (kind === "horizontal") n.instances = Math.min(6, n.instances + 1);
  if (kind === "database") n.database = Math.min(3, n.database + 1);
  if (kind === "index") n.indexed = true;
  if (kind === "cache") n.cache = true;
  return n;
}
export function available(a: Architecture, id: Upgrade) {
  return id === "index"
    ? !a.indexed
    : id === "cache"
      ? !a.cache
      : id === "horizontal"
        ? a.instances < 6
        : id === "app"
          ? a.app < 3
          : a.database < 3;
}
export function topology(
  a: Architecture,
  rps: number,
  workload: Workload,
  warm = 1,
): Topology {
  const w = WORKLOADS[workload];
  const nodes: SimNode[] = [];
  const add = (
    id: string,
    kind: SimNode["kind"],
    label: string,
    x: number,
    patch: Partial<SimNode["config"]>,
  ) =>
    nodes.push({
      id,
      kind,
      label,
      x,
      y: 210,
      config: { ...defaultConfig(kind), ...patch },
    });
  add("users", "client", "Your users", 40, {
    rps,
    readFraction: w.read,
    timeoutMs: 1500,
  });
  if (a.instances > 1) add("lb", "lb", "Load balancer", 265, {});
  add("app", "service", "App server", a.instances > 1 ? 490 : 300, {
    capacity: 8 * 2 ** a.app,
    instances: a.instances,
    serviceMs: 18,
    queueLimit: 96,
    timeoutMs: 1200,
    readFraction: w.read,
  });
  if (a.cache)
    add("cache", "cache", "Redis", a.instances > 1 ? 715 : 560, {
      hitRate: w.cacheable * w.read * warm,
      serviceMs: 2,
      readFraction: w.read,
    });
  // A calibrated workload-average service time, not an assertion about hardware QPS.
  // Indexes reduce read service from 30 to 8ms but raise write work from 30 to 36ms.
  const dbMs = a.indexed ? w.read * 8 + (1 - w.read) * 36 : 30;
  add(
    "db",
    "db",
    "MySQL",
    a.cache ? (a.instances > 1 ? 940 : 820) : a.instances > 1 ? 715 : 560,
    {
      capacity: 6 * 2 ** a.database,
      serviceMs: dbMs,
      serviceCv: 0.65,
      queueLimit: 64,
      readFraction: w.read,
      lockMs: 1.5,
    },
  );
  return {
    nodes,
    edges: nodes.slice(1).map((n, i) => ({
      id: `${nodes[i].id}-${n.id}`,
      from: nodes[i].id,
      to: n.id,
      weight: 1,
      latencyMs: 1,
    })),
  };
}
export function log(
  c: Company,
  title: string,
  detail: string,
  tone: JournalEntry["tone"] = "neutral",
) {
  c.events = [
    { id: (c.events[0]?.id ?? 0) + 1, hour: c.hours, title, detail, tone },
    ...c.events,
  ].slice(0, 30);
}
export function parseSave(raw: string | null): Company | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Company;
    const a = c.architecture;
    const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    if (
      c.version !== 1 ||
      !a ||
      !finite(c.hours) ||
      c.hours < 0 ||
      !finite(c.users) ||
      c.users < 0 ||
      !finite(c.cash) ||
      !finite(c.savedAt) ||
      !finite(c.cacheAge) ||
      !["saas", "analytics"].includes(c.workload)
    )
      return null;
    if (
      ![a.app, a.database].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 3,
      ) ||
      !Number.isInteger(a.instances) ||
      a.instances < 1 ||
      a.instances > 6 ||
      typeof a.indexed !== "boolean" ||
      typeof a.cache !== "boolean"
    )
      return null;
    if (
      ![c.paused, c.growth, c.launched].every((n) => typeof n === "boolean") ||
      !Array.isArray(c.events) ||
      c.events.length > 30 ||
      !c.events.every(
        (e) =>
          finite(e.id) &&
          finite(e.hour) &&
          typeof e.title === "string" &&
          typeof e.detail === "string" &&
          ["good", "warn", "neutral"].includes(e.tone),
      )
    )
      return null;
    if (
      c.project &&
      (!DECISIONS.some((d) => d.id === c.project?.kind) ||
        !finite(c.project.total) ||
        !finite(c.project.remaining) ||
        c.project.remaining < 0 ||
        c.project.remaining > c.project.total)
    )
      return null;
    return c;
  } catch {
    return null;
  }
}
