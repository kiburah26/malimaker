import { AppShell } from "@/components/AppShell";
import { MaliProvider } from "@/lib/data";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MaliProvider>
      <AppShell>{children}</AppShell>
    </MaliProvider>
  );
}
