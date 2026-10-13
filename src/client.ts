import { HttpClient, buildUserAgent } from "./http.js";
import { API_TOKEN_PREFIX, ApiTokenSource, DEFAULT_AUTH_URL, type TokenSource } from "./tokens.js";
import { SitesResource } from "./resources/sites.js";
import { DomainsResource } from "./resources/domains.js";
import { AccountResource } from "./resources/account.js";
import type { HostsmithOptions, Partition } from "./types.js";

export const DEFAULT_PARTITION_URLS: Record<Partition, string> = {
  us: "https://us.api.hostsmith.net",
  eu: "https://eu.api.hostsmith.net",
};

const KNOWN_PARTITIONS = Object.keys(DEFAULT_PARTITION_URLS) as Partition[];

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function partitionFromToken(token: string): Partition | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;
  const home = payload.homePartition;
  if (typeof home !== "string") return undefined;
  for (const p of KNOWN_PARTITIONS) {
    if (home === p) return p;
  }
  return undefined;
}

export class Hostsmith {
  readonly sites: SitesResource;
  readonly domains: DomainsResource;
  readonly account: AccountResource;

  constructor(options: HostsmithOptions) {
    const partitionUrls: Record<Partition, string> = {
      ...DEFAULT_PARTITION_URLS,
      ...options.partitionUrls,
    };

    if (options.accessToken && options.apiToken) {
      throw new Error("Pass either `accessToken` or `apiToken` to the Hostsmith client, not both.");
    }
    if (!options.accessToken && !options.apiToken) {
      throw new Error("Hostsmith client requires `accessToken` or `apiToken`.");
    }
    if (options.apiToken !== undefined && !options.apiToken.startsWith(API_TOKEN_PREFIX)) {
      throw new Error(`\`apiToken\` must be a Hostsmith API token, starting with "${API_TOKEN_PREFIX}".`);
    }

    const tokens: string | TokenSource = options.apiToken
      ? new ApiTokenSource(options.apiToken, (options.authUrl ?? DEFAULT_AUTH_URL).replace(/\/+$/, ""), buildUserAgent(options.userAgent))
      : options.accessToken!;

    const missingPartition =
      "Hostsmith client requires `partition` (\"us\" | \"eu\") or `baseUrl`. " +
      "The access token does not carry a `homePartition` claim, " +
      "so the partition cannot be inferred automatically.";

    let baseUrl: string | (() => Promise<string>);
    if (options.baseUrl) {
      baseUrl = options.baseUrl;
    } else if (options.partition) {
      const url = partitionUrls[options.partition];
      if (!url) {
        throw new Error(
          `Unknown partition "${options.partition}". Expected one of: ${KNOWN_PARTITIONS.join(", ")}`,
        );
      }
      baseUrl = url;
    } else if (typeof tokens === "string") {
      const inferred = partitionFromToken(tokens);
      if (!inferred) {
        throw new Error(missingPartition);
      }
      baseUrl = partitionUrls[inferred];
    } else {
      // With an API token, the first exchanged access token names the partition.
      const source = tokens;
      baseUrl = async () => {
        const inferred = partitionFromToken(await source.getToken());
        if (!inferred) throw new Error(missingPartition);
        return partitionUrls[inferred];
      };
    }

    const http = new HttpClient(baseUrl, tokens, options.userAgent);

    this.sites = new SitesResource(http);
    this.domains = new DomainsResource(http);
    this.account = new AccountResource(http);
  }
}
