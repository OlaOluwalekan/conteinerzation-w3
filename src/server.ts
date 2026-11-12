import "dotenv/config";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { PostgresTaskRepository } from "./taskRepository";

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  const prisma = await openDatabase();
  const app = createApp(new PostgresTaskRepository(prisma));

  const server = app.listen(PORT, () => {
    console.log("Using Postgres database");
    console.log(`Task API listening on http://localhost:${PORT}`);
  });

  // Close the database cleanly on Ctrl+C / container stop.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      server.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
