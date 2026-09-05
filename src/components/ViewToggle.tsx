type Props = {
  mode: "list" | "calendar";
  onChange: (mode: "list" | "calendar") => void;
};

export default function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="view-toggle" role="tablist" aria-label="보기 방식">
      <button
        type="button"
        role="tab"
        aria-label="리스트"
        aria-selected={mode === "list"}
        className={mode === "list" ? "on" : undefined}
        onClick={() => onChange("list")}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round">
          <path d="M8 7h12M8 12h12M8 17h12" />
          <path d="M4 7h.01M4 12h.01M4 17h.01" />
        </svg>
      </button>
      <button
        type="button"
        role="tab"
        aria-label="달력"
        aria-selected={mode === "calendar"}
        className={mode === "calendar" ? "on" : undefined}
        onClick={() => onChange("calendar")}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
    </div>
  );
}
