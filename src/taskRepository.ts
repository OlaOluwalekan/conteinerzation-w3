import type { PrismaClient } from "./generated/prisma/client";
import type { NewTask, TaskUpdate } from "./validation";

/** A task as the API sends it to clients. */
export interface Task {
  id: number;
  title: string;
  done: boolean;
}

/**
 * The contract the routes depend on. Any storage (in-memory array, SQLite,
 * Postgres) can sit behind it; the routes never know which one they get.
 */
export interface TaskRepository {
  findAll(): Promise<Task[]>;
  findById(id: number): Promise<Task | undefined>;
  create(task: NewTask): Promise<Task>;
  /** Returns the updated task, or undefined if no task has that id. */
  update(id: number, changes: TaskUpdate): Promise<Task | undefined>;
  /** Returns true if a task was deleted, false if no task has that id. */
  delete(id: number): Promise<boolean>;
}

const toTask = ({ id, title, done }: Task): Task => ({ id, title, done });

/**
 * Postgres implementation, via Prisma. All database access for the tasks
 * table lives here: swapping storage means swapping this class only.
 */
export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Task[]> {
    const rows = await this.prisma.task.findMany({ orderBy: { id: "asc" } });
    return rows.map(toTask);
  }

  async findById(id: number): Promise<Task | undefined> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    return row ? toTask(row) : undefined;
  }

  async create(task: NewTask): Promise<Task> {
    return toTask(await this.prisma.task.create({ data: task }));
  }

  async update(id: number, changes: TaskUpdate): Promise<Task | undefined> {
    // updateMany doesn't throw on a missing id; count tells us if it existed.
    // Undefined fields are skipped by Prisma, so unsent fields keep their value.
    const { count } = await this.prisma.task.updateMany({ where: { id }, data: changes });
    return count === 0 ? undefined : this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const { count } = await this.prisma.task.deleteMany({ where: { id } });
    return count > 0;
  }
}
