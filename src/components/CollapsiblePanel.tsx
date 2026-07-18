import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type CollapsiblePanelProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  eyebrow: string;
  title: string;
};

export function CollapsiblePanel({
  actions,
  children,
  className = "",
  defaultExpanded = true,
  eyebrow,
  title
}: CollapsiblePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <section className={`tool-panel collapsible-panel ${className} ${expanded ? "expanded" : "collapsed"}`}>
      <div className="panel-heading">
        <button
          className="panel-toggle"
          type="button"
          aria-controls={contentId}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <Icon size={18} />
          <span>
            <span className="eyebrow">{eyebrow}</span>
            <strong>{title}</strong>
          </span>
        </button>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>

      {expanded ? (
        <div className="panel-body" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
