"use client";

import { useEffect } from "react";
import { initSite } from "@/lib/motion";

// Mounts once per page load and wires interactions + motion to the server-rendered markup.
export function SiteMotion() {
  useEffect(() => initSite(), []);
  return null;
}
