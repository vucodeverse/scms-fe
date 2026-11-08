import { useEffect, useState } from "react";
import { formatTime } from "../lib/format.js";

// Kiosk shell (mục 5.2): full-screen, tương phản cao, đồng hồ lớn.
// Dùng cho SCR-02 — chấm công tại quầy (touch-first).
export default function KioskLayout({ branchName = null, screenCode = "SCR-02", children }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="kiosk-shell">
      <header className="d-flex align-items-start justify-content-between mb-4">
        <div className="d-flex align-items-center gap-2">
          <span className="brand-mark">SC</span>
          <div>
            <strong>SCMS Kiosk</strong>
            {branchName ? <div className="text-muted-scms small">{branchName}</div> : null}
          </div>
        </div>
        <div className="text-end">
          <div className="kiosk-clock">{formatTime(now)}</div>
          <span className="screen-code">{screenCode}</span>
        </div>
      </header>
      <main className="flex-grow-1 d-flex flex-column">{children}</main>
    </div>
  );
}
