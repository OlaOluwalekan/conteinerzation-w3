import express, { type NextFunction, type Request, type Response } from "express";
import type { TaskRepository } from "./taskRepository";
import { validateNewTask, validateTaskUpdate } from "./validation";

const NOT_FOUND = { error: "Task not found" };

/** Parses the :id route param; returns undefined if it isn't a positive integer. */
function parseId(req: Request): number | undefined {
  const raw = req.params.id;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** Named dependency checks for /health; each one rejects if its service is down. */
export type HealthChecks = Record<string, () => Promise<void>>;

export function createApp(tasks: TaskRepository, healthChecks: HealthChecks = {}) {
  const app = express();
  app.use(express.json());

  // GET /health — pings every dependency; 200 if all are up, 503 if any is down
  app.get("/health", async (_req: Request, res: Response) => {
    const entries = await Promise.all(
      Object.entries(healthChecks).map(async ([name, check]) => {
        try {
          await check();
          return [name, "up"] as const;
        } catch {
          return [name, "down"] as const;
        }
      }),
    );
    const services = Object.fromEntries(entries);
    const ok = entries.every(([, status]) => status === "up");
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", services });
  });

  // GET /tasks — every task
  app.get("/tasks", async (_req: Request, res: Response) => {
    res.json(await tasks.findAll());
  });

  // GET /tasks/:id — one task, or 404
  app.get("/tasks/:id", async (req: Request, res: Response) => {
    const id = parseId(req);
    const task = id === undefined ? undefined : await tasks.findById(id);
    if (!task) return res.status(404).json(NOT_FOUND);
    res.json(task);
  });

  // POST /tasks — create a task, 201 with the new row, or 400
  app.post("/tasks", async (req: Request, res: Response) => {
    const result = validateNewTask(req.body);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.status(201).json(await tasks.create(result.value));
  });

  // PUT /tasks/:id — update title and/or done; 404 for unknown ids, 400 for bad bodies
  app.put("/tasks/:id", async (req: Request, res: Response) => {
    const id = parseId(req);
    if (id === undefined) return res.status(404).json(NOT_FOUND);
    const result = validateTaskUpdate(req.body);
    if (!result.ok) return res.status(400).json({ error: result.error });
    const task = await tasks.update(id, result.value);
    if (!task) return res.status(404).json(NOT_FOUND);
    res.json(task);
  });

  // DELETE /tasks/:id — 204 on success, 404 for unknown ids
  app.delete("/tasks/:id", async (req: Request, res: Response) => {
    const id = parseId(req);
    if (id === undefined || !(await tasks.delete(id))) return res.status(404).json(NOT_FOUND);
    res.status(204).end();
  });

  // Malformed JSON bodies → 400; anything else unexpected → 500. Always JSON.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Request body is not valid JSON" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
