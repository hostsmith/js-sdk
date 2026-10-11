// `__HOSTSMITH_SDK_VERSION__` is the package.json version, which the release
// workflow stamps from the tag before it builds (see globals.d.ts). It is
// undefined when running from source, e.g. in tests.
export const SDK_VERSION: string =
  typeof __HOSTSMITH_SDK_VERSION__ === "string" ? __HOSTSMITH_SDK_VERSION__ : "0.0.0-dev";

/** Product token the SDK appends to every request's `User-Agent`. */
export const SDK_USER_AGENT = `hostsmith-js-sdk/${SDK_VERSION}`;
