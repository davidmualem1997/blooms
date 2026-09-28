"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { resolveMessage } from "@/app/(app)/actions";
import { formatIL } from "@/lib/dates";
import { MESSAGE_LABEL, REQUEST_STATUS, type Message } from "@/lib/types";
import { Chevron } from "./chevron";

const when = (iso: string) => { const { date, time } = formatIL(iso); return `${Number(date.slice(8))}.${Number(date.slice(5, 7))} · ${time}`; };

// "פניות מלקוחות" בדף הבית של הצוות: פניות פתוחות, סימון מהיר כטופל, ומעבר לפנייה לתשובה ולסטטוס
export function MessageList({ messages, clientNames }: { messages: Message[]; clientNames: Record<string, string> }) {
  const [, startTransition] = useTransition();
  const [list, remove] = useOptimistic(messages, (state, id: string) => state.filter((m) => m.id !== id));
  if (list.length === 0) return null;
  return (
    <section className="sec">
      <div className="sechead"><div className="label dotted">פניות מלקוחות</div><span className="txt num">{list.length} פתוחות</span></div>
      <div className="note">
        {list.map((m) => (
          <div key={m.id} className="todo">
            <button className="tick" aria-label="סימון שטופל" onClick={() => startTransition(async () => { remove(m.id); await resolveMessage(m.id); })}>✓</button>
            <Link href={`/c/${m.client_id}/requests?f=${m.status === "to_meeting" ? "meeting" : "open"}`} className="tx col">
              <span className="t">{m.body.length > 90 ? m.body.slice(0, 90) + "…" : m.body}</span>
              <span className="txt">
                <span className={`tag kind-${m.kind}`}>{MESSAGE_LABEL[m.kind]}</span> {clientNames[m.client_id]} · <span className="num">{when(m.created_at)}</span>
                {m.attachments?.length ? ` · ${m.attachments.length} קבצים` : ""} · <span className={`rstatus ${m.status}`}>{REQUEST_STATUS[m.status]}</span>
              </span>
            </Link>
            <span className="arrow"><Chevron dir="forward" /></span>
          </div>
        ))}
      </div>
    </section>
  );
}
