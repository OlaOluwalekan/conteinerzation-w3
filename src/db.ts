import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const SEED_TASKS = [
  { title: "Buy milk", done: false },
  { title: "Learn SQL", done: false },
  { title: "Finish Assignment 1", done: true },
];

/**
 * Connects to Postgres using DATABASE_URL (from .env locally, or from
 * docker-compose inside the container) and inserts the example tasks
 * only when the table is empty. The table itself is created by the
 * migration SQL in prisma/migrations, not here.
 */
export async function openDatabase(): Promise<PrismaClient> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  await prisma.$connect();

  if ((await prisma.task.count()) === 0) {
    await prisma.task.createMany({ data: SEED_TASKS });
    console.log(`Seeded ${SEED_TASKS.length} example tasks`);
  }

  return prisma;
}
