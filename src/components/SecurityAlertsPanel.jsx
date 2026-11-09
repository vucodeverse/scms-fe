import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import Icon from "./Icon.jsx";
import StatusTag from "./StatusTag.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { isUnassignedBranchManager } from "../auth/landing.js";
import { useToast } from "./ToastContext.jsx";
import { formatDateTime } from "../lib/format.js";
import { POSITION_LABELS } from "../config/userConstants.js";
import {
  SECURITY_ALERTS_CHANGED_EVENT,
  notifySecurityAlertsChanged,
  securityAlertsApi,
} from "../api/securityAlertsApi.js";

function formatRemaining(lockedUntil, nowMs) {
  if (!lockedUntil) return null;
  const diffSec = Math.ceil((new Date(lockedUntil).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return null;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function SecurityAlertsPanel({ branchId = null }) {
  const { user } = useAuth();
  const toast = useToast();
  const canView =
    Boolean(user) &&
    (user.role === "COO" || (user.role === "BRANCH_MANAGER" && !isUnassignedBranchManager(user)));

  const [summary, setSummary] = useState({ activeCount: 0, currentlyLockedCount: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await securityAlertsApi.list({ branchId, activeOnly, limit: 15 });
      setSummary({
        activeCount: res?.activeCount || 0,
        currentlyLockedCount: res?.currentlyLockedCount || 0,
        items: Array.isArray(res?.items) ? res.items : [],
      });
    } catch {
      /* không làm vỡ dashboard nếu api tạm lỗi */
    } finally {
      setLoading(false);
    }
  }, [canView, branchId, activeOnly]);

  useEffect(() => {
    if (!canView) return undefined;
    load();
    const timer = setInterval(load, 15000);
    const onChanged = () => load();
    window.addEventListener(SECURITY_ALERTS_CHANGED_EVENT, onChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener(SECURITY_ALERTS_CHANGED_EVENT, onChanged);
    };
  }, [canView, load]);

  useEffect(() => {
    if (summary.currentlyLockedCount <= 0) return undefined;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [summary.currentlyLockedCount]);

  if (!canView) return null;

  async function handleUnlock(item) {
    setBusyId(item.id);
    try {
      await securityAlertsApi.unlockPin(item.id, "Mở khóa PIN sớm từ Dashboard");
      toast.success(
        item.targetUserName
          ? `Đã mở khóa PIN sớm cho ${item.targetUserName}.`
          : "Đã mở khóa tra cứu PIN cho Kiosk chi nhánh.",
      );
      notifySecurityAlertsChanged();
      await load();
    } catch (err) {
      toast.error(err.message || "Không mở khóa PIN được.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAck(item) {
    setBusyId(item.id);
    try {
      await securityAlertsApi.acknowledge(item.id);
      toast.success("Đã xác nhận cảnh báo bảo mật.");
      notifySecurityAlertsChanged();
      await load();
    } catch (err) {
      toast.error(err.message || "Không xác nhận được cảnh báo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="scms-panel mb-3">
      <div
        className="d-flex justify-content-between align-items-center flex-wrap gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--paper)" }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Icon name="bell" size={15} />
          <strong style={{ fontSize: 13.5 }}>Cảnh báo bảo mật & khóa tạm PIN Kiosk</strong>
          {summary.currentlyLockedCount > 0 ? (
            <StatusTag
              status="PIN_LOCKED"
              variant="warn"
              label={`${summary.currentlyLockedCount} PIN đang tạm khóa`}
            />
          ) : summary.activeCount > 0 ? (
            <StatusTag
              status="ACTIVE_ALERT"
              variant="warn"
              label={`${summary.activeCount} cảnh báo chưa xem`}
            />
          ) : (
            <StatusTag status="SAFE" variant="success" label="Không có PIN bị khóa" />
          )}
        </div>

        <div className="d-flex align-items-center gap-2">
          <Button
            size="sm"
            variant={activeOnly ? "primary" : "outline-secondary"}
            onClick={() => setActiveOnly((v) => !v)}
          >
            {activeOnly ? "Đang lọc: Chưa xử lý" : "Tất cả lịch sử"}
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner size="sm" className="me-1" /> : null}
            Làm mới
          </Button>
        </div>
      </div>

      {summary.items.length === 0 ? (
        <div className="px-3 py-3 text-muted-scms small">
          {loading
            ? "Đang kiểm tra trạng thái an toàn PIN…"
            : activeOnly
              ? "Không có cảnh báo bảo mật nào đang chờ xử lý."
              : "Chưa ghi nhận lượt khóa tạm PIN (sai quá 3 lần) nào."}
        </div>
      ) : (
        <div>
          {summary.items.map((item, idx) => {
            const remaining = item.currentlyLocked ? formatRemaining(item.lockedUntil, nowMs) : null;
            const isStillLocked = Boolean(item.currentlyLocked && remaining);
            const roleText = item.targetRole ? POSITION_LABELS[item.targetRole] || item.targetRole : null;
            return (
              <div
                key={item.id}
                className="d-flex justify-content-between align-items-center flex-wrap gap-3 px-3 py-2"
                style={{
                  borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                  background: isStillLocked || item.status === "ACTIVE" ? "#fffaf3" : "var(--surface)",
                }}
              >
                <div style={{ minWidth: 260, flex: 1 }}>
                  <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                    <strong style={{ fontSize: 13 }}>
                      {item.targetUserName || `Kiosk ${item.branchName}`}
                    </strong>
                    {roleText ? <span className="small text-muted-scms">({roleText})</span> : null}
                    <span className="small text-muted-scms">· {item.branchName}</span>
                    {isStillLocked ? (
                      <StatusTag status="PIN_LOCKED" variant="warn" label={`Đang khóa · còn ${remaining}`} />
                    ) : item.status === "UNLOCKED" ? (
                      <StatusTag status="UNLOCKED" variant="success" label="Đã mở khóa sớm" />
                    ) : item.status === "ACKNOWLEDGED" ? (
                      <StatusTag status="ACKNOWLEDGED" variant="neutral" label="Đã xác nhận" />
                    ) : (
                      <StatusTag status="EXPIRED" variant="neutral" label="Đã hết thời gian khóa" />
                    )}
                  </div>

                  <div className="small text-muted-scms">
                    {item.message} · <span className="mono">{formatDateTime(item.createdAt)}</span>
                  </div>

                  {item.resolvedAt && item.resolvedByName ? (
                    <div className="small text-muted-scms mt-1">
                      Xử lý bởi <strong>{item.resolvedByName}</strong> lúc {formatDateTime(item.resolvedAt)}
                      {item.resolveNote ? ` — "${item.resolveNote}"` : ""}
                    </div>
                  ) : null}
                </div>

                <div className="d-flex align-items-center gap-2">
                  {isStillLocked ? (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busyId === item.id}
                      onClick={() => handleUnlock(item)}
                    >
                      {busyId === item.id ? <Spinner size="sm" className="me-1" /> : null}
                      Mở khóa PIN sớm
                    </Button>
                  ) : null}
                  {item.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={busyId === item.id}
                      onClick={() => handleAck(item)}
                    >
                      Đã xem
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
