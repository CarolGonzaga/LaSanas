import { getContext } from "@/lib/workspace";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getContext();
  return children;
}
