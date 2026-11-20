import { clearedCookie, signOut } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  await signOut(req);
  return json({ ok: true }, 200, { "set-cookie": clearedCookie() });
});
