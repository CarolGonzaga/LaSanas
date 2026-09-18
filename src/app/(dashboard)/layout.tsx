import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return children;
}
