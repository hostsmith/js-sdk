import { HttpClient } from "./http.js";
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

function partitionFromAud(
  token: string,
  partitionUrls: Record<Partition, string>,
): Partition | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;
  const aud = payload.aud;
  if (typeof aud !== "string") return undefined;
  for (const p of KNOWN_PARTITIONS) {
    if (aud === partitionUrls[p]) return p;
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

    let baseUrl: string;
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
    } else {
      const inferred = partitionFromAud(options.accessToken, partitionUrls);
      if (!inferred) {
        throw new Error(
          "Hostsmith client requires `partition` (\"us\" | \"eu\") or `baseUrl`. " +
            "The supplied access token does not have a single-partition `aud` claim, " +
            "so the partition cannot be inferred automatically.",
        );
      }
      baseUrl = partitionUrls[inferred];
    }

    const http = new HttpClient(baseUrl, options.accessToken);

    this.sites = new SitesResource(http);
    this.domains = new DomainsResource(http);
    this.account = new AccountResource(http);
  }
}
