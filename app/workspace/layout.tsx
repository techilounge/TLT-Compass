// Never prerender or cache authenticated records, even if the build has no credentials.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
