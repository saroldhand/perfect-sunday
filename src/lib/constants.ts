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

// The "type the code instead" field on Check your email. Built, deliberately
// off, for the same reason as the Google button: it only works once the
// magic-link email actually contains a code, and Supabase's stock template
// does not — it carries {{ .ConfirmationURL }} only. To turn it on, in this
// order: add {{ .Token }} to the Magic Link template (Dashboard →
// Auth → Email Templates), send yourself one to see the code arrive, then flip
// this to true. Flipped first, it asks every new player for a code their email
// does not have.
//
// Worth the trouble because the link fails exactly where this product is
// used: on a phone, a link tapped in Gmail opens a different browser from the
// one that asked for it, PKCE refuses the exchange, and an installed home-
// screen app never sees the session at all. verifyOtp signs in the app the
// player is already standing in.
export const CODE_SIGN_IN_ENABLED = false;
