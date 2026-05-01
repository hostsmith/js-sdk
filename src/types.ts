export type Partition = "us" | "eu";

export type HostsmithOptions = {
  accessToken: string;
  /**
   * Data partition to talk to. Required unless `baseUrl` is provided or the
   * access token's `aud` claim is a single string identifying a known
   * partition (in which case it is used as the default).
   */
  partition?: Partition;
  /**
   * Override the API base URL. When provided, takes precedence over
   * `partition` and skips token-based defaulting. Useful for local dev.
   */
  baseUrl?: string;
  /**
   * Override the per-partition base URL map. Merges with defaults, so partial
   * maps work too. Use this to point the SDK at non-prod hosts
   * (e.g. `hostsmith-dev.com`) without hardcoding `baseUrl` per partition.
   * Inference from a token's `aud` claim uses these overridden URLs.
   */
  partitionUrls?: Partial<Record<Partition, string>>;
};

export interface Site {
  id: string;
  subdomain: string;
  domain: string;
  /** Data residency / partition the site lives in. */
  partition?: Partition;
  siteStatus?: string;
  deployId?: string;
  storageUsed?: number;
  createdAt?: string;
}

export interface SiteListResponse {
  sites: Site[];
}

export interface SiteCreateParams {
  subdomain?: string;
  domain: string;
}

export interface SiteCreateResponse {
  siteId: string;
}

export interface SiteDeleteResponse {
  status: string;
}

export interface DeployFile {
  fileName: string;
  content: Buffer;
}

export interface UploadFileEntry {
  fileName: string;
  fileSize: number;
  parts?: number;
}

export interface UploadPartUrl {
  part: number;
  url: string;
}

export interface UploadFileInfo {
  uploadId: string;
  key: string;
  partUploadUrls: UploadPartUrl[];
}

export interface StartUploadResponse {
  versionId: string;
  files: Record<string, UploadFileInfo>;
}

export interface UploadCompletion {
  uploadId: string;
  key: string;
  parts: { ETag: string; PartNumber: number }[];
}

export interface FinalizeUploadResponse {
  status: string;
}

export interface DeployResult {
  versionId: string;
  status: string;
}

export interface Domain {
  id: string;
  name: string;
  shared: boolean;
  /** Data residency / partition the domain lives in. */
  partition: Partition;
  enableApexDomain: boolean;
  enableSubdomains: boolean;
  status: string;
  /**
   * URL where the site is actually served. For apex-enabled domains this is
   * `https://www.<apex>` (the bare apex 301-redirects via apex-link).
   */
  canonicalServedUrl: string;
  /**
   * Whether the bare apex form (e.g. `https://example.com`) is reachable.
   * True only when `enableApexDomain` is true.
   */
  bareApexCovered: boolean;
}

export interface DomainListParams {
  shared?: boolean;
}

export interface DomainListResponse {
  domains: Domain[];
}

export interface AccountPlan {
  title: string;
  sitesLimit: number;
  domainsLimit: number;
  uploadLimit: number;
  storageLimit: number;
  dataResidencySelector: boolean;
}

export interface AccountUsage {
  sites: number;
  domains: number;
  storage: number;
}

export interface Account {
  orgId: string;
  name: string;
  /** Data partition (residency) the account is anchored to. */
  partition: Partition | null;
  plan: AccountPlan;
  usage: AccountUsage;
}

export interface AccountResponse {
  account: Account;
}

export interface PartitionInfo {
  id: Partition;
  label: string;
}

export interface PartitionListResponse {
  partitions: PartitionInfo[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
}
