"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

/** Thin sliding bar fixed to the top of the screen. */
export function TopBar() {
  return (
    <div aria-hidden className="top-bar fixed inset-x-0 top-0 z-30 h-1 overflow-hidden bg-transparent">
      <span className="block h-full w-1/3 rounded-full bg-accent" />
    </div>
  );
}

/** A grey placeholder block in the shape of content that is on its way. */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-grout ${className}`} />;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-3 rounded-2xl panel-frame bg-enamel p-4 ${className}`}>{children}</div>;
}

/** Wrapper for every screen skeleton: top bar plus a screen-reader announcement. */
function Screen({ children }: { children: ReactNode }) {
  const t = useT().wait;
  return (
    <main className="space-y-4 pt-2" aria-busy="true">
      <TopBar />
      <p role="status" className="sr-only">
        {t.loading}
      </p>
      {children}
    </main>
  );
}

function Rows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-4 w-10" />
          <Bone className="h-4 flex-1" />
          <Bone className="h-4 w-16" />
        </div>
      ))}
    </>
  );
}

export function TodaySkeleton() {
  return (
    <Screen>
      <Card>
        <Bone className="h-4 w-32" />
        <Bone className="h-12 w-40" />
        <Bone className="h-3 w-full" />
        <Bone className="h-4 w-3/4" />
      </Card>
      <Card>
        <Bone className="h-5 w-28" />
        <Rows n={3} />
      </Card>
      <Card>
        <Bone className="h-5 w-20" />
        <Bone className="h-3 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Bone className="h-12" />
          <Bone className="h-12" />
          <Bone className="h-12" />
        </div>
      </Card>
    </Screen>
  );
}

export function TabsSkeleton({ tabs, children }: { tabs: number; children: ReactNode }) {
  return (
    <Screen>
      <Bone className="h-9 w-40" />
      <div className={`grid gap-1 rounded-2xl bg-grout p-1 ${tabs === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {Array.from({ length: tabs }, (_, i) => (
          <div key={i} className="min-h-11 rounded-xl" />
        ))}
      </div>
      {children}
    </Screen>
  );
}

export function HistorySkeleton() {
  return (
    <TabsSkeleton tabs={3}>
      <div className="divide-y divide-grout rounded-2xl panel-frame bg-enamel">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Bone className="size-3 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-4 w-28" />
              <Bone className="h-3 w-20" />
            </div>
            <Bone className="h-6 w-14" />
          </div>
        ))}
      </div>
    </TabsSkeleton>
  );
}

export function SettingsSkeleton() {
  return (
    <TabsSkeleton tabs={2}>
      {[3, 4, 3].map((n, i) => (
        <Card key={i}>
          <Bone className="h-5 w-32" />
          {Array.from({ length: n }, (_, j) => (
            <Bone key={j} className="h-12 w-full" />
          ))}
        </Card>
      ))}
    </TabsSkeleton>
  );
}

export function FormSkeleton() {
  return (
    <Screen>
      <Bone className="h-9 w-48" />
      <Card>
        <Bone className="h-16 w-full" />
        <Bone className="h-4 w-40" />
        <Bone className="h-24 w-full" />
        <Bone className="h-12 w-full" />
      </Card>
    </Screen>
  );
}
