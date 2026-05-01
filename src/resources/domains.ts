import type { HttpClient } from "../http.js";
import type { DomainListParams, DomainListResponse } from "../types.js";

export class DomainsResource {
  constructor(private readonly http: HttpClient) {}

  async list(params?: DomainListParams): Promise<DomainListResponse> {
    const query = new URLSearchParams();
    if (params?.shared !== undefined) {
      query.set("shared", String(params.shared));
    }
    const qs = query.toString();
    const path = qs ? `/v1/domains?${qs}` : "/v1/domains";
    return this.http.get<DomainListResponse>(path);
  }
}
