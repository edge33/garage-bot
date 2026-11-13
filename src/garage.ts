import type { Config } from "./config.ts";

export type Door = "small" | "large";

export type ActionResult =
  | { kind: "sent"; simulated: boolean }
  | { kind: "busy" }
  | { kind: "failed"; status: number }
  | { kind: "uncertain" };

export function createGarage(
  config: Config,
  dependencies: {
    fetch?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
  } = {},
) {
  const request = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? 5000;
  const inFlight = new Set<Door>();
  const lastStarted = new Map<Door, number>();

  return async (door: Door): Promise<ActionResult> => {
    const started = now();

    if (
      inFlight.has(door) ||
      started - (lastStarted.get(door) ?? -Infinity) < 5000
    ) {
      return { kind: "busy" };
    }

    inFlight.add(door);
    lastStarted.set(door, started);

    try {
      // Keep simulation ahead of all network activity, including DNS resolution.
      if (config.dryRun) {
        return { kind: "sent", simulated: true };
      }

      const response = await request(config.garageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: config.garageSecret, door }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });

      await response.body?.cancel();

      return response.ok
        ? { kind: "sent", simulated: false }
        : { kind: "failed", status: response.status };
    } catch {
      // A lost response does not tell us whether the physical action happened.
      return { kind: "uncertain" };
    } finally {
      inFlight.delete(door);
    }
  };
}
