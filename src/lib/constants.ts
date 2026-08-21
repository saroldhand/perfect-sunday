// Version string of the rules a user accepts, not a boolean. If the rules
// change mid-season we need to know who agreed to what, and a boolean cannot
// tell us. Bump this when the rules change; the app re-prompts anyone whose
// stored version is older.
export const TERMS_VERSION = "2026-08-21";

// No custom domain yet, so shares carry the Pages URL. One constant, so buying
// a domain is a one-line change.
export const SHARE_DOMAIN = "saroldhand.github.io/perfect-sunday";

// Phase 1 is magic link only. The Google path needs Google Cloud console setup
// the operator has not done, and a half-configured OAuth button that errors on
// tap is worse than no button. See CLAUDE.md "Deferred".
export const GOOGLE_AUTH_ENABLED = false;
