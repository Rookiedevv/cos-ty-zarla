import { signOut } from "@/app/actions";
import { AllowList } from "@/components/allow-list";
import { NotificationSettings } from "@/components/notification-settings";
import { PlanForm } from "@/components/plan-form";
import { Button, Panel } from "@/components/ui";
import { WeightQuick } from "@/components/weight-quick";
import { getDict } from "@/lib/i18n";
import { requireOnboardedUser } from "@/lib/session";

export default async function SettingsPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const t = getDict(profile.language);
  const { data: w } = await supabase.from("weights").select("kg, date").order("date", { ascending: false }).limit(1).maybeSingle();
  const last = w ? { kg: Number(w.kg), date: w.date as string } : null;

  let emails: string[] = [];
  if (profile.is_admin) {
    const { data } = await supabase.from("allowed_emails").select("email").order("added_at");
    emails = (data ?? []).map((r) => r.email as string);
  }

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{t.settings.title}</h1>
      <Panel>
        <WeightQuick last={last} />
      </Panel>
      <NotificationSettings prefs={profile.notification_prefs ?? {}} />
      <PlanForm mode="settings" profile={profile} weightKg={last?.kg ?? null} />
      {profile.is_admin && <AllowList emails={emails} self={profile.email} />}
      <form action={signOut}>
        <Button variant="ghost" className="w-full">
          {t.settings.signOut}
        </Button>
      </form>
      <p className="text-center text-xs text-ink-soft">{profile.email}</p>
    </main>
  );
}
