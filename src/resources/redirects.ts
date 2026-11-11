import type { HttpClient } from "../http.js";
import type {
  RedirectAddParams,
  RedirectAddResponse,
  RedirectListParams,
  RedirectListResponse,
  RedirectOperation,
  RedirectSetParams,
  RedirectTestParams,
  RedirectTestResponse,
  RedirectWriteOptions,
} from "../types.js";

/**
 * A site's redirect rules. User rules are kept on the hostname and checked
 * first; file rules come from the live deploy's `_redirects`. Redirects apply
 * only on the organization's own custom domains: a change to a site on a
 * shared domain is refused with 409 `CustomDomainRequired`.
 *
 * Use `set` or `edit` for bulk work rather than many `add` or `delete` calls.
 */
export class RedirectsResource {
  constructor(private readonly http: HttpClient) {}

  /** The rules in the order they are checked, a page of at most 1,000, with the file's report. */
  async list(siteId: string, params?: RedirectListParams): Promise<RedirectListResponse> {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString();
    return this.http.get<RedirectListResponse>(qs ? `${base(siteId)}?${qs}` : base(siteId));
  }

  /**
   * Replaces the whole list of user rules, from rules or from `_redirects`
   * text, all or nothing. Answers the first page of the new list.
   */
  async set(siteId: string, params: RedirectSetParams, options?: RedirectWriteOptions): Promise<RedirectListResponse> {
    return this.http.put<RedirectListResponse>(base(siteId), params, ifMatch(options));
  }

  /**
   * Applies adds, updates and deletes of user rules in order, as one change:
   * all of them or none. Answers the first page of the new list.
   */
  async edit(siteId: string, operations: RedirectOperation[], options?: RedirectWriteOptions): Promise<RedirectListResponse> {
    return this.http.patch<RedirectListResponse>(base(siteId), { operations }, ifMatch(options));
  }

  /** Adds one user rule to the latest list, at the end or at `position`. */
  async add(siteId: string, params: RedirectAddParams): Promise<RedirectAddResponse> {
    return this.http.post<RedirectAddResponse>(base(siteId), params);
  }

  /** Deletes one user rule by id from the latest list. */
  async delete(siteId: string, ruleId: string): Promise<void> {
    await this.http.delete<void>(`${base(siteId)}/${encodeURIComponent(ruleId)}`);
  }

  /**
   * Stops the live deploy's file rules from applying, or turns them back on,
   * until the next deploy goes live. Answers the first page of the list.
   */
  async setFileRules(siteId: string, enabled: boolean): Promise<RedirectListResponse> {
    return this.http.put<RedirectListResponse>(`${base(siteId)}/file-rules`, { enabled });
  }

  /**
   * The rule that answers a path, with the status and the `Location`, as the
   * site would. Pass `draftText` or `draftRules` to test them in place of the
   * live ones.
   */
  async test(siteId: string, params: RedirectTestParams): Promise<RedirectTestResponse> {
    return this.http.post<RedirectTestResponse>(`${base(siteId)}/test`, params);
  }
}

function base(siteId: string): string {
  return `/v1/sites/${encodeURIComponent(siteId)}/redirects`;
}

function ifMatch(options?: RedirectWriteOptions): Record<string, string> | undefined {
  return options?.version !== undefined ? { "If-Match": `"${options.version}"` } : undefined;
}
