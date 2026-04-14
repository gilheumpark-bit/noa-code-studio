import type { ReactNode } from "react";

/**
 * Primary layout region for route `children`.
 * `id="main-content"` wires the skip-navigation link in `app/layout.tsx`.
 */
export function MainContentRegion({ children }: { children: ReactNode }) {
  return (
    <div id="main-content" className="flex min-h-0 flex-1 flex-col outline-none" tabIndex={-1}>
      {children}
    </div>
  );
}
