import { AdminApp } from "@/components/admin/AdminApp";

// The admin panel runs in the browser against Supabase. Row level security in the
// database decides what each signed-in staff member can read and change.
export default function AdminPage() {
  return <AdminApp />;
}
