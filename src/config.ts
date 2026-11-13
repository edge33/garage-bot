export interface Config {
  token: string;
  allowedUserIds: ReadonlySet<number>;
  garageUrl: string;
  garageSecret: string;
  dryRun: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv): Config {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  const rawDryRun = env.DRY_RUN ?? "true";

  if (rawDryRun !== "true" && rawDryRun !== "false") {
    throw new Error("DRY_RUN must be true or false");
  }

  const dryRun = rawDryRun === "true";
  const ids = (env.ALLOWED_TELEGRAM_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim());

  if (
    ids.some(
      (id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)),
    )
  ) {
    throw new Error(
      "ALLOWED_TELEGRAM_USER_IDS must contain positive numeric user IDs",
    );
  }

  let url: URL;

  try {
    url = new URL(env.GARAGE_API_BASE_URL ?? "http://10.0.0.90:8443");
  } catch {
    throw new Error("GARAGE_API_BASE_URL must be an HTTP(S) origin");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("GARAGE_API_BASE_URL must be an HTTP(S) origin");
  }

  const garageSecret = env.GARAGE_API_SECRET ?? "";

  if (!dryRun && !garageSecret.trim()) {
    throw new Error("GARAGE_API_SECRET is required in live mode");
  }

  return {
    token,
    allowedUserIds: new Set(ids.map(Number)),
    garageUrl: new URL("/toggleAction", url).href,
    garageSecret,
    dryRun,
  };
}
