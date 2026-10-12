import { headers } from "next/headers";
import { signInWithGoogle } from "@/app/actions";
import { getDict } from "@/lib/i18n";

export default async function NotAllowedPage() {
  const accept = (await headers()).get("accept-language") ?? "";
  const t = getDict(/^en/i.test(accept) ? "en" : "pl");
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border-2 border-ink bg-enamel px-6 py-8 shadow-[0_4px_0_0_var(--ink)]">
        <h1 className="board text-3xl">{t.notAllowed.title}</h1>
        <p className="mt-3">{t.notAllowed.body}</p>
        <form action={signInWithGoogle} className="mt-6">
          <button type="submit" className="min-h-12 w-full rounded-xl border-2 border-ink px-4 font-semibold hover:bg-tile">
            {t.notAllowed.tryAnother}
          </button>
        </form>
      </div>
    </main>
  );
}
