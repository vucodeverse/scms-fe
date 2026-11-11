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
      errs.reason = "Bắt buộc nhập lý do nạp/rút tiền.";
    }
    if (!pinOptional && !managerPin.trim()) {
      errs.managerPin = "Bắt buộc nhập mã PIN Quản lý chi nhánh để duyệt.";
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
            label={pinOptional ? "Mã PIN Quản lý xác nhận thêm (tùy chọn)" : "Mã PIN Quản lý duyệt"}
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
// Thu ngân có thể chọn Bàn giao két cuối ca cho Quản lý (Check-out ngay, chờ Quản lý nhận két & rút cất két)
// hoặc đóng ca trực tiếp; nhập PIN cá nhân để xác thực.
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
  const [handoverToManager, setHandoverToManager] = useState(false);
  const [handoverReason, setHandoverReason] = useState("");
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
    setHandoverToManager(Boolean(userRole === "CASHIER" && shift?.shiftType === "NIGHT"));
    setHandoverReason("");
    setPin("");
    setNowMs(Date.now());
    setFieldErrors({});
    setApiError("");
  }, [show, shift?.id, shift?.shiftType, userRole]);

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
  const isManagerHandoverMode = Boolean(requirePin && handoverToManager);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const cleanPin = pin.trim();
    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Vui lòng nhập số tiền mặt thực đếm >= 0.";
    }
    if (hasVariance && !discrepancyReason.trim()) {
      errs.discrepancyReason = "Phát hiện chênh lệch két — bắt buộc nhập lý do giải trình.";
    }
    if (requirePin) {
      if (!cleanPin) {
        errs.pin = isManagerHandoverMode
          ? "Vui lòng nhập mã PIN cá nhân (4 số) để bàn giao két cuối ca & Check-out."
          : "Vui lòng nhập mã PIN cá nhân (4 số) để xác nhận đóng ca & Check-out.";
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
        handoverToManager: isManagerHandoverMode,
        handoverReason: isManagerHandoverMode ? handoverReason.trim() || null : null,
        ...(cleanPin ? { pin: cleanPin } : {}),
      });
      if (savedShift?.managerClosePending) {
        notifySecurityAlertsChanged();
        toast.success(
          `Đã bàn giao két ca #${shift.id} (${formatVnd(parsedCounted)}) chờ Quản lý xác nhận nhận tiền & tự động Check-out.`,
        );
        onClose?.();
        await onSuccess?.({
          closed: false,
          earlyClosePending: false,
          managerClosePending: true,
          shift: savedShift,
        });
      } else if (savedShift?.earlyClosePending) {
        notifySecurityAlertsChanged();
        toast.info(
          `Đã gửi yêu cầu đóng ca sớm #${shift.id} tới Quản lý chi nhánh. Màn hình đang chờ Quản lý xác nhận…`,
        );
        onClose?.();
        await onSuccess?.({
          closed: false,
          earlyClosePending: true,
          managerClosePending: false,
          shift: savedShift,
        });
      } else {
        const checkOutNote = requirePin && isCheckedIn ? " & Check-out ca làm việc" : "";
        toast.success(
          hasVariance
            ? `Đã đóng ca #${shift.id}${checkOutNote} (chênh lệch ${formatSignedVnd(variance)}).`
            : `Đã đóng ca #${shift.id}${checkOutNote} — két khớp hoàn toàn.`,
        );
        onClose?.();
        await onSuccess?.({
          closed: true,
          earlyClosePending: false,
          managerClosePending: false,
          shift: savedShift,
        });
      }
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("countedCash")) nextFields.countedCash = err.fieldError("countedCash");
      if (err.fieldError?.("discrepancyReason")) nextFields.discrepancyReason = err.fieldError("discrepancyReason");
      if (err.fieldError?.("earlyCloseReason")) nextFields.earlyCloseReason = err.fieldError("earlyCloseReason");
      if (err.fieldError?.("handoverReason")) nextFields.handoverReason = err.fieldError("handoverReason");
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
            Ngày {formatDate(shift?.shiftDate)} · Kiểm đếm tiền mặt thực tế trong két và đối chiếu với sổ sách.
          </div>

          {shift?.handoverPending ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>
                Ca đang có phiếu <strong>bàn giao két chờ nhận</strong>. Khi Quản lý/COO xác nhận đóng hẳn ca, phiếu bàn giao đang chờ sẽ tự động hủy để chốt sổ ca này.
              </span>
            </div>
          ) : null}

          {requirePin ? (
            <div
              className="p-3 mb-3"
              style={{
                background: isManagerHandoverMode ? "#f5f8ff" : "var(--paper)",
                border: isManagerHandoverMode ? "1px solid #bfdbfe" : "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <Form.Check
                type="switch"
                id="close-handover-to-manager-switch"
                checked={handoverToManager}
                onChange={(e) => setHandoverToManager(e.target.checked)}
                disabled={busy}
                label={
                  <span style={{ fontWeight: 600 }}>
                    Bàn giao két cuối ca cho Quản lý xác nhận nhận tiền (có thể rút tiền cất két)
                  </span>
                }
              />
              <div className="small text-muted-scms mt-1" style={{ paddingLeft: "2.25em" }}>
                {isManagerHandoverMode ? (
                  <>
                    Khi xác nhận kiểm két &amp; PIN, hệ thống sẽ{" "}
                    <strong>Check-out bạn ngay lập tức</strong>, tạm khóa POS chờ Quản lý kiểm lại tiền &amp; rút tiền về két Quản lý (hoặc giữ nguyên két cho sáng hôm sau) và{" "}
                    <strong>tự động đăng xuất</strong> màn hình về giao diện PIN. Dùng được cho cả ca tối hoặc khi kết thúc ca cuối cùng trong ngày.
                  </>
                ) : (
                  "Bật lựa chọn này nếu bạn đóng ca cuối ngày (kể cả ngày chỉ mở 1 ca) và cần bàn giao tiền mặt trong két lại cho Quản lý xác nhận."
                )}
              </div>
            </div>
          ) : null}

          {!isManagerHandoverMode && isEarlyClose ? (
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
                ? "Bắt buộc nhập giải trình khi tiền thực đếm khác tiền dự kiến."
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

          {isManagerHandoverMode ? (
            <FormField
              label="Ghi chú bàn giao cuối ca cho Quản lý (tùy chọn)"
              error={fieldErrors.handoverReason}
              help="VD: Bàn giao két cuối ngày, báo Quản lý số tiền để lại quầy hoặc nhờ rút bớt cất két."
              className="mb-3"
            >
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={500}
                placeholder="VD: Chốt két cuối ngày chờ Quản lý kiểm nhận & cất két…"
                value={handoverReason}
                onChange={(e) => {
                  setHandoverReason(e.target.value);
                  setFieldErrors((f) => ({ ...f, handoverReason: null }));
                }}
                disabled={busy}
              />
            </FormField>
          ) : null}

          {!isManagerHandoverMode && isEarlyClose ? (
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
                isManagerHandoverMode
                  ? "Mã PIN Thu ngân (4 số) để bàn giao két & Check-out"
                  : isCheckedIn
                    ? "Mã PIN Thu ngân (4 số) để đóng ca & Check-out"
                    : "Mã PIN Thu ngân (4 số) xác nhận đóng ca"
              }
              required
              error={fieldErrors.pin}
              help={
                isManagerHandoverMode
                  ? "Nhập PIN cá nhân để gửi bàn giao két cuối ca cho Quản lý; ca làm việc của bạn sẽ tự động Check-out ngay lập tức."
                  : isEarlyClose
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
            {isManagerHandoverMode
              ? "Bàn giao két Quản lý & Check-out"
              : isEarlyClose
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
      errs.discrepancyReason = "Phát hiện chênh lệch két — bắt buộc nhập giải trình.";
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
            label="Giải trình chênh lệch"
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

// Modal Quản lý chi nhánh / COO xác nhận nhận bàn giao két cuối ca, cho phép rút tiền cất két Quản lý & chốt đóng ca.
export function ApproveManagerCloseModal({
  show,
  summary,
  employeeMap = {},
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const shift = summary?.shift;
  const pendingHandover =
    shift?.pendingHandover?.handoverType === "MANAGER_CLOSE"
      ? shift.pendingHandover
      : (summary?.handovers || []).find(
          (h) => h.status === "PENDING_RECEIVE" && h.handoverType === "MANAGER_CLOSE",
        ) || shift?.pendingHandover;

  const expectedCash = Number(
    pendingHandover?.expectedCashAtOut ??
      summary?.currentCashBalance ??
      shift?.expectedCash ??
      shift?.openingCash ??
      0,
  );
  const outgoingCounted = Number(pendingHandover?.outgoingCountedCash ?? expectedCash);

  const [countedCash, setCountedCash] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("0");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show || !shift) return;
    setCountedCash(String(Math.round(outgoingCounted)));
    setWithdrawAmount("0");
    setWithdrawReason("");
    setDiscrepancyReason(pendingHandover?.outgoingNote || "");
    setApproveNote("");
    setFieldErrors({});
    setApiError("");
  }, [show, shift, outgoingCounted, pendingHandover?.outgoingNote]);

  const parsedCounted = countedCash === "" ? NaN : Number(countedCash);
  const parsedWithdraw = withdrawAmount === "" ? 0 : Number(withdrawAmount);
  const varFromOut = !Number.isNaN(parsedCounted) ? parsedCounted - outgoingCounted : 0;
  const varFromBook = !Number.isNaN(parsedCounted) ? parsedCounted - expectedCash : 0;
  const hasVarFromOut = !Number.isNaN(parsedCounted) && Math.abs(varFromOut) >= 0.01;
  const hasVarFromBook = !Number.isNaN(parsedCounted) && Math.abs(varFromBook) >= 0.01;
  const requiresDiscrepancyReason =
    hasVarFromOut || (hasVarFromBook && !String(pendingHandover?.outgoingNote || "").trim());
  const validWithdraw =
    !Number.isNaN(parsedWithdraw) &&
    parsedWithdraw >= 0 &&
    !Number.isNaN(parsedCounted) &&
    parsedWithdraw <= parsedCounted;
  const remainingClosingCash =
    !Number.isNaN(parsedCounted) && validWithdraw ? parsedCounted - parsedWithdraw : null;

  const cashierName =
    pendingHandover?.fromUserName || actorName(pendingHandover?.fromUserId ?? shift?.activeCashierId, employeeMap);
  const withdrawPresets = [0, 500000, 1000000, 2000000, 3000000, 5000000].filter(
    (v) => v === 0 || (!Number.isNaN(parsedCounted) && v <= parsedCounted),
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Vui lòng nhập số tiền mặt kiểm nhận >= 0.";
    }
    if (Number.isNaN(parsedWithdraw) || parsedWithdraw < 0) {
      errs.withdrawAmount = "Số tiền rút cất két phải >= 0.";
    } else if (!Number.isNaN(parsedCounted) && parsedWithdraw > parsedCounted) {
      errs.withdrawAmount = `Không thể rút quá số tiền thực đếm trong két (${formatVnd(parsedCounted)}).`;
    }
    if (requiresDiscrepancyReason && !discrepancyReason.trim()) {
      errs.discrepancyReason = hasVarFromOut
        ? "Số kiểm nhận lệch so với số Thu ngân bàn giao — vui lòng nhập lý do."
        : "Phát hiện chênh lệch két — bắt buộc nhập giải trình.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      await shiftsApi.approveManagerClose(shift.id, {
        countedCash: parsedCounted,
        withdrawAmount: parsedWithdraw > 0 ? parsedWithdraw : 0,
        withdrawReason: parsedWithdraw > 0 ? withdrawReason.trim() || null : null,
        discrepancyReason: discrepancyReason.trim() || null,
        approveNote: approveNote.trim() || null,
      });
      notifySecurityAlertsChanged();
      toast.success(
        parsedWithdraw > 0
          ? `Đã nhận két ca #${shift.id}, rút ${formatVnd(parsedWithdraw)} cất két Quản lý — lưu két ${formatVnd(parsedCounted - parsedWithdraw)}.`
          : `Đã nhận két ca #${shift.id} & đóng ca — lưu két ${formatVnd(parsedCounted)}.`,
      );
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      const nextFields = {};
      if (err.fieldError?.("countedCash")) nextFields.countedCash = err.fieldError("countedCash");
      if (err.fieldError?.("withdrawAmount")) nextFields.withdrawAmount = err.fieldError("withdrawAmount");
      if (err.fieldError?.("discrepancyReason")) nextFields.discrepancyReason = err.fieldError("discrepancyReason");
      if (err.detailCode === "REASON_REQUIRED") {
        nextFields.discrepancyReason = err.message;
      }
      if (err.detailCode === "INSUFFICIENT_CASH") {
        nextFields.withdrawAmount = err.message;
      }
      setFieldErrors(nextFields);
      setApiError(err.message || "Không xác nhận nhận két cuối ca được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">Xác nhận nhận két cuối ca &amp; Đóng ca · Ca #{shift?.id}</Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="p-3 mb-3" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
            <div className="small">
              <div>
                <span className="text-muted-scms">Thu ngân bàn giao &amp; đã Check-out: </span>
                <strong>{cashierName}</strong>
                {pendingHandover?.outgoingAt ? (
                  <span className="text-muted-scms"> · lúc {formatDateTime(pendingHandover.outgoingAt)}</span>
                ) : null}
              </div>
              <div className="mt-1">
                <span className="text-muted-scms">Số dư sổ sách két: </span>
                <strong>{formatVnd(expectedCash)}</strong>
                {" · "}
                <span className="text-muted-scms">Thu ngân khai báo thực đếm bàn giao: </span>
                <strong>{formatVnd(outgoingCounted)}</strong>
              </div>
              {pendingHandover?.outgoingNote ? (
                <div className="mt-1">
                  <span className="text-muted-scms">Giải trình chênh lệch của Thu ngân: </span>
                  <strong>{pendingHandover.outgoingNote}</strong>
                </div>
              ) : null}
              {pendingHandover?.reason ? (
                <div className="mt-1">
                  <span className="text-muted-scms">Ghi chú bàn giao: </span>
                  <strong>{pendingHandover.reason}</strong>
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
            label="Số tiền Quản lý kiểm đếm thực tế khi nhận két (VNĐ)"
            required
            error={fieldErrors.countedCash}
            help="Mặc định khớp số tiền Thu ngân bàn giao; có thể chỉnh lại nếu đếm thực tế khác."
          >
            <InputGroup>
              <Form.Control
                type="text"
                inputMode="numeric"
                value={formatMoneyInput(countedCash)}
                onChange={(e) => {
                  setCountedCash(parseMoneyDigits(e.target.value));
                  setFieldErrors((f) => ({ ...f, countedCash: null, withdrawAmount: null, discrepancyReason: null }));
                  setApiError("");
                }}
                disabled={busy}
              />
              <InputGroup.Text>VNĐ</InputGroup.Text>
            </InputGroup>
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
                    Lệch so với số Thu ngân giao: <strong>{formatSignedVnd(varFromOut)}</strong>{" "}
                    {hasVarFromBook ? `(so với sổ sách: ${formatSignedVnd(varFromBook)})` : "(khớp sổ sách)"}.
                  </>
                ) : hasVarFromBook ? (
                  <>
                    Khớp số Thu ngân bàn giao · Chênh lệch sổ sách <strong>{formatSignedVnd(varFromBook)}</strong> sẽ được giữ nguyên sau khi rút cất két.
                  </>
                ) : (
                  <>Khớp 100% với số Thu ngân bàn giao và sổ sách ({formatVnd(expectedCash)}).</>
                )}
              </span>
            </div>
          ) : null}

          <FormField
            label="Rút bớt tiền cất két Quản lý ngay khi đóng ca (VNĐ)"
            error={fieldErrors.withdrawAmount}
            help="Nhập 0 nếu để toàn bộ tiền mặt lại ngăn kéo cho ca sáng hôm sau."
          >
            <InputGroup>
              <Form.Control
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatMoneyInput(withdrawAmount)}
                onChange={(e) => {
                  const digits = parseMoneyDigits(e.target.value);
                  setWithdrawAmount(digits === "" ? "0" : digits);
                  setFieldErrors((f) => ({ ...f, withdrawAmount: null }));
                  setApiError("");
                }}
                disabled={busy}
              />
              <InputGroup.Text>VNĐ</InputGroup.Text>
            </InputGroup>
            <div className="d-flex gap-1 flex-wrap mt-2">
              {withdrawPresets.map((val) => (
                <Button
                  key={val}
                  type="button"
                  size="sm"
                  variant={Number(withdrawAmount || 0) === val ? "primary" : "outline-secondary"}
                  onClick={() => {
                    setWithdrawAmount(String(val));
                    setFieldErrors((f) => ({ ...f, withdrawAmount: null }));
                  }}
                  disabled={busy}
                >
                  {val === 0 ? "Không rút (0 đ)" : `${new Intl.NumberFormat("vi-VN").format(val)} đ`}
                </Button>
              ))}
              {!Number.isNaN(parsedCounted) && parsedCounted > 2000000 ? (
                <Button
                  type="button"
                  size="sm"
                  variant={
                    Number(withdrawAmount || 0) === parsedCounted - 2000000
                      ? "primary"
                      : "outline-secondary"
                  }
                  onClick={() => {
                    setWithdrawAmount(String(parsedCounted - 2000000));
                    setFieldErrors((f) => ({ ...f, withdrawAmount: null }));
                  }}
                  disabled={busy}
                >
                  Giữ két 2.000.000 đ (rút {new Intl.NumberFormat("vi-VN").format(parsedCounted - 2000000)} đ)
                </Button>
              ) : null}
            </div>
          </FormField>

          {!Number.isNaN(parsedCounted) && remainingClosingCash !== null ? (
            <div
              className="p-3 mb-3"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}
            >
              <div className="stat-line">
                <span className="text-muted-scms">Quản lý kiểm đếm thực nhận</span>
                <strong className="num">{formatVnd(parsedCounted)}</strong>
              </div>
              <div className="stat-line">
                <span className="text-muted-scms">− Rút tiền cất két Quản lý (CASH_OUT)</span>
                <strong className="num">−{formatVnd(parsedWithdraw)}</strong>
              </div>
              <div className="scms-divider my-2" />
              <div className="stat-line" style={{ fontSize: 14.5 }}>
                <strong>Tiền mặt lưu két chuyển ca tiếp theo</strong>
                <strong className="num">{formatVnd(remainingClosingCash)}</strong>
              </div>
            </div>
          ) : null}

          {parsedWithdraw > 0 ? (
            <FormField
              label="Lý do rút tiền cất két (tùy chọn)"
              className="mb-3"
            >
              <Form.Control
                type="text"
                maxLength={500}
                placeholder="VD: Rút tiền cuối ngày cất két Quản lý, chừa tiền lẻ tại quầy"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                disabled={busy}
              />
            </FormField>
          ) : null}

          <FormField
            label="Giải trình chênh lệch"
            required={requiresDiscrepancyReason}
            error={fieldErrors.discrepancyReason}
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder="Ghi chú giải trình nếu số kiểm nhận lệch Thu ngân hoặc lệch sổ sách…"
              value={discrepancyReason}
              onChange={(e) => {
                setDiscrepancyReason(e.target.value);
                setFieldErrors((f) => ({ ...f, discrepancyReason: null }));
              }}
              disabled={busy}
            />
          </FormField>

          <FormField
            label="Ghi chú xác nhận nhận két (tùy chọn)"
            help="Khi xác nhận, lịch sử bàn giao sẽ ghi hoàn tất (Thu ngân → Quản lý), tự động ghi phiếu rút cất két (nếu > 0) và chốt đóng ca."
            className="mb-0"
          >
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder="VD: Đã nhận đủ tiền từ Thu ngân cuối ca."
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
            {parsedWithdraw > 0
              ? `Xác nhận nhận két, Rút ${formatVnd(parsedWithdraw)} & Đóng ca`
              : "Xác nhận nhận két & Đóng ca"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal Quản lý trả lại ca chờ nhận két để tiếp tục bán hàng trên POS.
export function RejectManagerCloseModal({
  show,
  shift,
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
      await shiftsApi.rejectManagerClose(shift.id, { reason: reason.trim() || null });
      notifySecurityAlertsChanged();
      toast.info(`Đã trả lại Ca #${shift.id} — mở lại quầy POS để tiếp tục bán hàng hoặc kiểm đếm lại.`);
      onClose?.();
      await onSuccess?.();
    } catch (err) {
      setApiError(err.message || "Không trả lại ca được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">Trả lại ca &amp; Mở lại POS · Ca #{shift?.id}</Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              Hủy phiếu bàn giao chờ Quản lý nhận cho Ca #{shift?.id}; ca giữ trạng thái <strong>Đang mở</strong> và mở khóa lại quầy POS để kiểm đếm lại hoặc tiếp tục bán hàng.
            </span>
          </div>

          {apiError ? (
            <div className="notice notice--warn mb-3">
              <strong>!</strong>
              <span>{apiError}</span>
            </div>
          ) : null}

          <FormField label="Lý do trả lại ca (tùy chọn)" className="mb-0">
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder="VD: Vẫn còn khách gọi thêm món / Kiểm đếm nhầm số tờ tiền…"
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
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận trả lại ca
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// Modal thao tác tiền két giữa hai ca khi chi nhánh KHÔNG có ca nào đang mở:
// - PRE_OPEN_IN: Quản lý nạp thêm tiền đầu ngày trước khi mở ca (cộng dồn vào dự kiến đầu ca tới).
// - POST_CLOSE_OUT: Quản lý rút tiền sau kết ca từ số dư lưu két của ca đóng gần nhất.
export function BetweenShiftCashModal({
  show,
  mode = "PRE_OPEN_IN",
  branchId,
  previousClosed = null,
  userRole = null,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const isPreOpenIn = mode === "PRE_OPEN_IN";
  const pinOptional = userRole === "COO" || userRole === "BRANCH_MANAGER";
  const prevClosingCash = previousClosed?.hasPreviousShift ? Number(previousClosed?.countedCash || 0) : 0;
  const currentPreOpenIn = Number(previousClosed?.preOpenCashIn || 0);
  const currentExpectedOpen = prevClosingCash + currentPreOpenIn;

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
  }, [show, mode, branchId]);

  const parsedAmount = Number(amount);
  const presets = isPreOpenIn ? CASH_IN_PRESETS : CASH_OUT_PRESETS;
  const projectedNext =
    !Number.isNaN(parsedAmount) && parsedAmount > 0
      ? isPreOpenIn
        ? currentExpectedOpen + parsedAmount
        : prevClosingCash - parsedAmount
      : isPreOpenIn
        ? currentExpectedOpen
        : prevClosingCash;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!branchId || busy) return;

    const errs = {};
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount < 1) {
      errs.amount = "Số tiền phải lớn hơn 0 VNĐ.";
    } else if (!isPreOpenIn && parsedAmount > prevClosingCash) {
      errs.amount = `Số tiền lưu két sau kết ca (${formatVnd(prevClosingCash)}) không đủ để rút.`;
    }
    if (!reason.trim()) {
      errs.reason = isPreOpenIn ? "Bắt buộc nhập lý do nạp tiền đầu ngày." : "Bắt buộc nhập lý do rút tiền sau kết ca.";
    }
    if (!pinOptional && !managerPin.trim()) {
      errs.managerPin = "Bắt buộc nhập mã PIN Quản lý chi nhánh.";
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
        branchId,
        amount: parsedAmount,
        reason: reason.trim(),
        managerPin: managerPin.trim() || null,
      };
      if (isPreOpenIn) {
        await shiftsApi.preOpenCashIn(payload);
        toast.success(
          `Đã ghi nhận nạp ${formatVnd(parsedAmount)} đầu ngày — dự kiến mở ca sắp tới: ${formatVnd(currentExpectedOpen + parsedAmount)}.`,
        );
      } else {
        await shiftsApi.postCloseCashOut(payload);
        toast.success(
          `Đã rút ${formatVnd(parsedAmount)} sau kết ca — số dư lưu két còn lại: ${formatVnd(prevClosingCash - parsedAmount)}.`,
        );
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
      setApiError(err.message || "Không thực hiện được giao dịch két giữa ca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={() => !busy && onClose?.()} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">
          {isPreOpenIn ? "Nạp tiền đầu ngày (trước mở ca)" : "Rút tiền sau kết ca (cất két Quản lý)"}
        </Modal.Title>
      </Modal.Header>
      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body>
          <div className="notice mb-3">
            <strong>i</strong>
            <span>
              {isPreOpenIn
                ? "Khoản nạp đầu ngày KHÔNG tự động mở ca bán hàng. Thu ngân sẽ kiểm đếm lại tổng tiền két thực tế khi bấm Mở ca & đối soát khớp dự kiến."
                : "Rút tiền khỏi két từ số dư kết ca đã đóng (không cần mở ca mới). Hệ thống trừ đối ứng số dư lưu két và vẫn bảo toàn nguyên vẹn chênh lệch kiểm kê ca cũ."}
            </span>
          </div>

          <div
            className="p-2 px-3 mb-3"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }}
          >
            {isPreOpenIn ? (
              <>
                <div className="stat-line small" style={{ padding: "2px 0" }}>
                  <span className="text-muted-scms">Kết ca gần nhất chuyển sang</span>
                  <strong className="num">{previousClosed?.hasPreviousShift ? formatVnd(prevClosingCash) : "Chưa có ca trước (0 đ)"}</strong>
                </div>
                {currentPreOpenIn > 0 ? (
                  <div className="stat-line small" style={{ padding: "2px 0" }}>
                    <span className="text-muted-scms">+ Đã nạp đầu ngày chờ mở ca</span>
                    <strong className="num">{formatVnd(currentPreOpenIn)}</strong>
                  </div>
                ) : null}
                <div className="stat-line small" style={{ padding: "2px 0" }}>
                  <span className="text-muted-scms">Dự kiến đầu ca hiện tại</span>
                  <strong className="num">{formatVnd(currentExpectedOpen)}</strong>
                </div>
              </>
            ) : (
              <div className="stat-line small" style={{ padding: "2px 0" }}>
                <span className="text-muted-scms">Lưu két sau Ca #{previousClosed?.shiftId}</span>
                <strong className="num">{formatVnd(prevClosingCash)}</strong>
              </div>
            )}
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
                placeholder={isPreOpenIn ? "VD: 500.000" : "VD: 1.000.000"}
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
              {presets
                .filter((val) => isPreOpenIn || val <= prevClosingCash)
                .map((val) => (
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
              {isPreOpenIn ? "Tổng dự kiến két khi Thu ngân mở ca:" : "Số dư lưu két còn lại cho ca tiếp theo:"}{" "}
              <strong className="num">{formatVnd(projectedNext)}</strong>
            </div>
          ) : null}

          <FormField label="Lý do giao dịch" required error={fieldErrors.reason}>
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              placeholder={
                isPreOpenIn
                  ? "VD: Quản lý bỏ thêm tiền lẻ đầu ngày vào két trước giờ mở cửa"
                  : "VD: Quản lý rút bớt tiền cuối ngày cất két chi nhánh"
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
            label={pinOptional ? "Mã PIN Quản lý xác nhận thêm (tùy chọn)" : "Mã PIN Quản lý duyệt"}
            required={!pinOptional}
            error={fieldErrors.managerPin}
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
            {isPreOpenIn ? "Xác nhận nạp tiền đầu ngày" : "Xác nhận rút tiền sau kết ca"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
