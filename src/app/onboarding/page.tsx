import { redirect } from "next/navigation";
import { PlanForm } from "@/components/plan-form";
import { requireUser } from "@/lib/session";

export default async function OnboardingPage() {
  const { profile } = await requireUser();
  if (profile.onboarded_at) redirect("/");
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-12">
      <h1 className="board text-4xl">Coś ty żarła</h1>
      <PlanForm mode="onboarding" profile={profile} weightKg={null} />
    </main>
  );
}
