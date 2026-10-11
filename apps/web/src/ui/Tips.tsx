import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import type { Evidence } from './evidence.ts';
import { EVIDENCE_HELP, EVIDENCE_LABEL, GLOSSARY } from './evidence.ts';

/**
 * A small accessible tooltip: the trigger is a button (keyboard focusable), the tip opens on
 * hover, focus or click, closes on Escape or blur, and is linked with aria-describedby.
 */
function Tip({
  label,
  tip,
  className,
  children,
}: {
  label: string;
  tip: ComponentChildren;
  className: string;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span class="tip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        class={className}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {children}
      </button>
      {open && (
        <span role="tooltip" id={id} class="tip">
          {tip}
        </span>
      )}
    </span>
  );
}

/** Evidence badge: "Measured here" / "Literature" / "Assumed", with the reason on hover/focus. */
export function Badge({ level, why }: { level: Evidence; why?: string }) {
  return (
    <Tip
      className={`badge badge-${level}`}
      label={`Evidence: ${EVIDENCE_LABEL[level]}`}
      tip={
        <>
          <strong>{EVIDENCE_LABEL[level]}.</strong> {why ?? EVIDENCE_HELP[level]}
        </>
      }
    >
      <span class={`badge-icon badge-icon-${level}`} aria-hidden="true" />
      {EVIDENCE_LABEL[level]}
    </Tip>
  );
}

/** A glossary term: dotted underline, definition on hover/focus. */
export function Term({
  id,
  children,
}: {
  id: keyof typeof GLOSSARY;
  children?: ComponentChildren;
}) {
  const g = GLOSSARY[id]!;
  return (
    <Tip className="term" label={`${g.term}: definition`} tip={<>{g.text}</>}>
      {children ?? g.term}
    </Tip>
  );
}
