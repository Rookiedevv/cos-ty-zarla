import { BottomNav } from "@/components/bottom-nav";
import { I18nProvider } from "@/lib/i18n/client";
import { requireOnboardedUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOnboardedUser();
  return (
    <I18nProvider lang={profile.language}>
      <div lang={profile.language} className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
        {children}
      </div>
      <BottomNav />
    </I18nProvider>
  );
}
