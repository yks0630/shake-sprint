import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect("/screen/" + encodeURIComponent(code.toUpperCase()));
}
