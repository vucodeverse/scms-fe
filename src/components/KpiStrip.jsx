// KPI strip (mục 7.5): dải chỉ số phẳng ngăn bằng divider,
// thay cho card. items: [{ label, value, sub }]
export default function KpiStrip({ items = [] }) {
  return (
    <div className="scms-panel d-flex flex-wrap">
      {items.map((item, idx) => (
        <div
          key={item.label}
          style={{
            minWidth: 180,
            padding: "14px 16px",
            borderLeft: idx === 0 ? "none" : "1px solid var(--line)",
          }}
        >
          <div
            className="text-muted-scms"
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            {item.label}
          </div>
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.25,
              marginTop: 4,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {item.value}
          </div>
          {item.sub ? (
            <div className="text-muted-scms" style={{ fontSize: 11, marginTop: 2 }}>
              {item.sub}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
