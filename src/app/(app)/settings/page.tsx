import Link from "next/link";
import { signOut } from "@/app/actions";
import { AiCosts, type CostRow } from "@/components/ai-costs";
import { AllowList } from "@/components/allow-list";
import { NotificationSettings } from "@/components/notification-settings";
import { PlanForm } from "@/components/plan-form";
import { EmailReportSettings, FollowSettings, type Person } from "@/components/report-settings";
import { Button, Panel, PanelTitle } from "@/components/ui";
import { WatchSettings, type Device } from "@/components/watch-settings";
import { WeightQuick } from "@/components/weight-quick";
import { FOCUS_SHEETS, METHOD_SHEETS } from "@/lib/diet/cheatsheets";
import type { FoodFocus, Method } from "@/lib/engine/types";
import { getDict } from "@/lib/i18n";
import { emailConfigured } from "@/lib/email";
import { displayName } from "@/lib/reports/run";
import { requireOnboardedUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

type Tab = "diet" | "account";
type Ctx = Awaited<ReturnType<typeof requireOnboardedUser>>;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, profile } = await requireOnboardedUser();
  const tab: Tab = (await searchParams).tab === "account" ? "account" : "diet";
  const t = getDict(profile.language);

  const { data: w } = await supabase.from("weights").select("kg, date").eq("user_id", profile.id).order("date", { ascending: false }).limit(1).maybeSingle();
  const last = w ? { kg: Number(w.kg), date: w.date as string } : null;

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{t.settings.title}</h1>

      {/* Two tabs: everything about the diet, and everything else. */}
      <nav aria-label={t.settings.title} className="grid grid-cols-2 gap-1 rounded-2xl bg-grout p-1">
        {(["diet", "account"] as const).map((key) => (
          <Link
            key={key}
            href={`/settings?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl px-2 text-center font-semibold ${
              tab === key ? "bg-enamel text-ink shadow-[var(--panel-shadow)]" : "text-ink-soft hover:text-ink"
            }`}
          >
            {key === "diet" ? t.settings.tabDiet : t.settings.tabAccount}
          </Link>
        ))}
      </nav>

      {tab === "diet" ? <DietTab supabase={supabase} profile={profile} last={last} /> : <AccountTab supabase={supabase} profile={profile} />}
    </main>
  );
}

function GuideRow({ href, name, summary, current, currentLabel }: { href: string; name: string; summary: string; current: boolean; currentLabel: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-accent">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold">
            {name}
            {current && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">{currentLabel}</span>}
          </span>
          <span className="line-clamp-1 block text-sm text-ink-soft">{summary}</span>
        </span>
        <span aria-hidden className="shrink-0 text-ink-soft">›</span>
      </Link>
    </li>
  );
}

/** Everything about you and your diet: weight, profile, routine, pace, method, water, reports, cheatsheets. */
async function DietTab({ supabase, profile, last }: Ctx & { last: { kg: number; date: string } | null }) {
  const t = getDict(profile.language);
  // Other people's names come through the server key: profiles are otherwise private to their owner.
  const [{ data: others }, { data: follows }] = await Promise.all([
    createAdminClient().from("profiles").select("id, display_name, email").neq("id", profile.id).not("onboarded_at", "is", null).order("created_at"),
    supabase.from("follows").select("follower_id, followee_id, status"),
  ]);
  const people: Person[] = (others ?? []).map((p) => ({ id: p.id as string, name: displayName(p as { display_name: string | null; email: string }) }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const outgoing = Object.fromEntries((follows ?? []).filter((f) => f.follower_id === profile.id).map((f) => [f.followee_id as string, f.status as "pending" | "approved"]));
  const toMe = (follows ?? []).filter((f) => f.followee_id === profile.id && nameOf.has(f.follower_id as string));
  const incoming = toMe.filter((f) => f.status === "pending").map((f) => ({ id: f.follower_id as string, name: nameOf.get(f.follower_id as string)! }));
  const followers = toMe.filter((f) => f.status === "approved").map((f) => ({ id: f.follower_id as string, name: nameOf.get(f.follower_id as string)! }));
  const g = t.guide;
  const methods = Object.keys(METHOD_SHEETS) as Method[];
  const focuses = Object.keys(FOCUS_SHEETS) as FoodFocus[];

  return (
    <>
      <Panel>
        <WeightQuick last={last} />
      </Panel>
      <PlanForm mode="settings" profile={profile} weightKg={last?.kg ?? null} />
      <EmailReportSettings prefs={profile.email_prefs ?? {}} configured={emailConfigured()} />
      <FollowSettings selfId={profile.id} people={people} outgoing={outgoing} incoming={incoming} followers={followers} />
      <Panel>
        <PanelTitle>{g.all}</PanelTitle>
        <h3 className="mt-1 text-sm font-semibold text-ink-soft">{g.method}</h3>
        <ul className="divide-y divide-grout">
          {methods.map((m) => (
            <GuideRow
              key={m}
              href={`/guide?method=${m}&from=settings`}
              name={t.methods[m][0]}
              summary={METHOD_SHEETS[m][profile.language].summary}
              current={m === profile.method}
              currentLabel={g.current}
            />
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold text-ink-soft">{g.focus}</h3>
        <ul className="divide-y divide-grout">
          {focuses.map((f) => (
            <GuideRow
              key={f}
              href={`/guide?focus=${f}&from=settings`}
              name={t.focuses[f][0]}
              summary={FOCUS_SHEETS[f][profile.language].summary}
              current={f === profile.food_focus}
              currentLabel={g.current}
            />
          ))}
        </ul>
      </Panel>
    </>
  );
}

/** The app itself: reminders, watch, AI costs, access, sign out. */
async function AccountTab({ supabase, profile }: Ctx) {
  const t = getDict(profile.language);
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
    const [{ data: usage }, { data }] = await Promise.all([
      supabase.from("ai_usage").select("user_id, cost_usd").gte("at", monthStart),
      supabase.from("allowed_emails").select("email").order("added_at"),
    ]);
    costRows = (usage ?? []) as CostRow[];
    emails = (data ?? []).map((r) => r.email as string);
  }

  return (
    <>
      <NotificationSettings prefs={profile.notification_prefs ?? {}} />
      <WatchSettings devices={devices} nowIso={new Date().toISOString()} />
      {profile.is_admin && <AiCosts rows={costRows} selfId={profile.id} lang={profile.language} />}
      {profile.is_admin && <AllowList emails={emails} self={profile.email} />}
      <form action={signOut}>
        <Button variant="ghost" className="w-full">
          {t.settings.signOut}
        </Button>
      </form>
      <p className="text-center text-xs text-ink-soft">{profile.email}</p>
    </>
  );
}
