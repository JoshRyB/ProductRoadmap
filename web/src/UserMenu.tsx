import { useEffect, useRef, useState } from "react";
import { SOURCE_NAME } from "./source";
import type { Me } from "./types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function UserMenu({ me }: { me: Me | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = me?.name ?? "Guest";

  return (
    <div className="usermenu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="userbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">{initials(name)}</span>
        <span className="uname">{name}</span>
        <span className="chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div className="who">{name}</div>
            <div className="meta">
              {me?.email ?? (me && me.source !== "sample" ? `Signed in through ${SOURCE_NAME[me.source]}` : "Not connected to Jira or Azure DevOps")}
            </div>
          </div>
          <a className="menu-item" role="menuitem" href="#/settings" onClick={() => setOpen(false)}>
            Settings
          </a>
          {me?.canSignOut && (
            <form method="post" action="/logout" className="menu-form">
              <button type="submit" className="menu-item" role="menuitem">Sign out</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
