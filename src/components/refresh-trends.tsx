"use client";

import { useState, useTransition } from "react";
import { refreshTrends } from "@/app/(app)/team-actions";

export function RefreshTrends() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="row-gap">
      {msg && <span className="txt">{msg}</span>}
      <button className="edit" disabled={pending} onClick={() => start(async () => { setMsg(""); const r = await refreshTrends(); if (r.error) setMsg(r.error); })}>
        {pending ? "מחפש ברשת… (עד דקה-שתיים)" : "רענון עכשיו"}
      </button>
    </span>
  );
}
