import { useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import ConfirmDialog from "../ConfirmDialog.jsx";
import DataTable from "../DataTable.jsx";
import Icon from "../Icon.jsx";
import StatusTag from "../StatusTag.jsx";
import { useToast } from "../ToastContext.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { POSITION_LABELS } from "../../config/userConstants.js";
import { formatDate } from "../../lib/format.js";
import {
  SHIFT_STATUS_META,
  SHIFT_TYPES,
  SHIFT_TYPE_META,
  addDaysIso,
  analyzeScheduleConflicts,
  enumerateDates,
  formatHm,
  resolveShiftEmployeeRole,
  shortDdMm,
  todayIso,
  weekRange,
  weekdayShortLabel,
} from "./shiftUtils.js";

// Tab Lịch phân ca & Gán nhân viên (UC08, BR-15).
export default function ShiftScheduleTab({
  schedules = [],
  loading = false,
  startDate,
  endDate,
  onChangeDateRange,
  employees = [],
  employeeMap = {},
  checkedInIds = new Set(),
  currentUserId = null,
  hasOpenShift = false,
  canManage = false,
  readOnly = false,
  onRefresh,
  onOpenCreate,
  onOpenEdit,
  onQuickOpenScheduledShift,
  onViewDetail,
}) {
  const effectiveCanManage = !readOnly && canManage;
  const canQuickOpen = !readOnly && !hasOpenShift;
  const toast = useToast();
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const today = todayIso();
  const days = useMemo(() => enumerateDates(startDate, endDate, 14), [startDate, endDate]);
  const tooWideForGrid = useMemo(() => {
    const allDays = enumerateDates(startDate, endDate, 15);
    return allDays.length > 14;
  }, [startDate, endDate]);

  const filterEmpId = employeeFilter ? Number(employeeFilter) : null;

  const filteredSchedules = useMemo(() => {
    if (!filterEmpId) return schedules;
    return schedules.filter((s) => (s.assignedEmployeeIds || []).includes(filterEmpId));
  }, [schedules, filterEmpId]);

  const slotMap = useMemo(() => {
    const map = {};
    for (const s of schedules) {
      const key = `${s.shiftDate}|${s.shiftType}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [schedules]);

  const { mismatchIds, overlapIds, slotDuplicateIds } = useMemo(
    () => analyzeScheduleConflicts(schedules),
    [schedules],
  );
  const issueShiftCount = useMemo(
    () => new Set([...mismatchIds, ...overlapIds, ...slotDuplicateIds]).size,
    [mismatchIds, overlapIds, slotDuplicateIds],
  );

  function shiftWeek(deltaWeeks) {
    const base = addDaysIso(startDate || today, deltaWeeks * 7);
    const range = weekRange(base);
    onChangeDateRange?.(range.startDate, range.endDate);
  }

  function jumpThisWeek() {
    const range = weekRange(today);
    onChangeDateRange?.(range.startDate, range.endDate);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await shiftsApi.deleteSchedule(deleteTarget.shiftId);
      toast.success(`Đã xóa lịch ca #${deleteTarget.shiftId}.`);
      setDeleteTarget(null);
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "Không xóa được lịch ca.");
    } finally {
      setDeleting(false);
    }
  }

  const activeEmployees = useMemo(
    () => employees.filter((e) => !e.status || e.status === "ACTIVE"),
    [employees],
  );

  function renderStaffChip(empId, shiftDate, shift) {
    const emp = employeeMap[empId];
    const name = emp?.fullName || `NV #${empId}`;
    const { roleLabel, baseLabel, isOverride } = resolveShiftEmployeeRole(
      empId,
      shift,
      employeeMap,
      POSITION_LABELS,
    );
    const chipRole = isOverride ? `${roleLabel} (ca này)` : roleLabel;
    const checkedIn = shiftDate === today && (checkedInIds.has(empId) || emp?.isCheckedIn);
    const highlighted = filterEmpId === empId;
    return (
      <span
        key={empId}
        className={`staff-pill${highlighted ? " is-highlight" : ""}${isOverride ? " is-override" : ""}`}
        title={
          isOverride
            ? `${name} · Kiêm ${roleLabel} riêng trong ca này (chức danh gốc: ${baseLabel}, tự giữ nguyên sau hết ca)`
            : roleLabel
              ? `${name} (${roleLabel})`
              : name
        }
      >
        {checkedIn ? <span className="staff-pill__dot" title="Đã check-in hôm nay" /> : null}
        <span>{name}</span>
        {chipRole ? (
          <span className={`staff-pill__role${isOverride ? " is-override" : ""}`}>{chipRole}</span>
        ) : null}
      </span>
    );
  }

  const listColumns = [
    {
      key: "shiftDate",
      header: "Ngày",
      render: (s) => (
        <div>
          <strong>
            {weekdayShortLabel(s.shiftDate)} · {formatDate(s.shiftDate)}
          </strong>
          {s.shiftDate === today ? (
            <div className="small" style={{ color: "var(--accent-dark)", fontWeight: 600 }}>
              Hôm nay
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "shiftType",
      header: "Ca làm việc",
      render: (s) => (
        <div>
          <strong>{SHIFT_TYPE_META[s.shiftType]?.label || s.shiftType}</strong>{" "}
          <span className="mono text-muted-scms">#{s.shiftId}</span>
        </div>
      ),
    },
    {
      key: "time",
      header: "Khung giờ",
      render: (s) => {
        const typeMeta = SHIFT_TYPE_META[s.shiftType];
        const hasOverlap = overlapIds.has(s.shiftId);
        const hasDup = slotDuplicateIds.has(s.shiftId);
        const hasMismatch = mismatchIds.has(s.shiftId);
        return (
          <div>
            <span className="mono">
              {formatHm(s.plannedStart)} – {formatHm(s.plannedEnd)}
            </span>
            {hasOverlap ? (
              <div className="mt-1">
                <StatusTag status="CONFLICT" label="Chồng khung giờ" variant="warn" />
              </div>
            ) : hasDup ? (
              <div className="mt-1">
                <StatusTag status="CONFLICT" label="Trùng ca cùng ngày" variant="warn" />
              </div>
            ) : hasMismatch ? (
              <div className="mt-1">
                <StatusTag
                  status="MISMATCH"
                  label={`Lệch giờ chuẩn (${typeMeta?.start}–${typeMeta?.end})`}
                  variant="warn"
                />
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (s) => {
        const meta = SHIFT_STATUS_META[s.status] || { label: s.status, variant: "neutral" };
        return <StatusTag status={s.status} label={meta.label} variant={meta.variant} />;
      },
    },
    {
      key: "employees",
      header: "Nhân viên được phân công",
      render: (s) =>
        s.assignedEmployeeIds?.length ? (
          <div className="d-flex gap-1 flex-wrap">
            {s.assignedEmployeeIds.map((id) => renderStaffChip(id, s.shiftDate, s))}
          </div>
        ) : (
          <span className="text-muted-scms small">Chưa gán nhân viên</span>
        ),
    },
    {
      key: "actions",
      header: readOnly ? "Chi tiết" : "Thao tác",
      width: readOnly ? 120 : 230,
      render: (s) => (
        <div className="d-flex gap-1 flex-wrap">
          {readOnly ? (
            s.status !== "SCHEDULED" ? (
              <Button size="sm" variant="outline-secondary" onClick={() => onViewDetail?.(s.shiftId)}>
                Chi tiết ca
              </Button>
            ) : (
              <span className="small text-muted-scms">Chờ mở ca</span>
            )
          ) : (
            <>
              {effectiveCanManage && s.status !== "CLOSED" ? (
                <Button size="sm" variant="outline-secondary" onClick={() => onOpenEdit?.(s)}>
                  Gán NV/Sửa
                </Button>
              ) : null}
              {canQuickOpen && s.status === "SCHEDULED" ? (
                <Button size="sm" variant="primary" onClick={() => onQuickOpenScheduledShift?.(s)}>
                  Kiểm két &amp; Mở ca
                </Button>
              ) : null}
              {effectiveCanManage && s.status === "SCHEDULED" ? (
                <Button size="sm" variant="outline-danger" onClick={() => setDeleteTarget(s)}>
                  Xóa
                </Button>
              ) : null}
            </>
          )}
        </div>
      ),
    },
  ];

  const invalidRange = startDate && endDate && startDate > endDate;

  return (
    <>
      <div className="scms-panel p-3 mb-3 d-flex flex-wrap gap-2 align-items-end justify-content-between">
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <div className="form-label mb-1">Điều hướng tuần</div>
            <div className="d-flex gap-1">
              <Button size="sm" variant="outline-secondary" onClick={() => shiftWeek(-1)}>
                ‹ Trước
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={jumpThisWeek}>
                Tuần này
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={() => shiftWeek(1)}>
                Sau ›
              </Button>
            </div>
          </div>

          <div style={{ minWidth: 140 }}>
            <Form.Label className="mb-1">Từ ngày</Form.Label>
            <Form.Control
              type="date"
              size="sm"
              value={startDate}
              isInvalid={invalidRange}
              onChange={(e) => onChangeDateRange?.(e.target.value, endDate)}
            />
          </div>

          <div style={{ minWidth: 140 }}>
            <Form.Label className="mb-1">Đến ngày</Form.Label>
            <Form.Control
              type="date"
              size="sm"
              value={endDate}
              isInvalid={invalidRange}
              onChange={(e) => onChangeDateRange?.(startDate, e.target.value)}
            />
          </div>

          <div style={{ minWidth: 200 }}>
            <Form.Label className="mb-1">Lọc theo nhân viên</Form.Label>
            <Form.Select
              size="sm"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
            >
              <option value="">Tất cả nhân viên</option>
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={String(emp.id)}>
                  {emp.fullName} ({POSITION_LABELS[emp.roleCode] || emp.roleCode})
                </option>
              ))}
            </Form.Select>
          </div>
        </div>

        <div className="d-flex gap-2 align-items-center flex-wrap">
          <div className="btn-group" role="group" aria-label="Chế độ xem lịch">
            <Button
              size="sm"
              variant={viewMode === "grid" ? "primary" : "outline-secondary"}
              onClick={() => setViewMode("grid")}
            >
              Lịch tuần
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "primary" : "outline-secondary"}
              onClick={() => setViewMode("list")}
            >
              Danh sách ({filteredSchedules.length})
            </Button>
          </div>

          {effectiveCanManage ? (
            <Button size="sm" variant="primary" onClick={() => onOpenCreate?.()}>
              <Icon name="plus" size={14} /> Tạo ca &amp; phân công
            </Button>
          ) : null}
        </div>
      </div>

      {invalidRange ? (
        <div className="field-error mb-3">&quot;Từ ngày&quot; không được lớn hơn &quot;Đến ngày&quot;.</div>
      ) : null}

      {!invalidRange && issueShiftCount > 0 ? (
        <div className="notice notice--warn mb-3">
          <strong>!</strong>
          <span>
            Có <strong>{issueShiftCount}</strong> ca đang lệch khung giờ chuẩn mới ({SHIFT_TYPE_META.MORNING.window} ·{" "}
            {SHIFT_TYPE_META.EVENING.window} · {SHIFT_TYPE_META.NIGHT.window}) hoặc chồng giờ hoạt động.
            {effectiveCanManage
              ? " Bấm Gán NV/Sửa ở thẻ ca được đánh dấu để đưa về giờ chuẩn, tránh lỗi trùng lịch nhân sự (BR-15)."
              : " Quản lý chi nhánh cần chỉnh lại khung giờ chuẩn để tránh xung đột phân ca (BR-15)."}
          </span>
        </div>
      ) : null}

      {viewMode === "grid" && !invalidRange ? (
        tooWideForGrid ? (
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              Khoảng ngày đang chọn vượt quá 14 ngày — vui lòng thu gọn về phạm vi 1–2 tuần để xem dạng Lịch tuần hoặc chuyển sang chế độ <strong>Danh sách</strong>.
            </span>
          </div>
        ) : (
          <div className="scms-panel shift-matrix-wrap">
            <div
              className="shift-matrix"
              style={{ "--shift-days": Math.max(days.length, 1) }}
            >
              <div className="shift-matrix__corner">Ca làm việc</div>
              {days.map((day) => {
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={`shift-matrix__dayhead${isToday ? " is-today" : ""}`}
                  >
                    <div className="d-flex align-items-center justify-content-between gap-1">
                      <strong>
                        {weekdayShortLabel(day)} · {shortDdMm(day)}
                      </strong>
                      {isToday ? <span className="shift-today-badge">Hôm nay</span> : null}
                    </div>
                  </div>
                );
              })}

              {SHIFT_TYPES.map((type) => {
                const typeMeta = SHIFT_TYPE_META[type];
                return (
                  <div key={type} className="shift-matrix__row">
                    <div className="shift-matrix__rowhead">
                      <strong>{typeMeta.label}</strong>
                      <div className="text-muted-scms" style={{ fontSize: 11 }}>
                        {typeMeta.start} – {typeMeta.end}
                      </div>
                    </div>
                    {days.map((day) => {
                      const cellShifts = slotMap[`${day}|${type}`] || [];
                      return (
                        <div
                          key={`${day}-${type}`}
                          className={`shift-matrix__cell${day === today ? " is-today" : ""}`}
                        >
                          {cellShifts.length === 0 ? (
                            effectiveCanManage ? (
                              <button
                                type="button"
                                className="shift-slot-empty"
                                onClick={() => onOpenCreate?.({ shiftDate: day, shiftType: type })}
                              >
                                + Xếp ca
                              </button>
                            ) : (
                              <span className="small text-muted-scms">—</span>
                            )
                          ) : (
                            cellShifts.map((s) => {
                              const stMeta = SHIFT_STATUS_META[s.status] || {
                                label: s.status,
                                variant: "neutral",
                              };
                              const matchesFilter =
                                !filterEmpId || (s.assignedEmployeeIds || []).includes(filterEmpId);
                              const hasOverlap = overlapIds.has(s.shiftId);
                              const hasDup = slotDuplicateIds.has(s.shiftId);
                              const hasMismatch = mismatchIds.has(s.shiftId);
                              const hasIssue = hasOverlap || hasDup || hasMismatch;
                              const isHistoricalClosedSibling =
                                s.status === "CLOSED" && cellShifts.length > 1;
                              return (
                                <div
                                  key={s.shiftId}
                                  className={`shift-slot-card is-${String(s.status || "scheduled").toLowerCase()}${
                                    !matchesFilter ? " is-dimmed" : ""
                                  }${hasIssue ? " is-warn" : ""}`}
                                >
                                  <div className="d-flex justify-content-between align-items-center gap-1 mb-1 flex-wrap">
                                    <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                                      {formatHm(s.plannedStart)}–{formatHm(s.plannedEnd)}
                                    </span>
                                    <div className="d-flex align-items-center gap-1">
                                      {currentUserId && (s.assignedEmployeeIds || []).includes(currentUserId) ? (
                                        <StatusTag status="MINE" label="Ca của bạn" variant="success" />
                                      ) : null}
                                      <StatusTag
                                        status={s.status}
                                        label={stMeta.label}
                                        variant={stMeta.variant}
                                      />
                                    </div>
                                  </div>

                                  {hasOverlap ? (
                                    <div
                                      className="shift-slot-warn"
                                      title="Khung giờ ca này đang chồng lên một ca chưa đóng khác."
                                    >
                                      Chồng khung giờ ca khác
                                    </div>
                                  ) : hasDup ? (
                                    <div
                                      className="shift-slot-warn"
                                      title="Cùng ngày đang có hơn 1 ca hoạt động trong ô này."
                                    >
                                      Trùng ca cùng khung
                                    </div>
                                  ) : hasMismatch ? (
                                    <div
                                      className="shift-slot-warn"
                                      title={`Khung chuẩn của ${typeMeta.label} là ${typeMeta.start}–${typeMeta.end}. Bấm Gán NV/Sửa để cập nhật.`}
                                    >
                                      Lệch chuẩn ({typeMeta.start}–{typeMeta.end})
                                    </div>
                                  ) : isHistoricalClosedSibling ? (
                                    <div
                                      className="shift-slot-note"
                                      title="Ca phát sinh đã đóng trước đó trong cùng khung ca."
                                    >
                                      Ca đã đóng trước đó
                                    </div>
                                  ) : null}

                                  <div className="d-flex flex-column gap-1 my-1">
                                    {s.assignedEmployeeIds?.length ? (
                                      <div className="d-flex flex-wrap gap-1">
                                        {s.assignedEmployeeIds.map((id) => renderStaffChip(id, s.shiftDate, s))}
                                      </div>
                                    ) : (
                                      <span className="text-muted-scms" style={{ fontSize: 11, fontStyle: "italic" }}>
                                        Chưa gán nhân viên
                                      </span>
                                    )}
                                  </div>

                                  {(effectiveCanManage && s.status !== "CLOSED") ||
                                  (canQuickOpen && s.status === "SCHEDULED") ||
                                  (readOnly && s.status !== "SCHEDULED") ? (
                                    <div className="d-flex gap-1 flex-wrap mt-2 pt-1" style={{ borderTop: "1px dashed var(--line)" }}>
                                      {readOnly && s.status !== "SCHEDULED" ? (
                                        <Button
                                          size="sm"
                                          variant="outline-secondary"
                                          style={{ fontSize: 11, minHeight: 24, padding: "0 7px", whiteSpace: "nowrap" }}
                                          onClick={() => onViewDetail?.(s.shiftId)}
                                        >
                                          Chi tiết ca
                                        </Button>
                                      ) : null}
                                      {effectiveCanManage && s.status !== "CLOSED" ? (
                                        <Button
                                          size="sm"
                                          variant="outline-secondary"
                                          style={{ fontSize: 11, minHeight: 24, padding: "0 7px", whiteSpace: "nowrap" }}
                                          onClick={() => onOpenEdit?.(s)}
                                        >
                                          Gán NV/Sửa
                                        </Button>
                                      ) : null}
                                      {canQuickOpen && s.status === "SCHEDULED" ? (
                                        <Button
                                          size="sm"
                                          variant="primary"
                                          style={{ fontSize: 11, minHeight: 24, padding: "0 7px" }}
                                          onClick={() => onQuickOpenScheduledShift?.(s)}
                                          title="Chuyển sang Kiểm két & Mở ca phân công này"
                                        >
                                          Kiểm két &amp; Mở
                                        </Button>
                                      ) : null}
                                      {effectiveCanManage && s.status === "SCHEDULED" ? (
                                        <Button
                                          size="sm"
                                          variant="outline-secondary"
                                          style={{ fontSize: 11, minHeight: 24, padding: "0 7px" }}
                                          onClick={() => setDeleteTarget(s)}
                                          title="Xóa ca chưa mở"
                                        >
                                          Xóa
                                        </Button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : (
        <DataTable
          columns={listColumns}
          rows={filteredSchedules}
          rowKey={(s) => s.shiftId}
          loading={loading}
          emptyMessage="Chưa có ca làm việc nào trong khoảng thời gian đã chọn."
        />
      )}

      <div className="d-flex justify-content-between flex-wrap gap-2 mt-2 small text-muted-scms">
        <span>
          Quy định BR-15: Không thể phân công trùng khung giờ cho cùng một nhân viên.
        </span>
        <span>
          Chấm xanh trên thẻ tên biểu thị nhân viên đang trong ca chấm công Kiosk hôm nay.
        </span>
      </div>

      <ConfirmDialog
        show={Boolean(deleteTarget)}
        title="Xóa lịch ca làm việc"
        body={
          deleteTarget ? (
            <>
              Xóa{" "}
              <strong>
                {SHIFT_TYPE_META[deleteTarget.shiftType]?.label || deleteTarget.shiftType} #{deleteTarget.shiftId}
              </strong>{" "}
              ngày <strong>{formatDate(deleteTarget.shiftDate)}</strong>? Toàn bộ phân công nhân sự của ca này cũng sẽ bị xóa.
            </>
          ) : null
        }
        confirmLabel="Xóa lịch ca"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}
