import { useEffect, useMemo, useState } from "react";
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
  toTimeInput,
  todayIso,
} from "./shiftUtils.js";

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
  checkedInIds = new Set(),
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const isEdit = mode === "edit" && Boolean(initialShift?.shiftId);
  const isOpenShift = isEdit && initialShift?.status === "OPEN";
  const isToday = initialShift?.shiftDate === todayIso();

  const [shiftDate, setShiftDate] = useState(todayIso());
  const [shiftType, setShiftType] = useState("MORNING");
  const [startTime, setStartTime] = useState(SHIFT_TYPE_META.MORNING.start);
  const [endTime, setEndTime] = useState(SHIFT_TYPE_META.MORNING.end);
  const [customTimes, setCustomTimes] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

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

  const previewTiming = useMemo(
    () => buildShiftInstants(shiftDate, startTime, endTime),
    [shiftDate, startTime, endTime],
  );

  function handleShiftTypeChange(nextType) {
    setShiftType(nextType);
    if (!isEdit && !customTimes) {
      const meta = SHIFT_TYPE_META[nextType];
      if (meta) {
        setStartTime(meta.start);
        setEndTime(meta.end);
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
    if (!branchId || busy) return;

    const errs = {};
    if (!shiftDate) errs.shiftDate = "Vui lòng chọn ngày làm việc.";
    if (!startTime || !endTime) errs.time = "Vui lòng nhập đầy đủ giờ bắt đầu và kết thúc.";
    else if (startTime === endTime) errs.time = "Giờ kết thúc phải khác giờ bắt đầu.";

    const built = buildShiftInstants(shiftDate, startTime, endTime);
    const sameDate = isEdit && shiftDate === initialShift?.shiftDate;
    const keepStart =
      sameDate && initialShift?.plannedStart && startTime === toTimeInput(initialShift.plannedStart);
    const keepEnd =
      sameDate && initialShift?.plannedEnd && endTime === toTimeInput(initialShift.plannedEnd);
    const plannedStart = keepStart ? initialShift.plannedStart : built.plannedStart;
    const plannedEnd = keepEnd ? initialShift.plannedEnd : built.plannedEnd;
    if (!plannedStart || !plannedEnd || new Date(plannedStart) >= new Date(plannedEnd)) {
      errs.time = "Khung giờ ca không hợp lệ.";
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      if (isEdit) {
        await shiftsApi.updateSchedule(initialShift.shiftId, {
          shiftDate,
          shiftType,
          plannedStart,
          plannedEnd,
          assignedEmployeeIds: selectedIds,
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
      setApiError(err.message || "Không lưu được lịch ca làm việc.");
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
          {isOpenShift ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Ca này đang mở bán hàng — có thể điều chỉnh khung giờ dự kiến và gán/bớt nhân viên trực ca; ngày làm việc và loại ca được giữ nguyên.
              </span>
            </div>
          ) : null}

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <div className="form-grid mb-3">
            <FormField label="Ngày làm việc" required error={fieldErrors.shiftDate}>
              <Form.Control
                type="date"
                value={shiftDate}
                disabled={busy || isOpenShift}
                onChange={(e) => {
                  setShiftDate(e.target.value);
                  setFieldErrors((f) => ({ ...f, shiftDate: null }));
                }}
              />
            </FormField>

            <FormField label="Loại ca làm việc" required>
              <Form.Select
                value={shiftType}
                disabled={busy || isOpenShift}
                onChange={(e) => handleShiftTypeChange(e.target.value)}
              >
                {SHIFT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SHIFT_TYPE_META[t].label} ({SHIFT_TYPE_META[t].window})
                  </option>
                ))}
              </Form.Select>
            </FormField>

            <FormField label="Giờ bắt đầu" required error={fieldErrors.time}>
              <Form.Control
                type="time"
                value={startTime}
                disabled={busy}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setCustomTimes(true);
                  setFieldErrors((f) => ({ ...f, time: null }));
                }}
              />
            </FormField>

            <FormField
              label="Giờ kết thúc"
              required
              help={
                previewTiming.overnight
                  ? `Qua ngày hôm sau (kết thúc lúc ${endTime} ngày ${formatDate(previewTiming.endDate)})`
                  : "Trong cùng ngày làm việc"
              }
            >
              <Form.Control
                type="time"
                value={endTime}
                disabled={busy}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setCustomTimes(true);
                  setFieldErrors((f) => ({ ...f, time: null }));
                }}
              />
            </FormField>
          </div>

          <div className="scms-divider my-3" />

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <div>
              <div className="form-label mb-0">
                Nhân viên được gán vào ca ({selectedIds.length}/{activeEmployees.length})
              </div>
              <div className="small text-muted-scms">
                Hệ thống tự động kiểm tra trùng khung giờ nếu nhân viên đã có ca khác (BR-15).
              </div>
            </div>
            <div className="d-flex gap-1">
              <Button type="button" size="sm" variant="outline-secondary" onClick={selectAllFiltered} disabled={busy || filteredEmployees.length === 0}>
                Chọn danh sách lọc
              </Button>
              <Button type="button" size="sm" variant="outline-secondary" onClick={clearAllSelected} disabled={busy || selectedIds.length === 0}>
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
                const checkedIn = (isToday || shiftDate === todayIso()) && (checkedInIds.has(emp.id) || emp.isCheckedIn);
                return (
                  <label
                    key={emp.id}
                    htmlFor={`shift-emp-${emp.id}`}
                    className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 m-0"
                    style={{
                      cursor: busy ? "default" : "pointer",
                      background: checked ? "var(--accent-soft)" : "var(--surface)",
                      borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                    }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <Form.Check
                        id={`shift-emp-${emp.id}`}
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleEmployee(emp.id)}
                      />
                      <div>
                        <div style={{ fontWeight: checked ? 600 : 500, fontSize: 13 }}>
                          {emp.fullName}
                        </div>
                        <div className="text-muted-scms" style={{ fontSize: 11 }}>
                          {POSITION_LABELS[emp.roleCode] || emp.roleCode || "Nhân viên"}
                          {emp.phone ? ` · ${emp.phone}` : ""}
                          {emp.hasPin === false ? " · Chưa đặt PIN" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      {checkedIn ? (
                        <StatusTag status="CHECKED_IN" variant="success" label="Đang trong ca" />
                      ) : null}
                      {checked ? (
                        <StatusTag status="ASSIGNED" variant="dark" label="Đã gán" />
                      ) : null}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            {isEdit ? "Lưu thay đổi ca" : "Tạo ca & gán nhân viên"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
