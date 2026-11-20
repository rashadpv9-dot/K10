import { currentStaff } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const GET = route(async (req) => {
  const staff = await currentStaff(req);
  if (!staff) return json({ error: "not_signed_in" }, 401);
  return json({ staff: { email: staff.email, name: staff.name, role: staff.role } });
});
