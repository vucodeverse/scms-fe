import { useEffect, useState } from "react";
import { Button, Form, InputGroup, Modal, Spinner } from "react-bootstrap";
import FormField from "../FormField.jsx";
import PinCodeBoxes from "../PinCodeBoxes.jsx";
import { useToast } from "../ToastContext.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { notifySecurityAlertsChanged } from "../../api/securityAlertsApi.js";
import { formatDate, formatDateTime, formatMoneyInput, formatVnd, parseMoneyDigits } from "../../lib/format.js";
import { SHIFT_TYPE_META, actorName, formatHm, formatSignedVnd } from "./shiftUtils.js";

const CASH_IN_PRESETS = [100000, 200000, 500000, 1000000];
const CASH_OUT_PRESETS = [200000, 500000, 1000000, 2000000];
const EARLY_CLOSE_GRACE_MS = 10 * 60 * 1000;

// Modal nạp tiền / rút tiền két trong ca đang mở (UC25, UC26, BR-32, BR-37).
export function CashAdjustmentModal({
  show,
  mode = "IN",
  shift,
  currentCashBalance = 0,
  userRole,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const isCashIn = mode === "IN";
  const pinOptional = userRole === "COO" || userRole === "BRANCH_MANAGER";

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setAmount("");
    setReason("");
    setManagerPin("");
    setFieldErrors({});
    setApiError("");
  }, [show, mode, shift?.id]);

  const parsedAmount = Number(amount);
  const presets = isCashIn ? CASH_IN_PRESETS : CASH_OUT_PRESETS;
  const projectedBalance =
    !Number.isNaN(parsedAmount) && parsedAmount > 0
      ? Number(currentCashBalance || 0) + (isCashIn ? parsedAmount : -parsedAmount)
      : Number(currentCashBalance || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const errs = {};
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount < 1) {
      errs.amount = "Số tiền phải lớn hơn 0 VNĐ.";
    } else if (!isCashIn && parsedAmount > Number(currentCashBalance || 0)) {
      errs.amount = `Số dư két hiện tại (${formatVnd(currentCashBalance)}) không đủ để rút.`;
    }
    if (!reason.trim()) {
      errs.reason = "Bắt buộc nhập lý do nạp/rút tiền (BR-37).";
    }
    if (!pinOptional && !managerPin.trim()) {
      errs.managerPin = "Bắt buộc nhập mã PIN Quản lý chi nhánh để duyệt (BR-32).";
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      const payload = {
        amount: parsedAmount,
        reason: reason.trim(),
        managerPin: managerPin.trim() || null,
      };
      if (isCashIn) {
        await shiftsApi.cashIn(shift.id, payload);
        toast.success(`Đã nạp ${formatVnd(parsedAmount)} vào két.`);
      } else {
        await shiftsApi.cashOut(shift.id, payload);
        toast.success(`Đã rút ${formatVnd(parsedAmount)} khỏi két.`);
      }
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("amount")) nextFields.amount = err.fieldError("amount");
      if (err.fieldError?.("reason")) nextFields.reason = err.fieldError("reason");
      if (err.fieldError?.("managerPin")) nextFields.managerPin = err.fieldError("managerPin");
      if (err.detailCode === "INVALID_MANAGER_PIN" || err.detailCode === "MANAGER_PIN_REQUIRED") {
        nextFields.managerPin = err.message;
      }
      if (err.detailCode === "INSUFFICIENT_CASH") {
        nextFields.amount = err.message;
      }
      setFieldErrors(nextFields);
      setApiError(err.message || "Không thực hiện được giao dịch két.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">{isCashIn ? "Nạp thêm tiền vào két" : "Rút bớt tiền khỏi két"}</Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="d-flex justify-content-between align-items-center p-2 mb-3" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }}>
            <span className="small text-muted-scms">
              {SHIFT_TYPE_META[shift?.shiftType]?.label || shift?.shiftType} #{shift?.id} · Số dư dự kiến hiện tại
            </span>
            <strong className="num">{formatVnd(currentCashBalance)}</strong>
          </div>

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <FormField label="Số tiền (VNĐ)" required error={fieldErrors.amount}>
            <InputGroup>
              <Form.Control
                type="text"
                inputMode="numeric"
                placeholder={isCashIn ? "VD: 200.000" : "VD: 500.000"}
                value={formatMoneyInput(amount)}
                onChange={(e) => {
                  setAmount(parseMoneyDigits(e.target.value));
                  setFieldErrors((f) => ({ ...f, amount: null }));
                  setApiError("");
                }}
                disabled={busy}
                autoFocus
              />
              <InputGroup.Text>VNĐ</InputGroup.Text>
            </InputGroup>
            <div className="d-flex gap-1 flex-wrap mt-2">
              {presets.map((val) => (
                <Button
                  key={val}
                  type="button"
                  size="sm"
                  variant={Number(amount) === val ? "primary" : "outline-secondary"}
                  onClick={() => {
                    setAmount(String(val));
                    setFieldErrors((f) => ({ ...f, amount: null }));
                  }}
                  disabled={busy}
                >
                  {new Intl.NumberFormat("vi-VN").format(val)} đ
                </Button>
              ))}
            </div>
          </FormField>

          {!Number.isNaN(parsedAmount) && parsedAmount > 0 ? (
            <div className="small text-muted-scms mb-3">
              Số dư két sau giao dịch: <strong className="num">{formatVnd(projectedBalance)}</strong>
            </div>
          ) : null}

          <FormField label="Lý do giao dịch" required error={fieldErrors.reason}>
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder={
                isCashIn
                  ? "VD: Nạp thêm tiền lẻ 10k, 20k để thối cho khách"
                  : "VD: Rút bớt tiền nộp về quỹ chi nhánh cuối buổi"
              }
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: null }));
              }}
              disabled={busy}
            />
          </FormField>

          <FormField
            label={pinOptional ? "Mã PIN Quản lý xác nhận thêm (tùy chọn)" : "Mã PIN Quản lý duyệt (BR-32)"}
            required={!pinOptional}
            error={fieldErrors.managerPin}
            help={
              pinOptional
                ? "Quản lý chi nhánh và COO có quyền nạp/rút trực tiếp không cần nhập PIN; có thể nhập PIN để ghi nhận xác thực 2 lớp."
                : "Dùng mã PIN cá nhân của Quản lý chi nhánh (hoặc COO của chi nhánh) để xác nhận 2 lớp."
            }
            className="mb-0"
          >
            <Form.Control
              type="password"
              maxLength={10}
              placeholder={pinOptional ? "Để trống hoặc nhập PIN…" : "Nhập mã PIN quản lý…"}
              value={managerPin}
              onChange={(e) => {
                setManagerPin(e.target.value);
                setFieldErrors((f) => ({ ...f, managerPin: null }));
              }}
              disabled={busy}
            />
          </FormField>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            {isCashIn ? "Xác nhận nạp tiền" : "Xác nhận rút tiền"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal đóng ca & kiểm kê đối soát két tiền (UC27, BR-38, BR-39).
// Thu ngân nhập lại PIN cá nhân để xác thực đóng ca & tự động Check-out.
export function CloseShiftModal({
  show,
  summary,
  userRole = null,
  isCheckedIn = false,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const shift = summary?.shift;
  const expectedCash = Number(summary?.currentCashBalance ?? shift?.expectedCash ?? shift?.openingCash ?? 0);
  const requirePin = userRole === "CASHIER";

  const [countedCash, setCountedCash] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const [earlyCloseReason, setEarlyCloseReason] = useState("");
  const [pin, setPin] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setCountedCash("");
    setDiscrepancyReason("");
    setEarlyCloseReason("");
    setPin("");
    setNowMs(Date.now());
    setFieldErrors({});
    setApiError("");
  }, [show, shift?.id]);

  useEffect(() => {
    if (!show) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, [show]);

  const parsedCounted = countedCash === "" ? NaN : Number(countedCash);
  const variance = !Number.isNaN(parsedCounted) ? parsedCounted - expectedCash : 0;
  const hasVariance = !Number.isNaN(parsedCounted) && Math.abs(variance) >= 0.01;
  const plannedEndMs = shift?.plannedEnd ? new Date(shift.plannedEnd).getTime() : NaN;
  const earlyGapMs = !Number.isNaN(plannedEndMs) ? plannedEndMs - nowMs : 0;
  const isEarlyClose = Boolean(requirePin && !Number.isNaN(plannedEndMs) && earlyGapMs > EARLY_CLOSE_GRACE_MS);
  const remainingEarlyMins = isEarlyClose ? Math.ceil(earlyGapMs / 60000) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const cleanPin = pin.trim();
    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Vui lòng nhập số tiền mặt thực đếm >= 0.";
    }
    if (hasVariance && !discrepancyReason.trim()) {
      errs.discrepancyReason = "Phát hiện chênh lệch két — bắt buộc nhập lý do giải trình (BR-38).";
    }
    if (requirePin) {
      if (!cleanPin) {
        errs.pin = "Vui lòng nhập mã PIN cá nhân (4 số) để xác nhận đóng ca & Check-out.";
      } else if (!/^[0-9]{4}$/.test(cleanPin)) {
        errs.pin = "Mã PIN phải gồm đủ 4 chữ số.";
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
      const savedShift = await shiftsApi.close(shift.id, {
        countedCash: parsedCounted,
        discrepancyReason: discrepancyReason.trim() || null,
        earlyCloseReason: isEarlyClose ? earlyCloseReason.trim() || null : null,
        ...(cleanPin ? { pin: cleanPin } : {}),
      });
      if (savedShift?.earlyClosePending) {
        notifySecurityAlertsChanged();
        toast.info(
          `Đã gửi yêu cầu đóng ca sớm #${shift.id} tới Quản lý chi nhánh. Màn hình đang chờ Quản lý xác nhận…`,
        );
        onClose?.();
        await onSuccess?.({ closed: false, earlyClosePending: true, shift: savedShift });
      } else {
        const checkOutNote = requirePin && isCheckedIn ? " & Check-out ca làm việc" : "";
        toast.success(
          hasVariance
            ? `Đã đóng ca #${shift.id}${checkOutNote} (chênh lệch ${formatSignedVnd(variance)}).`
            : `Đã đóng ca #${shift.id}${checkOutNote} — két khớp hoàn toàn.`,
        );
        onClose?.();
        await onSuccess?.({ closed: true, earlyClosePending: false, shift: savedShift });
      }
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("countedCash")) nextFields.countedCash = err.fieldError("countedCash");
      if (err.fieldError?.("discrepancyReason")) nextFields.discrepancyReason = err.fieldError("discrepancyReason");
      if (err.fieldError?.("earlyCloseReason")) nextFields.earlyCloseReason = err.fieldError("earlyCloseReason");
      if (err.fieldError?.("pin")) nextFields.pin = err.fieldError("pin");
      if (err.detailCode === "REASON_REQUIRED") {
        nextFields.discrepancyReason = err.message;
      }
      if (err.code === "INVALID_PIN" || err.code === "PIN_LOCKED") {
        nextFields.pin = err.message;
      }
      setFieldErrors(nextFields);
      setApiError(err.message || "Không đóng được ca làm việc.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">
          Đóng ca &amp; Đối soát két · {SHIFT_TYPE_META[shift?.shiftType]?.label || shift?.shiftType} #{shift?.id}
        </Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="small text-muted-scms mb-3">
            Ngày {formatDate(shift?.shiftDate)} · Kiểm đếm tiền mặt thực tế trong két và đối chiếu với sổ sách theo quy định BR-38.
          </div>

          {shift?.handoverPending ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Ca đang có phiếu <strong>bàn giao két chờ nhận</strong>. Khi Quản lý/COO xác nhận đóng hẳn ca, phiếu bàn giao đang chờ sẽ tự động hủy để chốt sổ ca này.
              </span>
            </div>
          ) : null}

          {isEarlyClose ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                <strong>Đóng ca sớm hơn 10 phút so với giờ dự kiến</strong> (còn khoảng{" "}
                <strong>{remainingEarlyMins} phút</strong> đến mốc kết ca <strong>{formatHm(shift?.plannedEnd)}</strong>).
                Sau khi gửi kiểm két &amp; PIN, hệ thống sẽ <strong>gửi thông báo tới Quản lý chi nhánh</strong> và giữ màn hình{" "}
                <strong>chờ Quản lý xác nhận</strong> rồi mới chốt Check-out, đóng ca và tự động đăng xuất về màn hình PIN.
              </span>
            </div>
          ) : null}

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <div className="p-3 mb-3" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
            <div className="stat-line">
              <span className="text-muted-scms">Tiền mặt đầu ca</span>
              <strong>{formatVnd(summary?.openingCash)}</strong>
            </div>
            <div className="stat-line">
              <span className="text-muted-scms">+ Thu bán hàng tiền mặt</span>
              <strong>{formatVnd(summary?.cashRevenue)}</strong>
            </div>
            <div className="stat-line">
              <span className="text-muted-scms">+ Nạp tiền két</span>
              <strong>{formatVnd(summary?.totalCashIn)}</strong>
            </div>
            <div className="stat-line">
              <span className="text-muted-scms">− Rút tiền két</span>
              <strong>{formatVnd(summary?.totalCashOut)}</strong>
            </div>
            <div className="stat-line">
              <span className="text-muted-scms">− Hoàn tiền mặt</span>
              <strong>{formatVnd(summary?.totalRefundOut)}</strong>
            </div>
            <div className="scms-divider my-2" />
            <div className="stat-line" style={{ fontSize: 14 }}>
              <strong>Số dư tiền mặt dự kiến trong két</strong>
              <strong>{formatVnd(expectedCash)}</strong>
            </div>
            <div className="stat-line text-muted-scms" style={{ paddingTop: 2 }}>
              <span>Doanh thu chuyển khoản (VietQR — không nằm trong két)</span>
              <span>{formatVnd(summary?.transferRevenue)}</span>
            </div>
          </div>

          <FormField label="Số tiền mặt thực tế kiểm đếm được (VNĐ)" required error={fieldErrors.countedCash}>
            <div className="d-flex gap-2">
              <InputGroup>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  placeholder="Nhập số tiền thực đếm trong két…"
                  value={formatMoneyInput(countedCash)}
                  onChange={(e) => {
                    setCountedCash(parseMoneyDigits(e.target.value));
                    setFieldErrors((f) => ({ ...f, countedCash: null, discrepancyReason: null }));
                    setApiError("");
                  }}
                  disabled={busy}
                  autoFocus
                />
                <InputGroup.Text>VNĐ</InputGroup.Text>
              </InputGroup>
              <Button
                type="button"
                variant="outline-secondary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => {
                  setCountedCash(String(Math.round(expectedCash)));
                  setFieldErrors((f) => ({ ...f, countedCash: null, discrepancyReason: null }));
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
                    Chênh lệch so với dự kiến: <strong>{formatSignedVnd(variance)}</strong> (
                    {variance > 0 ? "Thừa tiền trong két" : "Thiếu tiền trong két"}). Vui lòng ghi rõ nguyên nhân bên dưới.
                  </>
                ) : (
                  <>Khớp hoàn toàn với số dư sổ sách ({formatVnd(expectedCash)}).</>
                )}
              </span>
            </div>
          ) : null}

          <FormField
            label="Lý do giải trình chênh lệch"
            required={hasVariance}
            error={fieldErrors.discrepancyReason}
            help={
              hasVariance
                ? "Bắt buộc theo BR-38 khi tiền thực đếm khác tiền dự kiến."
                : "Không bắt buộc khi tiền két khớp."
            }
            className={requirePin ? "mb-3" : "mb-0"}
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder="VD: Thối nhầm 10.000 đ cho khách / Khách bo để lại quầy…"
              value={discrepancyReason}
              onChange={(e) => {
                setDiscrepancyReason(e.target.value);
                setFieldErrors((f) => ({ ...f, discrepancyReason: null }));
              }}
              disabled={busy}
            />
          </FormField>

          {isEarlyClose ? (
            <FormField
              label="Lý do xin đóng ca sớm (gửi Quản lý chi nhánh duyệt)"
              error={fieldErrors.earlyCloseReason}
              help="Tùy chọn — giúp Quản lý nắm lý do đóng ca sớm hơn giờ kết thúc dự kiến."
              className="mb-3"
            >
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={500}
                placeholder="VD: Cửa hàng vắng khách sớm / Sự cố điện nước cần đóng cửa sớm…"
                value={earlyCloseReason}
                onChange={(e) => {
                  setEarlyCloseReason(e.target.value);
                  setFieldErrors((f) => ({ ...f, earlyCloseReason: null }));
                }}
                disabled={busy}
              />
            </FormField>
          ) : null}

          {requirePin ? (
            <FormField
              label={
                isCheckedIn
                  ? "Mã PIN Thu ngân (4 số) để đóng ca & Check-out"
                  : "Mã PIN Thu ngân (4 số) xác nhận đóng ca"
              }
              required
              error={fieldErrors.pin}
              help={
                isEarlyClose
                  ? "Nhập PIN cá nhân để gửi yêu cầu đóng ca sớm; Check-out sẽ tự động hoàn tất ngay khi Quản lý xác nhận."
                  : isCheckedIn
                    ? "Nhập lại mã PIN cá nhân của bạn để xác nhận đóng ca két và tự động Check-out kết thúc ca làm việc."
                    : "Nhập lại mã PIN cá nhân của bạn để xác nhận đóng ca két."
              }
              className="mb-0"
            >
              <PinCodeBoxes
                value={pin}
                onChange={(nextPin) => {
                  setPin(nextPin);
                  setFieldErrors((f) => ({ ...f, pin: null }));
                  setApiError("");
                }}
                disabled={busy}
                isInvalid={Boolean(fieldErrors.pin)}
                ariaLabel="Mã PIN Thu ngân đóng ca 4 số"
              />
            </FormField>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            {isEarlyClose
              ? "Gửi yêu cầu đóng ca sớm & Chờ Quản lý duyệt"
              : requirePin && isCheckedIn
                ? "Xác nhận đóng ca & Check-out"
                : "Xác nhận đóng ca"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal Quản lý chi nhánh / COO xác nhận duyệt yêu cầu đóng ca sớm từ Thu ngân.
export function ApproveEarlyCloseModal({
  show,
  summary,
  employeeMap = {},
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const shift = summary?.shift;
  const expectedCash = Number(summary?.currentCashBalance ?? shift?.expectedCash ?? shift?.openingCash ?? 0);
  const requestedCounted =
    shift?.earlyCloseCountedCash !== null && shift?.earlyCloseCountedCash !== undefined
      ? Number(shift.earlyCloseCountedCash)
      : expectedCash;

  const [countedCash, setCountedCash] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show || !shift) return;
    setCountedCash(String(Math.round(requestedCounted)));
    setDiscrepancyReason(shift.earlyCloseDiscrepancyReason || "");
    setApproveNote("");
    setFieldErrors({});
    setApiError("");
  }, [show, shift, requestedCounted]);

  const parsedCounted = countedCash === "" ? NaN : Number(countedCash);
  const variance = !Number.isNaN(parsedCounted) ? parsedCounted - expectedCash : 0;
  const hasVariance = !Number.isNaN(parsedCounted) && Math.abs(variance) >= 0.01;
  const requesterName =
    shift?.earlyCloseRequestedByName || actorName(shift?.earlyCloseRequestedBy, employeeMap);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Số tiền kiểm đếm thực tế phải >= 0.";
    }
    if (hasVariance && !discrepancyReason.trim()) {
      errs.discrepancyReason = "Phát hiện chênh lệch két — bắt buộc nhập giải trình (BR-38).";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      await shiftsApi.approveEarlyClose(shift.id, {
        countedCash: parsedCounted,
        discrepancyReason: discrepancyReason.trim() || null,
        approveNote: approveNote.trim() || null,
      });
      notifySecurityAlertsChanged();
      toast.success(`Đã xác nhận đóng ca sớm #${shift.id} & tự động Check-out Thu ngân.`);
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("countedCash")) nextFields.countedCash = err.fieldError("countedCash");
      if (err.fieldError?.("discrepancyReason")) nextFields.discrepancyReason = err.fieldError("discrepancyReason");
      if (err.detailCode === "REASON_REQUIRED") {
        nextFields.discrepancyReason = err.message;
      }
      setFieldErrors(nextFields);
      setApiError(err.message || "Không xác nhận duyệt đóng ca sớm được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">Xác nhận đóng ca sớm · Ca #{shift?.id}</Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="p-3 mb-3" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
            <div className="small">
              <div>
                <span className="text-muted-scms">Thu ngân gửi yêu cầu: </span>
                <strong>{requesterName}</strong>
                {shift?.earlyCloseRequestedAt ? (
                  <span className="text-muted-scms"> · lúc {formatDateTime(shift.earlyCloseRequestedAt)}</span>
                ) : null}
              </div>
              <div className="mt-1">
                <span className="text-muted-scms">Giờ kết ca dự kiến: </span>
                <strong>{formatHm(shift?.plannedEnd)}</strong>
                {" · "}
                <span className="text-muted-scms">Dự kiến két sổ sách: </span>
                <strong>{formatVnd(expectedCash)}</strong>
              </div>
              <div className="mt-1">
                <span className="text-muted-scms">Số tiền Thu ngân kiểm đếm khai báo: </span>
                <strong>{formatVnd(requestedCounted)}</strong>
              </div>
              {shift?.earlyCloseReason ? (
                <div className="mt-1">
                  <span className="text-muted-scms">Lý do xin đóng ca sớm: </span>
                  <strong>{shift.earlyCloseReason}</strong>
                </div>
              ) : null}
            </div>
          </div>

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <FormField
            label="Số tiền thực tế chốt đóng ca (VNĐ)"
            required
            error={fieldErrors.countedCash}
            help="Mặc định giữ nguyên số tiền Thu ngân đã kiểm đếm; Quản lý có thể điều chỉnh nếu đếm lại cùng quầy."
          >
            <InputGroup>
              <Form.Control
                type="text"
                inputMode="numeric"
                value={formatMoneyInput(countedCash)}
                onChange={(e) => {
                  setCountedCash(parseMoneyDigits(e.target.value));
                  setFieldErrors((f) => ({ ...f, countedCash: null, discrepancyReason: null }));
                  setApiError("");
                }}
                disabled={busy}
              />
              <InputGroup.Text>VNĐ</InputGroup.Text>
            </InputGroup>
          </FormField>

          {!Number.isNaN(parsedCounted) ? (
            <div
              className={`notice mb-3 ${hasVariance ? "notice--warn" : ""}`}
              style={!hasVariance ? { background: "var(--success-soft)", borderColor: "#bcc7b5" } : undefined}
            >
              <strong>{hasVariance ? "!" : "✓"}</strong>
              <span>
                {hasVariance
                  ? `Chênh lệch kết ca: ${formatSignedVnd(variance)}.`
                  : `Khớp hoàn toàn với sổ sách (${formatVnd(expectedCash)}).`}
              </span>
            </div>
          ) : null}

          <FormField
            label="Giải trình chênh lệch (BR-38)"
            required={hasVariance}
            error={fieldErrors.discrepancyReason}
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder="Ghi chú giải trình chênh lệch tiền mặt két…"
              value={discrepancyReason}
              onChange={(e) => {
                setDiscrepancyReason(e.target.value);
                setFieldErrors((f) => ({ ...f, discrepancyReason: null }));
              }}
              disabled={busy}
            />
          </FormField>

          <FormField
            label="Ghi chú phê duyệt của Quản lý (tùy chọn)"
            help="Khi bấm Xác nhận, hệ thống sẽ đóng ca ngay, cập nhật Check-out Thu ngân và tự động đăng xuất màn Thu ngân về màn hình PIN."
            className="mb-0"
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder="VD: Đã kiểm két trực tiếp cùng Thu ngân, đồng ý đóng ca sớm."
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              disabled={busy}
            />
          </FormField>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Để sau
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận đóng ca sớm &amp; Check-out Thu ngân
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal Quản lý từ chối hoặc Thu ngân tự hủy yêu cầu đóng ca sớm để tiếp tục vận hành ca.
export function RejectEarlyCloseModal({
  show,
  shift,
  isSelfCancel = false,
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
      await shiftsApi.rejectEarlyClose(shift.id, { reason: reason.trim() || null });
      notifySecurityAlertsChanged();
      toast.info(
        isSelfCancel
          ? `Đã hủy yêu cầu đóng ca sớm #${shift.id} — quầy POS đã mở khóa trở lại.`
          : `Đã từ chối yêu cầu đóng ca sớm #${shift.id} — mở lại ca bán hàng.`,
      );
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      setApiError(err.message || "Không hủy/từ chối được yêu cầu đóng ca sớm.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">
          {isSelfCancel ? "Hủy yêu cầu đóng ca sớm" : "Từ chối yêu cầu đóng ca sớm"}
        </Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              {isSelfCancel
                ? `Hủy yêu cầu chờ duyệt cho Ca #${shift?.id} để mở khóa lại quầy POS và tiếp tục bán hàng bình thường.`
                : `Từ chối yêu cầu đóng ca sớm Ca #${shift?.id}; ca vẫn giữ trạng thái Đang mở và Thu ngân có thể tiếp tục bán hàng trên POS.`}
            </span>
          </div>

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <FormField label={isSelfCancel ? "Lý do hủy (tùy chọn)" : "Lý do từ chối (tùy chọn)"} className="mb-0">
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder={
                isSelfCancel
                  ? "VD: Khách lại đông trở lại, tiếp tục mở ca bán hàng"
                  : "VD: Chưa đến giờ đóng ca, tiếp tục trực quầy theo lịch"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </FormField>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Quay lại
          </Button>
          <Button type="submit" variant={isSelfCancel ? "primary" : "danger"} disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            {isSelfCancel ? "Xác nhận hủy & Mở lại POS" : "Từ chối đóng ca sớm"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
