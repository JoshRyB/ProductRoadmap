import { useCallback, useRef, useState } from "react";
import { useDismiss } from "./useDismiss";
import { BUILTIN_VIEWS } from "./views";
import type { SavedView, ViewState } from "./views";

interface Props {
  saved: SavedView[];
  /** id of the view the screen currently matches, or null when it is a custom setup */
  matchedId: string | null;
  matchedName: string | null;
  onApply: (state: ViewState) => void;
  /** returns an error message, or null when saved */
  onSave: (name: string) => string | null;
  onDelete: (id: string) => void;
}

export function ViewsMenu({ saved, matchedId, matchedName, onApply, onSave, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setConfirmId(null);
    setError(null);
  }, []);
  useDismiss(open, close, wrapRef, buttonRef);

  const apply = (state: ViewState) => {
    onApply(state);
    close();
    buttonRef.current?.focus();
  };

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const err = onSave(name);
    setError(err);
    if (!err) {
      setName("");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }
  };

  return (
    <div className="dd" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        View: <strong>{matchedName ?? "Custom"}</strong>
      </button>
      {open && (
        <div className="menu wide" role="menu" aria-label="Views">
          <div className="menu-title">Standard views</div>
          {BUILTIN_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemradio"
              aria-checked={matchedId === v.id}
              className="menu-item view-item"
              onClick={() => apply(v.state)}
            >
              <span className="vname">{v.name}</span>
              <span className="vdesc">{v.description}</span>
            </button>
          ))}

          <div className="menu-title">Your views</div>
          {saved.length === 0 && <div className="menu-empty">None yet. Set the roadmap up how you like it, then save it below.</div>}
          {saved.map((v) => (
            <div className="saved-row" key={v.id}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={matchedId === v.id}
                className="menu-item view-item"
                onClick={() => apply(v.state)}
              >
                <span className="vname">{v.name}</span>
              </button>
              {confirmId === v.id ? (
                <span className="confirm">
                  <button type="button" className="link danger" onClick={() => { onDelete(v.id); setConfirmId(null); }}>
                    Delete
                  </button>
                  <button type="button" className="link" onClick={() => setConfirmId(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="x" aria-label={`Delete view ${v.name}`} onClick={() => setConfirmId(v.id)}>
                  &times;
                </button>
              )}
            </div>
          ))}

          <form className="save-form" onSubmit={submit}>
            <label htmlFor="view-name">Save the current setup as</label>
            <div className="save-row">
              <input
                id="view-name"
                type="text"
                value={name}
                maxLength={40}
                placeholder="Board pack"
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
              <button type="submit" className="btn">Save</button>
            </div>
            {error && <div className="form-err" role="alert">{error}</div>}
            {justSaved && <div className="form-ok" role="status">Saved</div>}
          </form>
        </div>
      )}
    </div>
  );
}
