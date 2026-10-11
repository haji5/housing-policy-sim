import type { ComponentChildren } from 'preact';
import { useId, useRef } from 'preact/hooks';

export interface TabDef {
  id: string;
  label: string;
  /** Small count or marker shown after the label (e.g. pending changes). */
  extra?: string;
  panel: ComponentChildren;
}

/**
 * WAI-ARIA tabs: arrow keys, Home and End move between tabs (roving tabindex); inactive panels
 * stay in the DOM but hidden, so their state (e.g. lever drafts) is kept.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );
  const go = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n]!.id);
    refs.current[n]?.focus();
  };
  return (
    <div class="tabs">
      <div role="tablist" aria-label={label} class="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-controls={`${base}-panel-${t.id}`}
            aria-selected={i === idx}
            tabIndex={i === idx ? 0 : -1}
            class={`tab${i === idx ? ' active' : ''}`}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') go(i + 1);
              else if (e.key === 'ArrowLeft') go(i - 1);
              else if (e.key === 'Home') go(0);
              else if (e.key === 'End') go(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
          >
            {t.label}
            {t.extra && <span class="tab-extra">{t.extra}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={i !== idx}
          class="tabpanel"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
