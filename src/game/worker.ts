import { Runtime } from "./runtime";
import type { Command } from "./runtime";
let runtime: Runtime | null = null;
let counter = 0;
let suspended = false;
let hiddenAt = 0;
self.onmessage = ({
  data,
}: MessageEvent<Command | { type: "visibility"; hidden: boolean }>) => {
  try {
    if (data.type === "visibility") {
      if (data.hidden && !suspended) hiddenAt = Date.now();
      if (!data.hidden && suspended && runtime && !runtime.sandbox)
        runtime = new Runtime({ ...runtime.company, savedAt: hiddenAt });
      suspended = data.hidden;
    } else if (data.type === "init") runtime = new Runtime(data.company);
    else runtime?.command(data);
    if (runtime) self.postMessage({ type: "view", view: runtime.view() });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed",
    });
  }
};
setInterval(() => {
  if (!runtime || suspended) return;
  try {
    runtime.step(100);
    if (++counter % 3 === 0)
      self.postMessage({ type: "view", view: runtime.view() });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed",
    });
    runtime = null;
  }
}, 100);
