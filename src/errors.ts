export class HostsmithError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostsmithError";
  }
}

export class ApiError extends HostsmithError {
  readonly status: number;
  readonly errorCode: string;
  /**
   * The error body's fields besides `error` and `message`, such as the
   * `errors` of an `InvalidRules` refusal or the latest `version` of a
   * `StaleVersion` one. Undefined when the body has none.
   */
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, errorCode: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class AuthError extends ApiError {
  constructor(errorCode: string, message: string) {
    super(401, errorCode, message);
    this.name = "AuthError";
  }
}
