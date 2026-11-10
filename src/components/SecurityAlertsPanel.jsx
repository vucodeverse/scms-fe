import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import Icon from "./Icon.jsx";
import StatusTag from "./StatusTag.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { isUnassignedBranchManager } from "../auth/landing.js";
import { useRouter } from "../router/HashRouter.jsx";
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
  const { navigate } = useRouter();
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
          <strong style={{ fontSize: 13.5 }}>Thông báo vận hành &amp; khóa tạm PIN Kiosk</strong>
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
              label={`${summary.activeCount} thông báo chờ xử lý`}
            />
          ) : (
            <StatusTag status="SAFE" variant="success" label="Ổn định · Không có chờ duyệt" />
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
            ? "Đang kiểm tra trạng thái vận hành & an toàn PIN…"
            : activeOnly
              ? "Không có thông báo hoặc yêu cầu nào đang chờ xử lý."
              : "Chưa ghi nhận bàn giao két cuối ca, đóng ca sớm hay lượt khóa tạm PIN nào."}
        </div>
      ) : (
        <div>
          {summary.items.map((item, idx) => {
            const isEarlyClose = item.alertType === "EARLY_SHIFT_CLOSE_REQUEST";
            const isManagerClose = item.alertType === "MANAGER_SHIFT_CLOSE_REQUEST";
            const isShiftAlert = isEarlyClose || isManagerClose;
            const remaining = !isShiftAlert && item.currentlyLocked ? formatRemaining(item.lockedUntil, nowMs) : null;
            const isStillLocked = Boolean(!isShiftAlert && item.currentlyLocked && remaining);
            const roleText = item.targetRole ? POSITION_LABELS[item.targetRole] || item.targetRole : null;
            const canReviewShiftAlert = isShiftAlert && (item.status === "ACTIVE" || item.status === "ACKNOWLEDGED");
            return (
              <div
                key={item.id}
                className="d-flex justify-content-between align-items-center flex-wrap gap-3 px-3 py-2"
                style={{
                  borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                  background: isStillLocked || item.status === "ACTIVE" || canReviewShiftAlert ? "#fffaf3" : "var(--surface)",
                }}
              >
                <div style={{ minWidth: 260, flex: 1 }}>
                  <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                    <strong style={{ fontSize: 13 }}>
                      {isManagerClose
                        ? item.title || `Xác nhận nhận két cuối ca #${item.referenceShiftId || ""}`
                        : isEarlyClose
                          ? item.title || `Yêu cầu đóng ca sớm #${item.referenceShiftId || ""}`
                          : item.targetUserName || `Kiosk ${item.branchName}`}
                    </strong>
                    {!isShiftAlert && roleText ? <span className="small text-muted-scms">({roleText})</span> : null}
                    <span className="small text-muted-scms">· {item.branchName}</span>
                    {isManagerClose ? (
                      item.status === "APPROVED" ? (
                        <StatusTag status="APPROVED" variant="success" label="Đã nhận két & đóng ca" />
                      ) : item.status === "REJECTED" ? (
                        <StatusTag status="REJECTED" variant="neutral" label="Đã trả lại ca" />
                      ) : (
                        <StatusTag status="MANAGER_CLOSE_PENDING" variant="warn" label="Chờ QL nhận két" />
                      )
                    ) : isEarlyClose ? (
                      item.status === "APPROVED" ? (
                        <StatusTag status="APPROVED" variant="success" label="Đã duyệt đóng ca" />
                      ) : item.status === "REJECTED" ? (
                        <StatusTag status="REJECTED" variant="neutral" label="Đã từ chối" />
                      ) : (
                        <StatusTag status="EARLY_CLOSE_PENDING" variant="warn" label="Chờ duyệt đóng ca sớm" />
                      )
                    ) : isStillLocked ? (
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
                  {canReviewShiftAlert ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        const targetUrl =
                          user.role === "COO" && item.branchId
                            ? `/branch/shifts?branchId=${item.branchId}&tab=operations`
                            : "/branch/shifts?tab=operations";
                        navigate(targetUrl);
                        window.dispatchEvent(
                          new CustomEvent("scms:shift-refresh-requested", {
                            detail: { branchId: item.branchId, shiftId: item.referenceShiftId },
                          }),
                        );
                      }}
                    >
                      Mở Ca &amp; Xác nhận →
                    </Button>
                  ) : null}
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
                  {!isShiftAlert && item.status === "ACTIVE" ? (
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
