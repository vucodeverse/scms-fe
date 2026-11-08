// Tag trạng thái theo prototype (app.css .tag): 10.5px/600, padding 2px 7px,
// có chấm tròn phía trước; trạng thái "đang hoạt động/hoàn tất" dùng
// biến thể done = nền mực chữ sáng (khớp ảnh prototype SCR-11).
const VARIANTS = {
  success: { background: "var(--success-soft)", color: "var(--success)", border: "#bcc7b5", dot: "var(--success)" },
  warn: { background: "var(--warn-soft)", color: "#5c432b", border: "#c9b89b", dot: "var(--accent)" },
  neutral: { background: "var(--paper-2)", color: "var(--muted)", border: "var(--line)", dot: "var(--muted)" },
  dark: { background: "var(--ink)", color: "var(--surface)", border: "var(--ink)", dot: "var(--surface)" },
};

// Ánh xạ trạng thái nghiệp vụ thường gặp -> variant.
const STATUS_VARIANTS = {
  ACTIVE: "dark",
  AVAILABLE: "dark",
  CHECKED_IN: "dark",
  COMPLETED: "dark",
  INACTIVE: "neutral",
  UNAVAILABLE: "warn",
  DRAFT: "warn",
  EXPIRED: "neutral",
};

export default function StatusTag({ status, label, variant }) {
  const v = VARIANTS[variant || STATUS_VARIANTS[status] || "neutral"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 7px",
        borderRadius: "var(--radius-xs)",
        border: `1px solid ${v.border}`,
        background: v.background,
        color: v.color,
        fontSize: 10.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{ width: 5, height: 5, borderRadius: "50%", background: v.dot, flex: "none" }}
      />
      {label || status}
    </span>
  );
}
