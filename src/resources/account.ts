import type { HttpClient } from "../http.js";
import type { AccountResponse } from "../types.js";

export class AccountResource {
  constructor(private readonly http: HttpClient) {}

  async get(): Promise<AccountResponse> {
    return this.http.get<AccountResponse>("/v1/account");
  }
}
