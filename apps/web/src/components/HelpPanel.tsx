import { useState } from "react";

interface HelpPanelProps {
  title: string;
  text: string;
  example?: string;
}

/** "What is this / how do I use it" teaching box shown at the top of every
 * ontology page — the plain-language onboarding the app needs so building
 * an ontology doesn't require knowing the underlying graph model. Starts
 * open so first-time users see it, and remembers per-page if it was closed. */
export function HelpPanel({ title, text, example }: HelpPanelProps) {
  const storageKey = `help-collapsed:${title}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(storageKey, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="help-panel">
      <button type="button" className="help-panel-toggle" onClick={toggle}>
        💡 {title} {collapsed ? "▾" : "▴"}
      </button>
      {!collapsed && (
        <div className="help-panel-body">
          <p>{text}</p>
          {example && <p className="muted">{example}</p>}
        </div>
      )}
    </div>
  );
}
