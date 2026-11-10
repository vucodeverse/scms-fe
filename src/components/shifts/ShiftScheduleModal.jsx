import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import FormField from "../FormField.jsx";
import StatusTag from "../StatusTag.jsx";
import { useToast } from "../ToastContext.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { POSITION_LABELS } from "../../config/userConstants.js";
import { formatDate } from "../../lib/format.js";
import {
  SHIFT_STATUS_META,
  SHIFT_TYPES,
  SHIFT_TYPE_META,
  buildShiftInstants,
  formatHm,
  hasShiftTimeOverlap,
  toTimeInput,
  todayIso,
  validateShiftWindow,
} from "./shiftUtils.js";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function Time24Select({ id, value, disabled = false, isInvalid = false, ariaPrefix, onChange }) {
  const [rawHour = "00", rawMin = "00"] = String(value || "00:00").split(":");
  const hour = HOURS_24.includes(rawHour) ? rawHour : "00";
  const minute = MINUTES_60.includes(rawMin) ? rawMin : "00";
  return (
    <div className="d-flex align-items-center gap-2">
      <Form.Select
        id={id}
        value={hour}
        disabled={disabled}
        isInvalid={isInvalid}
        aria-label={`Giờ ${ariaPrefix} (định dạng 24 giờ)`}
        style={{ flex: "1 1 0", minWidth: 92, fontVariantNumeric: "tabular-nums" }}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
      >
        {HOURS_24.map((h) => (
          <option key={h} value={h}>
            {h} giờ
          </option>
        ))}
      </Form.Select>
      <span className="fw-bold text-muted-scms" aria-hidden="true">:</span>
      <Form.Select
        value={minute}
        disabled={disabled}
        isInvalid={isInvalid}
        aria-label={`Phút ${ariaPrefix}`}
        style={{ flex: "1 1 0", minWidth: 92, fontVariantNumeric: "tabular-nums" }}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
      >
        {MINUTES_60.map((m) => (
          <option key={m} value={m}>
            {m} phút
          </option>
        ))}
      </Form.Select>
    </div>
  );
}

const ROLE_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "CASHIER", label: "Thu ngân" },
  { value: "BARISTA", label: "Pha chế" },
  { value: "WAITER", label: "Phục vụ" },
  { value: "BRANCH_MANAGER", label: "Quản lý" },
];

// Modal tạo lịch ca mới hoặc chỉnh sửa lịch & gán nhân viên trực ca (UC08, BR-15).
export default function ShiftScheduleModal({
  show,
  mode = "create",
  initialShift = null,
  branchId,
  employees = [],
  schedules = [],
  checkedInIds = new Set(),
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const today = todayIso();
  const isEdit = mode === "edit" && Boolean(initialShift?.shiftId);
  const isOpenShift = isEdit && initialShift?.status === "OPEN";
  const isLockedPastSchedule = Boolean(
    isEdit &&
      initialShift?.status === "SCHEDULED" &&
      initialShift?.shiftDate &&
      initialShift.shiftDate < today,
  );
  const isToday = initialShift?.shiftDate === today;

  const [shiftDate, setShiftDate] = useState(todayIso());
  const [shiftType, setShiftType] = useState("MORNING");
  const [startTime, setStartTime] = useState(SHIFT_TYPE_META.MORNING.start);
  const [endTime, setEndTime] = useState(SHIFT_TYPE_META.MORNING.end);
  const [customTimes, setCustomTimes] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);
  const topNoticeRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    const type = initialShift?.shiftType || "MORNING";
    const meta = SHIFT_TYPE_META[type] || SHIFT_TYPE_META.MORNING;
    setShiftDate(initialShift?.shiftDate || todayIso());
    setShiftType(type);
    if (isEdit && initialShift?.plannedStart && initialShift?.plannedEnd) {
      setStartTime(toTimeInput(initialShift.plannedStart) || meta.start);
      setEndTime(toTimeInput(initialShift.plannedEnd) || meta.end);
      setCustomTimes(true);
    } else {
      setStartTime(meta.start);
      setEndTime(meta.end);
      setCustomTimes(false);
    }
    setSelectedIds(Array.isArray(initialShift?.assignedEmployeeIds) ? [...initialShift.assignedEmployeeIds] : []);
    setEmployeeRoles(initialShift?.employeeRoles ? { ...initialShift.employeeRoles } : {});
    setSearch("");
    setRoleFilter("");
    setFieldErrors({});
    setApiError("");
  }, [show, isEdit, initialShift]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => !e.status || e.status === "ACTIVE"),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return activeEmployees.filter((e) => {
      if (roleFilter && e.roleCode !== roleFilter) return false;
      if (kw && !String(e.fullName || "").toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [activeEmployees, roleFilter, search]);

  const effectiveTiming = useMemo(() => {
    const built = buildShiftInstants(shiftDate, startTime, endTime);
    const sameDate = isEdit && shiftDate === initialShift?.shiftDate;
    const keepStart =
      sameDate && initialShift?.plannedStart && startTime === toTimeInput(initialShift.plannedStart);
    const keepEnd =
      sameDate && initialShift?.plannedEnd && endTime === toTimeInput(initialShift.plannedEnd);
    return {
      plannedStart: keepStart ? initialShift.plannedStart : built.plannedStart,
      plannedEnd: keepEnd ? initialShift.plannedEnd : built.plannedEnd,
      keepOriginalOpenTimes: isOpenShift && keepStart && keepEnd,
      endDate: built.endDate,
    };
  }, [shiftDate, startTime, endTime, isEdit, initialShift, isOpenShift]);

  const currentTypeMeta = SHIFT_TYPE_META[shiftType] || SHIFT_TYPE_META.MORNING;
  const matchesPreset =
    startTime === currentTypeMeta.start && endTime === currentTypeMeta.end;
  const liveTimeError = useMemo(() => {
    if (effectiveTiming.keepOriginalOpenTimes) {
      return null;
    }
    return validateShiftWindow(shiftType, startTime, endTime);
  }, [effectiveTiming.keepOriginalOpenTimes, shiftType, startTime, endTime]);
  const displayedTimeError = fieldErrors.time || liveTimeError;

  const duplicateSlotShift = useMemo(() => {
    if (!shiftDate || !shiftType) return null;
    if (isEdit && initialShift?.status !== "SCHEDULED") return null;
    return (
      schedules.find(
        (s) =>
          s.shiftId !== initialShift?.shiftId &&
          s.status !== "CLOSED" &&
          s.shiftDate === shiftDate &&
          s.shiftType === shiftType,
      ) || null
    );
  }, [schedules, shiftDate, shiftType, isEdit, initialShift]);

  const employeeConflictMap = useMemo(() => {
    const map = {};
    if (!effectiveTiming.plannedStart || !effectiveTiming.plannedEnd) return map;
    for (const s of schedules) {
      if (s.shiftId === initialShift?.shiftId || s.status === "CLOSED") continue;
      if (
        !hasShiftTimeOverlap(
          effectiveTiming.plannedStart,
          effectiveTiming.plannedEnd,
          s.plannedStart,
          s.plannedEnd,
        )
      ) {
        continue;
      }
      for (const empId of s.assignedEmployeeIds || []) {
        if (!map[empId]) map[empId] = s;
      }
    }
    return map;
  }, [schedules, effectiveTiming.plannedStart, effectiveTiming.plannedEnd, initialShift?.shiftId]);

  const selectedConflicts = useMemo(
    () =>
      selectedIds
        .map((id) => ({
          emp: employees.find((e) => e.id === id),
          shift: employeeConflictMap[id],
        }))
        .filter((item) => Boolean(item.shift)),
    [selectedIds, employees, employeeConflictMap],
  );

  const selectedManagers = useMemo(
    () =>
      selectedIds
        .map((id) => employees.find((e) => e.id === id))
        .filter((emp) => emp && emp.roleCode === "BRANCH_MANAGER")
        .map((emp) => {
          const roleInShift =
            employeeRoles[emp.id] ?? employeeRoles[String(emp.id)] ?? emp.roleCode;
          return {
            emp,
            roleInShift,
            isOverridden: Boolean(roleInShift && roleInShift !== "BRANCH_MANAGER"),
          };
        }),
    [selectedIds, employees, employeeRoles],
  );

  function handleShiftTypeChange(nextType) {
    const prevMeta = SHIFT_TYPE_META[shiftType];
    const matchesPrevPreset =
      prevMeta && startTime === prevMeta.start && endTime === prevMeta.end;
    const invalidForNextType = Boolean(validateShiftWindow(nextType, startTime, endTime));
    setShiftType(nextType);
    setApiError("");
    setFieldErrors((f) => ({ ...f, time: null }));
    if (!isOpenShift && ((!isEdit && !customTimes) || matchesPrevPreset || invalidForNextType)) {
      const meta = SHIFT_TYPE_META[nextType];
      if (meta) {
        setStartTime(meta.start);
        setEndTime(meta.end);
        setCustomTimes(false);
      }
    }
  }

  function toggleEmployee(empId) {
    setSelectedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    );
    setApiError("");
    setFieldErrors((f) => ({ ...f, assignedEmployeeIds: null }));
  }

  function selectAllFiltered() {
    const visibleIds = filteredEmployees.map((e) => e.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    setApiError("");
  }

  function clearAllSelected() {
    setSelectedIds([]);
    setApiError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!branchId || busy || isLockedPastSchedule) return;

    const errs = {};
    if (!shiftDate) {
      errs.shiftDate = "Vui lòng chọn ngày làm việc.";
    } else if (!isOpenShift && shiftDate < today) {
      errs.shiftDate = "Không thể tạo hoặc gán lịch cho ngày đã qua.";
    }

    const plannedStart = effectiveTiming.plannedStart;
    const plannedEnd = effectiveTiming.plannedEnd;
    if (effectiveTiming.keepOriginalOpenTimes) {
      if (!plannedStart || !plannedEnd || new Date(plannedStart) >= new Date(plannedEnd)) {
        errs.time = "Khung giờ ca không hợp lệ.";
      }
    } else {
      const windowErr = validateShiftWindow(shiftType, startTime, endTime);
      if (windowErr) {
        errs.time = windowErr;
      } else if (!plannedStart || !plannedEnd || new Date(plannedStart) >= new Date(plannedEnd)) {
        errs.time = "Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setApiError("");
      return;
    }

    if (duplicateSlotShift) {
      setApiError("");
      topNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    const cleanedRoles = {};
    for (const id of selectedIds) {
      const emp = employees.find((item) => item.id === id);
      const chosen = employeeRoles[id] ?? employeeRoles[String(id)];
      if (chosen && chosen !== emp?.roleCode) {
        cleanedRoles[id] = chosen;
      }
    }
    try {
      if (isEdit) {
        await shiftsApi.updateSchedule(initialShift.shiftId, {
          shiftDate,
          shiftType,
          plannedStart,
          plannedEnd,
          assignedEmployeeIds: selectedIds,
          employeeRoles: cleanedRoles,
        });
        toast.success(`Đã cập nhật lịch & phân công cho ca #${initialShift.shiftId}.`);
      } else {
        const res = await shiftsApi.createSchedule({
          branchId,
          shiftDate,
          shiftType,
          plannedStart,
          plannedEnd,
          assignedEmployeeIds: selectedIds,
          employeeRoles: cleanedRoles,
        });
        toast.success(`Đã tạo ${SHIFT_TYPE_META[shiftType]?.label || shiftType} (#${res.shiftId}) ngày ${formatDate(shiftDate)}.`);
      }
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("shiftDate")) nextFields.shiftDate = err.fieldError("shiftDate");
      if (err.fieldError?.("assignedEmployeeIds")) nextFields.assignedEmployeeIds = err.fieldError("assignedEmployeeIds");
      if (err.detailCode === "INVALID_SHIFT_TIME") nextFields.time = err.message;
      setFieldErrors(nextFields);
      setApiError(Object.keys(nextFields).length > 0 ? "" : err.message || "Không lưu được lịch ca làm việc.");
    } finally {
      setBusy(false);
    }
  }

  const statusMeta = initialShift?.status ? SHIFT_STATUS_META[initialShift.status] : null;

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Modal.Title as="h2">
            {isEdit ? `Phân công & chỉnh sửa ca #${initialShift.shiftId}` : "Tạo lịch ca & phân công nhân viên"}
          </Modal.Title>
          {statusMeta ? <StatusTag status={initialShift.status} label={statusMeta.label} variant={statusMeta.variant} /> : null}
        </div>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          {isLockedPastSchedule ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Ngày <strong>{formatDate(initialShift?.shiftDate)}</strong> đã qua — hệ thống khóa chỉnh sửa và không cho phép gán nhân viên vào lịch ca quá khứ.
              </span>
            </div>
          ) : isOpenShift ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Ca này đang mở bán hàng — có thể điều chỉnh khung giờ dự kiến và gán/bớt nhân viên trực ca; ngày làm việc và loại ca được giữ nguyên.
              </span>
            </div>
          ) : null}

          {duplicateSlotShift ? (
            <div ref={topNoticeRef} className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Ngày <strong>{formatDate(shiftDate)}</strong> đã có{" "}
                <strong>
                  {(SHIFT_TYPE_META[duplicateSlotShift.shiftType] || currentTypeMeta).label} #
                  {duplicateSlotShift.shiftId}
                </strong>{" "}
                ({SHIFT_STATUS_META[duplicateSlotShift.status]?.label || duplicateSlotShift.status},{" "}
                {formatHm(duplicateSlotShift.plannedStart)}–{formatHm(duplicateSlotShift.plannedEnd)}). Hãy chỉnh sửa ca
                hiện có thay vì tạo trùng khung ca.
              </span>
            </div>
          ) : null}

          {!duplicateSlotShift && apiError ? (
            <div ref={topNoticeRef} className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <div className="form-grid mb-3">
            <FormField label="Ngày làm việc" required error={fieldErrors.shiftDate}>
              <Form.Control
                type="date"
                min={isOpenShift || isLockedPastSchedule ? undefined : today}
                value={shiftDate}
                disabled={busy || isOpenShift || isLockedPastSchedule}
                onChange={(e) => {
                  setShiftDate(e.target.value);
                  setApiError("");
                  setFieldErrors((f) => ({ ...f, shiftDate: null }));
                }}
              />
            </FormField>

            <FormField label="Loại ca làm việc" required>
              <Form.Select
                value={shiftType}
                disabled={busy || isOpenShift || isLockedPastSchedule}
                onChange={(e) => handleShiftTypeChange(e.target.value)}
              >
                {SHIFT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SHIFT_TYPE_META[t].label} ({SHIFT_TYPE_META[t].window})
                  </option>
                ))}
              </Form.Select>
            </FormField>

            <FormField label="Giờ bắt đầu (24h)" required error={displayedTimeError}>
              <Time24Select
                id="shift-start-time"
                value={startTime}
                disabled={busy || isLockedPastSchedule}
                isInvalid={Boolean(displayedTimeError)}
                ariaPrefix="bắt đầu"
                onChange={(nextVal) => {
                  setStartTime(nextVal);
                  setCustomTimes(true);
                  setApiError("");
                  setFieldErrors((f) => ({ ...f, time: null }));
                }}
              />
            </FormField>

            <FormField
              label="Giờ kết thúc (24h)"
              required
              help={`Trong cùng ngày · Phạm vi ${currentTypeMeta.label}: ${currentTypeMeta.window}`}
            >
              <Time24Select
                id="shift-end-time"
                value={endTime}
                disabled={busy || isLockedPastSchedule}
                isInvalid={Boolean(displayedTimeError)}
                ariaPrefix="kết thúc"
                onChange={(nextVal) => {
                  setEndTime(nextVal);
                  setCustomTimes(true);
                  setApiError("");
                  setFieldErrors((f) => ({ ...f, time: null }));
                }}
              />
            </FormField>
          </div>

          {!matchesPreset ? (
            <div className="notice mb-3 justify-content-between align-items-center flex-wrap">
              <span>
                {liveTimeError ? (
                  <>
                    <strong>Phạm vi hợp lệ của {currentTypeMeta.label}:</strong> {currentTypeMeta.window} trong cùng
                    ngày. Bấm nút bên phải để đặt lại nhanh.
                  </>
                ) : (
                  <>
                    <strong>Khung rút gọn hợp lệ:</strong> {startTime}–{endTime} (trong phạm vi{" "}
                    <strong>{currentTypeMeta.label}</strong> {currentTypeMeta.window}).
                  </>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline-secondary"
                disabled={busy || isLockedPastSchedule}
                onClick={() => {
                  setStartTime(currentTypeMeta.start);
                  setEndTime(currentTypeMeta.end);
                  setCustomTimes(false);
                  setFieldErrors((f) => ({ ...f, time: null }));
                  setApiError("");
                }}
              >
                Đặt về {currentTypeMeta.start} – {currentTypeMeta.end}
              </Button>
            </div>
          ) : null}

          <div className="scms-divider my-3" />

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <div>
              <div className="form-label mb-0">
                Nhân viên được gán vào ca ({selectedIds.length}/{activeEmployees.length})
              </div>
              <div className="small text-muted-scms">
                Hệ thống tự kiểm tra trùng khung giờ (BR-15) và cho phép chọn vai trò kiêm nhiệm riêng trong ca mà không đổi chức danh gốc sau hết ca.
              </div>
            </div>
            <div className="d-flex gap-1">
              <Button type="button" size="sm" variant="outline-secondary" onClick={selectAllFiltered} disabled={busy || isLockedPastSchedule || filteredEmployees.length === 0}>
                Chọn danh sách lọc
              </Button>
              <Button type="button" size="sm" variant="outline-secondary" onClick={clearAllSelected} disabled={busy || isLockedPastSchedule || selectedIds.length === 0}>
                Bỏ chọn hết
              </Button>
            </div>
          </div>

          <div className="d-flex gap-2 flex-wrap align-items-center mb-2">
            <Form.Control
              type="search"
              size="sm"
              placeholder="Tìm tên nhân viên…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <div className="d-flex gap-1 flex-wrap">
              {ROLE_FILTERS.map((rf) => (
                <Button
                  key={rf.value || "all"}
                  type="button"
                  size="sm"
                  variant={roleFilter === rf.value ? "primary" : "outline-secondary"}
                  onClick={() => setRoleFilter(rf.value)}
                >
                  {rf.label}
                </Button>
              ))}
            </div>
          </div>

          {fieldErrors.assignedEmployeeIds ? (
            <div className="field-error mb-2">{fieldErrors.assignedEmployeeIds}</div>
          ) : null}

          {selectedConflicts.length > 0 ? (
            <div className="notice notice--warn mb-2">
              <strong>!</strong>
              <span>
                Nhân viên đang chọn bị trùng giờ với ca khác (BR-15):{" "}
                {selectedConflicts
                  .map(
                    ({ emp, shift }) =>
                      `${emp?.fullName || `NV`} (${SHIFT_TYPE_META[shift.shiftType]?.label || shift.shiftType} ${formatHm(
                        shift.plannedStart,
                      )}–${formatHm(shift.plannedEnd)})`,
                  )
                  .join(", ")}
                . Hãy bỏ chọn hoặc chỉnh lại khung giờ của ca bị lệch chuẩn.
              </span>
            </div>
          ) : null}

          {selectedManagers.length > 0 ? (
            <div className="notice notice--warn mb-2">
              <strong>!</strong>
              <span>
                <strong>Lưu ý gán Quản lý chi nhánh:</strong>{" "}
                {selectedManagers
                  .map(({ emp, roleInShift, isOverridden }) =>
                    isOverridden
                      ? `${emp.fullName} đang được chọn kiêm ${POSITION_LABELS[roleInShift] || roleInShift}`
                      : `${emp.fullName} (${POSITION_LABELS[emp.roleCode] || "Quản lý chi nhánh"}) đang được gán trực tiếp vào ca`,
                  )
                  .join("; ")}
                . Hãy kiểm tra lại để tránh lỡ tay thêm Quản lý khi dùng nút chọn nhanh hoặc khi không cần kiêm vị trí nhân viên.
              </span>
            </div>
          ) : null}

          <div
            style={{
              maxHeight: 250,
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              background: "var(--paper)",
            }}
          >
            {activeEmployees.length === 0 ? (
              <div className="p-3 text-center text-muted-scms small">
                Chi nhánh chưa có nhân viên đang hoạt động nào. Thêm nhân sự tại màn Nhân viên.
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-3 text-center text-muted-scms small">
                Không có nhân viên nào khớp bộ lọc.
              </div>
            ) : (
              filteredEmployees.map((emp, idx) => {
                const checked = selectedIds.includes(emp.id);
                const checkedIn = (isToday || shiftDate === today) && (checkedInIds.has(emp.id) || emp.isCheckedIn);
                const conflictShift = employeeConflictMap[emp.id];
                const currentRoleInShift =
                  employeeRoles[emp.id] ?? employeeRoles[String(emp.id)] ?? emp.roleCode ?? "";
                const canCustomizeRole = checked && emp.roleCode !== "COO";
                const isManagerAssigned = checked && emp.roleCode === "BRANCH_MANAGER";
                const isManagerOverridden =
                  isManagerAssigned &&
                  Boolean(currentRoleInShift && currentRoleInShift !== "BRANCH_MANAGER");
                return (
                  <div
                    key={emp.id}
                    className="d-flex align-items-start align-items-sm-center justify-content-between flex-wrap gap-2 px-3 py-2 m-0"
                    style={{
                      background: checked ? "var(--accent-soft)" : "var(--surface)",
                      borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                    }}
                  >
                    <label
                      htmlFor={`shift-emp-${emp.id}`}
                      className="d-flex align-items-center gap-2 mb-0 flex-grow-1"
                      style={{ cursor: busy || isLockedPastSchedule ? "default" : "pointer", minWidth: 210 }}
                    >
                      <Form.Check
                        id={`shift-emp-${emp.id}`}
                        type="checkbox"
                        checked={checked}
                        disabled={busy || isLockedPastSchedule}
                        onChange={() => toggleEmployee(emp.id)}
                      />
                      <div>
                        <div style={{ fontWeight: checked ? 600 : 500, fontSize: 13 }}>
                          {emp.fullName}
                        </div>
                        <div className="text-muted-scms" style={{ fontSize: 11 }}>
                          Chức danh gốc: {POSITION_LABELS[emp.roleCode] || emp.roleCode || "Nhân viên"}
                          {emp.phone ? ` · ${emp.phone}` : ""}
                          {emp.hasPin === false ? " · Chưa đặt PIN" : ""}
                        </div>
                      </div>
                    </label>
                    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                      {canCustomizeRole ? (
                        <Form.Select
                          size="sm"
                          value={currentRoleInShift}
                          disabled={busy || isLockedPastSchedule}
                          aria-label={`Vai trò trong ca cho ${emp.fullName}`}
                          style={{ width: "auto", minWidth: 235, maxWidth: "100%", fontSize: 12 }}
                          onChange={(e) => {
                            const nextRole = e.target.value;
                            setEmployeeRoles((prev) => {
                              const next = { ...prev };
                              delete next[String(emp.id)];
                              if (!nextRole || nextRole === emp.roleCode) {
                                delete next[emp.id];
                              } else {
                                next[emp.id] = nextRole;
                              }
                              return next;
                            });
                          }}
                        >
                          <option value={emp.roleCode || ""}>
                            Đúng chức danh ({POSITION_LABELS[emp.roleCode] || emp.roleCode || "Mặc định"})
                          </option>
                          {emp.roleCode !== "BARISTA" ? (
                            <option value="BARISTA">Kiêm Pha chế (riêng ca này)</option>
                          ) : null}
                          {emp.roleCode !== "WAITER" ? (
                            <option value="WAITER">Kiêm Phục vụ (riêng ca này)</option>
                          ) : null}
                          {emp.roleCode !== "CASHIER" ? (
                            <option value="CASHIER">Hỗ trợ Thu ngân (riêng ca này)</option>
                          ) : null}
                        </Form.Select>
                      ) : null}
                      {isManagerAssigned ? (
                        <StatusTag
                          status="MANAGER_WARN"
                          variant="warn"
                          label={
                            isManagerOverridden
                              ? `Cảnh báo: Quản lý kiêm ${POSITION_LABELS[currentRoleInShift] || currentRoleInShift}`
                              : "Cảnh báo: Quản lý chi nhánh"
                          }
                        />
                      ) : null}
                      {conflictShift ? (
                        <StatusTag
                          status="CONFLICT"
                          variant="warn"
                          label={`Trùng ${SHIFT_TYPE_META[conflictShift.shiftType]?.label || conflictShift.shiftType} (${formatHm(
                            conflictShift.plannedStart,
                          )}–${formatHm(conflictShift.plannedEnd)})`}
                        />
                      ) : null}
                      {checkedIn ? (
                        <StatusTag status="CHECKED_IN" variant="success" label="Đang trong ca" />
                      ) : null}
                      {checked ? (
                        <StatusTag status="ASSIGNED" variant="dark" label="Đã gán" />
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy || isLockedPastSchedule}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            {isEdit ? "Lưu thay đổi ca" : "Tạo ca & gán nhân viên"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
