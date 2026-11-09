import { useEffect, useMemo, useState } from "react";
import { Button, Col, Form, Row, Spinner } from "react-bootstrap";
import DataTable from "../DataTable.jsx";
import FormField from "../FormField.jsx";
import Icon from "../Icon.jsx";
import KpiStrip from "../KpiStrip.jsx";
import StatusTag from "../StatusTag.jsx";
import { useToast } from "../ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { POSITION_LABELS } from "../../config/userConstants.js";
import { formatDate, formatDateTime, formatVnd } from "../../lib/format.js";
import {
  CASH_TX_META,
  SHIFT_STATUS_META,
  SHIFT_TYPE_META,
  actorName,
  formatHm,
  formatSignedVnd,
  todayIso,
} from "./shiftUtils.js";

const OPENING_PRESETS = [500000, 1000000, 1500000, 2000000];

function rankScheduledCandidate(s, currentUserId, today) {
  const nowMs = Date.now();
  const isToday = s.shiftDate === today ? 0 : 10;
  const isMine = currentUserId && (s.assignedEmployeeIds || []).includes(currentUserId) ? 0 : 4;
  const startMs = s.plannedStart ? new Date(s.plannedStart).getTime() : nowMs;
  const endMs = s.plannedEnd ? new Date(s.plannedEnd).getTime() : startMs;
  const nearWindow =
    !Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs >= startMs - 3600000 && nowMs <= endMs
      ? 0
      : 2;
  return {
    tier: isToday + isMine + nearWindow,
    distance: Number.isNaN(startMs) ? Number.MAX_SAFE_INTEGER : Math.abs(startMs - nowMs),
  };
}

// Tab Kiểm két & Vận hành ca (UC24–UC27): Mở ca đối soát kết ca cũ, Nạp/Rút két (Quản lý/COO), Theo dõi nhân sự & Đóng ca kiểm đếm.
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
  onClearPreselectedScheduled,
  onReloadAll,
  onOpenCashModal,
  onOpenCloseModal,
  onOpenScheduleModal,
}) {
  const toast = useToast();
  const { navigate } = useRouter();
  const canAdjustCash = userRole === "COO" || userRole === "BRANCH_MANAGER";

  const [openSource, setOpenSource] = useState("scheduled"); // "scheduled" | "adhoc"
  const [selectedScheduledId, setSelectedScheduledId] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [openNote, setOpenNote] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openFieldErrors, setOpenFieldErrors] = useState({});
  const [openApiError, setOpenApiError] = useState("");

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
      const ra = rankScheduledCandidate(a, currentUserId, today);
      const rb = rankScheduledCandidate(b, currentUserId, today);
      if (ra.tier !== rb.tier) return ra.tier - rb.tier;
      return ra.distance - rb.distance;
    });
  }, [scheduledCandidates, currentUserId, today]);

  useEffect(() => {
    if (preselectedScheduledId) {
      setOpenSource("scheduled");
      setSelectedScheduledId(String(preselectedScheduledId));
      return;
    }
    if (orderedScheduledCandidates.length > 0) {
      setOpenSource((cur) => (cur === "adhoc" && !selectedScheduledId ? "scheduled" : cur));
      setSelectedScheduledId((cur) => {
        if (cur && orderedScheduledCandidates.some((s) => String(s.shiftId) === String(cur))) {
          return cur;
        }
        return String(orderedScheduledCandidates[0].shiftId);
      });
    } else {
      setOpenSource("adhoc");
      setSelectedScheduledId("");
    }
  }, [preselectedScheduledId, orderedScheduledCandidates, selectedScheduledId]);

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
    if (openSource === "scheduled" && scheduledCandidates.length > 0 && !selectedScheduledId) {
      setOpenApiError("Vui lòng chọn ca đã lên lịch hoặc chuyển sang Mở ca phát sinh.");
      return;
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
      toast.success(
        `Đã mở ${SHIFT_TYPE_META[created.shiftType]?.label || created.shiftType} (#${created.id}) với két đầu ca ${formatVnd(amount)}.`,
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

    return (
      <>
        <div className="scms-panel panel-pad mb-3">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                <span className="screen-code">CA ĐANG MỞ · #{activeShift.id}</span>
                <StatusTag status={activeShift.status} label={statusMeta.label} variant={statusMeta.variant} />
              </div>
              <h2 className="mb-1" style={{ fontSize: 19 }}>
                {typeMeta.label} · Ngày {formatDate(activeShift.shiftDate)}
              </h2>
              <div className="small text-muted-scms">
                Khung giờ dự kiến: <strong>{formatHm(activeShift.plannedStart)} – {formatHm(activeShift.plannedEnd)}</strong>
                {" · "}Mở lúc <strong>{formatDateTime(activeShift.openedAt)}</strong> bởi{" "}
                <strong>{activeShift.openedByName || actorName(activeShift.openedBy, employeeMap)}</strong>
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
              <Button variant="primary" onClick={() => onOpenCloseModal?.()}>
                <Icon name="check" size={14} /> Đóng ca &amp; Đối soát
              </Button>
            </div>
          </div>
        </div>

        {!canAdjustCash ? (
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              Quyền <strong>Thu ngân</strong>: Bạn có thể kiểm kê két, bán hàng POS và nhập số tiền thực đếm khi đóng ca. Thao tác{" "}
              <strong>nạp / rút tiền mặt thủ công khỏi két</strong> chỉ dành cho <strong>Quản lý chi nhánh</strong> hoặc <strong>COO</strong>{" "}
              (tiền thừa thối khách khi order thuộc luồng thanh toán riêng trên đơn).
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
                sub: "Cần khớp khi đóng ca",
              },
            ]}
          />
        </div>

        <Row className="g-3">
          <Col lg={4}>
            <div className="scms-panel panel-pad h-100">
              <div className="panel-head">
                <div>
                  <h2>Nhân sự trực ca ({assignedIds.length})</h2>
                  <p>Phân công cho ca hiện tại &amp; trạng thái chấm công.</p>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => onOpenScheduleModal?.("edit", activeSchedule)}
                  >
                    <Icon name="edit" size={13} /> Gán / sửa
                  </Button>
                ) : null}
              </div>

              {assignedIds.length === 0 ? (
                <div className="empty-state py-4">
                  <span className="empty-state__icon">
                    <Icon name="users" size={18} />
                  </span>
                  <span>Chưa có nhân viên nào được gán vào ca này.</span>
                  {canManage ? (
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
                    return (
                      <div
                        key={empId}
                        className="d-flex justify-content-between align-items-center p-2"
                        style={{
                          background: "var(--paper)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-xs)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {emp?.fullName || `NV #${empId}`}
                          </div>
                          <div className="text-muted-scms" style={{ fontSize: 11.5 }}>
                            {POSITION_LABELS[emp?.roleCode] || emp?.roleCode || "Nhân viên"}
                            {emp?.phone ? ` · ${emp.phone}` : ""}
                          </div>
                        </div>
                        <StatusTag
                          status={checkedIn ? "CHECKED_IN" : "INACTIVE"}
                          variant={checkedIn ? "success" : "neutral"}
                          label={checkedIn ? "Đang trong ca" : "Chưa check-in"}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 pt-2 d-flex justify-content-between align-items-center" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="small text-muted-scms">Quầy chấm công PIN/RFID</span>
                <Button size="sm" variant="outline-secondary" onClick={() => navigate("/kiosk")}>
                  Mở Kiosk →
                </Button>
              </div>
            </div>
          </Col>

          <Col lg={8}>
            <div className="scms-panel panel-pad mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h2 className="mb-0" style={{ fontSize: 15 }}>Biến động tiền mặt trong ca ({txRows.length})</h2>
                <p className="mb-0 text-muted-scms small">Lịch sử mở ca, nạp tiền lẻ, rút tiền và hoàn tiền tại quầy.</p>
              </div>
              <Button size="sm" variant="outline-secondary" onClick={() => navigate("/pos")}>
                Mở quầy POS →
              </Button>
            </div>
            <DataTable
              columns={txColumns}
              rows={txRows}
              rowKey={(tx) => tx.id}
              emptyMessage="Chưa có biến động két tiền nào."
            />
          </Col>
        </Row>
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

        {userRole === "CASHIER" && currentUserId && !checkedInIds.has(currentUserId) ? (
          <div className="notice mb-3 justify-content-between align-items-center flex-wrap">
            <span>
              <strong>Nhắc đầu ca:</strong> Bạn chưa Check-in chấm công hôm nay. Nếu cần tính công ca làm việc, hãy bấm Check-in tại quầy POS hoặc Kiosk.
            </span>
            <Button size="sm" variant="outline-secondary" onClick={() => navigate("/kiosk")}>
              Mở Kiosk chấm công →
            </Button>
          </div>
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
                  const selected = openSource === "scheduled" && String(selectedScheduledId) === String(s.shiftId);
                  const meta = SHIFT_TYPE_META[s.shiftType] || { label: s.shiftType };
                  const isMine = currentUserId && (s.assignedEmployeeIds || []).includes(currentUserId);
                  const isToday = s.shiftDate === today;
                  return (
                    <div
                      key={s.shiftId}
                      onClick={() => {
                        setOpenSource("scheduled");
                        setSelectedScheduledId(String(s.shiftId));
                        setOpenApiError("");
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenSource("scheduled");
                          setSelectedScheduledId(String(s.shiftId));
                        }
                      }}
                      className="p-3"
                      style={{
                        cursor: "pointer",
                        background: selected ? "var(--accent-soft)" : "var(--surface)",
                        border: selected ? "1px solid var(--accent)" : "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <Form.Check
                            type="radio"
                            name="openShiftMode"
                            checked={selected}
                            onChange={() => {
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
                          <StatusTag status="SCHEDULED" label="Đã lên lịch" variant="neutral" />
                        </div>
                      </div>
                      <div className="small text-muted-scms mt-1 ms-4">
                        {s.assignedEmployeeIds?.length ? (
                          <>
                            Nhân sự gán ca:{" "}
                            <strong>
                              {s.assignedEmployeeIds
                                .map((id) => actorName(id, employeeMap))
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
            ) : (
              <div className="small text-muted-scms mb-2">
                Không có ca nào ở trạng thái Đã lên lịch quanh ngày hôm nay. Bạn có thể mở ca phát sinh ngay bên dưới.
              </div>
            )}

            <div
              onClick={() => {
                setOpenSource("adhoc");
                setOpenApiError("");
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
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
                  onChange={() => setOpenSource("adhoc")}
                />
                <strong>Mở ca phát sinh (tạo ca mới theo giờ hiện tại)</strong>
              </div>
              <div className="small text-muted-scms mt-1 ms-4">
                Hệ thống tự suy luận Ca sáng / Ca chiều / Ca tối theo giờ Việt Nam và mở ca trong 8 giờ dự kiến.
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
              <Form.Control
                type="number"
                min="0"
                step="1"
                placeholder="Nhập số tiền thực đếm trong két…"
                value={openingCash}
                onChange={(e) => {
                  setOpeningCash(e.target.value);
                  setOpenFieldErrors((f) => ({ ...f, openingCash: null, note: null }));
                  setOpenApiError("");
                }}
                disabled={openingBusy}
              />
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
              Xác nhận kiểm két &amp; Mở ca
            </Button>
          </div>
        </Form>
      </div>
    </>
  );
}
