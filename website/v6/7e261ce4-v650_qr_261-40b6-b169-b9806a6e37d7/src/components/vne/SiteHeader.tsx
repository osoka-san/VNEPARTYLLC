import { AppHeader } from "@/components/app/AppHeader";

export function SiteHeader({
  onDialogOpenChange,
}: {
  onDialogOpenChange: (open: boolean) => void;
}) {
  return <AppHeader transparent onOpenChange={onDialogOpenChange} />;
}
