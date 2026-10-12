import { Panel, PanelTitle } from "@/components/ui";
import { getDict, type Lang } from "@/lib/i18n";

export interface CostRow {
  user_id: string;
  cost_usd: number;
}

const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`menu-row ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="leader" aria-hidden />
      <span className="value">{value}</span>
    </div>
  );
}

/** Admin-only summary of this month's AI spend (SPEC §12). */
export function AiCosts({ rows, selfId, lang, now = new Date() }: { rows: CostRow[]; selfId: string; lang: Lang; now?: Date }) {
  const t = getDict(lang).costs;
  const total = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const mine = rows.filter((r) => r.user_id === selfId);
  const others = rows.filter((r) => r.user_id !== selfId);
  const sum = (rs: CostRow[]) => rs.reduce((s, r) => s + Number(r.cost_usd), 0);

  const day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = (total / day) * daysInMonth;

  return (
    <Panel>
      <PanelTitle>{t.title}</PanelTitle>
      {rows.length === 0 ? (
        <p className="text-ink-soft">{t.none}</p>
      ) : (
        <div className="space-y-1.5">
          <Row label={t.total} value={usd(total)} strong />
          <Row label={t.projected} value={`~${usd(projected)}`} />
          <Row label={t.estimates} value={String(rows.length)} />
          <Row label={t.perEstimate} value={usd(total / rows.length)} />
          <Row label={`${t.you} (${mine.length})`} value={usd(sum(mine))} />
          <Row label={`${t.others} (${others.length})`} value={usd(sum(others))} />
        </div>
      )}
      <p className="mt-3 text-sm text-ink-soft">{t.limits(5, 10)}</p>
    </Panel>
  );
}
