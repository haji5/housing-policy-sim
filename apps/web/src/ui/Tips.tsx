import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Evidence } from './evidence.ts';
import { EVIDENCE_HELP, EVIDENCE_LABEL, GLOSSARY } from './evidence.ts';

/** Gap between the trigger and the tip, and the tip's minimum distance from the viewport edge. */
const GAP = 6;
const EDGE = 8;

/**
 * Where to put a tip of size `w` x `h` for a trigger at `t` in a `vw` x `vh` viewport: below the
 * trigger, left-aligned with it, shifted left to stay on screen, and flipped above when there is
 * no room below (whichever side has more room if neither fits).
 */
export function placeTip(
  t: { left: number; top: number; bottom: number },
  w: number,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number; above: boolean } {
  const left = Math.max(EDGE, Math.min(t.left, vw - EDGE - w));
  const below = t.bottom + GAP;
  const fitsBelow = below + h <= vh - EDGE;
  const fitsAbove = t.top - GAP - h >= EDGE;
  const above = !fitsBelow && (fitsAbove || t.top > vh - t.bottom);
  const top = above ? Math.max(EDGE, t.top - GAP - h) : below;
  return { left, top, above };
}

/**
 * A small accessible tooltip: the trigger is a button (keyboard focusable), the tip opens on
 * hover, focus or click, closes on Escape or blur, and is linked with aria-describedby. The tip
 * is rendered on <body> with fixed coordinates, so scrolling columns cannot clip it, and it is
 * kept inside the viewport (placeTip).
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
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tipEl = useRef<HTMLSpanElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const t = trigger.current;
      const tip = tipEl.current;
      if (!t || !tip) return;
      const r = t.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      setPos(placeTip(r, tip.offsetWidth, tip.offsetHeight, vw, window.innerHeight));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  return (
    <span class="tip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={trigger}
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
      {open &&
        createPortal(
          <span
            ref={tipEl}
            role="tooltip"
            id={id}
            class={`tip${pos?.above ? ' tip-above' : ''}`}
            style={
              pos
                ? { left: `${pos.left}px`, top: `${pos.top}px` }
                : { left: '0px', top: '0px', visibility: 'hidden' }
            }
          >
            {tip}
          </span>,
          document.body,
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
