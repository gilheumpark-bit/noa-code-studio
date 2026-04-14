import { notFound } from "next/navigation";
import { isFeatureEnabledServer } from "@/lib/feature-flags";

export default function CodeStudioLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabledServer("CODE_STUDIO")) {
    notFound();
  }
  return <div spellCheck={false}>{children}</div>;
}
