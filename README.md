# Task API: Postgres + Docker Compose

A small CRUD API for a to-do list, built with **TypeScript**, **Express**, **PostgreSQL**
and **Prisma**, running as a two-container stack with Docker Compose.

This is Assignment 3 (BE-04, "Containerize your stack"). It starts from my A2 project
([connecting-db-w3](https://github.com/OlaOluwalekan/connecting-db-w3)), which stored
tasks in SQLite, and moves storage to Postgres running in Docker.

```
A1:  Client -> API -> array in memory
A2:  Client -> API -> SQLite file (tasks.db)
A3:  Client -> API container -> Postgres container -> Docker volume (pgdata)
```

## Quick start

Requirements: **Docker** with Docker Compose. (Node.js 20+ only if you want to run the
app outside Docker.)

```bash
git clone <this repo>
cd <this repo>
cp .env.example .env      # then change POSTGRES_PASSWORD (and DATABASE_URL to match)
docker compose up --build
```

The API is at `http://localhost:3000` (or whatever `APP_PORT` you set in `.env`).

On start-up the stack:

1. starts Postgres and waits until it is healthy (`pg_isready` health check),
2. runs `prisma migrate deploy` in the app container, which runs
   [`prisma/migrations/…_init/migration.sql`](prisma/migrations) to create the `tasks`
   table if it hasn't been applied yet,
3. inserts three example tasks, but only when the table is empty,
4. starts the API.

Stop it with `docker compose down`. Your data stays in the `pgdata` volume. Only
`docker compose down -v` deletes it.

## Configuration (.env)

All settings come from `.env`, which is **gitignored**. [`.env.example`](.env.example)
is committed and lists every variable:

| Variable            | Used by                    | Purpose                                                |
| ------------------- | -------------------------- | ------------------------------------------------------ |
| `POSTGRES_USER`     | compose (db + app)         | Database user                                          |
| `POSTGRES_PASSWORD` | compose (db + app)         | Database password                                      |
| `POSTGRES_DB`       | compose (db + app)         | Database name                                          |
| `APP_PORT`          | compose (app)              | Host port the API is published on (default 3000)       |
| `DATABASE_URL`      | Prisma CLI / `npm run dev` | Connection string when running **on the host**         |

Inside Docker the app doesn't use `DATABASE_URL` from `.env`. Compose builds its own
from the `POSTGRES_*` values with host `db` (the service name), because `localhost`
inside the app container is the app container itself.

## The table: one SQL file

The schema is defined in [`prisma/schema.prisma`](prisma/schema.prisma), and Prisma
generated this migration from it, which is the only SQL that creates the table:

```sql
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
```

Unlike SQLite, Postgres has a real `BOOLEAN`, so the 0/1 to true/false conversion
from A2 is gone.

## Swapping the repository: what changed and what didn't

The point of A2's layering was that switching storage should only touch the data
layer. Here is what actually happened:

| File                   | Changed? | What changed                                                                                                                                          |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/taskRepository.ts` | Rewritten | Now a `TaskRepository` **interface** plus a `PostgresTaskRepository` class that implements it with Prisma. The SQLite class is gone.                     |
| `src/db.ts`             | Rewritten | Creates the Prisma client (with the `pg` driver adapter) and seeds. Table creation moved to the migration SQL.                                          |
| `src/server.ts`         | Small     | Builds `PostgresTaskRepository` and passes it to `createApp`; async start-up and shutdown.                                                              |
| `src/validation.ts`     | **No**    | Untouched.                                                                                                                                             |
| `src/app.ts` (routes)   | **Yes, a little** | Paths, status codes, validation and responses are **unchanged**. Two honest differences, shown below.                                         |

To be honest about the routes: they did change, but only in how they call the
repository, not in what they do.

1. **`async`/`await`.** `better-sqlite3` is synchronous, but every Postgres client in
   Node (Prisma included) returns Promises. So each handler became `async` and each
   repository call got an `await`, e.g.
   `res.json(tasks.findAll())` became `res.json(await tasks.findAll())`.
   Express 5 forwards rejected promises to the error handler, so error handling needed
   no change.
2. **Dependency injection.** In A2, `createApp(db)` built the SQLite repository itself.
   Now `createApp(tasks: TaskRepository)` receives a repository, so `app.ts` doesn't
   import any database code at all. This is the change that makes the *next* storage
   swap touch only `server.ts` and a new repository class.

The lesson: A2's layering held up (no SQL or Prisma leaks into the routes), but a
synchronous repository interface can't survive a move to a networked database. The
interface is now Promise-based, which any future storage (Redis cache, another DB, a
test fake) can implement without touching the routes again.

API behaviour is identical to A2. I re-ran every endpoint against the Postgres stack,
including the error cases (unknown id → 404, `/tasks/abc` → 404, empty body on PUT →
400, malformed JSON → 400, empty title → 400, second DELETE of the same id → 404).

## Proving persistence

What I ran, against the stack on port 3001 (my `APP_PORT`, because 3000 was taken):

```bash
docker compose up -d --build
curl -X POST localhost:3001/tasks -H "Content-Type: application/json" -d '{"title":"Survive a restart"}'
curl -X POST localhost:3001/tasks -H "Content-Type: application/json" -d '{"title":"Persist me too","done":true}'
curl -X PUT  localhost:3001/tasks/1 -H "Content-Type: application/json" -d '{"done":true}'
curl -X DELETE localhost:3001/tasks/2
curl localhost:3001/tasks                 # BEFORE

docker compose down                       # removes BOTH containers (app and db) and the network
docker volume ls | grep pgdata            # the pgdata volume is still there
docker compose up -d                      # brand-new containers
curl localhost:3001/tasks                 # AFTER
```

Before and after were identical:

```json
[{"id":1,"title":"Buy milk","done":true},
 {"id":3,"title":"Finish Assignment 1","done":true},
 {"id":4,"title":"Survive a restart","done":false},
 {"id":5,"title":"Persist me too","done":true}]
```

Three things show it is real persistence and not a re-seed:

- the update (task 1 `done: true`) and the delete (task 2 missing) survived,
- the new rows 4 and 5 are still there,
- the app log after the restart has **no** `Seeded 3 example tasks` line, so the table
  was not empty when the new container started.

`docker compose down` deletes the containers, not just stops them, so the only thing
that carried the data across was the `pgdata` named volume.

## Running the app on the host (optional)

Useful for fast reloads while developing. Postgres still runs in Docker:

```bash
npm install                 # also runs prisma generate
docker compose up -d db     # just the database
npx prisma migrate dev      # apply migrations (and create new ones after schema edits)
npm run dev
```

This uses `DATABASE_URL` from `.env` (host `localhost:5432`).

| Script               | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Start with auto-reload (tsx)                       |
| `npm run build`      | Generate the Prisma client and compile to `dist/`  |
| `npm start`          | Run the compiled build                             |
| `npm run typecheck`  | Type-check without writing files                   |
| `npm run db:migrate` | `prisma migrate dev`                               |

## API

Same as A1/A2.

| Method   | Path         | Body                                                         | Success                      | Errors       |
| -------- | ------------ | ------------------------------------------------------------ | ---------------------------- | ------------ |
| `GET`    | `/tasks`     | none                                                         | `200` with an array of tasks | none         |
| `GET`    | `/tasks/:id` | none                                                         | `200` with the task          | `404`        |
| `POST`   | `/tasks`     | `{ "title": string, "done"?: boolean }`                      | `201` with the created task  | `400`        |
| `PUT`    | `/tasks/:id` | `{ "title"?: string, "done"?: boolean }`, at least one field | `200` with the updated task  | `400`, `404` |
| `DELETE` | `/tasks/:id` | none                                                         | `204`, no content            | `404`        |

## Project structure

```
src/
  server.ts            starts the HTTP server, wires Postgres repository into the app
  app.ts               Express routes (API layer), depends only on the TaskRepository interface
  taskRepository.ts    TaskRepository interface + PostgresTaskRepository (Prisma)
  validation.ts        request body validation
  db.ts                creates the Prisma client, seeds example tasks
  generated/prisma/    generated Prisma client (gitignored)
prisma/
  schema.prisma        Task model -> "tasks" table
  migrations/          the SQL that creates the table
prisma.config.ts       tells Prisma where the schema is and reads DATABASE_URL
Dockerfile             two-stage build: compile, then slim runtime image
docker-compose.yml     app + db, pgdata volume, health check
.env.example           committed template for the gitignored .env
queries.sql            SQL I ran by hand against the database
```

## Exploring the database by hand

Port 5432 is published, so DBeaver (or any client) can connect to `localhost:5432` with
the credentials from `.env`. Or, without installing anything:

```bash
docker compose exec db psql -U tasks -d tasks -c "SELECT * FROM tasks;"
```

The queries in [`queries.sql`](queries.sql) work the same way as in A2.
