// Version string of the rules a user accepts, not a boolean. If the rules
// change mid-season we need to know who agreed to what, and a boolean cannot
// tell us. Bump this when the rules change; the app re-prompts anyone whose
// stored version is older.
//
// 2026-09-15: the spread layer became a moneyline layer, which changes both
// how to enter and how a winner is determined — the two sections most likely
// to matter to someone who already accepted. Everyone is re-prompted, which is
// the point of storing a version rather than a boolean. See migration 0019.
export const TERMS_VERSION = "2026-09-15";

// No custom domain yet, so shares carry the Pages URL. One constant, so buying
// a domain is a one-line change.
export const SHARE_DOMAIN = "saroldhand.github.io/perfect-sunday";

// Phase 1 is magic link only. The Google path needs Google Cloud console setup
// the operator has not done, and a half-configured OAuth button that errors on
// tap is worse than no button. See CLAUDE.md "Deferred".
export const GOOGLE_AUTH_ENABLED = false;
