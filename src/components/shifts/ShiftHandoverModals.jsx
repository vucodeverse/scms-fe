import { useEffect, useMemo, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import FormField from "../FormField.jsx";
import { useToast } from "../ToastContext.jsx";
import { authApi } from "../../api/authApi.js";
import { shiftsApi } from "../../api/shiftsApi.js";
import { POSITION_LABELS } from "../../config/userConstants.js";
import { formatDateTime, formatVnd } from "../../lib/format.js";
import { SHIFT_TYPE_META, actorName, formatSignedVnd } from "./shiftUtils.js";

const HANDOVER_REASON_PRESETS = [
  "Có việc gia đình đột xuất",
  "Đổi ca giữa buổi theo điều động",
  "Sức khỏe / mệt đột xuất cần nghỉ sớm",
  "Họp / xử lý công việc nội bộ",
];

// Modal Bàn giao két giữa ca — Chiều giao (giữ nguyên ca OPEN, khóa tạm POS & auto Check-out người giao).
export function InitiateHandoverModal({
  show,
  summary,
  userRole,
  branchId,
  currentUserId,
  employees = [],
  employeeMap = {},
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const shift = summary?.shift;
  const expectedCash = Number(summary?.currentCashBalance ?? shift?.expectedCash ?? shift?.openingCash ?? 0);
  const currentHolderId = shift?.activeCashierId || shift?.openedBy || currentUserId;
  const currentHolderName = shift?.activeCashierName || shift?.openedByName || actorName(currentHolderId, employeeMap);
  const requirePin = userRole === "CASHIER";

  const [countedCash, setCountedCash] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [expectedIncomingUserId, setExpectedIncomingUserId] = useState("");
  const [pin, setPin] = useState("");
  const [cashierCandidates, setCashierCandidates] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setCountedCash("");
    setReason("");
    setNote("");
    setExpectedIncomingUserId("");
    setPin("");
    setFieldErrors({});
    setApiError("");
  }, [show, shift?.id]);

  useEffect(() => {
    if (!show || !branchId) return;
    if (employees.length > 0) {
      setCashierCandidates([]);
      return;
    }
    let alive = true;
    authApi
      .cashiers(branchId)
      .then((list) => {
        if (alive) setCashierCandidates(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setCashierCandidates([]);
      });
    return () => {
      alive = false;
    };
  }, [show, branchId, employees.length]);

  const incomingOptions = useMemo(() => {
    if (employees.length > 0) {
      return employees
        .filter((e) => (!e.status || e.status === "ACTIVE") && e.id !== currentHolderId)
        .filter((e) => e.roleCode === "CASHIER" || e.roleCode === "BRANCH_MANAGER")
        .sort((a, b) => {
          if (a.roleCode !== b.roleCode) return a.roleCode === "CASHIER" ? -1 : 1;
          return (a.fullName || "").localeCompare(b.fullName || "", "vi");
        })
        .map((e) => ({
          id: e.id,
          label: `${e.fullName} (${POSITION_LABELS[e.roleCode] || e.roleCode})`,
        }));
    }
    return cashierCandidates
      .filter((c) => c.employeeId !== currentHolderId)
      .map((c) => ({
        id: c.employeeId,
        label: `${c.fullName} (Thu ngân)`,
      }));
  }, [employees, cashierCandidates, currentHolderId]);

  const parsedCounted = countedCash === "" ? NaN : Number(countedCash);
  const variance = !Number.isNaN(parsedCounted) ? parsedCounted - expectedCash : 0;
  const hasVariance = !Number.isNaN(parsedCounted) && Math.abs(variance) >= 0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const cleanPin = pin.trim();
    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Vui lòng nhập số tiền mặt thực đếm bàn giao >= 0.";
    }
    if (!reason.trim()) {
      errs.reason = "Bắt buộc nhập lý do bàn giao két giữa ca.";
    }
    if (hasVariance && !note.trim()) {
      errs.note = "Phát hiện chênh lệch két khi bàn giao — vui lòng ghi chú giải trình.";
    }
    if (requirePin) {
      if (!cleanPin) {
        errs.pin = "Vui lòng nhập mã PIN cá nhân (4–6 số) để xác nhận giao két & tự động Check-out.";
      } else if (!/^[0-9]{4,6}$/.test(cleanPin)) {
        errs.pin = "Mã PIN phải gồm từ 4 đến 6 chữ số.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      await shiftsApi.initiateHandover(shift.id, {
        countedCash: parsedCounted,
        reason: reason.trim(),
        note: note.trim() || null,
        expectedIncomingUserId: expectedIncomingUserId ? Number(expectedIncomingUserId) : null,
        ...(cleanPin ? { pin: cleanPin } : {}),
      });
      toast.success(
        `Đã chốt số kiểm két bàn giao (${formatVnd(parsedCounted)}). Ca #${shift.id} vẫn ĐANG MỞ và tạm khóa POS chờ người nhận kiểm két.`,
      );
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("countedCash")) nextFields.countedCash = err.fieldError("countedCash");
      if (err.fieldError?.("reason")) nextFields.reason = err.fieldError("reason");
      if (err.fieldError?.("note")) nextFields.note = err.fieldError("note");
      if (err.fieldError?.("pin")) nextFields.pin = err.fieldError("pin");
      if (err.detailCode === "REASON_REQUIRED") nextFields.note = err.message;
      if (err.code === "INVALID_PIN" || err.code === "PIN_LOCKED") nextFields.pin = err.message;
      setFieldErrors(nextFields);
      setApiError(err.message || "Không thể khởi tạo bàn giao két giữa ca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">
          Bàn giao két giữa ca · {SHIFT_TYPE_META[shift?.shiftType]?.label || shift?.shiftType} #{shift?.id}
        </Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              <strong>Chuẩn nghiệp vụ &ldquo;Kiểm két đổi người nhưng chưa đóng ca&rdquo;:</strong>{" "}
              Ca bán hàng vẫn giữ <strong>ĐANG MỞ</strong> để giữ nguyên doanh thu, két ca và các đơn đang chờ; người bàn giao được{" "}
              <strong>tự động Check-out</strong> chấm công; quầy POS &amp; nạp/rút két sẽ <strong>tạm khóa</strong> cho đến khi người nhận kiểm két xác nhận nhận ca.
            </span>
          </div>

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <div
            className="p-3 mb-3"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}
          >
            <div className="stat-line">
              <span className="text-muted-scms">Người đang giữ két bàn giao</span>
              <strong>{currentHolderName}</strong>
            </div>
            <div className="stat-line">
              <span className="text-muted-scms">Số dư tiền mặt sổ sách hiện tại (Dự kiến)</span>
              <strong className="num" style={{ fontSize: 15 }}>
                {formatVnd(expectedCash)}
              </strong>
            </div>
          </div>

          <FormField label="Số tiền mặt thực đếm tại thời điểm bàn giao (VNĐ)" required error={fieldErrors.countedCash}>
            <div className="d-flex gap-2">
              <Form.Control
                type="number"
                min="0"
                step="1"
                placeholder="Đếm thực tế tiền mặt đang có trong két…"
                value={countedCash}
                onChange={(e) => {
                  setCountedCash(e.target.value);
                  setFieldErrors((f) => ({ ...f, countedCash: null, note: null }));
                  setApiError("");
                }}
                disabled={busy}
                autoFocus
              />
              <Button
                type="button"
                variant="outline-secondary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => {
                  setCountedCash(String(Math.round(expectedCash)));
                  setFieldErrors((f) => ({ ...f, countedCash: null, note: null }));
                }}
                disabled={busy}
              >
                Khớp dự kiến
              </Button>
            </div>
          </FormField>

          {!Number.isNaN(parsedCounted) ? (
            <div
              className={`notice mb-3 ${hasVariance ? "notice--warn" : ""}`}
              style={!hasVariance ? { background: "var(--success-soft)", borderColor: "#bcc7b5" } : undefined}
            >
              <strong>{hasVariance ? "!" : "✓"}</strong>
              <span>
                {hasVariance ? (
                  <>
                    Chênh lệch so với sổ sách: <strong>{formatSignedVnd(variance)}</strong> (
                    {variance > 0 ? "Thừa tiền mặt" : "Thiếu tiền mặt"}). Vui lòng ghi chú giải trình bên dưới.
                  </>
                ) : (
                  <>Số kiểm đếm khớp hoàn toàn với sổ sách ({formatVnd(expectedCash)}).</>
                )}
              </span>
            </div>
          ) : null}

          <FormField label="Lý do bàn giao giữa ca" required error={fieldErrors.reason}>
            <Form.Control
              type="text"
              maxLength={500}
              placeholder="VD: Có việc gia đình đột xuất cần về sớm…"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: null }));
              }}
              disabled={busy}
            />
            <div className="d-flex gap-1 flex-wrap mt-2">
              {HANDOVER_REASON_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={reason === preset ? "primary" : "outline-secondary"}
                  onClick={() => {
                    setReason(preset);
                    setFieldErrors((f) => ({ ...f, reason: null }));
                  }}
                  disabled={busy}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </FormField>

          <FormField
            label="Người dự kiến nhận ca thay (tùy chọn)"
            help="Có thể chọn trước người thay thế hoặc để trống nếu Quản lý chi nhánh sẽ đứng quầy / phân người khác nhận sau."
          >
            <Form.Select
              value={expectedIncomingUserId}
              onChange={(e) => setExpectedIncomingUserId(e.target.value)}
              disabled={busy}
            >
              <option value="">Chưa chốt trước (Quản lý đứng quầy hoặc Thu ngân khác tự mở PIN nhận)</option>
              {incomingOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </Form.Select>
          </FormField>

          <FormField
            label={hasVariance ? "Ghi chú giải trình chênh lệch" : "Ghi chú bàn giao cho người nhận"}
            required={hasVariance}
            error={fieldErrors.note}
            className={requirePin ? "mb-3" : "mb-0"}
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder={
                hasVariance
                  ? "Bắt buộc giải trình lý do thừa/thiếu tiền tại thời điểm bàn giao…"
                  : "VD: Đã dặn khách bàn 3 đang chờ đơn #12, tiền lẻ trong ngăn dưới còn đủ…"
              }
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setFieldErrors((f) => ({ ...f, note: null }));
              }}
              disabled={busy}
            />
          </FormField>

          {requirePin ? (
            <FormField
              label="Mã PIN Thu ngân (4–6 số) xác nhận bàn giao & Check-out"
              required
              error={fieldErrors.pin}
              help="Xác nhận bạn đã kiểm két xong để giao ca và tự động Check-out chấm công."
              className="mb-0"
            >
              <Form.Control
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setFieldErrors((f) => ({ ...f, pin: null }));
                  setApiError("");
                }}
                disabled={busy}
              />
            </FormField>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận bàn giao két &amp; Tạm khóa POS
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal Bàn giao két giữa ca — Chiều nhận (người mới kiểm đếm lại tiền két và mở khóa POS).
export function AcceptHandoverModal({
  show,
  summary,
  userRole,
  currentUserId,
  currentUserName,
  employees = [],
  employeeMap = {},
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const shift = summary?.shift;
  const pending = shift?.pendingHandover || null;
  const outgoingCounted = Number(pending?.outgoingCountedCash ?? 0);
  const expectedAtOut = Number(pending?.expectedCashAtOut ?? summary?.currentCashBalance ?? 0);
  const isCashier = userRole === "CASHIER";
  const isSameInitiatorCashier = Boolean(
    isCashier && pending?.fromUserId && currentUserId && Number(pending.fromUserId) === Number(currentUserId),
  );

  const [incomingUserId, setIncomingUserId] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setIncomingUserId("");
    setCountedCash("");
    setNote("");
    setPin("");
    setFieldErrors({});
    setApiError("");
  }, [show, shift?.id, pending?.id]);

  const managerAssignableUsers = useMemo(() => {
    if (isCashier) return [];
    return employees
      .filter((e) => (!e.status || e.status === "ACTIVE") && e.id !== pending?.fromUserId && e.id !== currentUserId)
      .filter((e) => e.roleCode === "CASHIER" || e.roleCode === "BRANCH_MANAGER")
      .sort((a, b) => {
        if (a.roleCode !== b.roleCode) return a.roleCode === "CASHIER" ? -1 : 1;
        return (a.fullName || "").localeCompare(b.fullName || "", "vi");
      });
  }, [isCashier, employees, pending?.fromUserId, currentUserId]);

  const pickingAnotherPerson = Boolean(!isCashier && incomingUserId && Number(incomingUserId) !== Number(currentUserId));
  const requirePin = isCashier || pickingAnotherPerson;

  const parsedCounted = countedCash === "" ? NaN : Number(countedCash);
  const varFromOut = !Number.isNaN(parsedCounted) ? parsedCounted - outgoingCounted : 0;
  const varFromBook = !Number.isNaN(parsedCounted) ? parsedCounted - expectedAtOut : 0;
  const hasVarFromOut = !Number.isNaN(parsedCounted) && Math.abs(varFromOut) >= 0.01;
  const hasVarFromBook = !Number.isNaN(parsedCounted) && Math.abs(varFromBook) >= 0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy || isSameInitiatorCashier) return;

    const cleanPin = pin.trim();
    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Vui lòng nhập số tiền mặt thực đếm kiểm nhận >= 0.";
    }
    if (hasVarFromOut && !note.trim()) {
      errs.note = "Số kiểm nhận khác số người giao khai báo — bắt buộc nhập ghi chú giải trình.";
    }
    if (requirePin) {
      if (!cleanPin) {
        errs.pin = pickingAnotherPerson
          ? "Vui lòng để người được chọn đứng quầy nhập mã PIN cá nhân xác nhận nhận két."
          : "Vui lòng nhập mã PIN cá nhân (4–6 số) xác nhận nhận két & tự động Check-in.";
      } else if (!/^[0-9]{4,6}$/.test(cleanPin)) {
        errs.pin = "Mã PIN phải gồm từ 4 đến 6 chữ số.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      const updated = await shiftsApi.acceptHandover(shift.id, {
        countedCash: parsedCounted,
        note: note.trim() || null,
        incomingUserId: pickingAnotherPerson ? Number(incomingUserId) : null,
        ...(cleanPin ? { pin: cleanPin } : {}),
      });
      toast.success(
        `Đã nhận bàn giao két ca #${shift.id} (${updated?.activeCashierName || currentUserName || "Người nhận"}). Quầy POS đã mở khóa trở lại!`,
      );
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("countedCash")) nextFields.countedCash = err.fieldError("countedCash");
      if (err.fieldError?.("note")) nextFields.note = err.fieldError("note");
      if (err.fieldError?.("pin")) nextFields.pin = err.fieldError("pin");
      if (err.detailCode === "REASON_REQUIRED") nextFields.note = err.message;
      if (err.code === "INVALID_PIN" || err.code === "PIN_LOCKED") nextFields.pin = err.message;
      setFieldErrors(nextFields);
      setApiError(err.message || "Không thể xác nhận nhận bàn giao két.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">
          Kiểm két nhận bàn giao · {SHIFT_TYPE_META[shift?.shiftType]?.label || shift?.shiftType} #{shift?.id}
        </Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          {isSameInitiatorCashier ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Tài khoản hiện tại chính là người vừa bàn giao két ({pending?.fromUserName || currentUserName}).
                Người tiếp nhận phải bấm <strong>Đổi thu ngân</strong> để đăng nhập PIN của người mới, hoặc nếu bạn tiếp tục đứng quầy hãy dùng nút <strong>Hủy bàn giao</strong>.
              </span>
            </div>
          ) : null}

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          {pending ? (
            <div
              className="p-3 mb-3"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}
            >
              <div className="stat-line">
                <span className="text-muted-scms">Người bàn giao két</span>
                <strong>
                  {pending.fromUserName || actorName(pending.fromUserId, employeeMap)} ·{" "}
                  <span className="text-muted-scms fw-normal">{formatDateTime(pending.outgoingAt)}</span>
                </strong>
              </div>
              <div className="stat-line">
                <span className="text-muted-scms">Lý do bàn giao</span>
                <strong>{pending.reason}</strong>
              </div>
              {pending.outgoingNote ? (
                <div className="stat-line">
                  <span className="text-muted-scms">Ghi chú người giao</span>
                  <span>{pending.outgoingNote}</span>
                </div>
              ) : null}
              <div className="scms-divider my-2" />
              <div className="stat-line">
                <span className="text-muted-scms">Số dư sổ sách khi bàn giao</span>
                <strong>{formatVnd(expectedAtOut)}</strong>
              </div>
              <div className="stat-line" style={{ fontSize: 14 }}>
                <strong>Tiền thực đếm người giao khai báo</strong>
                <strong className="num">{formatVnd(outgoingCounted)}</strong>
              </div>
            </div>
          ) : null}

          {!isCashier ? (
            <FormField
              label="Người trực tiếp đứng quầy nhận két & phụ trách POS"
              help={
                pickingAnotherPerson
                  ? "Khi chỉ định nhân viên khác nhận két, nhân viên đó phải tự nhập mã PIN cá nhân ngay bên dưới."
                  : "Nếu chưa có Thu ngân thay thế kịp, Quản lý trực tiếp đứng quầy nhận két (tài khoản Quản lý đã có quyền thao tác POS & thanh toán)."
              }
            >
              <Form.Select
                value={incomingUserId}
                onChange={(e) => {
                  setIncomingUserId(e.target.value);
                  setPin("");
                  setFieldErrors((f) => ({ ...f, pin: null }));
                }}
                disabled={busy}
              >
                <option value="">
                  Chính tôi ({currentUserName || POSITION_LABELS[userRole] || userRole}) — Quản lý đứng quầy thay
                </option>
                {managerAssignableUsers.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({POSITION_LABELS[emp.roleCode] || emp.roleCode})
                  </option>
                ))}
              </Form.Select>
            </FormField>
          ) : null}

          <FormField label="Số tiền mặt thực tế bạn đếm lại khi nhận két (VNĐ)" required error={fieldErrors.countedCash}>
            <div className="d-flex gap-2">
              <Form.Control
                type="number"
                min="0"
                step="1"
                placeholder="Nhập số tiền bạn đếm lại được trong két…"
                value={countedCash}
                onChange={(e) => {
                  setCountedCash(e.target.value);
                  setFieldErrors((f) => ({ ...f, countedCash: null, note: null }));
                  setApiError("");
                }}
                disabled={busy || isSameInitiatorCashier}
                autoFocus
              />
              <Button
                type="button"
                variant="outline-secondary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => {
                  setCountedCash(String(Math.round(outgoingCounted)));
                  setFieldErrors((f) => ({ ...f, countedCash: null, note: null }));
                }}
                disabled={busy || isSameInitiatorCashier}
              >
                Khớp số bàn giao
              </Button>
            </div>
          </FormField>

          {!Number.isNaN(parsedCounted) ? (
            <div
              className={`notice mb-3 ${hasVarFromOut || hasVarFromBook ? "notice--warn" : ""}`}
              style={!hasVarFromOut && !hasVarFromBook ? { background: "var(--success-soft)", borderColor: "#bcc7b5" } : undefined}
            >
              <strong>{hasVarFromOut || hasVarFromBook ? "!" : "✓"}</strong>
              <span>
                {hasVarFromOut ? (
                  <>
                    Chênh lệch so với số bàn giao ({formatVnd(outgoingCounted)}):{" "}
                    <strong>{formatSignedVnd(varFromOut)}</strong> (bắt buộc nhập ghi chú giải trình).
                  </>
                ) : (
                  <>Khớp 100% với số bàn giao của người trước ({formatVnd(outgoingCounted)}).</>
                )}
                {hasVarFromBook ? (
                  <>
                    {" "}· So với sổ sách ({formatVnd(expectedAtOut)}):{" "}
                    <strong>{formatSignedVnd(varFromBook)}</strong>.
                  </>
                ) : null}
              </span>
            </div>
          ) : null}

          <FormField
            label={hasVarFromOut ? "Ghi chú giải trình chênh lệch khi nhận két" : "Ghi chú nhận bàn giao"}
            required={hasVarFromOut}
            error={fieldErrors.note}
            className={requirePin ? "mb-3" : "mb-0"}
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder={
                hasVarFromOut
                  ? "Bắt buộc nêu rõ lý do tiền đếm lại khác với số người giao khai báo…"
                  : "VD: Đã kiểm đếm đủ tiền lẻ và tiếp nhận quầy"
              }
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setFieldErrors((f) => ({ ...f, note: null }));
              }}
              disabled={busy || isSameInitiatorCashier}
            />
          </FormField>

          {requirePin ? (
            <FormField
              label={
                pickingAnotherPerson
                  ? "Mã PIN (4–6 số) của nhân viên nhận két"
                  : "Mã PIN cá nhân (4–6 số) xác nhận nhận két & tự Check-in"
              }
              required
              error={fieldErrors.pin}
              help="Xác nhận xong hệ thống sẽ tự động Check-in (với Thu ngân) và mở khóa lại quầy POS."
              className="mb-0"
            >
              <Form.Control
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setFieldErrors((f) => ({ ...f, pin: null }));
                  setApiError("");
                }}
                disabled={busy || isSameInitiatorCashier}
              />
            </FormField>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" variant="primary" disabled={busy || isSameInitiatorCashier}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận nhận két &amp; Mở lại POS
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal hủy yêu cầu bàn giao két đang chờ.
export function CancelHandoverModal({
  show,
  shift,
  userRole,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setReason("");
    setApiError("");
  }, [show, shift?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;
    setBusy(true);
    setApiError("");
    try {
      await shiftsApi.cancelHandover(shift.id, {
        reason: reason.trim() || null,
      });
      toast.success(
        userRole === "CASHIER"
          ? `Đã hủy yêu cầu bàn giao ca #${shift.id}, tự động Check-in lại và mở khóa POS.`
          : `Đã hủy yêu cầu bàn giao ca #${shift.id} và mở khóa POS trở lại.`,
      );
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      setApiError(err.message || "Không thể hủy yêu cầu bàn giao.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">Hủy yêu cầu bàn giao két #{shift?.id}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <p className="small text-muted-scms mb-3">
            Hủy phiếu bàn giao đang chờ để khôi phục quyền bán hàng POS và giao dịch két cho phiên ca hiện tại.
            {userRole === "CASHIER" ? " Nếu bạn là người vừa giao két, hệ thống sẽ tự động Check-in lại để bạn tiếp tục đứng quầy." : ""}
          </p>
          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}
          <FormField label="Lý do hủy bàn giao (tùy chọn)" className="mb-0">
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={300}
              placeholder="VD: Thu ngân tiếp tục ở lại đứng quầy / Nhập nhầm thao tác bàn giao…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </FormField>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Giữ nguyên chờ nhận
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận hủy bàn giao
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
