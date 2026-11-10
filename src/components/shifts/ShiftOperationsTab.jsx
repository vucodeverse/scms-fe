import { useEffect, useMemo, useState } from "react";
import { Button, Col, Form, InputGroup, Row, Spinner } from "react-bootstrap";
import DataTable from "../DataTable.jsx";
import FormField from "../FormField.jsx";
import Icon from "../Icon.jsx";
import KpiStrip from "../KpiStrip.jsx";
import StatusTag from "../StatusTag.jsx";
import { useToast } from "../ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { POSITION_LABELS } from "../../config/userConstants.js";
import { formatDate, formatDateTime, formatMoneyInput, formatVnd, parseMoneyDigits } from "../../lib/format.js";
import {
  CASH_TX_META,
  HANDOVER_STATUS_META,
  SHIFT_STATUS_META,
  SHIFT_TYPE_META,
  actorName,
  formatHm,
  formatSignedVnd,
  getScheduledOpenability,
  resolveShiftEmployeeRole,
  todayIso,
} from "./shiftUtils.js";

const OPENING_PRESETS = [500000, 1000000, 1500000, 2000000];

function formatAssignedStaffSummary(empId, shift, employeeMap) {
  const name = actorName(empId, employeeMap);
  const { roleLabel, isOverride } = resolveShiftEmployeeRole(empId, shift, employeeMap, POSITION_LABELS);
  return isOverride ? `${name} (kiêm ${roleLabel})` : name;
}

function rankScheduledCandidate(s, currentUserId, today, nowMs) {
  const openability = getScheduledOpenability(s, nowMs);
  const notOpenablePenalty = openability.openable ? 0 : 100;
  const isToday = s.shiftDate === today ? 0 : 10;
  const isMine = currentUserId && (s.assignedEmployeeIds || []).includes(currentUserId) ? 0 : 4;
  const startMs = s.plannedStart ? new Date(s.plannedStart).getTime() : nowMs;
  const endMs = s.plannedEnd ? new Date(s.plannedEnd).getTime() : startMs;
  const nearWindow =
    !Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs >= startMs - 3600000 && nowMs <= endMs
      ? 0
      : 2;
  return {
    tier: notOpenablePenalty + isToday + isMine + nearWindow,
    distance: Number.isNaN(startMs) ? Number.MAX_SAFE_INTEGER : Math.abs(startMs - nowMs),
  };
}

// Tab Kiểm két & Vận hành ca (UC24–UC27): Mở ca đối soát kết ca cũ, Nạp/Rút két (Quản lý), Theo dõi nhân sự & Đóng ca kiểm đếm.
// Ở chế độ readOnly (COO): chỉ xem trạng thái két, nhân sự trực ca, ca chờ mở và xem chi tiết ca — ngoại trừ xác nhận duyệt/từ chối đóng ca sớm khi cần.
export default function ShiftOperationsTab({
  branchId,
  userRole,
  currentUserId = null,
  currentSummary,
  loadingCurrent,
  openShiftError,
  previousClosed = null,
  loadingPreviousClosed = false,
  scheduledCandidates = [],
  preselectedScheduledId = null,
  todaySchedules = [],
  employeeMap = {},
  checkedInIds = new Set(),
  canManage = false,
  readOnly = false,
  hideStaffSchedule = false,
  onClearPreselectedScheduled,
  onReloadAll,
  onOpenCashModal,
  onOpenCloseModal,
  onOpenApproveEarlyClose,
  onOpenRejectEarlyClose,
  onOpenInitiateHandover,
  onOpenAcceptHandover,
  onOpenCancelHandover,
  onChangeCashier,
  onOpenScheduleModal,
  onViewDetail,
  onSwitchTab,
}) {
  const toast = useToast();
  const { navigate } = useRouter();
  const canAdjustCash = !readOnly && (userRole === "COO" || userRole === "BRANCH_MANAGER");
  const canEditStaff = !readOnly && canManage;

  const [openSource, setOpenSource] = useState("scheduled"); // "scheduled" | "adhoc"
  const [selectedScheduledId, setSelectedScheduledId] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [openNote, setOpenNote] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openFieldErrors, setOpenFieldErrors] = useState({});
  const [openApiError, setOpenApiError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setOpeningCash("");
    setOpenNote("");
    setOpenFieldErrors({});
    setOpenApiError("");
  }, [branchId]);

  const today = todayIso();
  const orderedScheduledCandidates = useMemo(() => {
    if (!scheduledCandidates.length) return [];
    return [...scheduledCandidates].sort((a, b) => {
      const ra = rankScheduledCandidate(a, currentUserId, today, nowMs);
      const rb = rankScheduledCandidate(b, currentUserId, today, nowMs);
      if (ra.tier !== rb.tier) return ra.tier - rb.tier;
      return ra.distance - rb.distance;
    });
  }, [scheduledCandidates, currentUserId, today, nowMs]);

  const openableCandidates = useMemo(
    () => orderedScheduledCandidates.filter((s) => getScheduledOpenability(s, nowMs).openable),
    [orderedScheduledCandidates, nowMs],
  );

  useEffect(() => {
    if (preselectedScheduledId) {
      const target = orderedScheduledCandidates.find(
        (s) => String(s.shiftId) === String(preselectedScheduledId),
      );
      const targetOpenability = target ? getScheduledOpenability(target, nowMs) : null;
      if (!target || targetOpenability?.openable) {
        setOpenSource("scheduled");
        setSelectedScheduledId(String(preselectedScheduledId));
      } else {
        setOpenSource(openableCandidates.length > 0 ? "scheduled" : "adhoc");
        setSelectedScheduledId(
          openableCandidates.length > 0 ? String(openableCandidates[0].shiftId) : "",
        );
        setOpenApiError(targetOpenability.message);
      }
      return;
    }
    if (openableCandidates.length > 0) {
      setOpenSource((cur) => (cur === "adhoc" && !selectedScheduledId ? "scheduled" : cur));
      setSelectedScheduledId((cur) => {
        if (cur && openableCandidates.some((s) => String(s.shiftId) === String(cur))) {
          return cur;
        }
        return String(openableCandidates[0].shiftId);
      });
    } else {
      setOpenSource("adhoc");
      setSelectedScheduledId("");
    }
  }, [preselectedScheduledId, orderedScheduledCandidates, openableCandidates, selectedScheduledId, nowMs]);

  const activeShift = currentSummary?.shift || null;

  const activeSchedule = useMemo(() => {
    if (!activeShift) return null;
    return (todaySchedules || []).find((s) => s.shiftId === activeShift.id) || {
      shiftId: activeShift.id,
      branchId: activeShift.branchId,
      shiftDate: activeShift.shiftDate,
      shiftType: activeShift.shiftType,
      plannedStart: activeShift.plannedStart,
      plannedEnd: activeShift.plannedEnd,
      status: activeShift.status,
      assignedEmployeeIds: [],
    };
  }, [activeShift, todaySchedules]);

  const hasPrevClosed = Boolean(
    previousClosed?.hasPreviousShift &&
      previousClosed?.countedCash !== null &&
      previousClosed?.countedCash !== undefined,
  );
  const prevClosingCash = hasPrevClosed ? Number(previousClosed.countedCash) : null;
  const parsedOpeningCash = openingCash === "" ? NaN : Number(openingCash);
  const hasValidOpeningCash = !Number.isNaN(parsedOpeningCash) && parsedOpeningCash >= 0;
  const openingVariance =
    hasPrevClosed && hasValidOpeningCash ? parsedOpeningCash - prevClosingCash : null;
  const hasOpeningDiscrepancy = openingVariance !== null && Math.abs(openingVariance) >= 0.01;

  async function handleOpenShift(e) {
    e.preventDefault();
    if (!branchId || openingBusy) return;

    const amount = Number(openingCash);
    const errs = {};
    if (openingCash === "" || Number.isNaN(amount) || amount < 0) {
      errs.openingCash = "Vui lòng nhập số tiền mặt thực đếm đầu ca >= 0.";
    }
    if (hasOpeningDiscrepancy && !openNote.trim()) {
      errs.note =
        "Số tiền thực đếm đầu ca lệch so với kết ca trước — vui lòng ghi rõ lý do bàn giao để mở ca.";
    }
    if (Object.keys(errs).length > 0) {
      setOpenFieldErrors(errs);
      return;
    }
    if (openSource === "scheduled") {
      const picked = orderedScheduledCandidates.find(
        (s) => String(s.shiftId) === String(selectedScheduledId),
      );
      if (!picked) {
        setOpenApiError("Vui lòng chọn ca đã lên lịch hợp lệ hoặc chuyển sang Mở ca phát sinh.");
        return;
      }
      const pickedOpenability = getScheduledOpenability(picked, nowMs);
      if (!pickedOpenability.openable) {
        setOpenApiError(pickedOpenability.message);
        return;
      }
    }

    setOpeningBusy(true);
    setOpenFieldErrors({});
    setOpenApiError("");
    try {
      const created = await shiftsApi.open({
        branchId,
        openingCash: amount,
        scheduledShiftId:
          openSource === "scheduled" && selectedScheduledId ? Number(selectedScheduledId) : null,
        note: openNote.trim() || null,
      });
      const shiftLabel = SHIFT_TYPE_META[created.shiftType]?.label || created.shiftType;
      const autoCheckInMsg =
        userRole === "CASHIER" && currentUserId && !checkedInIds.has(currentUserId)
          ? " và tự động Check-in cho bạn. Quầy POS đã sẵn sàng!"
          : ".";
      toast.success(
        `Đã mở ${shiftLabel} (#${created.id}) với két đầu ca ${formatVnd(amount)}${autoCheckInMsg}`,
      );
      setOpeningCash("");
      setOpenNote("");
      onClearPreselectedScheduled?.();
      await onReloadAll?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("openingCash")) nextFields.openingCash = err.fieldError("openingCash");
      if (err.fieldError?.("note")) nextFields.note = err.fieldError("note");
      if (err.detailCode === "REASON_REQUIRED") {
        nextFields.note = err.message;
      }
      setOpenFieldErrors(nextFields);
      setOpenApiError(err.message || "Không mở được ca làm việc.");
    } finally {
      setOpeningBusy(false);
    }
  }

  if (loadingCurrent && !currentSummary) {
    return (
      <div className="scms-panel p-5 text-center">
        <Spinner size="sm" className="me-2" /> Đang kiểm tra trạng thái ca hiện tại…
      </div>
    );
  }

  if (openShiftError && openShiftError.detailCode !== "SHIFT_NOT_OPEN") {
    return (
      <div className="scms-panel panel-pad">
        <div className="notice notice--warn mb-3">
          <strong>!</strong>
          <span>{openShiftError.message || "Không tải được thông tin ca hiện tại."}</span>
        </div>
        <Button variant="outline-secondary" onClick={onReloadAll}>
          Thử lại
        </Button>
      </div>
    );
  }

  // Trường hợp 1: Chi nhánh đang có ca OPEN -> bảng điều khiển két tiền & nhân sự ca hiện tại
  if (activeShift && currentSummary) {
    const typeMeta = SHIFT_TYPE_META[activeShift.shiftType] || { label: activeShift.shiftType };
    const statusMeta = SHIFT_STATUS_META[activeShift.status] || { label: activeShift.status, variant: "dark" };
    const assignedIds = activeSchedule?.assignedEmployeeIds || [];
    const txRows = currentSummary.transactions || [];
    const handoverRows = currentSummary.handovers || [];
    const isEarlyClosePending = Boolean(activeShift.earlyClosePending);
    const earlyRequesterName =
      activeShift.earlyCloseRequestedByName ||
      actorName(activeShift.earlyCloseRequestedBy, employeeMap);
    const earlyCloseVariance =
      activeShift.earlyCloseVariance !== null && activeShift.earlyCloseVariance !== undefined
        ? Number(activeShift.earlyCloseVariance)
        : null;
    const earlyHasVariance = earlyCloseVariance !== null && Math.abs(earlyCloseVariance) >= 0.01;
    const isHandoverPending = Boolean(activeShift.handoverPending);
    const pendingHandover = activeShift.pendingHandover || null;
    const holderName =
      activeShift.activeCashierName ||
      activeShift.openedByName ||
      actorName(activeShift.activeCashierId || activeShift.openedBy, employeeMap);
    const isSameHolderCashier = Boolean(
      userRole === "CASHIER" &&
        pendingHandover?.fromUserId &&
        currentUserId &&
        Number(pendingHandover.fromUserId) === Number(currentUserId),
    );
    const isInitiatorCashier = Boolean(
      userRole === "CASHIER" &&
        pendingHandover &&
        currentUserId &&
        (Number(pendingHandover.fromUserId) === Number(currentUserId) ||
          Number(pendingHandover.outgoingConfirmedBy) === Number(currentUserId)),
    );
    const canCancelHandover = Boolean(!readOnly && (userRole !== "CASHIER" || isInitiatorCashier));
    const totalOutAndRefund = Number(currentSummary.totalCashOut || 0) + Number(currentSummary.totalRefundOut || 0);
    const activeOpeningVar =
      activeShift.openingVariance !== null && activeShift.openingVariance !== undefined
        ? Number(activeShift.openingVariance)
        : null;
    const activeHasOpeningVar = activeOpeningVar !== null && Math.abs(activeOpeningVar) >= 0.01;

    const txColumns = [
      {
        key: "createdAt",
        header: "Thời gian",
        render: (tx) => <span className="small">{formatDateTime(tx.createdAt)}</span>,
      },
      {
        key: "type",
        header: "Loại",
        render: (tx) => {
          const meta = CASH_TX_META[tx.type] || { label: tx.type, variant: "neutral" };
          return <StatusTag status={tx.type} variant={meta.variant} label={meta.label} />;
        },
      },
      {
        key: "amount",
        header: "Số tiền",
        numeric: true,
        render: (tx) => {
          const sign = CASH_TX_META[tx.type]?.sign || "";
          return (
            <strong>
              {sign}
              {formatVnd(tx.amount)}
            </strong>
          );
        },
      },
      {
        key: "reason",
        header: "Lý do / Ghi chú",
        render: (tx) => tx.reason || "—",
      },
      {
        key: "actor",
        header: "Thực hiện / Duyệt",
        render: (tx) => (
          <div className="small">
            <div>{tx.createdByName || actorName(tx.createdBy, employeeMap)}</div>
            {tx.approvedBy ? (
              <div className="text-muted-scms">
                Duyệt: {tx.approvedByName || actorName(tx.approvedBy, employeeMap)}
              </div>
            ) : null}
          </div>
        ),
      },
    ];

    const handoverColumns = [
      {
        key: "time",
        header: "Thời gian",
        render: (h) => (
          <div className="small">
            <div>Giao: {formatDateTime(h.outgoingAt)}</div>
            {h.incomingAt ? (
              <div className="text-muted-scms">Nhận: {formatDateTime(h.incomingAt)}</div>
            ) : h.cancelledAt ? (
              <div className="text-muted-scms">Hủy: {formatDateTime(h.cancelledAt)}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "actors",
        header: "Giao → Nhận",
        render: (h) => (
          <div className="small">
            <div>
              <strong>{h.fromUserName || actorName(h.fromUserId, employeeMap)}</strong>
              {" → "}
              <strong>{h.toUserName || (h.toUserId ? actorName(h.toUserId, employeeMap) : "Chờ nhận")}</strong>
            </div>
            {h.cancelledByName ? <div className="text-muted-scms">Hủy bởi: {h.cancelledByName}</div> : null}
          </div>
        ),
      },
      {
        key: "amounts",
        header: "Kiểm giao / Nhận",
        numeric: true,
        render: (h) => (
          <div className="small">
            <div>
              Giao: <strong>{formatVnd(h.outgoingCountedCash)}</strong>
            </div>
            <div className="text-muted-scms">Sổ: {formatVnd(h.expectedCashAtOut)}</div>
            {h.incomingCountedCash !== null && h.incomingCountedCash !== undefined ? (
              <div>
                Nhận: <strong>{formatVnd(h.incomingCountedCash)}</strong>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: "variance",
        header: "Đối soát",
        render: (h) => {
          const hasOutVar =
            h.outgoingVariance !== null &&
            h.outgoingVariance !== undefined &&
            Math.abs(Number(h.outgoingVariance)) >= 0.01;
          const hasInCash = h.incomingCountedCash !== null && h.incomingCountedCash !== undefined;
          const hasInOutVar =
            hasInCash &&
            h.incomingVarianceFromOut !== null &&
            h.incomingVarianceFromOut !== undefined &&
            Math.abs(Number(h.incomingVarianceFromOut)) >= 0.01;
          return (
            <div className="small">
              <div>Giao vs sổ: <strong>{hasOutVar ? formatSignedVnd(h.outgoingVariance) : "Khớp"}</strong></div>
              {hasInCash ? (
                <div>Nhận vs giao: <strong>{hasInOutVar ? formatSignedVnd(h.incomingVarianceFromOut) : "Khớp 100%"}</strong></div>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "reason",
        header: "Lý do / Ghi chú",
        render: (h) => (
          <div className="small">
            <div><strong>{h.reason}</strong></div>
            {h.outgoingNote ? <div className="text-muted-scms">Giao: {h.outgoingNote}</div> : null}
            {h.incomingNote ? <div className="text-muted-scms">Nhận: {h.incomingNote}</div> : null}
            {h.cancelReason ? <div className="text-muted-scms">Hủy: {h.cancelReason}</div> : null}
          </div>
        ),
      },
      {
        key: "status",
        header: "Trạng thái",
        render: (h) => {
          const meta = HANDOVER_STATUS_META[h.status] || { label: h.status, variant: "neutral" };
          return <StatusTag status={h.status} variant={meta.variant} label={meta.label} />;
        },
      },
    ];

    return (
      <>
        <div className="scms-panel panel-pad mb-3">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                <span className="screen-code">CA ĐANG MỞ · #{activeShift.id}</span>
                <StatusTag status={activeShift.status} label={statusMeta.label} variant={statusMeta.variant} />
                {isEarlyClosePending ? (
                  <StatusTag status="EARLY_CLOSE_PENDING" label="Chờ duyệt đóng ca sớm" variant="warn" />
                ) : null}
                {isHandoverPending ? (
                  <StatusTag status="PENDING_RECEIVE" label="Chờ nhận bàn giao két" variant="warn" />
                ) : null}
              </div>
              <h2 className="mb-1" style={{ fontSize: 19 }}>
                {typeMeta.label} · Ngày {formatDate(activeShift.shiftDate)}
              </h2>
              <div className="small text-muted-scms">
                Khung giờ dự kiến: <strong>{formatHm(activeShift.plannedStart)} – {formatHm(activeShift.plannedEnd)}</strong>
                {" · "}Mở lúc <strong>{formatDateTime(activeShift.openedAt)}</strong> bởi{" "}
                <strong>{activeShift.openedByName || actorName(activeShift.openedBy, employeeMap)}</strong>
                {" · "}Đang giữ két: <strong>{holderName}</strong>
              </div>
              {activeShift.previousShiftId || (activeShift.previousClosingCash !== null && activeShift.previousClosingCash !== undefined) ? (
                <div className="small mt-1">
                  <span className="text-muted-scms">
                    Kiểm két đầu ca so với kết ca #{activeShift.previousShiftId || "trước"} (
                    <strong>{formatVnd(activeShift.previousClosingCash)}</strong>):{" "}
                  </span>
                  {activeHasOpeningVar ? (
                    <strong style={{ color: "var(--accent-dark)" }}>
                      Chênh {formatSignedVnd(activeOpeningVar)}
                      {activeShift.openingNote ? ` — Lý do: ${activeShift.openingNote}` : ""}
                    </strong>
                  ) : (
                    <span>
                      Khớp hoàn toàn{activeShift.openingNote ? ` · Ghi chú: ${activeShift.openingNote}` : ""}
                    </span>
                  )}
                </div>
              ) : activeShift.openingNote ? (
                <div className="small text-muted-scms mt-1">Ghi chú mở ca: {activeShift.openingNote}</div>
              ) : null}
            </div>

            <div className="d-flex gap-2 flex-wrap">
              {isEarlyClosePending ? (
                <>
                  {userRole === "BRANCH_MANAGER" || userRole === "COO" ? (
                    <>
                      <Button variant="primary" onClick={() => onOpenApproveEarlyClose?.()}>
                        <Icon name="check" size={14} /> Xác nhận đóng ca sớm &amp; Check-out
                      </Button>
                      <Button variant="outline-danger" onClick={() => onOpenRejectEarlyClose?.(false)}>
                        Từ chối / Mở lại ca
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" onClick={() => onReloadAll?.()}>
                        <Spinner size="sm" className="me-2" /> Kiểm tra trạng thái ngay
                      </Button>
                      <Button variant="outline-secondary" onClick={() => onOpenRejectEarlyClose?.(true)}>
                        Hủy yêu cầu đóng ca sớm
                      </Button>
                    </>
                  )}
                  {readOnly ? (
                    <Button variant="outline-secondary" onClick={() => onViewDetail?.(activeShift.id)}>
                      Xem chi tiết ca →
                    </Button>
                  ) : (
                    <Button
                      variant="outline-secondary"
                      disabled
                      title="Ca đang chờ Quản lý chi nhánh xác nhận đóng ca sớm"
                    >
                      <Icon name="pos" size={14} /> Mở quầy POS (Chờ đóng ca)
                    </Button>
                  )}
                </>
              ) : readOnly ? (
                <Button variant="primary" onClick={() => onViewDetail?.(activeShift.id)}>
                  Xem chi tiết ca →
                </Button>
              ) : isHandoverPending ? (
                <>
                  {isSameHolderCashier ? (
                    <>
                      <Button variant="primary" onClick={() => onChangeCashier?.()}>
                        Đổi thu ngân (mở PIN người mới)
                      </Button>
                      <Button
                        variant="outline-secondary"
                        disabled
                        title="Người vừa bàn giao két không thể tự nhận lại ca bằng cùng tài khoản; dùng Đổi thu ngân để người mới nhập PIN hoặc Hủy bàn giao để đứng quầy tiếp."
                      >
                        Kiểm két nhận ca
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" onClick={() => onOpenAcceptHandover?.()}>
                      <Icon name="check" size={14} /> Kiểm két nhận ca &amp; Mở lại POS
                    </Button>
                  )}
                  {canCancelHandover ? (
                    <Button variant="outline-secondary" onClick={() => onOpenCancelHandover?.()}>
                      Hủy bàn giao
                    </Button>
                  ) : null}
                  <Button
                    variant="outline-secondary"
                    disabled
                    title="Két tiền đang tạm khóa chờ xác nhận bàn giao giữa ca"
                  >
                    <Icon name="pos" size={14} /> Mở quầy POS (Đang bàn giao)
                  </Button>
                  {canAdjustCash ? (
                    <Button variant="outline-danger" onClick={() => onOpenCloseModal?.()}>
                      <Icon name="check" size={14} /> Đóng hẳn ca
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <Button variant="primary" onClick={() => navigate("/pos")}>
                    <Icon name="pos" size={14} /> Mở quầy POS →
                  </Button>
                  {canAdjustCash ? (
                    <>
                      <Button variant="outline-secondary" onClick={() => onOpenCashModal?.("IN")}>
                        <Icon name="plus" size={14} /> Nạp tiền két
                      </Button>
                      <Button variant="outline-secondary" onClick={() => onOpenCashModal?.("OUT")}>
                        − Rút tiền két
                      </Button>
                    </>
                  ) : null}
                  <Button variant="outline-primary" onClick={() => onOpenInitiateHandover?.()}>
                    Bàn giao két giữa ca
                  </Button>
                  <Button variant="outline-danger" onClick={() => onOpenCloseModal?.()}>
                    <Icon name="check" size={14} /> Đóng ca &amp; Đối soát
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {isEarlyClosePending ? (
          <div
            className="scms-panel panel-pad mb-3"
            style={{ background: "var(--warn-soft)", border: "1px solid var(--accent)" }}
          >
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-2 mb-1">
                  {userRole === "CASHIER" ? <Spinner size="sm" /> : <strong>!</strong>}
                  <strong style={{ fontSize: 15 }}>
                    {userRole === "CASHIER"
                      ? "Đang chờ Quản lý chi nhánh xác nhận đóng ca sớm"
                      : "Yêu cầu xác nhận đóng ca sớm từ Thu ngân"}
                  </strong>
                </div>
                <div className="small mb-2">
                  {userRole === "CASHIER" ? (
                    <>
                      Yêu cầu đóng Ca #{activeShift.id} (kết ca dự kiến lúc{" "}
                      <strong>{formatHm(activeShift.plannedEnd)}</strong>) đã được gửi lên{" "}
                      <strong>Quản lý chi nhánh</strong>. Hệ thống đang tạm khóa quầy POS và tự kiểm tra trạng thái mỗi 4 giây — ngay khi Quản lý xác nhận, bạn sẽ được{" "}
                      <strong>tự động Check-out</strong> và <strong>đăng xuất về màn hình PIN</strong>.
                    </>
                  ) : (
                    <>
                      Thu ngân <strong>{earlyRequesterName}</strong> đã kiểm két và gửi yêu cầu đóng Ca #
                      {activeShift.id} sớm hơn giờ kết ca dự kiến (
                      <strong>{formatHm(activeShift.plannedEnd)}</strong>). Vui lòng xác nhận chốt ca &amp; Check-out Thu ngân hoặc từ chối để tiếp tục bán hàng.
                    </>
                  )}
                </div>
                <div
                  className="p-2 small"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-xs)",
                  }}
                >
                  <div>
                    <span className="text-muted-scms">Người gửi: </span>
                    <strong>{earlyRequesterName}</strong>
                    {activeShift.earlyCloseRequestedAt ? (
                      <span className="text-muted-scms">
                        {" "}· lúc {formatDateTime(activeShift.earlyCloseRequestedAt)}
                      </span>
                    ) : null}
                    {" · "}
                    <span className="text-muted-scms">Thực đếm khai báo: </span>
                    <strong>{formatVnd(activeShift.earlyCloseCountedCash)}</strong>
                    {earlyCloseVariance !== null ? (
                      <>
                        {" · "}
                        <span className="text-muted-scms">Chênh lệch: </span>
                        <strong>{earlyHasVariance ? formatSignedVnd(earlyCloseVariance) : "Khớp"}</strong>
                      </>
                    ) : null}
                  </div>
                  {activeShift.earlyCloseDiscrepancyReason ? (
                    <div className="mt-1">
                      <span className="text-muted-scms">Giải trình chênh lệch: </span>
                      <strong>{activeShift.earlyCloseDiscrepancyReason}</strong>
                    </div>
                  ) : null}
                  {activeShift.earlyCloseReason ? (
                    <div className="mt-1">
                      <span className="text-muted-scms">Lý do xin đóng ca sớm: </span>
                      <strong>{activeShift.earlyCloseReason}</strong>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="d-flex flex-column gap-2">
                {userRole === "CASHIER" ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => onReloadAll?.()}>
                      Kiểm tra trạng thái ngay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => onOpenRejectEarlyClose?.(true)}
                    >
                      Hủy yêu cầu đóng ca sớm
                    </Button>
                  </>
                ) : userRole === "BRANCH_MANAGER" || userRole === "COO" ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => onOpenApproveEarlyClose?.()}>
                      <Icon name="check" size={14} /> Xác nhận đóng ca sớm &amp; Check-out Thu ngân
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => onOpenRejectEarlyClose?.(false)}
                    >
                      Từ chối / Mở lại ca
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isHandoverPending && pendingHandover ? (
          <div className="notice notice--warn mb-3">
            <strong>!</strong>
            <span>
              <strong>Đang tạm khóa POS chờ bàn giao két giữa ca:</strong>{" "}
              <strong>{pendingHandover.fromUserName || actorName(pendingHandover.fromUserId, employeeMap)}</strong> đã chốt kiểm giao{" "}
              <strong>{formatVnd(pendingHandover.outgoingCountedCash)}</strong> (lúc{" "}
              {formatDateTime(pendingHandover.outgoingAt)}) · Lý do: <em>{pendingHandover.reason}</em>.
              {pendingHandover.toUserId ? (
                <>
                  {" "}Người dự kiến nhận:{" "}
                  <strong>{pendingHandover.toUserName || actorName(pendingHandover.toUserId, employeeMap)}</strong>.
                </>
              ) : null}{" "}
              {readOnly
                ? "Quầy POS tạm khóa cho đến khi người nhận mới hoặc Quản lý chi nhánh kiểm két xác nhận nhận ca."
                : isSameHolderCashier
                  ? "Người tiếp nhận hãy bấm «Đổi thu ngân» để đăng nhập bằng PIN của người mới và kiểm đếm lại tiền két; hoặc nếu bạn ở lại đứng quầy, bấm «Hủy bàn giao»."
                  : userRole === "CASHIER"
                    ? "Vui lòng đếm lại tiền mặt thực tế trong két và bấm «Kiểm két nhận ca & Mở lại POS» để nhận quầy & tự động Check-in."
                    : "Nếu chưa có Thu ngân thay thế kịp, Quản lý có thể bấm «Kiểm két nhận ca & Mở lại POS» để trực tiếp đứng quầy thay (hoặc chọn Thu ngân khác / «Đóng hẳn ca»)."}
            </span>
          </div>
        ) : null}

        {readOnly ? (
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              <strong>Chế độ xem COO:</strong> Theo dõi số dư két tiền, nhân sự trực ca và lịch sử biến động theo thời gian thực. Thao tác kiểm két, mở/đóng ca và nạp/rút két do{" "}
              <strong>Thu ngân</strong> hoặc <strong>Quản lý chi nhánh</strong> thực hiện.
            </span>
          </div>
        ) : !canAdjustCash ? (
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              Quyền <strong>Thu ngân</strong>: Bạn có thể kiểm kê két, bán hàng POS, bàn giao két giữa ca khi cần đổi người trực và nhập số tiền thực đếm kèm PIN cá nhân để đóng ca &amp; tự động Check-out. Thao tác{" "}
              <strong>nạp / rút tiền mặt thủ công khỏi két</strong> chỉ dành cho <strong>Quản lý chi nhánh</strong>.
            </span>
          </div>
        ) : null}

        <div className="mb-3">
          <KpiStrip
            items={[
              { label: "Tiền đầu ca", value: formatVnd(currentSummary.openingCash) },
              { label: "Thu tiền mặt", value: formatVnd(currentSummary.cashRevenue), sub: "Bán hàng POS" },
              { label: "Chuyển khoản QR", value: formatVnd(currentSummary.transferRevenue), sub: "Không vào két" },
              { label: "Nạp thêm vào két", value: formatVnd(currentSummary.totalCashIn) },
              {
                label: "Rút két / Hoàn tiền",
                value: formatVnd(totalOutAndRefund),
                sub: `Rút: ${formatVnd(currentSummary.totalCashOut)} · Hoàn: ${formatVnd(currentSummary.totalRefundOut)}`,
              },
              {
                label: "Dự kiến trong két",
                value: formatVnd(currentSummary.currentCashBalance),
                sub: isEarlyClosePending
                  ? "Chờ duyệt đóng ca sớm"
                  : isHandoverPending
                    ? "Tạm khóa chờ bàn giao"
                    : "Cần khớp khi đóng ca",
              },
            ]}
          />
        </div>

        <Row className="g-3">
          {!hideStaffSchedule ? (
            <Col lg={4}>
              <div className="scms-panel panel-pad h-100">
                <div className="panel-head">
                  <div>
                    <h2>Nhân sự trực ca ({assignedIds.length})</h2>
                    <p>Phân công cho ca hiện tại &amp; trạng thái chấm công.</p>
                  </div>
                  {canEditStaff ? (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => onOpenScheduleModal?.("edit", activeSchedule)}
                    >
                      <Icon name="edit" size={13} /> Gán NV/Sửa
                    </Button>
                  ) : null}
                </div>

                {assignedIds.length === 0 ? (
                  <div className="empty-state py-4">
                    <span className="empty-state__icon">
                      <Icon name="users" size={18} />
                    </span>
                    <span>Chưa có nhân viên nào được gán vào ca này.</span>
                    {canEditStaff ? (
                      <Button
                        size="sm"
                        variant="primary"
                        className="mt-1"
                        onClick={() => onOpenScheduleModal?.("edit", activeSchedule)}
                      >
                        Gán nhân viên vào ca
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {assignedIds.map((empId) => {
                      const emp = employeeMap[empId];
                      const checkedIn = checkedInIds.has(empId) || emp?.isCheckedIn;
                      const { roleLabel, baseLabel, isOverride } = resolveShiftEmployeeRole(
                        empId,
                        activeSchedule,
                        employeeMap,
                        POSITION_LABELS,
                      );
                      return (
                        <div
                          key={empId}
                          className="d-flex justify-content-between align-items-center p-2"
                          style={{
                            background: isOverride ? "var(--accent-soft)" : "var(--paper)",
                            border: isOverride ? "1px solid var(--accent)" : "1px solid var(--line)",
                            borderRadius: "var(--radius-xs)",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {emp?.fullName || `NV #${empId}`}
                            </div>
                            <div className="text-muted-scms" style={{ fontSize: 11.5 }}>
                              {isOverride ? (
                                <>
                                  <strong>{roleLabel}</strong> (ca này · gốc {baseLabel})
                                </>
                              ) : (
                                roleLabel || "Nhân viên"
                              )}
                              {emp?.phone ? ` · ${emp.phone}` : ""}
                            </div>
                          </div>
                          <div className="d-flex align-items-center gap-1">
                            {activeSchedule?.replacementEmployeeIds?.includes(empId) ? (
                              <StatusTag
                                status="REPLACEMENT"
                                variant="warn"
                                label="Nhân sự thay thế"
                              />
                            ) : null}
                            <StatusTag
                              status={checkedIn ? "CHECKED_IN" : "INACTIVE"}
                              variant={checkedIn ? "success" : "neutral"}
                              label={checkedIn ? "Đang trong ca" : "Chưa check-in"}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!readOnly ? (
                  <div className="mt-3 pt-2 d-flex justify-content-between align-items-center" style={{ borderTop: "1px solid var(--line)" }}>
                    <span className="small text-muted-scms">Quầy chấm công PIN/RFID</span>
                    <Button size="sm" variant="outline-secondary" onClick={() => navigate("/kiosk")}>
                      Mở Kiosk →
                    </Button>
                  </div>
                ) : null}
              </div>
            </Col>
          ) : null}

          <Col lg={hideStaffSchedule ? 12 : 8}>
            <div className="scms-panel panel-pad mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h2 className="mb-0" style={{ fontSize: 15 }}>Biến động tiền mặt trong ca ({txRows.length})</h2>
                <p className="mb-0 text-muted-scms small">Lịch sử mở ca, nạp tiền lẻ, rút tiền và hoàn tiền tại quầy.</p>
              </div>
              {readOnly ? (
                <Button size="sm" variant="outline-secondary" onClick={() => onViewDetail?.(activeShift.id)}>
                  Chi tiết đối soát →
                </Button>
              ) : isEarlyClosePending ? (
                <Button size="sm" variant="outline-secondary" disabled>
                  POS tạm khóa chờ đóng ca
                </Button>
              ) : isHandoverPending ? (
                <Button size="sm" variant="outline-secondary" disabled>
                  POS tạm khóa bàn giao
                </Button>
              ) : (
                <Button size="sm" variant="outline-secondary" onClick={() => navigate("/pos")}>
                  Mở quầy POS →
                </Button>
              )}
            </div>
            <DataTable
              columns={txColumns}
              rows={txRows}
              rowKey={(tx) => tx.id}
              emptyMessage="Chưa có biến động két tiền nào."
            />
          </Col>
        </Row>

        {handoverRows.length > 0 ? (
          <div className="mt-3">
            <div className="scms-panel panel-pad mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h2 className="mb-0" style={{ fontSize: 15 }}>Lịch sử bàn giao két giữa ca ({handoverRows.length})</h2>
                <p className="mb-0 text-muted-scms small">
                  Ghi nhận kiểm đếm giao/nhận két khi đổi người trực nhưng vẫn giữ nguyên ca bán hàng đang mở.
                </p>
              </div>
            </div>
            <DataTable
              columns={handoverColumns}
              rows={handoverRows}
              rowKey={(h) => h.id}
              emptyMessage="Chưa có lượt bàn giao két nào trong ca."
            />
          </div>
        ) : null}
      </>
    );
  }

  // Trường hợp 2 (COO readOnly): Chưa có ca mở -> chỉ xem trạng thái chi nhánh, kết ca trước + chi tiết ca, và ca đã lên lịch
  if (readOnly) {
    return (
      <>
        <div className="notice mb-3">
          <strong>i</strong>
          <span>
            Chi nhánh hiện chưa mở ca làm việc. Việc kiểm đếm két đầu ca và mở ca được thực hiện bởi{" "}
            <strong>Thu ngân</strong> hoặc <strong>Quản lý chi nhánh</strong> (COO chỉ xem tổng quan &amp; chi tiết đối soát).
          </span>
        </div>

        <div
          className="scms-panel panel-pad mb-3"
          style={{ background: "var(--paper)", border: "1px solid var(--line-strong)" }}
        >
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <div
                className="text-muted-scms mb-1"
                style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                Ca đóng gần nhất tại chi nhánh
              </div>
              {loadingPreviousClosed ? (
                <div className="small text-muted-scms py-1">
                  <Spinner size="sm" className="me-2" /> Đang tải dữ liệu ca đóng gần nhất…
                </div>
              ) : hasPrevClosed ? (
                <>
                  <div className="d-flex align-items-baseline gap-2 flex-wrap">
                    <span style={{ fontSize: 14 }}>Tiền mặt kết ca bàn giao:</span>
                    <strong className="num" style={{ fontSize: 22 }}>
                      {formatVnd(prevClosingCash)}
                    </strong>
                  </div>
                  <div className="small text-muted-scms mt-1">
                    <strong>{SHIFT_TYPE_META[previousClosed.shiftType]?.label || previousClosed.shiftType}</strong>{" "}
                    <span className="mono">#{previousClosed.shiftId}</span> · Ngày {formatDate(previousClosed.shiftDate)} · Đóng lúc{" "}
                    <strong>{formatDateTime(previousClosed.closedAt)}</strong> bởi{" "}
                    <strong>{previousClosed.closedByName || actorName(previousClosed.closedBy, employeeMap)}</strong>
                    {previousClosed.variance !== null &&
                    previousClosed.variance !== undefined &&
                    Math.abs(Number(previousClosed.variance)) >= 0.01 ? (
                      <> · Chênh lúc đóng ca: <strong>{formatSignedVnd(previousClosed.variance)}</strong></>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="small text-muted-scms">Chi nhánh chưa có ca đã đóng nào trước đó.</div>
              )}
            </div>

            {hasPrevClosed && !loadingPreviousClosed ? (
              <Button
                type="button"
                variant="outline-primary"
                onClick={() => onViewDetail?.(previousClosed.shiftId)}
              >
                Xem chi tiết ca #{previousClosed.shiftId} →
              </Button>
            ) : null}
          </div>
        </div>

        <div className="scms-panel panel-pad">
          <div className="panel-head">
            <div>
              <h2>Ca đã lên lịch chờ mở quanh hôm nay ({orderedScheduledCandidates.length})</h2>
              <p>Theo dõi lịch phân công các ca sắp tới của chi nhánh.</p>
            </div>
            <Button size="sm" variant="outline-secondary" onClick={() => onSwitchTab?.("schedule")}>
              Xem lịch phân ca →
            </Button>
          </div>

          {orderedScheduledCandidates.length === 0 ? (
            <div className="small text-muted-scms">
              Chưa có ca nào ở trạng thái Đã lên lịch quanh ngày hôm nay.
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {orderedScheduledCandidates.map((s) => {
                const meta = SHIFT_TYPE_META[s.shiftType] || { label: s.shiftType };
                const isToday = s.shiftDate === today;
                return (
                  <div
                    key={s.shiftId}
                    className="p-3"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <strong>
                          {meta.label} · {formatDate(s.shiftDate)}
                        </strong>
                        <span className="mono small text-muted-scms">
                          #{s.shiftId} · {formatHm(s.plannedStart)} – {formatHm(s.plannedEnd)}
                        </span>
                      </div>
                      <div className="d-flex align-items-center gap-1 flex-wrap">
                        {isToday ? <StatusTag status="TODAY" label="Hôm nay" variant="dark" /> : null}
                        <StatusTag status="SCHEDULED" label="Đã lên lịch" variant="neutral" />
                      </div>
                    </div>
                    <div className="small text-muted-scms mt-1">
                      {s.assignedEmployeeIds?.length ? (
                        <>
                          Nhân sự gán ca:{" "}
                          <strong>
                            {s.assignedEmployeeIds
                              .map((id) => formatAssignedStaffSummary(id, s, employeeMap))
                              .join(", ")}
                          </strong>
                        </>
                      ) : (
                        "Chưa gán nhân viên vào lịch ca này"
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  // Trường hợp 2: Chi nhánh chưa có ca đang mở -> form Kiểm két đầu ca đối chiếu kết ca cũ & Mở ca (UC24)
  return (
    <>
      <div className="notice notice--warn mb-3">
        <strong>!</strong>
        <span>
          Chi nhánh hiện chưa mở ca làm việc. Kiểm đếm tiền mặt hiện có trong két so với kết ca trước, chọn ca bên dưới (hoặc mở ca phát sinh) để bắt đầu bán hàng.
        </span>
      </div>

      {/* Thẻ Đối soát kết ca trước */}
      <div
        className="scms-panel panel-pad mb-3"
        style={{ background: "var(--paper)", border: "1px solid var(--line-strong)" }}
      >
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <div
              className="text-muted-scms mb-1"
              style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Đối soát kết ca cũ trước khi nhận két
            </div>
            {loadingPreviousClosed ? (
              <div className="small text-muted-scms py-1">
                <Spinner size="sm" className="me-2" /> Đang tải dữ liệu ca đóng gần nhất…
              </div>
            ) : hasPrevClosed ? (
              <>
                <div className="d-flex align-items-baseline gap-2 flex-wrap">
                  <span style={{ fontSize: 14 }}>Tiền mặt bàn giao từ ca trước:</span>
                  <strong className="num" style={{ fontSize: 22 }}>
                    {formatVnd(prevClosingCash)}
                  </strong>
                </div>
                <div className="small text-muted-scms mt-1">
                  <strong>{SHIFT_TYPE_META[previousClosed.shiftType]?.label || previousClosed.shiftType}</strong>{" "}
                  <span className="mono">#{previousClosed.shiftId}</span> · Ngày {formatDate(previousClosed.shiftDate)} · Đóng lúc{" "}
                  <strong>{formatDateTime(previousClosed.closedAt)}</strong> bởi{" "}
                  <strong>{previousClosed.closedByName || actorName(previousClosed.closedBy, employeeMap)}</strong>
                  {previousClosed.variance !== null &&
                  previousClosed.variance !== undefined &&
                  Math.abs(Number(previousClosed.variance)) >= 0.01 ? (
                    <> · Chênh lúc đóng ca trước: <strong>{formatSignedVnd(previousClosed.variance)}</strong></>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="small text-muted-scms">
                Chi nhánh chưa có ca đã đóng nào trước đó. Đếm tiền mặt thực tế trong két để khai báo ca đầu tiên.
              </div>
            )}
          </div>

          {hasPrevClosed && !loadingPreviousClosed ? (
            <Button
              type="button"
              variant={hasValidOpeningCash && !hasOpeningDiscrepancy ? "primary" : "outline-secondary"}
              onClick={() => {
                setOpeningCash(String(Math.round(prevClosingCash)));
                setOpenFieldErrors({});
                setOpenApiError("");
              }}
              disabled={openingBusy}
            >
              Khớp kết ca cũ ({formatVnd(prevClosingCash)})
            </Button>
          ) : null}
        </div>
      </div>

      <div className="scms-panel panel-pad">
        <div className="panel-head">
          <div>
            <h2>Mở ca &amp; Kiểm két đầu ca</h2>
            <p>Chọn ca đã phân công (hoặc ca phát sinh), đếm thực tế tiền trong két và xác nhận đối soát so với kết ca trước.</p>
          </div>
        </div>

        {userRole === "CASHIER" && currentUserId ? (
          checkedInIds.has(currentUserId) ? (
            <div className="notice mb-3" style={{ background: "var(--success-soft)", borderColor: "#bcc7b5" }}>
              <strong>✓</strong>
              <span>
                Bạn đã <strong>Check-in</strong> chấm công hôm nay. Hãy kiểm két &amp; xác nhận mở ca để vào quầy <strong>Gọi món (POS)</strong>.
              </span>
            </div>
          ) : (
            <div className="notice mb-3" style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}>
              <strong>i</strong>
              <span>
                <strong>Nhận ca Thu ngân:</strong> Đếm tiền mặt thực tế trong két và bấm{" "}
                <strong>Xác nhận kiểm két, Mở ca &amp; Check-in</strong> bên dưới — hệ thống sẽ tự động{" "}
                <strong>Check-in</strong> cho bạn và mở khóa <strong>Gọi món (POS)</strong>.
              </span>
            </div>
          )
        ) : null}

        {openApiError ? (
          <div className="notice notice--warn mb-3">
            <strong>!</strong>
            <span>{openApiError}</span>
          </div>
        ) : null}

        <Form noValidate onSubmit={handleOpenShift}>
          <div className="mb-3">
            <div className="form-label mb-2">1. Chọn ca làm việc</div>
            {orderedScheduledCandidates.length > 0 ? (
              <div className="d-flex flex-column gap-2 mb-2">
                {orderedScheduledCandidates.map((s) => {
                  const openability = getScheduledOpenability(s, nowMs);
                  const canSelect = openability.openable;
                  const selected = canSelect && openSource === "scheduled" && String(selectedScheduledId) === String(s.shiftId);
                  const meta = SHIFT_TYPE_META[s.shiftType] || { label: s.shiftType };
                  const isMine = currentUserId && (s.assignedEmployeeIds || []).includes(currentUserId);
                  const isToday = s.shiftDate === today;
                  return (
                    <div
                      key={s.shiftId}
                      onClick={() => {
                        if (!canSelect) {
                          setOpenApiError(openability.message);
                          return;
                        }
                        if (preselectedScheduledId && String(s.shiftId) !== String(preselectedScheduledId)) {
                          onClearPreselectedScheduled?.();
                        }
                        setOpenSource("scheduled");
                        setSelectedScheduledId(String(s.shiftId));
                        setOpenApiError("");
                      }}
                      role="button"
                      tabIndex={canSelect ? 0 : -1}
                      aria-disabled={!canSelect}
                      title={!canSelect ? openability.message : undefined}
                      onKeyDown={(e) => {
                        if (!canSelect) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (preselectedScheduledId && String(s.shiftId) !== String(preselectedScheduledId)) {
                            onClearPreselectedScheduled?.();
                          }
                          setOpenSource("scheduled");
                          setSelectedScheduledId(String(s.shiftId));
                        }
                      }}
                      className="p-3"
                      style={{
                        cursor: canSelect ? "pointer" : "not-allowed",
                        opacity: canSelect ? 1 : 0.72,
                        background: selected ? "var(--accent-soft)" : canSelect ? "var(--surface)" : "var(--paper)",
                        border: selected ? "1px solid var(--accent)" : "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <Form.Check
                            type="radio"
                            name="openShiftMode"
                            disabled={!canSelect}
                            checked={selected}
                            onChange={() => {
                              if (!canSelect) return;
                              if (preselectedScheduledId && String(s.shiftId) !== String(preselectedScheduledId)) {
                                onClearPreselectedScheduled?.();
                              }
                              setOpenSource("scheduled");
                              setSelectedScheduledId(String(s.shiftId));
                            }}
                          />
                          <strong>
                            {meta.label} · {formatDate(s.shiftDate)}
                          </strong>
                          <span className="mono small text-muted-scms">
                            #{s.shiftId} · {formatHm(s.plannedStart)} – {formatHm(s.plannedEnd)}
                          </span>
                        </div>
                        <div className="d-flex align-items-center gap-1 flex-wrap">
                          {isToday ? <StatusTag status="TODAY" label="Hôm nay" variant="dark" /> : null}
                          {isMine ? <StatusTag status="MINE" label="Ca của bạn" variant="success" /> : null}
                          {canSelect ? (
                            <StatusTag status="SCHEDULED" label="Đã lên lịch" variant="neutral" />
                          ) : (
                            <StatusTag
                              status={openability.reason || "LOCKED"}
                              label={openability.label}
                              variant={openability.reason === "TOO_EARLY" ? "neutral" : "warn"}
                            />
                          )}
                        </div>
                      </div>
                      <div className="small text-muted-scms mt-1 ms-4">
                        {hideStaffSchedule ? (
                          isMine
                            ? "Ca được phân công cho bạn · Chọn để kiểm két & mở ca"
                            : "Ca đã lên lịch tại quầy"
                        ) : s.assignedEmployeeIds?.length ? (
                          <>
                            Nhân sự gán ca:{" "}
                            <strong>
                              {s.assignedEmployeeIds
                                .map((id) => formatAssignedStaffSummary(id, s, employeeMap))
                                .join(", ")}
                            </strong>
                          </>
                        ) : (
                          "Chưa gán nhân viên vào lịch ca này"
                        )}
                      </div>
                      {!canSelect && openability.message ? (
                        <div className="small mt-1 ms-4" style={{ color: "var(--muted)", fontStyle: "italic" }}>
                          {openability.message}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="small text-muted-scms mb-2">
                Không có ca nào ở trạng thái Đã lên lịch quanh ngày hôm nay. Bạn có thể mở ca phát sinh ngay bên dưới.
              </div>
            )}

            <div
              onClick={() => {
                if (preselectedScheduledId) onClearPreselectedScheduled?.();
                setOpenSource("adhoc");
                setOpenApiError("");
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (preselectedScheduledId) onClearPreselectedScheduled?.();
                  setOpenSource("adhoc");
                }
              }}
              className="p-3"
              style={{
                cursor: "pointer",
                background: openSource === "adhoc" ? "var(--accent-soft)" : "var(--surface)",
                border: openSource === "adhoc" ? "1px solid var(--accent)" : "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <Form.Check
                  type="radio"
                  name="openShiftMode"
                  checked={openSource === "adhoc"}
                  onChange={() => {
                    if (preselectedScheduledId) onClearPreselectedScheduled?.();
                    setOpenSource("adhoc");
                  }}
                />
                <strong>Mở ca phát sinh (tạo ca mới theo giờ hiện tại)</strong>
              </div>
              <div className="small text-muted-scms mt-1 ms-4">
                Hệ thống tự suy luận Ca sáng (07:00–12:30), Ca chiều (12:30–18:00) hoặc Ca tối (18:00–23:00) theo giờ Việt Nam.
              </div>
            </div>
          </div>

          <div className="form-grid mt-3">
            <FormField
              label="2. Tiền mặt thực tế kiểm đếm được trong két (VNĐ)"
              required
              error={openFieldErrors.openingCash}
              help="Nhập đúng số tiền thực đếm hiện có trong két khi nhận ca."
            >
              <InputGroup>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  placeholder="Nhập số tiền thực đếm trong két…"
                  value={formatMoneyInput(openingCash)}
                  onChange={(e) => {
                    setOpeningCash(parseMoneyDigits(e.target.value));
                    setOpenFieldErrors((f) => ({ ...f, openingCash: null, note: null }));
                    setOpenApiError("");
                  }}
                  disabled={openingBusy}
                />
                <InputGroup.Text>VNĐ</InputGroup.Text>
              </InputGroup>
              <div className="d-flex gap-1 flex-wrap mt-2">
                {OPENING_PRESETS.map((val) => (
                  <Button
                    key={val}
                    type="button"
                    size="sm"
                    variant={hasValidOpeningCash && parsedOpeningCash === val ? "primary" : "outline-secondary"}
                    onClick={() => {
                      setOpeningCash(String(val));
                      setOpenFieldErrors((f) => ({ ...f, openingCash: null, note: null }));
                      setOpenApiError("");
                    }}
                    disabled={openingBusy}
                  >
                    {new Intl.NumberFormat("vi-VN").format(val)} đ
                  </Button>
                ))}
              </div>
            </FormField>

            <FormField
              label={hasOpeningDiscrepancy ? "Giải trình chênh lệch đầu ca" : "Ghi chú mở ca"}
              required={hasOpeningDiscrepancy}
              error={openFieldErrors.note}
              help={
                hasOpeningDiscrepancy
                  ? "Bắt buộc nhập lý do vì số tiền thực đếm khác với kết ca trước."
                  : "Tùy chọn khi tiền trong két khớp với kết ca trước."
              }
            >
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={500}
                placeholder={
                  hasOpeningDiscrepancy
                    ? "VD: Quản lý tạm ứng trước khi mở ca / Ca trước kiểm sót tiền lẻ…"
                    : "VD: Nhận bàn giao két từ ca trước"
                }
                value={openNote}
                onChange={(e) => {
                  setOpenNote(e.target.value);
                  setOpenFieldErrors((f) => ({ ...f, note: null }));
                  setOpenApiError("");
                }}
                disabled={openingBusy}
              />
            </FormField>
          </div>

          {hasPrevClosed && hasValidOpeningCash ? (
            <div
              className={`notice mt-2 mb-3 ${hasOpeningDiscrepancy ? "notice--warn" : ""}`}
              style={!hasOpeningDiscrepancy ? { background: "var(--success-soft)", borderColor: "#bcc7b5" } : undefined}
            >
              <strong>{hasOpeningDiscrepancy ? "!" : "✓"}</strong>
              <span>
                {hasOpeningDiscrepancy ? (
                  <>
                    Chênh lệch so với kết ca trước ({formatVnd(prevClosingCash)}):{" "}
                    <strong>{formatSignedVnd(openingVariance)}</strong> (
                    {openingVariance > 0 ? "Thừa tiền so với kết ca cũ" : "Thiếu tiền so với kết ca cũ"}). Vui lòng ghi rõ nguyên nhân ở ô giải trình phía trên để tiếp tục mở ca.
                  </>
                ) : (
                  <>Khớp hoàn toàn với kết ca trước ({formatVnd(prevClosingCash)}).</>
                )}
              </span>
            </div>
          ) : null}

          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={openingBusy}>
              {openingBusy ? <Spinner size="sm" className="me-2" /> : <Icon name="check" size={14} />}
              {userRole === "CASHIER" && currentUserId && !checkedInIds.has(currentUserId)
                ? "Xác nhận kiểm két, Mở ca & Check-in"
                : "Xác nhận kiểm két & Mở ca"}
            </Button>
          </div>
        </Form>
      </div>
    </>
  );
}
