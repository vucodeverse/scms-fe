import { useEffect, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import FormField from "../FormField.jsx";
import { useToast } from "../ToastContext.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { formatDate, formatVnd } from "../../lib/format.js";
import { SHIFT_TYPE_META, formatSignedVnd } from "./shiftUtils.js";

const CASH_IN_PRESETS = [100000, 200000, 500000, 1000000];
const CASH_OUT_PRESETS = [200000, 500000, 1000000, 2000000];

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
            <Form.Control
              type="number"
              min="1"
              step="1"
              placeholder={isCashIn ? "VD: 200000" : "VD: 500000"}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setFieldErrors((f) => ({ ...f, amount: null }));
                setApiError("");
              }}
              disabled={busy}
              autoFocus
            />
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
export function CloseShiftModal({ show, summary, onClose, onSuccess }) {
  const toast = useToast();
  const shift = summary?.shift;
  const expectedCash = Number(summary?.currentCashBalance ?? shift?.expectedCash ?? shift?.openingCash ?? 0);

  const [countedCash, setCountedCash] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setCountedCash("");
    setDiscrepancyReason("");
    setFieldErrors({});
    setApiError("");
  }, [show, shift?.id]);

  const parsedCounted = countedCash === "" ? NaN : Number(countedCash);
  const variance = !Number.isNaN(parsedCounted) ? parsedCounted - expectedCash : 0;
  const hasVariance = !Number.isNaN(parsedCounted) && Math.abs(variance) >= 0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!shift?.id || busy) return;

    const errs = {};
    if (countedCash === "" || Number.isNaN(parsedCounted) || parsedCounted < 0) {
      errs.countedCash = "Vui lòng nhập số tiền mặt thực đếm >= 0.";
    }
    if (hasVariance && !discrepancyReason.trim()) {
      errs.discrepancyReason = "Phát hiện chênh lệch két — bắt buộc nhập lý do giải trình (BR-38).";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setApiError("");
    try {
      await shiftsApi.close(shift.id, {
        countedCash: parsedCounted,
        discrepancyReason: discrepancyReason.trim() || null,
      });
      toast.success(
        hasVariance
          ? `Đã đóng ca #${shift.id} (chênh lệch ${formatSignedVnd(variance)}).`
          : `Đã đóng ca #${shift.id} — két khớp hoàn toàn.`,
      );
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
              <Form.Control
                type="number"
                min="0"
                step="1"
                placeholder="Nhập số tiền thực đếm trong két…"
                value={countedCash}
                onChange={(e) => {
                  setCountedCash(e.target.value);
                  setFieldErrors((f) => ({ ...f, countedCash: null, discrepancyReason: null }));
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
            className="mb-0"
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
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận đóng ca
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
