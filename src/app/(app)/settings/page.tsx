import { signOut } from "@/app/actions";
import { AiCosts, type CostRow } from "@/components/ai-costs";
import { AllowList } from "@/components/allow-list";
import { NotificationSettings } from "@/components/notification-settings";
import { PlanForm } from "@/components/plan-form";
import { Button, Panel } from "@/components/ui";
import { WatchSettings, type Device } from "@/components/watch-settings";
import { WeightQuick } from "@/components/weight-quick";
import { getDict } from "@/lib/i18n";
import { requireOnboardedUser } from "@/lib/session";

export default async function SettingsPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const t = getDict(profile.language);
  const { data: w } = await supabase.from("weights").select("kg, date").order("date", { ascending: false }).limit(1).maybeSingle();
  const last = w ? { kg: Number(w.kg), date: w.date as string } : null;

  const { data: deviceRows } = await supabase
    .from("device_tokens")
    .select("id, label, created_at, last_sync_at")
    .eq("user_id", profile.id)
    .order("created_at");
  const devices = (deviceRows ?? []) as Device[];

  let emails: string[] = [];
  let costRows: CostRow[] = [];
  if (profile.is_admin) {
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`;
    const { data: usage } = await supabase.from("ai_usage").select("user_id, cost_usd").gte("at", monthStart);
    costRows = (usage ?? []) as CostRow[];
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
      <WatchSettings devices={devices} nowIso={new Date().toISOString()} />
      <PlanForm mode="settings" profile={profile} weightKg={last?.kg ?? null} />
      {profile.is_admin && <AiCosts rows={costRows} selfId={profile.id} lang={profile.language} />}
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
