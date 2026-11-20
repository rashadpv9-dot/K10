import { del, put } from "@vercel/blob";
import { audit, requireStaff } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, json, route } from "@/lib/server/http";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function requireBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, "storage_not_configured");
}

async function currentImage(outletId: string) {
  const res = await db().query<{ id: string; image_url: string | null }>(
    "select id, image_url from floor_plans where outlet_id = $1 and is_active",
    [outletId]
  );
  if (!res.rows[0]) throw new HttpError(409, "no_floor_plan");
  return res.rows[0];
}

// Upload (or replace) the layout image. Images only, 5 MB at most.
export const POST = route(async (req) => {
  const staff = await requireStaff(req, "manager");
  requireBlob();
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "form_required");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "file_required");
  const ext = TYPES[file.type];
  if (!ext) throw new HttpError(415, "image_type_not_allowed");
  if (file.size > MAX_BYTES) throw new HttpError(413, "image_too_large");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 20000 || height > 20000) {
    throw new HttpError(400, "image_size_required");
  }

  const plan = await currentImage(staff.outletId);
  const blob = await put(`floor-plans/${staff.outletId}/layout.${ext}`, file, { access: "public", contentType: file.type, addRandomSuffix: true });
  await db().query("update floor_plans set image_url = $1, image_width = $2, image_height = $3 where id = $4", [blob.url, width, height, plan.id]);
  if (plan.image_url) await del(plan.image_url).catch(() => undefined);
  await audit(staff, "upload", "floor_plan_image", plan.id, { width, height });
  return json({ image_url: blob.url, image_width: width, image_height: height }, 201);
});

// Remove the layout image. Tables stay where they are.
export const DELETE = route(async (req) => {
  const staff = await requireStaff(req, "manager");
  const plan = await currentImage(staff.outletId);
  await db().query("update floor_plans set image_url = null, image_width = null, image_height = null where id = $1", [plan.id]);
  if (plan.image_url && process.env.BLOB_READ_WRITE_TOKEN) await del(plan.image_url).catch(() => undefined);
  await audit(staff, "delete", "floor_plan_image", plan.id);
  return json({ ok: true });
});
