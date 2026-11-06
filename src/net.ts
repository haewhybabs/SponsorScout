import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FetchContext } from "./types.js";

const lastRequestAtByHost = new Map<string, number>();

async function throttleHost(host: string, minIntervalMs: number): Promise<void> {
  const last = lastRequestAtByHost.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAtByHost.set(host, Date.now());
}

export type PoliteFetchInit = { method?: string; body?: string; headers?: Record<string, string> };

/** Fetch with per-host rate limiting, a timeout, and retry-with-backoff. Never hammers a host. */
export async function politeFetch(url: string, ctx: FetchContext, init?: PoliteFetchInit): Promise<Response> {
  const host = new URL(url).host;
  let lastError: unknown;

  for (let attempt = 0; attempt <= ctx.retries; attempt++) {
    await throttleHost(host, ctx.minIntervalMsPerHost);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    try {
      const res = await fetch(url, {
        method: init?.method,
        body: init?.body,
        headers: { "User-Agent": ctx.userAgent, ...init?.headers },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < ctx.retries) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function cacheKeyToPath(cacheDir: string, cacheKey: string): string {
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheDir, `${safeKey}.json`);
}

/** politeFetch for a JSON endpoint, cached to disk for the day so re-runs don't re-hit the site. */
export async function politeFetchJsonCached<T>(
  url: string,
  ctx: FetchContext,
  cacheKey: string,
  init?: PoliteFetchInit,
): Promise<T> {
  const cachePath = cacheKeyToPath(ctx.cacheDir, cacheKey);
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf-8")) as T;
  }
  const res = await politeFetch(url, ctx, init);
  const text = await res.text();
  mkdirSync(ctx.cacheDir, { recursive: true });
  writeFileSync(cachePath, text, "utf-8");
  return JSON.parse(text) as T;
}

/** politeFetch for a text/HTML endpoint, cached to disk for the day. */
export async function politeFetchTextCached(
  url: string,
  ctx: FetchContext,
  cacheKey: string,
): Promise<string> {
  const cachePath = cacheKeyToPath(ctx.cacheDir, cacheKey).replace(/\.json$/, ".txt");
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, "utf-8");
  }
  const res = await politeFetch(url, ctx);
  const text = await res.text();
  mkdirSync(ctx.cacheDir, { recursive: true });
  writeFileSync(cachePath, text, "utf-8");
  return text;
}
