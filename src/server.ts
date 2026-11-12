import "dotenv/config";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { openRedis } from "./redis";
import { PostgresTaskRepository } from "./taskRepository";

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  const prisma = await openDatabase();
  const redis = await openRedis();

  const app = createApp(new PostgresTaskRepository(prisma), {
    // Each check throws if its dependency is unreachable; /health reports the result.
    postgres: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    redis: async () => {
      await redis.ping();
    },
  });

  const server = app.listen(PORT, () => {
    console.log("Using Postgres database and Redis");
    console.log(`Task API listening on http://localhost:${PORT}`);
  });

  // Close connections cleanly on Ctrl+C / container stop.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      server.close();
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
