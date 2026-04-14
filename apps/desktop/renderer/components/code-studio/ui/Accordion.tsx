"use client";

// ============================================================
// Accordion — Collapsible sections with animation
// ============================================================
// Wraps existing .ds-panel CSS pattern into a React component.
// Smooth height animation via grid-rows trick (no JS height calc).

import { useState, useCallback, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface AccordionItemData {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  /** Default open state */
  defaultOpen?: boolean;
}

interface AccordionProps {
  items: AccordionItemData[];
  /** Allow multiple items open simultaneously */
  multiple?: boolean;
  className?: string;
}

export function Accordion({ items, multiple = false, className = "" }: AccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of items) {
      if (item.defaultOpen) initial.add(item.id);
    }
    return initial;
  });

  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (!multiple) next.clear();
          next.add(id);
        }
        return next;
      });
    },
    [multiple],
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        return (
          <div
            key={item.id}
            className="border border-border rounded-lg bg-bg-secondary/40 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              aria-controls={`accordion-body-${item.id}`}
              className="w-full flex items-center gap-2 px-3 py-2.5
                text-xs font-semibold text-text-secondary
                hover:bg-bg-tertiary/50 hover:text-text-primary"
              style={{ transition: `background-color var(--transition-fast), color var(--transition-fast)` }}
            >
              <ChevronRight
                size={12}
                className={`text-text-tertiary shrink-0 ${isOpen ? "rotate-90" : ""}`}
                style={{ transition: `transform var(--transition-fast)` }}
              />
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="truncate">{item.title}</span>
            </button>

            <div
              id={`accordion-body-${item.id}`}
              role="region"
              className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="px-3 pb-3 pt-1 text-xs text-text-primary leading-relaxed">
                  {item.children}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Single collapsible (simpler API for one-off usage)
// ============================================================

interface CollapsibleProps {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Collapsible({
  title,
  icon,
  defaultOpen = false,
  children,
  className = "",
}: CollapsibleProps) {
  return (
    <Accordion
      items={[{ id: "single", title, icon, children, defaultOpen }]}
      multiple
      className={className}
    />
  );
}
