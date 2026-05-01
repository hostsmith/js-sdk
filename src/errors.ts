export class HostsmithError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostsmithError";
  }
}

export class ApiError extends HostsmithError {
  readonly status: number;
  readonly errorCode: string;

  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export class AuthError extends ApiError {
  constructor(errorCode: string, message: string) {
    super(401, errorCode, message);
    this.name = "AuthError";
  }
}
