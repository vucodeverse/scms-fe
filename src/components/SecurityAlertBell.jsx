import { useCallback, useEffect, useRef, useState } from "react";
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

export default function SecurityAlertBell() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const canSee =
    Boolean(user) &&
    (user.role === "COO" || (user.role === "BRANCH_MANAGER" && !isUnassignedBranchManager(user)));

  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState({ activeCount: 0, currentlyLockedCount: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    if (!canSee) return;
    setLoading(true);
    try {
      const res = await securityAlertsApi.list({ limit: 12 });
      setSummary({
        activeCount: res?.activeCount || 0,
        currentlyLockedCount: res?.currentlyLockedCount || 0,
        items: Array.isArray(res?.items) ? res.items : [],
      });
    } catch {
      /* topbar im lặng nếu phiên hết hạn hoặc mạng tạm gián đoạn */
    } finally {
      setLoading(false);
    }
  }, [canSee]);

  useEffect(() => {
    if (!canSee) return undefined;
    load();
    const timer = setInterval(load, 15000);
    const onChanged = () => load();
    const onFocus = () => load();
    window.addEventListener(SECURITY_ALERTS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener(SECURITY_ALERTS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [canSee, load]);

  useEffect(() => {
    if (!open) return undefined;
    setNowMs(Date.now());
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => {
      clearInterval(tick);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [open]);

  if (!canSee) return null;

  const badgeCount = Math.max(summary.activeCount, summary.currentlyLockedCount);

  async function handleUnlock(alert) {
    setBusyId(alert.id);
    try {
      await securityAlertsApi.unlockPin(alert.id, "Mở khóa PIN sớm từ chuông cảnh báo");
      toast.success(
        alert.targetUserName
          ? `Đã mở khóa PIN sớm cho ${alert.targetUserName}.`
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

  async function handleAck(alert) {
    setBusyId(alert.id);
    try {
      await securityAlertsApi.acknowledge(alert.id);
      notifySecurityAlertsChanged();
      await load();
    } catch (err) {
      toast.error(err.message || "Không xác nhận được cảnh báo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="alert-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`alert-bell-btn${badgeCount > 0 ? " has-alerts" : ""}`}
        aria-label="Thông báo vận hành & bảo mật"
        title={
          badgeCount > 0
            ? `${badgeCount} thông báo cần Quản lý xử lý`
            : "Thông báo vận hành & bảo mật"
        }
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) load();
        }}
      >
        <Icon name="bell" size={16} />
        {badgeCount > 0 ? <span className="alert-bell-badge">{badgeCount > 9 ? "9+" : badgeCount}</span> : null}
      </button>

      {open ? (
        <div className="alert-popover" role="dialog" aria-label="Thông báo vận hành & bảo mật">
          <div className="alert-popover__head">
            <div>
              <strong>Thông báo vận hành &amp; PIN</strong>
              <div className="text-muted-scms" style={{ fontSize: 11 }}>
                {summary.currentlyLockedCount > 0 || summary.activeCount > 0
                  ? `${summary.activeCount} cần xử lý${summary.currentlyLockedCount > 0 ? ` · ${summary.currentlyLockedCount} PIN đang khóa` : ""}`
                  : "Theo dõi khóa PIN Kiosk & duyệt đóng ca sớm"}
              </div>
            </div>
            <div className="d-flex gap-1 align-items-center">
              <Button size="sm" variant="outline-secondary" onClick={load} disabled={loading}>
                {loading ? <Spinner size="sm" /> : "Làm mới"}
              </Button>
            </div>
          </div>

          <div className="alert-popover__body">
            {summary.items.length === 0 ? (
              <div className="p-3 text-center text-muted-scms small">
                Chưa có thông báo vận hành hay cảnh báo PIN nào gần đây.
              </div>
            ) : (
              summary.items.map((item) => {
                const isEarlyClose = item.alertType === "EARLY_SHIFT_CLOSE_REQUEST";
                const remaining = !isEarlyClose && item.currentlyLocked ? formatRemaining(item.lockedUntil, nowMs) : null;
                const isStillLocked = Boolean(!isEarlyClose && item.currentlyLocked && remaining);
                const roleText = item.targetRole ? POSITION_LABELS[item.targetRole] || item.targetRole : null;
                const canReviewEarlyClose = isEarlyClose && (item.status === "ACTIVE" || item.status === "ACKNOWLEDGED");
                return (
                  <div
                    key={item.id}
                    className={`alert-popover__item${item.status === "ACTIVE" || isStillLocked || canReviewEarlyClose ? " is-active" : ""}`}
                  >
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                      <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35 }}>
                        {isEarlyClose
                          ? item.title || `Yêu cầu đóng ca sớm #${item.referenceShiftId || ""}`
                          : item.targetUserName || `Kiosk ${item.branchName}`}
                        {!isEarlyClose && roleText ? (
                          <span className="text-muted-scms fw-normal"> · {roleText}</span>
                        ) : null}
                      </div>
                      {isEarlyClose ? (
                        item.status === "APPROVED" ? (
                          <StatusTag status="APPROVED" variant="success" label="Đã duyệt đóng ca" />
                        ) : item.status === "REJECTED" ? (
                          <StatusTag status="REJECTED" variant="neutral" label="Đã từ chối" />
                        ) : (
                          <StatusTag status="EARLY_CLOSE_PENDING" variant="warn" label="Chờ duyệt đóng ca sớm" />
                        )
                      ) : isStillLocked ? (
                        <StatusTag status="PIN_LOCKED" variant="warn" label={`Đang khóa · ${remaining}`} />
                      ) : item.status === "UNLOCKED" ? (
                        <StatusTag status="UNLOCKED" variant="success" label="Đã mở khóa" />
                      ) : item.status === "ACKNOWLEDGED" ? (
                        <StatusTag status="ACKNOWLEDGED" variant="neutral" label="Đã xem" />
                      ) : (
                        <StatusTag status="EXPIRED" variant="neutral" label="Hết hạn khóa" />
                      )}
                    </div>

                    <div className="text-muted-scms mb-2" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                      <div>
                        <strong>{item.branchName}</strong> · {formatDateTime(item.createdAt)}
                      </div>
                      <div>{item.message}</div>
                      {item.resolvedAt && item.resolvedByName ? (
                        <div className="mt-1">
                          Xử lý bởi <strong>{item.resolvedByName}</strong> ({formatDateTime(item.resolvedAt)})
                          {item.resolveNote ? ` — "${item.resolveNote}"` : ""}
                        </div>
                      ) : null}
                    </div>

                    {isEarlyClose ? (
                      canReviewEarlyClose ? (
                        <div className="d-flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setOpen(false);
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
                        </div>
                      ) : null
                    ) : isStillLocked || item.status === "ACTIVE" ? (
                      <div className="d-flex gap-2">
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
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="alert-popover__foot">
            <Button
              size="sm"
              variant="link"
              className="p-0"
              onClick={() => {
                setOpen(false);
                navigate(user.role === "COO" ? "/chain/overview" : "/branch/overview");
              }}
            >
              Xem trên Dashboard →
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
