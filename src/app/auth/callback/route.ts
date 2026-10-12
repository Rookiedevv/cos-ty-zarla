import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Google sends people back here after sign-in. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description") ?? "";

  // The allow-list trigger blocks account creation; Supabase reports it as a database error.
  if (/database error|not.allowed/i.test(errorDescription)) {
    return NextResponse.redirect(`${origin}/not-allowed`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    if (/database error|not.allowed/i.test(error.message)) return NextResponse.redirect(`${origin}/not-allowed`);
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
