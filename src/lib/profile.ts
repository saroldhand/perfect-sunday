import { supabase } from "@/lib/supabase/client";
import { TERMS_VERSION } from "@/lib/constants";

export type Profile = {
  id: string;
  display_name: string;
  terms_version: string | null;
};

/** Returns the signed-in user's profile row, or null if they have not made one. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, terms_version")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Where a signed-in user belongs right now. A user with no profile has not
 * finished signing up; a user whose accepted rules are out of date needs to
 * see the gate again rather than having the new version applied silently.
 */
export function landingRoute(profile: Profile | null): "/welcome" | "/" {
  if (!profile) return "/welcome";
  if (profile.terms_version !== TERMS_VERSION) return "/welcome";
  return "/";
}

export function isDisplayNameAvailable(name: string) {
  return supabase
    .from("profiles")
    .select("id")
    .eq("display_name", name)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data === null;
    });
}

export async function createProfile(userId: string, displayName: string) {
  const { error } = await supabase.from("profiles").insert({
    id: userId,
    display_name: displayName,
    terms_version: TERMS_VERSION,
    terms_accepted_at: new Date().toISOString(),
  });

  // 23505 is the unique violation on display_name. The inline availability
  // check is a convenience; this is the actual guard, since two people can
  // pass the check at the same moment.
  if (error) {
    if (error.code === "23505") {
      throw new Error("TAKEN");
    }
    throw new Error(error.message);
  }
}
