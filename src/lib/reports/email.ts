import { getDict } from "../i18n";
import { isoWeekday } from "../profile";
import type { DailyAi, WeeklyAi } from "./ai";
import type { DailyData, WeeklyData } from "./build";

/*
  Email-safe HTML: tables, inline styles, no external CSS or images.
  Same palette as the app (light version — most mail apps force their own dark mode).
*/
const C = {
  page: "#f4f5f7",
  card: "#ffffff",
  ink: "#1d2128",
  soft: "#5f6b7a",
  line: "#e3e6eb",
  accent: "#2563eb",
  good: "#15803d",
  goodBg: "#dcfce7",
  bad: "#d92d20",
  badBg: "#fee4e2",
  water: "#0e7490",
  waterBg: "#cff4fc",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type Lang = "en" | "pl";
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const locale = (lang: Lang) => (lang === "en" ? "en-GB" : "pl-PL");
const n0 = (lang: Lang, n: number) => new Intl.NumberFormat(locale(lang)).format(Math.round(n));
const n1 = (lang: Lang, n: number) => new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(n);
const signed = (lang: Lang, n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${n1(lang, Math.abs(n))}`;
export const dateLabel = (lang: Lang, d: string, withWeekday = true) =>
  new Intl.DateTimeFormat(locale(lang), { ...(withWeekday ? { weekday: "long" } : {}), day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
export const rangeLabel = (lang: Lang, a: string, b: string) => {
  const f = (d: string) => new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return `${f(a)} – ${f(b)}`;
};

function shell(lang: Lang, preheader: string, body: string, appUrl: string): string {
  const t = getDict(lang).reports;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Coś ty żarła</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};color:${C.ink};">
<tr><td style="padding:0 4px 14px;font-size:22px;font-weight:800;letter-spacing:-0.3px;">Coś ty <span style="color:${C.accent};">żarła?</span></td></tr>
${body}
<tr><td align="center" style="padding:20px 4px 6px;">
  <a href="${esc(appUrl)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">${esc(t.openApp)}</a>
</td></tr>
<tr><td align="center" style="padding:10px 4px;font-size:12px;color:${C.soft};">${esc(t.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

const card = (inner: string) =>
  `<tr><td style="padding:0 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:14px;"><tr><td style="padding:18px 18px;">${inner}</td></tr></table></td></tr>`;
const h2 = (s: string) => `<div style="font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.soft};margin:0 0 10px;">${esc(s)}</div>`;
const pill = (text: string, good: boolean) =>
  `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;background:${good ? C.goodBg : C.badBg};color:${good ? C.good : C.bad};">${good ? "✓" : "▲"} ${esc(text)}</span>`;
const list = (items: string[], mark: string, color: string) =>
  items
    .map((s) => `<tr><td valign="top" style="width:22px;color:${color};font-weight:800;font-size:15px;padding:3px 0;">${mark}</td><td style="font-size:15px;line-height:1.45;padding:3px 0;">${esc(s)}</td></tr>`)
    .join("");
const para = (s: string) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;">${esc(s)}</p>`;
const bar = (pct: number, color: string, bg: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:6px;"><tr><td style="width:${Math.max(2, Math.min(100, pct))}%;background:${color};height:8px;border-radius:6px;font-size:0;line-height:0;">&nbsp;</td><td style="font-size:0;line-height:0;">&nbsp;</td></tr></table>`;

// ───────────────────────── Daily ─────────────────────────

export function renderDaily(lang: Lang, d: DailyData, ai: DailyAi | null, appUrl: string): RenderedEmail {
  const t = getDict(lang).reports;
  const kcal = getDict(lang).common.kcal;
  const status =
    d.diff == null ? `<span style="color:${C.soft};font-size:14px;">${esc(t.noTarget)}</span>` : d.diff > 0 ? pill(t.over(n0(lang, d.diff)), false) : pill(t.under(n0(lang, -d.diff)), true);

  const top = `${h2(`${t.yourDay} · ${dateLabel(lang, d.date)}`)}
<div style="font-size:40px;font-weight:800;line-height:1;">${n0(lang, d.eaten)} <span style="font-size:18px;font-weight:700;">${kcal}</span></div>
<div style="font-size:14px;color:${C.soft};margin:6px 0 10px;">${esc(t.eaten)}${d.target != null ? ` · ${esc(t.target)} ${n0(lang, d.target)} ${kcal}` : ""}</div>
<div>${status}</div>
${d.target ? `<div style="margin-top:12px;">${bar((d.eaten / d.target) * 100, d.diff! > 0 ? C.bad : C.good, C.line)}</div>` : ""}`;

  const meals = d.meals
    .map((m) => {
      const items = m.items.length
        ? `<div style="font-size:13px;color:${C.soft};margin-top:2px;">${m.items.map((i) => esc(`${i.name}${i.amount != null ? ` ${n1(lang, i.amount)}${i.unit === "pcs" ? (lang === "pl" ? " szt." : " pcs") : i.unit ? ` ${i.unit}` : ""}` : ""}`)).join(" · ")}</div>`
        : "";
      return `<tr><td valign="top" style="width:48px;font-size:14px;color:${C.soft};padding:8px 0;border-top:1px solid ${C.line};">${esc(m.time)}</td>
<td valign="top" style="padding:8px 8px 8px 0;border-top:1px solid ${C.line};font-size:15px;line-height:1.4;font-weight:600;">${esc(m.description)}${items}</td>
<td valign="top" align="right" style="white-space:nowrap;padding:8px 0;border-top:1px solid ${C.line};font-size:15px;font-weight:700;">${n0(lang, m.kcal)} ${kcal}</td></tr>`;
    })
    .join("");

  const water = `${h2(t.water)}<div style="font-size:15px;font-weight:700;margin-bottom:8px;color:${C.water};">💧 ${esc(d.waterTargetMl ? t.waterOf(n0(lang, d.waterMl), n0(lang, d.waterTargetMl)) : t.waterMl(n0(lang, d.waterMl)))}</div>${d.waterTargetMl ? bar((d.waterMl / d.waterTargetMl) * 100, C.water, C.waterBg) : ""}`;

  const review = ai
    ? `${ai.good.length ? `${h2(t.good)}<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">${list(ai.good, "+", C.good)}</table>` : ""}
${ai.bad.length ? `${h2(t.bad)}<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">${list(ai.bad, "−", C.bad)}</table>` : ""}
${ai.tip ? `${h2(t.tip)}<div style="font-size:15px;line-height:1.5;background:${C.page};border-left:3px solid ${C.accent};padding:10px 12px;border-radius:6px;">${esc(ai.tip)}</div>` : ""}`
    : `<div style="font-size:14px;color:${C.soft};">${esc(t.aiMissing)}</div>`;

  const body =
    card(top) +
    card(`${h2(t.meals)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${meals || `<tr><td style="font-size:15px;color:${C.soft};">—</td></tr>`}</table>`) +
    card(water) +
    card(review);

  const subject = t.dailySubject(dateLabel(lang, d.date));
  const text = [
    subject,
    `${t.eaten}: ${n0(lang, d.eaten)} ${kcal}${d.target != null ? ` / ${n0(lang, d.target)}` : ""}`,
    d.diff == null ? t.noTarget : d.diff > 0 ? t.over(n0(lang, d.diff)) : t.under(n0(lang, -d.diff)),
    "",
    `${t.meals}:`,
    ...d.meals.map((m) => `${m.time}  ${m.description} — ${n0(lang, m.kcal)} ${kcal}`),
    "",
    `${t.water}: ${d.waterTargetMl ? t.waterOf(n0(lang, d.waterMl), n0(lang, d.waterTargetMl)) : t.waterMl(n0(lang, d.waterMl))}`,
    ...(ai ? ["", `${t.good}:`, ...ai.good.map((s) => `+ ${s}`), ...(ai.bad.length ? ["", `${t.bad}:`, ...ai.bad.map((s) => `− ${s}`)] : []), "", `${t.tip}: ${ai.tip}`] : []),
    "",
    appUrl,
  ].join("\n");
  const pre = d.diff == null ? `${n0(lang, d.eaten)} ${kcal}` : d.diff > 0 ? t.over(n0(lang, d.diff)) : t.under(n0(lang, -d.diff));
  return { subject, html: shell(lang, pre, body, appUrl), text };
}

// ───────────────────────── Weekly ─────────────────────────

function weekTable(lang: Lang, w: WeeklyData): string {
  const t = getDict(lang).reports;
  const max = Math.max(1, ...w.days.map((d) => Math.max(d.eaten, d.target ?? 0)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${w.days
    .map((d) => {
      const over = d.target != null && d.eaten > d.target;
      const color = !d.logged ? C.line : d.target == null ? C.soft : over ? C.bad : C.good;
      const mark = !d.logged ? "–" : d.target == null ? "" : over ? "▲" : "✓";
      return `<tr><td style="width:40px;font-size:13px;color:${C.soft};padding:4px 0;">${t.days[isoWeekday(d.date) - 1]}</td>
<td style="padding:4px 8px 4px 0;">${d.logged ? bar((d.eaten / max) * 100, color, C.page) : `<div style="font-size:12px;color:${C.soft};">—</div>`}</td>
<td align="right" style="white-space:nowrap;font-size:13px;padding:4px 0;width:120px;"><span style="font-weight:700;">${d.logged ? n0(lang, d.eaten) : ""}</span><span style="color:${C.soft};">${d.target != null ? ` / ${n0(lang, d.target)}` : ""}</span> <span style="color:${color};font-weight:800;">${mark}</span></td></tr>`;
    })
    .join("")}</table>`;
}

function progressBlock(lang: Lang, w: WeeklyData): string {
  const t = getDict(lang).reports;
  const weight =
    w.weight.kg != null
      ? `<div style="font-size:34px;font-weight:800;line-height:1;">${n1(lang, w.weight.kg)} kg</div>
<div style="font-size:14px;color:${C.soft};margin-top:6px;">${[
          w.weight.changeWeek != null ? t.weekChange(signed(lang, w.weight.changeWeek)) : null,
          w.weight.changeTotal != null ? t.sinceStart(signed(lang, w.weight.changeTotal)) : null,
        ]
          .filter(Boolean)
          .map((s) => esc(s!))
          .join(" · ")}</div>`
      : `<div style="font-size:16px;font-weight:700;color:${C.soft};">${esc(t.noWeighIn)}</div>`;
  const stat = (s: string, good: boolean | null) =>
    `<tr><td style="font-size:15px;padding:4px 0;"><span style="color:${good == null ? C.soft : good ? C.good : C.bad};font-weight:800;">${good == null ? "•" : good ? "✓" : "▲"}</span>&nbsp; ${esc(s)}</td></tr>`;
  return `${h2(`${t.yourWeek} · ${rangeLabel(lang, w.start, w.end)}`)}${weight}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
${stat(t.daysOnTarget(w.daysOnTarget, w.daysWithTarget), w.daysWithTarget ? w.daysOnTarget >= w.daysWithTarget * 0.7 : null)}
${w.daysWithTarget ? stat(w.weekDiff > 0 ? t.weekOver(n0(lang, w.weekDiff)) : t.weekUnder(n0(lang, -w.weekDiff)), w.weekDiff <= 0) : ""}
${stat(t.daysLogged(w.daysLogged), w.daysLogged >= 6)}
${w.water.targetMl ? stat(t.waterDays(w.water.daysHit), w.water.daysHit >= 5) : ""}
${w.sleep.nights ? stat(`${t.sleep}: ${t.avgSleep(n1(lang, w.sleep.avgHours!), w.sleep.shortNights)}`, w.sleep.shortNights <= 1) : ""}
</table>`;
}

export function renderWeekly(lang: Lang, w: WeeklyData, ai: WeeklyAi | null, appUrl: string): RenderedEmail {
  const t = getDict(lang).reports;
  const review = ai
    ? card(`${h2(t.progress)}${para(ai.summary)}`) +
      card(`${h2(t.dietFit)}${para(ai.diet_fit)}`) +
      (ai.sleep ? card(`${h2(t.sleep)}${para(ai.sleep)}`) : "") +
      (ai.suggestions.length
        ? card(
            `${h2(t.suggestions)}${ai.suggestions
              .map(
                (s, i) =>
                  `<div style="margin:0 0 12px;"><div style="font-size:15px;font-weight:700;">${i + 1}. ${esc(s.what)}</div><div style="font-size:14px;line-height:1.5;color:${C.soft};margin-top:2px;"><b style="color:${C.accent};">${esc(t.how)}:</b> ${esc(s.how)}</div></div>`,
              )
              .join("")}`,
          )
        : "")
    : card(`<div style="font-size:14px;color:${C.soft};">${esc(t.aiMissing)}</div>`);

  const body = card(progressBlock(lang, w)) + card(`${h2(t.calories)}${weekTable(lang, w)}`) + review;
  const subject = t.weeklySubject(rangeLabel(lang, w.start, w.end));
  const text = [
    subject,
    w.weight.kg != null ? `${t.weight}: ${n1(lang, w.weight.kg)} kg${w.weight.changeWeek != null ? ` (${t.weekChange(signed(lang, w.weight.changeWeek))})` : ""}` : t.noWeighIn,
    t.daysOnTarget(w.daysOnTarget, w.daysWithTarget),
    t.daysLogged(w.daysLogged),
    ...(ai
      ? ["", ai.summary, "", `${t.dietFit}: ${ai.diet_fit}`, ...(ai.sleep ? ["", `${t.sleep}: ${ai.sleep}`] : []), "", `${t.suggestions}:`, ...ai.suggestions.map((s, i) => `${i + 1}. ${s.what} — ${s.how}`)]
      : []),
    "",
    appUrl,
  ].join("\n");
  return { subject, html: shell(lang, ai?.summary ?? subject, body, appUrl), text };
}

// ───────────────────────── Friend (simplified) ─────────────────────────

export function renderFriend(lang: Lang, name: string, w: WeeklyData, friendSummary: string | null, appUrl: string): RenderedEmail {
  const t = getDict(lang).reports;
  const row = (label: string, value: string, good: boolean | null) =>
    `<tr><td style="font-size:15px;padding:7px 0;border-top:1px solid ${C.line};">${esc(label)}</td><td align="right" style="font-size:15px;padding:7px 0;border-top:1px solid ${C.line};font-weight:700;color:${good == null ? C.ink : good ? C.good : C.bad};">${esc(value)}</td></tr>`;
  const calOk = w.daysWithTarget > 0 && w.daysOnTarget >= w.daysWithTarget * 0.7;
  const rows = [
    w.weight.changeWeek != null
      ? row(t.weight, `${signed(lang, w.weight.changeWeek)} kg`, w.weight.changeWeek <= 0)
      : row(t.weight, w.weight.kg != null ? "—" : t.noWeighIn, null),
    w.daysWithTarget ? row(t.calories, `${w.daysOnTarget}/${w.daysWithTarget} ${calOk ? "✓" : "▲"}`, calOk) : "",
    w.water.targetMl ? row(t.water, `${w.water.daysHit}/7 ${w.water.daysHit >= 5 ? "✓" : "▲"}`, w.water.daysHit >= 5) : "",
    row(t.loggedLabel, `${w.daysLogged}/7`, null),
  ].join("");
  const body = card(
    `${h2(`${t.friendHeading(name)} · ${rangeLabel(lang, w.start, w.end)}`)}${friendSummary ? para(friendSummary) : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${rows}</table>`,
  );
  const subject = t.friendSubject(name);
  const text = [
    t.friendHeading(name),
    friendSummary ?? "",
    w.weight.changeWeek != null ? `${t.weight}: ${signed(lang, w.weight.changeWeek)} kg` : t.noWeighIn,
    w.daysWithTarget ? `${t.calories}: ${w.daysOnTarget}/${w.daysWithTarget}` : "",
    w.water.targetMl ? `${t.water}: ${w.water.daysHit}/7` : "",
    appUrl,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html: shell(lang, friendSummary ?? subject, body, appUrl), text };
}
