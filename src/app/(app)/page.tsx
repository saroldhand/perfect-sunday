"use client";

import { useWeek } from "@/components/app/WeekProvider";
import { SignInForm } from "@/components/auth/SignInForm";

export default function Hub() {
  const { phase, signedIn } = useWeek();
  if (phase === "loading") return null;
  if (!signedIn) return <SignInForm />;
  return <p>Hub goes here.</p>;
}
