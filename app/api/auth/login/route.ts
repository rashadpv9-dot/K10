import { z } from "zod";
import { sessionCookie, signIn } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";

const input = z.object({ email: z.string().trim().min(3).max(254), password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  const { email, password } = await readJson(req, input);
  const { token, staff } = await signIn(email, password);
  return json({ staff: { email: staff.email, name: staff.name, role: staff.role } }, 200, { "set-cookie": sessionCookie(token) });
});
