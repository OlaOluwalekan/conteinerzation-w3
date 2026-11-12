-- Hand-run queries against the Postgres "tasks" table, e.g.
--   docker compose exec db psql -U tasks -d tasks
-- or in DBeaver connected to localhost:5432.
-- The API reads straight from the database, so GET /tasks reflects
-- every change made here immediately, with no server restart needed.

-- List every task
SELECT * FROM tasks ORDER BY id;

-- Show only completed tasks (Postgres has a real BOOLEAN, unlike SQLite's 0/1)
SELECT * FROM tasks WHERE done = true;

-- Count all tasks
SELECT COUNT(*) FROM tasks;

-- Mark every task as completed
UPDATE tasks SET done = true;

-- Delete all completed tasks (after the UPDATE above, this empties the table!)
DELETE FROM tasks WHERE done = true;
