import { useCallback, useRef, useState } from "react";
import { copyText } from "./exportFiles";
import { useDismiss } from "./useDismiss";

interface Props {
  disabled: boolean;
  /** the link to the current view */
  link: string;
  onPng: () => Promise<void>;
  onSvg: () => void;
  onPdf: () => void;
}

export function ShareMenu({ disabled, link, onPng, onSvg, onPdf }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setNote(null);
    setShowLink(false);
  }, []);
  useDismiss(open, close, wrapRef, buttonRef);

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setNote(`Preparing ${label}…`);
    try {
      await fn();
      setNote(null);
      setOpen(false);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const copy = async () => {
    const ok = await copyText(link);
    setShowLink(!ok);
    setNote(ok ? "Link copied." : "Your browser blocked copying. Copy the link below.");
  };

  return (
    <div className="dd" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Share
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Share">
          <div className="menu-title">Download this view</div>
          <button type="button" role="menuitem" className="menu-item view-item" onClick={() => run("image", onPng)}>
            <span className="vname">Image (PNG)</span>
            <span className="vdesc">For slides and documents</span>
          </button>
          <button type="button" role="menuitem" className="menu-item view-item" onClick={() => run("image", onSvg)}>
            <span className="vname">Vector image (SVG)</span>
            <span className="vdesc">Stays sharp at any size</span>
          </button>
          <button type="button" role="menuitem" className="menu-item view-item" onClick={() => run("PDF", onPdf)}>
            <span className="vname">PDF</span>
            <span className="vdesc">Opens print. Choose Save as PDF.</span>
          </button>
          <div className="menu-title">Link</div>
          <button type="button" role="menuitem" className="menu-item view-item" onClick={copy}>
            <span className="vname">Copy link to this view</span>
            <span className="vdesc">Opens the same setup for anyone using this app</span>
          </button>
          {showLink && (
            <input className="link-box" readOnly value={link} aria-label="Link to this view" onFocus={(e) => (e.currentTarget as unknown as HTMLInputElement).select()} />
          )}
          {note && <div className="menu-note" role="status">{note}</div>}
        </div>
      )}
    </div>
  );
}
