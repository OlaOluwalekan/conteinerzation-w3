import { createClient } from "redis";

/**
 * Connects to Redis using REDIS_URL (from .env locally, or from
 * docker-compose inside the container) and sends one PING to prove the
 * connection works. Nothing is cached yet: W4 will build on this client.
 */
export async function openRedis() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set (copy .env.example to .env)");

  const redis = createClient({ url });
  // Without a listener, a dropped connection would crash the process with an
  // unhandled 'error' event. Log it instead; the client reconnects on its own.
  redis.on("error", (err) => console.error("Redis error:", err.message));

  await redis.connect();
  console.log(`Redis PING -> ${await redis.ping()}`);
  return redis;
}

/** The connected client's type, inferred from openRedis (node-redis generics are verbose). */
export type RedisClient = Awaited<ReturnType<typeof openRedis>>;
