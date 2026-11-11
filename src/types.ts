export type Partition = "us" | "eu";

export type HostsmithOptions = {
  /**
   * An OAuth 2.0 access token. Pass this or `apiToken`, not both.
   */
  accessToken?: string;
  /**
   * A Hostsmith API token (`hsat_...`), created by an organization owner in
   * the dashboard. The client exchanges it for 1-hour access tokens and
   * renews them as needed, so it suits CI and other long-running automation.
   * The API token is sent only to the token endpoint. Pass this or
   * `accessToken`, not both.
   */
  apiToken?: string;
  /**
   * The Hostsmith authorization server, where API tokens are exchanged.
   * Defaults to `https://hostsmith.net`. Only needed for non-prod hosts.
   */
  authUrl?: string;
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
  /**
   * Your product token(s) for the `User-Agent` header, e.g.
   * `"my-app/2.1.0"`. The SDK appends its own `hostsmith-js-sdk/<version>`
   * token, so requests carry `User-Agent: my-app/2.1.0 hostsmith-js-sdk/<version>`.
   * Without it, requests carry the SDK token alone.
   */
  userAgent?: string;
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

/**
 * `user`: kept on the hostname and edited through the API, the dashboard or
 * MCP, checked first. `file`: from the live deploy's `_redirects`, changed
 * only by a deploy.
 */
export type RedirectManagedBy = "user" | "file";

export interface RedirectRule {
  managedBy: RedirectManagedBy;
  /** User rules: the rule's id. */
  id?: string;
  /** File rules: the line in `_redirects`, from 1. */
  line?: number;
  /** Source path: exact, with `:name` placeholders, or ending in `/*`. */
  from: string;
  /** Destination path or http(s) URL, with `:splat` and `:name` filled in. */
  to: string;
  /** 301, 302, 303, 307 or 308. */
  status: number;
  /** File rules: the id of the exact user rule for the same path, which answers first. */
  shadowedBy?: string;
}

/** A rule the API refused or a deploy skipped, and why. */
export interface RedirectError {
  /** Line in `_redirects` text, from 1. */
  line?: number;
  /** Position in a list of rules or a batch of operations, from 0. */
  index?: number;
  /** The part of the rule that is wrong. */
  field?: "from" | "to" | "status" | "rule";
  /** Stable error code, such as `UNSUPPORTED_STATUS`. */
  code: string;
  /** What is wrong, and how to fix it. */
  message: string;
}

/** The live deploy's `_redirects`. */
export interface RedirectFileReport {
  deployId: string;
  /** Rules the file gave. */
  applied: number;
  /** Lines skipped as invalid. */
  skippedCount: number;
  /** The first 1,000 skipped lines, with the reason. */
  skipped: RedirectError[];
  /** False while the file rules are switched off. */
  enabled: boolean;
  /** Why none of the file's rules apply: redirects work only on the org's own custom domains. */
  notApplied?: "CUSTOM_DOMAIN_REQUIRED";
}

export interface RedirectLimits {
  /** Size cap of the file and of the user rules, each. */
  maxBytes: number;
  /** Rules per source. */
  maxRules: number;
  /** Rules with a `*` or a placeholder, per source, within `maxRules`. */
  maxPatterns: number;
  /** Characters per rule. */
  maxRuleLength: number;
}

/** A site's redirect rules, in the order they are checked. */
export interface RedirectListResponse {
  /** The user rules' version, 0 before the first save. Pass it to a write to refuse it if the rules changed since. */
  version: number;
  /** All rules of both sources. Read past the first page with `offset`. */
  total: number;
  /** The position of the first rule returned, from 0. */
  offset: number;
  /** One page of the rules, at most 1,000: user rules, then file rules. */
  rules: RedirectRule[];
  /** The live deploy's `_redirects`, or null when it has none. */
  file: RedirectFileReport | null;
  limits: RedirectLimits;
}

export interface RedirectListParams {
  /** Position of the first rule to return, from 0. */
  offset?: number;
  /** Rules to return, at most and by default 1,000. */
  limit?: number;
}

export interface RedirectRuleInput {
  from: string;
  to: string;
  /** 301, 302, 303, 307 or 308. Defaults to 301. */
  status?: number;
}

/** A rule of a new list. A rule sent with an id the list has keeps it. */
export interface RedirectRuleWithId extends RedirectRuleInput {
  id?: string;
}

/** The new list of user rules, as rules or as `_redirects` text. */
export type RedirectSetParams = { rules: RedirectRuleWithId[] } | { text: string };

export interface RedirectWriteOptions {
  /** The version the rules were read at. The write is refused with 412 `StaleVersion` if another change was saved since. */
  version?: number;
}

export type RedirectOperation =
  | { op: "add"; rule: RedirectRuleInput; /** Where to add the rule, from 0. Defaults to the end. */ position?: number }
  | { op: "update"; id: string; rule: RedirectRuleInput }
  | { op: "delete"; id: string };

export interface RedirectAddParams extends RedirectRuleInput {
  /** Where to add the rule, from 0. Defaults to the end. */
  position?: number;
}

export interface RedirectAddResponse {
  rule: { id: string; from: string; to: string; status: number };
  /** The new version. */
  version: number;
}

export interface RedirectTestParams {
  /** The path, with an optional query string. */
  path: string;
  /** `_redirects` text tested in place of the live deploy's file. */
  draftText?: string;
  /** User rules tested in place of the saved ones. */
  draftRules?: RedirectRuleWithId[];
}

export interface RedirectMatch {
  managedBy: RedirectManagedBy;
  /** User rules: the rule's id, when it has one. */
  id?: string;
  /** File rules: the line in `_redirects`. */
  line?: number;
  status: number;
  /** The `Location` the visitor is sent to, with the query string carried over. */
  location: string;
}

export interface RedirectTestResponse {
  /** The rule that answers, or null when the path is served as is. */
  match: RedirectMatch | null;
  /** The drafts' first 1,000 errors: by `index` for draft rules, by `line` for a draft file. */
  errors: RedirectError[];
  /** All the drafts' errors. */
  errorCount: number;
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

export interface AccountUser {
  /** Data partition (residency) the calling user is anchored to. */
  homePartition: Partition | null;
}

export interface Account {
  orgId: string;
  orgName: string;
  user: AccountUser;
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
