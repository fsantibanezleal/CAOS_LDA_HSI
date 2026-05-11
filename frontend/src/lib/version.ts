declare const __APP_BUILD_TIME__: string;
declare const __APP_COMMIT_SHA__: string;
declare const __APP_BRANCH__: string;

export const APP_VERSION = "cycle 81";

export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : "dev";

export const APP_COMMIT_SHA: string =
  typeof __APP_COMMIT_SHA__ !== "undefined" ? __APP_COMMIT_SHA__ : "dev";

export const APP_BRANCH: string =
  typeof __APP_BRANCH__ !== "undefined" ? __APP_BRANCH__ : "dev";
