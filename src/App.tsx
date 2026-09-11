import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  FlaskConical,
  GitBranch,
  Globe2,
  Layers3,
  Maximize,
  Minus,
  Network,
  Pause,
  Play,
  Plus,
  Radio,
  Redo2,
  Rocket,
  Server,
  Settings2,
  ShieldCheck,
  Undo2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  available,
  cost,
  DECISIONS,
  engineeringCost,
  parseSave,
  revenue,
  topology,
  WORKLOADS,
} from "./game/model";
import type { Decision } from "./game/model";
import type { Command, View } from "./game/runtime";

const SAVE_KEY = "scale.company.v1";
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const number = (n: number) =>
  new Intl.NumberFormat("en-US", {
    notation: n >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(n > 0.1 ? 0 : 1)}%`;
const icons = {
  users: Users,
  app: Server,
  db: Database,
  cache: Layers3,
  lb: Network,
};
type Section = "architecture" | "projects" | "journal";
type Position = { x: number; y: number };

function useSimulation() {
  const worker = useRef<Worker | null>(null);
  const latest = useRef<View | null>(null);
  const unlockSave = useRef<(() => void) | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [storage, setStorage] = useState("Saved on this device");
  useEffect(() => {
    let alive = true;
    let release: (() => void) | undefined;
    let cleanup: (() => void) | undefined;
    const start = () => {
      let company = null;
      let originalRaw: string | null = null;
      let protectSave = false;
      try {
        originalRaw = localStorage.getItem(SAVE_KEY);
        company = parseSave(originalRaw);
        protectSave = !!originalRaw && !company;
        if (protectSave)
          setStorage(
            "Unreadable save preserved; this session will not overwrite it",
          );
      } catch {
        setStorage(
          "Storage unavailable. Keep this tab open to retain progress.",
        );
      }
      unlockSave.current = () => {
        protectSave = false;
        try {
          originalRaw = localStorage.getItem(SAVE_KEY);
        } catch {
          originalRaw = null;
        }
      };
      const w = new Worker(new URL("./game/worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (data.type === "error") setError(data.message);
        else {
          latest.current = data.view;
          setView(data.view);
        }
      };
      w.onerror = () =>
        setError(
          "The simulation could not start. Reload to restore your last saved company.",
        );
      w.postMessage({ type: "init", company });
      const save = () => {
        if (!latest.current || protectSave) return;
        try {
          if (localStorage.getItem(SAVE_KEY) !== originalRaw) {
            protectSave = true;
            w.postMessage({ type: "visibility", hidden: true });
            setError(
              "Another tab changed this company. This session has stopped to protect your progress. Reload to use the latest save.",
            );
            return;
          }
          const nextRaw = JSON.stringify({
            ...latest.current.company,
            paused: latest.current.sandbox || latest.current.company.paused,
            savedAt: Date.now(),
          });
          localStorage.setItem(SAVE_KEY, nextRaw);
          originalRaw = nextRaw;
          setStorage("Saved on this device");
        } catch {
          setStorage("Could not save. Keep this tab open to retain progress.");
        }
      };
      const visibility = () => {
        if (document.hidden) save();
        w.postMessage({ type: "visibility", hidden: document.hidden });
      };
      const timer = window.setInterval(() => {
        if (!document.hidden) save();
      }, 3000);
      window.addEventListener("pagehide", save);
      document.addEventListener("visibilitychange", visibility);
      cleanup = () => {
        save();
        clearInterval(timer);
        window.removeEventListener("pagehide", save);
        document.removeEventListener("visibilitychange", visibility);
        w.terminate();
        worker.current = null;
      };
    };
    if (navigator.locks) {
      void navigator.locks
        .request(
          "scale-company-writer",
          { ifAvailable: true },
          async (lock) => {
            if (!alive) return;
            if (!lock) {
              setError(
                "Scale is already running in another tab. Close that tab, then reload here to continue your company.",
              );
              return;
            }
            start();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          },
        )
        .catch(() => {
          if (alive)
            setError(
              "Could not acquire the company save lock. Reload to try again.",
            );
        });
    } else start();
    return () => {
      alive = false;
      cleanup?.();
      release?.();
    };
  }, []);
  const send = (command: Command) => {
    if (command.type === "reset-company") unlockSave.current?.();
    worker.current?.postMessage(command);
  };
  return { view, send, error, storage };
}

function TrafficSlider({
  value,
  change,
}: {
  value: number;
  change: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <input
      aria-label="Sandbox requests per second"
      type="range"
      min="10"
      max="5000"
      step="10"
      value={draft}
      onChange={(e) => {
        const next = Number(e.target.value);
        setDraft(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => change(next), 150);
      }}
    />
  );
}

function Sparkline({
  values,
  color = "var(--green)",
  height = 65,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (n, i) =>
        `${(i / Math.max(1, values.length - 1)) * 320},${height - 5 - (n / max) * (height - 12)}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 320 ${height}`}
      role="img"
      aria-label={`Recent trend, latest ${Math.round(values.at(-1) ?? 0)}, peak ${Math.round(max)}`}
      preserveAspectRatio="none"
    >
      <path
        d={`M0 ${height - 4}H320`}
        stroke="var(--line)"
        strokeDasharray="3 4"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchitectureCanvas({
  view,
  selected,
  select,
}: {
  view: View;
  selected: string;
  select: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [zoom, setZoom] = useState<number | null>(null);
  const [camera, setCamera] = useState<Position | null>(null);
  const gesture = useRef<{
    id: string;
    start: Position;
    origin: Position;
    moving: boolean;
  } | null>(null);
  const t = topology(view.architecture, view.rps, view.workload);
  const vertical = width < 460;
  const columns = width < 760 ? 2 : 3;
  const rows = Math.ceil(t.nodes.length / columns);
  const canvasHeight = vertical
    ? t.nodes.length * 166 + 105
    : rows > 1
      ? rows * 175 + 110
      : 330;
  const nodes = t.nodes.map((n, i) => ({
    ...n,
    ...(vertical
      ? { x: 40, y: 65 + i * 166 }
      : (positions[n.id] ?? {
          x: 40 + (i % columns) * 250,
          y: 100 + Math.floor(i / columns) * 175,
        })),
  }));
  const minX = Math.min(0, ...nodes.map((n) => n.x - 20));
  const minY = Math.min(160, ...nodes.map((n) => n.y - 35));
  const right = Math.max(...nodes.map((n) => n.x + 192));
  const bottom = Math.max(...nodes.map((n) => n.y + 135));
  const fit = Math.min(
    1,
    (width - 64) / (right - minX + 40),
    (canvasHeight - 100) / (bottom - minY + 40),
  );
  const scale = vertical ? Math.max(0.85, fit) : (zoom ?? fit);
  const autoOffset = {
    x: (width - (right - minX) * scale) / 2 - minX * scale,
    y: (canvasHeight - (bottom - minY) * scale) / 2 - minY * scale,
  };
  const offset = vertical ? autoOffset : (camera ?? autoOffset);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const o = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const start = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || vertical || e.pointerType === "touch") return;
    const node = nodes.find((n) => n.id === id);
    gesture.current = {
      id,
      start: { x: e.clientX, y: e.clientY },
      origin: node ? { x: node.x, y: node.y } : offset,
      moving: false,
    };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.start.x,
      dy = e.clientY - g.start.y;
    if (!g.moving && Math.hypot(dx, dy) < 5) return;
    if (!g.moving) {
      g.moving = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setZoom(scale);
      setCamera(offset);
    }
    if (g.id === "canvas")
      setCamera({ x: g.origin.x + dx, y: g.origin.y + dy });
    else
      setPositions((p) => ({
        ...p,
        [g.id]: { x: g.origin.x + dx / scale, y: g.origin.y + dy / scale },
      }));
  };
  return (
    <div
      className={`canvas ${view.paused ? "paused" : ""}`}
      ref={host}
      style={{ height: canvasHeight }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("button")) start(e, "canvas");
      }}
      onPointerMove={move}
      onPointerUp={() => {
        gesture.current = null;
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
    >
      <div className="canvas-caption">
        <span className="tiny-dot" />
        {view.sandbox ? "EXPERIMENT BRANCH" : "LIVE ARCHITECTURE"}
        <span className="canvas-region">
          Local simulation <span>·</span> {nodes.length - 1} components
        </span>
      </div>
      <div
        className="world"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <svg
          className="connections"
          width="1800"
          height="800"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10" fill="var(--wire)" />
            </marker>
          </defs>
          {t.edges.map((edge) => {
            const a = nodes.find((n) => n.id === edge.from)!;
            const b = nodes.find((n) => n.id === edge.to)!;
            const ax = vertical ? a.x + 96 : a.x + 192,
              ay = vertical ? a.y + 123 : a.y + 58,
              bx = vertical ? b.x + 96 : b.x,
              by = vertical ? b.y : b.y + 58;
            const wrap = !vertical && bx < ax && by > ay + 130;
            const d = vertical
              ? `M${ax} ${ay}L${bx} ${by}`
              : wrap
                ? `M${ax} ${ay}H${ax + 20}V${ay + 92}H${bx - 20}V${by}H${bx}`
                : `M${ax} ${ay} C${ax + (bx - ax) / 2} ${ay},${bx - (bx - ax) / 2} ${by},${bx} ${by}`;
            return (
              <g key={edge.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="var(--wire)"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow)"
                />
                <path
                  className="flow"
                  d={d}
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth="3"
                  strokeDasharray="3 21"
                />
                <text
                  x={(ax + bx) / 2 + (vertical ? 30 : 0)}
                  y={wrap ? ay + 83 : (ay + by) / 2 - (vertical ? 0 : 13)}
                  textAnchor="middle"
                >
                  {number(view.snapshot.edgeFlow[edge.id] ?? 0)}/s
                </text>
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => {
          const Icon = icons[n.id as keyof typeof icons] ?? Server;
          const stats = view.snapshot.nodes[n.id];
          const util = stats?.utilization ?? 0;
          const description =
            n.id === "users"
              ? `${number(view.company.users)} people`
              : n.id === "app"
                ? `${view.architecture.instances} instance${view.architecture.instances > 1 ? "s" : ""} · tier ${view.architecture.app + 1}`
                : n.id === "db"
                  ? `Primary · tier ${view.architecture.database + 1}`
                  : n.id === "cache"
                    ? "Read-through · 30s TTL"
                    : "Round-robin routing";
          return (
            <button
              key={n.id}
              className={`system-node ${selected === n.id ? "selected" : ""} ${util > 0.85 ? "pressure" : ""} ${n.id === "users" ? "audience-node" : ""}`}
              style={{
                left: n.x,
                top: n.y,
                touchAction: vertical ? "pan-y" : undefined,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                start(e, n.id);
              }}
              onClick={() => {
                select(n.id);
                if (vertical)
                  document.querySelector(".inspector")?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  });
              }}
              aria-label={`Inspect ${n.label}`}
              aria-pressed={selected === n.id}
            >
              <div className="node-heading">
                <Icon size={20} />
                <strong>{n.label}</strong>
                <span className={`node-dot ${util > 0.85 ? "amber" : ""}`} />
              </div>
              <div className="node-description">{description}</div>
              <div className="node-rule" />
              <div className="node-measure">
                <span>
                  {n.id === "users"
                    ? "Requests"
                    : n.id === "cache"
                      ? "Cache hits"
                      : "Utilization"}
                </span>
                <strong>
                  {n.id === "users"
                    ? `${number(view.rps)}/s`
                    : n.id === "cache"
                      ? pct(stats?.hitRate ?? 0)
                      : pct(util)}
                </strong>
              </div>
              <div className="node-meter">
                <i
                  style={{
                    width: `${Math.min(100, (n.id === "users" ? 0.6 : n.id === "cache" ? (stats?.hitRate ?? 0) : util) * 100)}%`,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
      <div className="canvas-bottom">
        <span>
          <span className="legend-dot" />
          Request flow{" "}
          <span className="canvas-hint">
            {vertical ? "· Tap to inspect" : "· Drag to arrange"}
          </span>
        </span>
        {!vertical && (
          <div className="canvas-tools">
            <button
              title="Zoom out"
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(0.25, scale - 0.1))}
            >
              <Minus size={15} />
            </button>
            <span>{Math.round(scale * 100)}%</span>
            <button
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(1.6, scale + 0.1))}
            >
              <Plus size={15} />
            </button>
            <span className="tool-divider" />
            <button
              title="Fit architecture"
              aria-label="Fit architecture"
              onClick={() => {
                setZoom(null);
                setCamera(null);
              }}
            >
              <Maximize size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionPanel({
  view,
  selected,
  send,
}: {
  view: View;
  selected: string;
  send: (command: Command) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const stats = view.snapshot.nodes[selected];
  const name =
    selected === "db"
      ? "MySQL"
      : selected === "app"
        ? "App server"
        : selected === "cache"
          ? "Redis"
          : selected === "lb"
            ? "Load balancer"
            : "Your users";
  const Icon = icons[selected as keyof typeof icons] ?? Database;
  const choices = DECISIONS.filter((d) =>
    selected === "app" || selected === "lb"
      ? ["app", "horizontal"].includes(d.id)
      : selected === "db" || selected === "cache"
        ? ["database", "index", "cache"].includes(d.id)
        : ["app", "database", "cache"].includes(d.id),
  );
  return (
    <aside className="inspector">
      <div className="inspector-label">
        <span>COMPONENT INSPECTOR</span>
        <Settings2 size={15} />
      </div>
      <div className="inspector-title">
        <div className={`component-icon ${selected}`}>
          <Icon size={25} />
        </div>
        <div>
          <h2>{name}</h2>
          <span>
            {selected === "db"
              ? "Relational database"
              : selected === "app"
                ? "Application compute"
                : selected === "cache"
                  ? "Memory cache"
                  : selected === "users"
                    ? WORKLOADS[view.workload].label
                    : "Traffic distribution"}
          </span>
        </div>
        <span
          className={`status-dot ${(stats?.utilization ?? 0) > 0.85 ? "amber" : ""}`}
        />
      </div>
      <div className="inspector-stats">
        <div>
          <span>
            {selected === "users" ? "Offered traffic" : "Concurrency used"}
          </span>
          <strong>
            {selected === "users"
              ? `${number(view.rps)}/s`
              : pct(stats?.utilization ?? 0)}
          </strong>
        </div>
        <div>
          <span title="Recorded work time; waiting is shown separately in the request trace">
            Work time · p99
          </span>
          <strong>
            {Math.round(stats?.p99 ?? 0)}
            <small> ms</small>
          </strong>
        </div>
      </div>
      <div className="inspector-detail">
        <span>Waiting requests</span>
        <strong>{number(stats?.queued ?? 0)}</strong>
      </div>
      <div className="inspector-detail">
        <span>Completed requests</span>
        <strong>{number(stats?.throughput ?? 0)} /s</strong>
      </div>
      <div className={`diagnosis ${(stats?.queued ?? 0) > 4 ? "warning" : ""}`}>
        <Activity size={17} />
        <div>
          <strong>
            {(stats?.queued ?? 0) > 4
              ? "Work is waiting for capacity"
              : "Room to grow"}
          </strong>
          <p>
            {(stats?.queued ?? 0) > 4
              ? `${stats?.queued} requests are waiting here. Compare this component with the rest of the path before spending.`
              : "Watch waiting requests and tail latency as traffic grows. A busy component is not always a bottleneck."}
          </p>
        </div>
      </div>
      <div className="section-label">
        {view.sandbox ? "TRY AN INTERVENTION" : "ENGINEERING DECISIONS"}
        <span>{choices.length} options</span>
      </div>
      <div className="decisions">
        {choices.map((d) => {
          const enabled = available(view.architecture, d.id);
          const delta = cost(upgradePreview(view, d)) - cost(view.architecture);
          return (
            <div
              className={`decision ${expanded === d.id ? "expanded" : ""}`}
              key={d.id}
            >
              <button
                className="decision-toggle"
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                aria-expanded={expanded === d.id}
              >
                <div>
                  <strong>
                    {d.title}
                    {!enabled && <Check size={13} />}
                  </strong>
                  <span>{d.subtitle}</span>
                </div>
                <ChevronDown size={16} />
              </button>
              {expanded === d.id && (
                <div className="decision-body">
                  <p>{d.benefit}</p>
                  <p className="tradeoff">{d.tradeoff}</p>
                  <div className="decision-price">
                    <span>
                      <Clock3 size={13} />
                      {d.hours}h engineering
                    </span>
                    <span>+{money(delta)}/mo</span>
                  </div>
                  <button
                    className="primary full"
                    disabled={
                      !enabled ||
                      (!view.sandbox &&
                        (!!view.company.project ||
                          view.company.cash < d.upfront))
                    }
                    onClick={() =>
                      send(
                        view.sandbox
                          ? { type: "experiment", kind: d.id }
                          : { type: "project", kind: d.id },
                      )
                    }
                  >
                    {!enabled
                      ? "Already implemented"
                      : view.sandbox
                        ? "Test in sandbox"
                        : `Start project · ${money(d.upfront)}`}
                    <ArrowRight size={15} />
                  </button>
                  {!view.sandbox && (
                    <small>
                      {view.company.project
                        ? `Team busy: ${view.company.project.remaining.toFixed(1)}h remaining on the current project.`
                        : view.company.cash < d.upfront
                          ? `${money(d.upfront - view.company.cash)} more cash needed.`
                          : "Engineering burn: $600/mo while active."}
                    </small>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="inspector-note">
        <ShieldCheck size={16} />
        <span>
          {view.sandbox
            ? "Your company is paused and untouched. Experiments do not spend cash."
            : "Changes take engineering time. Compare alternatives in Sandbox before committing."}
        </span>
      </div>
    </aside>
  );
}

function upgradePreview(v: View, d: Decision) {
  const a = { ...v.architecture };
  if (d.id === "app") a.app = Math.min(3, a.app + 1);
  if (d.id === "database") a.database = Math.min(3, a.database + 1);
  if (d.id === "horizontal") a.instances = Math.min(6, a.instances + 1);
  if (d.id === "cache") a.cache = true;
  if (d.id === "index") a.indexed = true;
  return a;
}

export default function App() {
  const { view, send, error, storage } = useSimulation();
  const [selected, setSelected] = useState("db");
  const [section, setSection] = useState<Section>("architecture");
  const [guide, setGuide] = useState(false);
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (guide) dialog.current?.showModal();
    else dialog.current?.close();
  }, [guide]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest("input,select,textarea,button,dialog")
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        send({ type: "pause" });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        send({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  if (!view)
    return (
      <div className="loading">
        <div className="brand-mark">
          <i />
          <i />
          <i />
        </div>
        <h1>Scale</h1>
        <p>{error || "Starting your company…"}</p>
        {error && (
          <button onClick={() => window.location.reload()}>Reload</button>
        )}
      </div>
    );
  const c = view.company,
    s = view.snapshot.system;
  const healthy = s.errorRate < 0.02 && s.p99 < 500;
  const daily = (revenue(c) - cost(c.architecture) - engineeringCost(c)) / 30;
  const currentProject = DECISIONS.find((d) => d.id === c.project?.kind);
  const safeSelected = topology(
    view.architecture,
    view.rps,
    view.workload,
  ).nodes.some((n) => n.id === selected)
    ? selected
    : "db";
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Scale home">
          <div className="brand-mark">
            <i />
            <i />
            <i />
          </div>
          <span>
            scale<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-name">
          <span className="divider" />
          <span className="workspace-avatar">S</span>Sideproject, Inc.
          <ChevronDown size={13} />
        </div>
        <div className="topbar-right">
          <span className="local-save">
            <Check size={13} />
            {storage}
          </span>
          <button
            className="icon-button guide-button"
            aria-label="Open guide"
            onClick={() => setGuide(true)}
          >
            <CircleHelp size={18} />
          </button>
          <span className="user-avatar">You</span>
        </div>
      </header>
      <nav className="sidebar" aria-label="Main navigation">
        <div className="nav-group">
          <span className="nav-label">WORKSPACE</span>
          {(
            [
              { id: "architecture", icon: Network, label: "Architecture" },
              { id: "projects", icon: GitBranch, label: "Engineering" },
              { id: "journal", icon: BookOpen, label: "Company journal" },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              className={`nav-item ${section === n.id ? "active" : ""}`}
              onClick={() => setSection(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "projects" && c.project && (
                <span className="nav-count">1</span>
              )}
            </button>
          ))}
        </div>
        <div className="nav-group">
          <span className="nav-label">LABORATORY</span>
          <button
            aria-label={view.sandbox ? "Return to company" : "Sandbox"}
            className={`nav-item ${view.sandbox ? "active" : ""}`}
            onClick={() => {
              send({ type: view.sandbox ? "return" : "sandbox" });
              setSection("architecture");
            }}
          >
            <FlaskConical size={18} />
            <span>{view.sandbox ? "Return to company" : "Sandbox"}</span>
            <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="chapter-mini">
            <span className="mini-orbit">
              <Globe2 size={23} />
            </span>
            <span>
              Chapter one<strong>Small beginnings</strong>
            </span>
          </div>
          <button
            className="nav-item"
            aria-label="Field guide"
            onClick={() => setGuide(true)}
          >
            <CircleHelp size={18} />
            <span>Field guide</span>
            <span className="keycap">?</span>
          </button>
          <div className="sidebar-foot">
            A systems engineering game<span>Local-first · Early build</span>
          </div>
        </div>
      </nav>
      <main className="main">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              Your company
              <ChevronRight size={12} />
              {view.sandbox ? "Sandbox branch" : "Chapter 01"}
            </div>
            <h1>
              {view.sandbox
                ? "Room to experiment."
                : section === "projects"
                  ? "Make the next move."
                  : section === "journal"
                    ? "Every decision leaves a trace."
                    : "Build for what comes next."}
            </h1>
            <p>
              {view.sandbox
                ? "Try a different architecture. Your company can wait."
                : section === "projects"
                  ? "One team. Limited time. Choose where your engineering effort goes."
                  : section === "journal"
                    ? "Growth, changes, and the moments your architecture met reality."
                    : "A small product, a growing audience. Keep the good things running."}
            </p>
          </div>
          <div className="time-control">
            {!c.launched && !view.sandbox && (
              <button
                className="secondary small launch-shortcut"
                disabled={c.cash < 100}
                onClick={() => send({ type: "launch" })}
              >
                <Rocket size={13} />
                Launch · $100
              </button>
            )}
            <span className="day-label">
              <Clock3 size={14} />
              Day {Math.floor(c.hours / 24) + 1}
              <span>·</span>
              {String(Math.floor(c.hours % 24)).padStart(2, "0")}:00
            </span>
            <div className="transport">
              <button
                aria-label={
                  view.paused ? "Resume simulation" : "Pause simulation"
                }
                title="Space to pause or resume"
                onClick={() => send({ type: "pause" })}
              >
                {view.paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                className={view.speed === 1 ? "chosen" : ""}
                onClick={() => send({ type: "speed", value: 1 })}
              >
                1×
              </button>
              <button
                className={view.speed === 4 ? "chosen" : ""}
                onClick={() => send({ type: "speed", value: 4 })}
              >
                4×
              </button>
            </div>
          </div>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}{" "}
            <button onClick={() => window.location.reload()}>
              Reload saved company
            </button>
          </div>
        )}
        {storage !== "Saved on this device" && (
          <div className="alert" role="status">
            {storage}
          </div>
        )}
        {view.notice && (
          <div className="alert" role="status">
            {view.notice}
          </div>
        )}
        {view.offline && !dismissedOffline && (
          <div className="alert" role="status">
            <Clock3 size={18} />
            {view.offline}
            <button
              aria-label="Dismiss offline report"
              onClick={() => setDismissedOffline(true)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <section className="business-strip" aria-label="Company finances">
          <div>
            <span>
              Active users
              <Users size={14} />
            </span>
            <strong>{number(c.users)}</strong>
            <small className="positive">
              {view.sandbox
                ? "Company time frozen"
                : c.growth && healthy
                  ? "+18% organic / day"
                  : "Organic growth paused"}
            </small>
          </div>
          <div>
            <span>
              Monthly revenue
              <ArrowUpRight size={14} />
            </span>
            <strong>{money(revenue(c))}</strong>
            <small>$2.50 per active user</small>
          </div>
          <div>
            <span>
              Infrastructure
              <Server size={14} />
            </span>
            <strong>
              {money(cost(view.architecture))}
              <em>/mo</em>
            </strong>
            <small>
              {view.sandbox
                ? "Experiment estimate"
                : `${pct(cost(c.architecture) / revenue(c))} of revenue`}
            </small>
          </div>
          <div>
            <span>
              Cash balance
              <Wallet size={14} />
            </span>
            <strong>{money(c.cash)}</strong>
            <small className={daily >= 0 ? "positive" : "negative"}>
              {daily >= 0 ? "+" : ""}
              {money(daily)} / day before errors
            </small>
          </div>
        </section>
        {view.sandbox && (
          <div className="sandbox-banner">
            <FlaskConical size={18} />
            <div>
              <strong>A safe place to ask “what if?”</strong>
              <span>
                Company time is frozen. Measurements restart after each edit
                with the same seed.
              </span>
            </div>
            <button
              className="secondary"
              onClick={() => send({ type: "return" })}
            >
              <ArrowLeft size={14} />
              Return to company
            </button>
          </div>
        )}
        {section === "architecture" && (
          <>
            <div className="workbench">
              <div className="architecture-main">
                <div className="workbench-toolbar">
                  <div className="workbench-title">
                    <Network size={17} />
                    <strong>System architecture</strong>
                    <span className={`health ${healthy ? "" : "degraded"}`}>
                      <span />
                      {healthy ? "Healthy" : "Under pressure"}
                      {view.paused ? " · Paused" : ""}
                    </span>
                  </div>
                  <div className="toolbar-actions">
                    {view.sandbox ? (
                      <>
                        <button
                          className="icon-button"
                          aria-label="Undo experiment"
                          disabled={!view.canUndo}
                          onClick={() => send({ type: "undo" })}
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Redo experiment"
                          disabled={!view.canRedo}
                          onClick={() => send({ type: "redo" })}
                        >
                          <Redo2 size={16} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => send({ type: "reset-sandbox" })}
                        >
                          Reset
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => send({ type: "sandbox" })}
                      >
                        <FlaskConical size={15} />
                        Open in sandbox
                        <ArrowUpRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <ArchitectureCanvas
                  view={view}
                  selected={safeSelected}
                  select={setSelected}
                />
                <div className="traffic-bar">
                  <div>
                    <Radio size={17} />
                    <span>
                      Incoming traffic
                      <strong>
                        {number(view.rps)} <small>req/s</small>
                      </strong>
                    </span>
                  </div>
                  {view.sandbox ? (
                    <label className="traffic-slider">
                      <span>Offered load</span>
                      <TrafficSlider
                        value={view.rps}
                        change={(value) => send({ type: "traffic", value })}
                      />
                    </label>
                  ) : (
                    <span className="traffic-copy">
                      {WORKLOADS[view.workload].label}
                      <small>
                        {pct(WORKLOADS[view.workload].read)} reads ·{" "}
                        {pct(1 - WORKLOADS[view.workload].read)} writes
                      </small>
                    </span>
                  )}
                  {view.sandbox ? (
                    <select
                      aria-label="Sandbox workload"
                      value={view.workload}
                      onChange={(e) =>
                        send({
                          type: "workload",
                          value: e.target.value as "saas" | "analytics",
                        })
                      }
                    >
                      {Object.entries(WORKLOADS).map(([id, w]) => (
                        <option key={id} value={id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      className="secondary small"
                      onClick={() => send({ type: "growth" })}
                    >
                      {c.growth ? "Hold growth" : "Resume growth"}
                    </button>
                  )}
                </div>
                <div className="telemetry">
                  <div className="chart">
                    <div className="chart-heading">
                      <span>
                        <span className="legend-dot" />
                        Successful throughput
                      </span>
                      <strong>
                        {number(s.goodputRps)}
                        <small> req/s</small>
                      </strong>
                    </div>
                    <Sparkline
                      values={view.snapshot.history.map((h) => h.goodput)}
                    />
                    <div className="chart-foot">
                      <span>Recent simulation window</span>
                      <span>Now</span>
                    </div>
                  </div>
                  <div className="chart">
                    <div className="chart-heading">
                      <span>
                        <span className="legend-dot amber-dot" />
                        Tail latency · p99
                      </span>
                      <strong>
                        {number(s.p99)}
                        <small> ms</small>
                      </strong>
                    </div>
                    <Sparkline
                      values={view.snapshot.history.map((h) => h.p99)}
                      color="var(--amber)"
                    />
                    <div className="chart-foot">
                      <span>Target &lt; 500 ms</span>
                      <span className={s.p99 < 500 ? "positive" : "negative"}>
                        {s.p99 < 500 ? "Within target" : "Above target"}
                      </span>
                    </div>
                  </div>
                </div>
                <details className="request-trace">
                  <summary>
                    <GitBranch size={13} />
                    Trace one sampled request
                    <span>
                      {view.snapshot.trace
                        ? `${Math.round(view.snapshot.trace.totalMs)} ms end to end`
                        : "Waiting for a sample"}
                    </span>
                  </summary>
                  <div className="trace-content">
                    <p>
                      One real request in this simulation, not an average.
                      Waiting and work are separate.
                    </p>
                    {view.snapshot.trace?.hops.map((hop, i) => (
                      <div className="trace-hop" key={`${hop.nodeId}-${i}`}>
                        <strong>
                          {hop.nodeId === "db"
                            ? "MySQL"
                            : hop.nodeId === "app"
                              ? "App server"
                              : hop.nodeId === "cache"
                                ? "Redis"
                                : hop.nodeId}
                        </strong>
                        <span>{Math.round(hop.queuedMs)} ms waiting</span>
                        <span>{Math.round(hop.serviceMs)} ms work</span>
                      </div>
                    ))}
                    {view.snapshot.trace && (
                      <p>
                        {view.snapshot.trace.ok
                          ? "Request completed."
                          : `Request failed: ${view.snapshot.trace.reason}.`}{" "}
                        Component p99 reports recorded work time. System p99
                        includes end-to-end waiting.
                      </p>
                    )}
                  </div>
                </details>
                <div className="system-foot">
                  <span>
                    <ShieldCheck size={13} />
                    {pct(s.errorRate)} errors <span>·</span> target &lt; 2%
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setGuide(true)}
                  >
                    How this is simulated
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
              <DecisionPanel view={view} selected={safeSelected} send={send} />
            </div>
            {view.sandbox && view.baseline ? (
              <section className="comparison">
                <div>
                  <FlaskConical size={21} />
                  <h2>Your experiment, side by side</h2>
                  <p>
                    Baseline is the company snapshot when you branched. Changed
                    workloads are different experiments, not like-for-like
                    comparisons.
                  </p>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Measurement</th>
                      <th>Company at branch</th>
                      <th>Current experiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Successful requests/s</td>
                      <td>{number(view.baseline.goodputRps)}</td>
                      <td>{number(s.goodputRps)}</td>
                    </tr>
                    <tr>
                      <td>p99 latency</td>
                      <td>{number(view.baseline.p99)} ms</td>
                      <td>{number(s.p99)} ms</td>
                    </tr>
                    <tr>
                      <td>Error rate</td>
                      <td>{pct(view.baseline.errorRate)}</td>
                      <td>{pct(s.errorRate)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            ) : (
              <section className="next-step">
                <div className="next-icon">
                  <Rocket size={22} />
                </div>
                <div>
                  <span className="section-label">THE NEXT CHAPTER</span>
                  <h2>
                    {c.launched
                      ? "Growth is a good problem to have."
                      : "Your first launch is waiting."}
                  </h2>
                  <p>
                    {c.launched
                      ? "Follow the pressure. Test a change in Sandbox, then give your engineers a project."
                      : "Share your product with the world. A launch brings 3× the audience, and a real test for your architecture."}
                  </p>
                </div>
                <button
                  className={c.launched ? "secondary" : "primary"}
                  disabled={!c.launched && c.cash < 100}
                  onClick={() =>
                    c.launched
                      ? send({ type: "sandbox" })
                      : send({ type: "launch" })
                  }
                >
                  {c.launched ? "Explore a solution" : "Launch your product"}
                  <ArrowRight size={16} />
                </button>
                {!c.launched && (
                  <span className="launch-price">$100 marketing spend</span>
                )}
              </section>
            )}
          </>
        )}
        {section === "projects" && (
          <section className="projects-page">
            <div className="project-intro">
              <GitBranch size={28} />
              <h2>
                {currentProject ? currentProject.title : "Your team is ready."}
              </h2>
              <p>
                {c.project
                  ? `${c.project.remaining.toFixed(1)} company hours until deployment. You can keep diagnosing while your team works.`
                  : "Inspect a component to compare interventions. A project has an upfront cost, a delivery time, and a recurring impact."}
              </p>
              {c.project && (
                <progress
                  aria-label="Engineering project completion"
                  max={c.project.total}
                  value={c.project.total - c.project.remaining}
                />
              )}
              <button
                className="primary"
                onClick={() => setSection("architecture")}
              >
                Back to architecture
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="project-catalog">
              {DECISIONS.map((d) => (
                <article key={d.id}>
                  <div>
                    <h3>{d.title}</h3>
                    <p>{d.benefit}</p>
                    <small>{d.tradeoff}</small>
                  </div>
                  <div>
                    <span>
                      {d.hours}h · {money(d.upfront)} setup
                    </span>
                    <button
                      className="secondary"
                      disabled={
                        !available(c.architecture, d.id) ||
                        !!c.project ||
                        view.sandbox ||
                        c.cash < d.upfront
                      }
                      onClick={() => send({ type: "project", kind: d.id })}
                    >
                      {available(c.architecture, d.id)
                        ? "Start project"
                        : "Implemented"}
                      <ChevronRight size={14} />
                    </button>
                    {available(c.architecture, d.id) && (
                      <small>
                        {view.sandbox
                          ? "Return to company to start a project."
                          : c.project
                            ? `Team busy for ${c.project.remaining.toFixed(1)}h.`
                            : c.cash < d.upfront
                              ? `${money(d.upfront - c.cash)} more cash needed.`
                              : "Adds $600/mo engineering burn while active."}
                      </small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {section === "journal" && (
          <section className="journal">
            {c.events.map((e) => (
              <article key={e.id} className={`journal-entry ${e.tone}`}>
                <div className="journal-time">
                  Day {Math.floor(e.hour / 24) + 1}
                  <span>
                    {String(Math.floor(e.hour % 24)).padStart(2, "0")}:00
                  </span>
                </div>
                <div className="journal-pin">
                  {e.tone === "warn" ? (
                    <Activity size={17} />
                  ) : e.tone === "good" ? (
                    <Check size={17} />
                  ) : (
                    <GitBranch size={17} />
                  )}
                </div>
                <div>
                  <h2>{e.title}</h2>
                  <p>{e.detail}</p>
                </div>
              </article>
            ))}
          </section>
        )}
        {c.project && section !== "projects" && (
          <button
            className="project-dock"
            onClick={() => setSection("projects")}
          >
            <GitBranch size={17} />
            <strong>{currentProject?.title}</strong>
            <span>{c.project.remaining.toFixed(1)}h remaining</span>
            <progress
              aria-label="Engineering project completion"
              max={c.project.total}
              value={c.project.total - c.project.remaining}
            />
            <ArrowUpRight size={15} />
          </button>
        )}
        <footer className="page-footer">
          <span>Build an intuition. Not just a bigger system.</span>
          <span>Fictional economics · Measured simulation</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        className="guide"
        aria-labelledby="guide-title"
        onCancel={() => setGuide(false)}
        onClose={() => {
          setGuide(false);
          setConfirmReset(false);
        }}
      >
        <div className="guide-head">
          <span className="brand">
            <div className="brand-mark">
              <i />
              <i />
              <i />
            </div>
            Field guide
          </span>
          <button
            className="icon-button"
            aria-label="Close guide"
            onClick={() => setGuide(false)}
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="guide-title">
          A little company.
          <br />A lot to learn.
        </h2>
        <p>
          Traffic grows. Systems get busy. Your job is to understand the
          pressure and choose an intervention that makes sense.
        </p>
        <ol>
          <li>
            <strong>Observe.</strong> Select a component. Compare waiting
            requests, utilization, and measured latency.
          </li>
          <li>
            <strong>Experiment.</strong> Branch into Sandbox. Try upgrades or
            change the workload. Undo freely.
          </li>
          <li>
            <strong>Implement.</strong> Return to your company and start an
            engineering project. Watch what changes after deployment.
          </li>
        </ol>
        <div className="guide-facts">
          <h3>What the numbers mean</h3>
          <p>
            One real second advances one company hour at 1×. Request simulation
            has its own clock. Machine tiers map to concurrency, not hardware
            benchmarks. Prices and growth are fictional balancing values.
          </p>
          <p>
            Latency comes from simulated requests. The engine models queues,
            service time, cache hit probability and write contention. It does
            not reproduce MySQL, Redis, real queries, network stacks, or
            correctness guarantees. Cache eligibility and TTL tolerance are
            declared workload assumptions.
          </p>
          <p>
            Offline progress is capped at 24 company hours and stops at a
            service incident. Reopening reconstructs and warms the request
            engine; it does not restore in-flight requests. Saves remain in this
            browser. Company time pauses in Sandbox.
          </p>
          <p>
            <a
              href="https://github.com/xevrion/breakscale"
              target="_blank"
              rel="noreferrer"
            >
              Simulation engine: Breakscale (MIT)
              <ArrowUpRight size={12} />
            </a>
          </p>
        </div>
        <div className="guide-actions">
          <button className="primary" onClick={() => setGuide(false)}>
            Back to building
            <ArrowRight size={16} />
          </button>
          {confirmReset ? (
            <div>
              <p>Replace this company and its saved progress?</p>
              <button
                className="danger-button"
                onClick={() => {
                  send({ type: "reset-company" });
                  setConfirmReset(false);
                  setGuide(false);
                  setSection("architecture");
                }}
              >
                Start a new company
              </button>
              <button
                className="text-button"
                onClick={() => setConfirmReset(false)}
              >
                Keep this company
              </button>
            </div>
          ) : (
            <button
              className="text-button"
              onClick={() => setConfirmReset(true)}
            >
              Start over…
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
