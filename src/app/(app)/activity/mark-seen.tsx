"use client";

import { useEffect } from "react";
import { markActivitySeen } from "./actions";

export function MarkSeen() {
  useEffect(() => { markActivitySeen(); }, []);
  return null;
}
