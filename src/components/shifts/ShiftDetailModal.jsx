import { useEffect, useState } from "react";
import { Button, Modal, Spinner, Table } from "react-bootstrap";
import KpiStrip from "../KpiStrip.jsx";
import StatusTag from "../StatusTag.jsx";
import { attendanceApi } from "../../api/attendanceApi.js";
import { shiftsApi } from "../../api/shiftsApi.js";
import { POSITION_LABELS } from "../../config/userConstants.js";
import { formatDate, formatDateTime, formatVnd } from "../../lib/format.js";
import {
  CASH_TX_META,
  HANDOVER_STATUS_META,
  SHIFT_STATUS_META,
  SHIFT_TYPE_META,
  actorName,
  formatHm,
  formatSignedVnd,
  resolveShiftEmployeeRole,
} from "./shiftUtils.js";

// Modal xem chi tiết đối soát két tiền, nhân sự phân công & nhật ký giao dịch của một ca bất kỳ.
export default function ShiftDetailModal({
  show,
  shiftId,
  employeeMap = {},
  hideAssignedStaff = false,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [assignedIds, setAssignedIds] = useState([]);
  const [assignedRoles, setAssignedRoles] = useState({});
  const [fallbackStaffMap, setFallbackStaffMap] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show || !shiftId) {
      setSummary(null);
      setAssignedIds([]);
      setAssignedRoles({});
      setFallbackStaffMap({});
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    shiftsApi
      .detail(shiftId)
      .then(async (res) => {
        if (!alive) return;
        setSummary(res);
        if (!hideAssignedStaff && res?.shift?.branchId && res?.shift?.shiftDate) {
          const [schedRes, kioskRes] = await Promise.allSettled([
            shiftsApi.schedules({
              branchId: res.shift.branchId,
              startDate: res.shift.shiftDate,
              endDate: res.shift.shiftDate,
            }),
            attendanceApi.kioskEmployees(res.shift.branchId),
          ]);
          if (!alive) return;
          if (schedRes.status === "fulfilled") {
            const found = (schedRes.value || []).find((s) => s.shiftId === res.shift.id);
            setAssignedIds(found?.assignedEmployeeIds || []);
            setAssignedRoles(found?.employeeRoles || {});
          } else {
            setAssignedIds([]);
            setAssignedRoles({});
          }
          if (kioskRes.status === "fulfilled" && Array.isArray(kioskRes.value)) {
            const nextMap = {};
            for (const emp of kioskRes.value) {
              nextMap[emp.employeeId] = {
                id: emp.employeeId,
                fullName: emp.fullName,
                roleCode: emp.role,
              };
            }
            setFallbackStaffMap(nextMap);
          } else {
            setFallbackStaffMap({});
          }
        } else {
          setAssignedIds([]);
          setAssignedRoles({});
          setFallbackStaffMap({});
        }
      })
      .catch((err) => {
        if (alive) setError(err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [show, shiftId, hideAssignedStaff]);

  const resolvedEmployeeMap = { ...fallbackStaffMap, ...employeeMap };

  const shift = summary?.shift;
  const statusMeta = shift ? SHIFT_STATUS_META[shift.status] || { label: shift.status, variant: "neutral" } : null;
  const variance = shift?.variance !== null && shift?.variance !== undefined ? Number(shift.variance) : null;
  const hasVariance = variance !== null && Math.abs(variance) >= 0.01;
  const openingVariance =
    shift?.openingVariance !== null && shift?.openingVariance !== undefined ? Number(shift.openingVariance) : null;
  const hasOpeningVariance = openingVariance !== null && Math.abs(openingVariance) >= 0.01;

  return (
    <Modal show={show} onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Modal.Title as="h2">
            {shift
              ? `${SHIFT_TYPE_META[shift.shiftType]?.label || shift.shiftType} #${shift.id} · ${formatDate(shift.shiftDate)}${shift.branchName ? ` · ${shift.branchName}` : ""}`
              : `Chi tiết ca #${shiftId || ""}`}
          </Modal.Title>
          {statusMeta ? <StatusTag status={shift.status} label={statusMeta.label} variant={statusMeta.variant} /> : null}
          {shift?.earlyClosePending ? (
            <StatusTag status="EARLY_CLOSE_PENDING" label="Chờ duyệt đóng ca sớm" variant="warn" />
          ) : null}
          {shift?.handoverPending ? (
            <StatusTag status="PENDING_RECEIVE" label="Chờ bàn giao két" variant="warn" />
          ) : null}
        </div>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center py-5">
            <Spinner size="sm" className="me-2" /> Đang tải dữ liệu ca…
          </div>
        ) : error ? (
          <div className="notice notice--warn">
            <strong>!</strong>
            <span>{error.message || "Không tải được chi tiết ca làm việc."}</span>
          </div>
        ) : summary && shift ? (
          <>
            <div className="p-3 mb-3" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
              <div className="row g-2 small">
                <div className="col-md-6">
                  <div>
                    <span className="text-muted-scms">Khung giờ dự kiến: </span>
                    <strong>{formatHm(shift.plannedStart)} → {formatHm(shift.plannedEnd)}</strong>
                  </div>
                  <div className="mt-1">
                    <span className="text-muted-scms">Mở ca: </span>
                    <strong>
                      {shift.openedAt
                        ? `${formatDateTime(shift.openedAt)} · ${shift.openedByName || actorName(shift.openedBy, resolvedEmployeeMap)}`
                        : "Chưa mở"}
                    </strong>
                  </div>
                  {(shift.activeCashierId || shift.openedBy) ? (
                    <div className="mt-1">
                      <span className="text-muted-scms">
                        {shift.status === "OPEN" ? "Người giữ két hiện tại: " : "Thu ngân giữ két sau cùng: "}
                      </span>
                      <strong>
                        {shift.activeCashierName || actorName(shift.activeCashierId || shift.openedBy, resolvedEmployeeMap)}
                      </strong>
                    </div>
                  ) : null}
                  {shift.previousShiftId || shift.previousClosingCash !== null && shift.previousClosingCash !== undefined ? (
                    <div className="mt-1">
                      <span className="text-muted-scms">Kết ca trước{shift.previousShiftId ? ` (#${shift.previousShiftId})` : ""}: </span>
                      <strong>{formatVnd(shift.previousClosingCash)}</strong>
                      {openingVariance !== null ? (
                        <span className="ms-1">
                          ({hasOpeningVariance ? `Chênh đầu ca ${formatSignedVnd(openingVariance)}` : "Khớp khi mở ca"})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="col-md-6">
                  <div>
                    <span className="text-muted-scms">Đóng ca: </span>
                    <strong>
                      {shift.closedAt
                        ? `${formatDateTime(shift.closedAt)} · ${shift.closedByName || actorName(shift.closedBy, resolvedEmployeeMap)}`
                        : "—"}
                    </strong>
                  </div>
                  <div className="mt-1">
                    <span className="text-muted-scms">Chênh lệch đối soát kết ca: </span>
                    <strong>{variance === null ? "Chưa đối soát" : formatSignedVnd(variance)}</strong>
                  </div>
                </div>
              </div>
              {shift.openingNote ? (
                <div className={`notice mt-2 ${hasOpeningVariance ? "notice--warn" : ""}`}>
                  <strong>{hasOpeningVariance ? "Giải trình chênh lệch đầu ca:" : "Ghi chú mở ca:"}</strong>
                  <span>{shift.openingNote}</span>
                </div>
              ) : null}
              {shift.discrepancyReason ? (
                <div className={`notice mt-2 ${hasVariance ? "notice--warn" : ""}`}>
                  <strong>Ghi chú / giải trình kết ca:</strong>
                  <span>{shift.discrepancyReason}</span>
                </div>
              ) : null}
              {(shift.earlyClosePending || shift.earlyCloseRequestedBy || shift.earlyCloseReason) ? (
                <div className={`notice mt-2 ${shift.earlyClosePending ? "notice--warn" : ""}`}>
                  <strong>{shift.earlyClosePending ? "!" : "i"}</strong>
                  <span>
                    <strong>
                      {shift.earlyClosePending ? "Đang chờ duyệt đóng ca sớm:" : "Thông tin xin đóng ca sớm:"}
                    </strong>{" "}
                    {shift.earlyCloseRequestedBy ? (
                      <>
                        Thu ngân <strong>{shift.earlyCloseRequestedByName || actorName(shift.earlyCloseRequestedBy, resolvedEmployeeMap)}</strong>
                      </>
                    ) : null}
                    {shift.earlyCloseRequestedAt ? (
                      <> · gửi lúc <strong>{formatDateTime(shift.earlyCloseRequestedAt)}</strong></>
                    ) : null}
                    {shift.earlyCloseCountedCash !== null && shift.earlyCloseCountedCash !== undefined ? (
                      <> · thực đếm khai báo: <strong>{formatVnd(shift.earlyCloseCountedCash)}</strong></>
                    ) : null}
                    {shift.earlyCloseReason ? (
                      <> · Lý do: <em>{shift.earlyCloseReason}</em></>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mb-3">
              <KpiStrip
                items={[
                  { label: "Đầu ca", value: formatVnd(summary.openingCash) },
                  { label: "Thu tiền mặt", value: formatVnd(summary.cashRevenue) },
                  { label: "Chuyển khoản QR", value: formatVnd(summary.transferRevenue) },
                  { label: "Nạp / Rút", value: formatVnd(summary.totalCashIn), sub: `Rút: ${formatVnd(summary.totalCashOut)} · Hoàn: ${formatVnd(summary.totalRefundOut)}` },
                  {
                    label: shift.status === "CLOSED" ? "Thực đếm / Dự kiến" : "Dự kiến két",
                    value: shift.status === "CLOSED" ? formatVnd(shift.countedCash) : formatVnd(summary.currentCashBalance),
                    sub: shift.status === "CLOSED" ? `Dự kiến: ${formatVnd(shift.expectedCash)}` : undefined,
                  },
                ]}
              />
            </div>

            {!hideAssignedStaff ? (
              <div className="mb-3">
                <div className="text-muted-scms mb-2" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Nhân sự được phân công ({assignedIds.length})
                </div>
                {assignedIds.length === 0 ? (
                  <div className="small text-muted-scms">Chưa có nhân viên được phân công vào ca này.</div>
                ) : (
                  <div className="d-flex gap-2 flex-wrap">
                    {assignedIds.map((empId) => {
                      const emp = resolvedEmployeeMap[empId];
                      const { roleLabel, baseLabel, isOverride } = resolveShiftEmployeeRole(
                        empId,
                        { employeeRoles: assignedRoles },
                        resolvedEmployeeMap,
                        POSITION_LABELS,
                      );
                      return (
                        <span
                          key={empId}
                          className="px-2 py-1 small"
                          style={{
                            border: isOverride ? "1px solid var(--accent)" : "1px solid var(--line)",
                            borderRadius: "var(--radius-xs)",
                            background: isOverride ? "var(--accent-soft)" : "var(--surface)",
                          }}
                          title={
                            isOverride
                              ? `Kiêm ${roleLabel} riêng trong ca này (chức danh gốc: ${baseLabel})`
                              : undefined
                          }
                        >
                          <strong>{emp?.fullName || `NV #${empId}`}</strong>
                          {roleLabel ? (
                            <span className={isOverride ? "" : "text-muted-scms"}>
                              {" "}· {isOverride ? `${roleLabel} (ca này · gốc ${baseLabel})` : roleLabel}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {summary.handovers?.length > 0 ? (
              <div className="mb-3">
                <div className="text-muted-scms mb-2" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Lịch sử bàn giao két giữa ca ({summary.handovers.length})
                </div>
                <div className="scms-panel">
                  <div className="table-responsive">
                    <Table hover className="mb-0">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Giao → Nhận</th>
                          <th className="num">Kiểm giao / Nhận</th>
                          <th>Đối soát</th>
                          <th>Lý do / Ghi chú</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.handovers.map((h) => {
                          const hMeta = HANDOVER_STATUS_META[h.status] || { label: h.status, variant: "neutral" };
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
                            <tr key={h.id}>
                              <td className="small">
                                <div>Giao: {formatDateTime(h.outgoingAt)}</div>
                                {h.incomingAt ? (
                                  <div className="text-muted-scms">Nhận: {formatDateTime(h.incomingAt)}</div>
                                ) : h.cancelledAt ? (
                                  <div className="text-muted-scms">Hủy: {formatDateTime(h.cancelledAt)}</div>
                                ) : null}
                              </td>
                              <td className="small">
                                <div>
                                  <strong>{h.fromUserName || actorName(h.fromUserId, resolvedEmployeeMap)}</strong>
                                  {" → "}
                                  <strong>
                                    {h.toUserName || (h.toUserId ? actorName(h.toUserId, resolvedEmployeeMap) : "Chờ nhận")}
                                  </strong>
                                </div>
                                {h.cancelledByName ? (
                                  <div className="text-muted-scms">Hủy bởi: {h.cancelledByName}</div>
                                ) : null}
                              </td>
                              <td className="num small">
                                <div>
                                  Giao: <strong>{formatVnd(h.outgoingCountedCash)}</strong>
                                </div>
                                <div className="text-muted-scms">Sổ: {formatVnd(h.expectedCashAtOut)}</div>
                                {hasInCash ? (
                                  <div>
                                    Nhận: <strong>{formatVnd(h.incomingCountedCash)}</strong>
                                  </div>
                                ) : null}
                              </td>
                              <td className="small">
                                <div>
                                  Giao vs sổ:{" "}
                                  <strong>{hasOutVar ? formatSignedVnd(h.outgoingVariance) : "Khớp"}</strong>
                                </div>
                                {hasInCash ? (
                                  <div>
                                    Nhận vs giao:{" "}
                                    <strong>{hasInOutVar ? formatSignedVnd(h.incomingVarianceFromOut) : "Khớp 100%"}</strong>
                                  </div>
                                ) : null}
                              </td>
                              <td className="small">
                                <div>
                                  <strong>{h.reason}</strong>
                                </div>
                                {h.outgoingNote ? (
                                  <div className="text-muted-scms">Giao: {h.outgoingNote}</div>
                                ) : null}
                                {h.incomingNote ? (
                                  <div className="text-muted-scms">Nhận: {h.incomingNote}</div>
                                ) : null}
                                {h.cancelReason ? (
                                  <div className="text-muted-scms">Hủy: {h.cancelReason}</div>
                                ) : null}
                              </td>
                              <td>
                                <StatusTag status={h.status} variant={hMeta.variant} label={hMeta.label} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <div className="text-muted-scms mb-2" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Nhật ký két tiền ({summary.transactions?.length || 0})
              </div>
              <div className="scms-panel">
                <div className="table-responsive">
                  <Table hover className="mb-0">
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Loại</th>
                        <th className="num">Số tiền</th>
                        <th>Lý do</th>
                        <th>Người thực hiện / Duyệt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!summary.transactions || summary.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-3 text-muted-scms">
                            Chưa có giao dịch két tiền nào trong ca.
                          </td>
                        </tr>
                      ) : (
                        summary.transactions.map((tx) => {
                          const txMeta = CASH_TX_META[tx.type] || { label: tx.type, variant: "neutral", sign: "" };
                          return (
                            <tr key={tx.id}>
                              <td className="small">{formatDateTime(tx.createdAt)}</td>
                              <td>
                                <StatusTag status={tx.type} variant={txMeta.variant} label={txMeta.label} />
                              </td>
                              <td className="num">
                                <strong>{txMeta.sign}{formatVnd(tx.amount)}</strong>
                              </td>
                              <td>{tx.reason || "—"}</td>
                              <td className="small">
                                <div>{tx.createdByName || actorName(tx.createdBy, resolvedEmployeeMap)}</div>
                                {tx.approvedBy ? (
                                  <div className="text-muted-scms">
                                    Duyệt PIN: {tx.approvedByName || actorName(tx.approvedBy, resolvedEmployeeMap)}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </Table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          Đóng
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
