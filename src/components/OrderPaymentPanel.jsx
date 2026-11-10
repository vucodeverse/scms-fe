import { useEffect, useRef, useState } from "react";
import { Button, Form, InputGroup, Spinner } from "react-bootstrap";
import { formatVnd, formatDateTime, formatMoneyInput, parseMoneyDigits } from "../lib/format.js";
import { ordersApi } from "../api/ordersApi.js";
import { paymentsApi } from "../api/paymentsApi.js";

// Panel thanh toán cho một đơn PENDING (dùng ở POS sau khi tạo đơn và
// ở trang chi tiết đơn): áp/gỡ voucher (UC17), thu tiền mặt kèm tiền
// thừa (UC19), tạo VietQR và theo dõi trạng thái qua polling (UC43).
// onOrderChanged(detail) được gọi sau mỗi thao tác đổi tổng/trạng thái.
export default function OrderPaymentPanel({ order, onOrderChanged }) {
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherError, setVoucherError] = useState(null);

  const [method, setMethod] = useState("CASH");
  const [cashReceived, setCashReceived] = useState("");
  const [cashBusy, setCashBusy] = useState(false);
  const [cashResult, setCashResult] = useState(null);
  const [cashError, setCashError] = useState(null);

  const [qr, setQr] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [payStatus, setPayStatus] = useState(null);
  const pollRef = useRef(null);

  const finalAmount = Number(order.finalAmount || 0);
  const hasEnteredCash = cashReceived !== "";
  const received = hasEnteredCash ? Number(cashReceived || 0) : 0;
  const shortage = hasEnteredCash && received < finalAmount ? finalAmount - received : 0;
  const change = received >= finalAmount ? received - finalAmount : 0;
  const cashPresets = finalAmount > 500000 ? [50000, 100000, 200000, 500000, 1000000] : [50000, 100000, 200000, 500000];

  useEffect(() => {
    setCashReceived("");
    setCashResult(null);
    setCashError(null);
    setQr(null);
    setPayStatus(null);
    setVoucherError(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [order.id]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  function renderCashSuccessNotice(res) {
    const paidTotal = res.totalAmount != null ? Number(res.totalAmount) : finalAmount;
    const paidCash = res.cashReceived != null ? Number(res.cashReceived) : received;
    const paidChange = res.changeReturned != null ? Number(res.changeReturned) : Math.max(0, paidCash - paidTotal);
    return (
      <div
        className="notice mt-3"
        style={{ background: "var(--success-soft)", borderColor: "#bcc7b5" }}
      >
        <strong>✓</strong>
        <div className="w-100">
          <div className="fw-semibold">
            Đã thu tiền mặt{res.paidAt ? ` · ${formatDateTime(res.paidAt)}` : ""}
          </div>
          <div className="stat-line mt-1" style={{ padding: "2px 0" }}>
            <span className="text-muted">Khách phải trả</span>
            <strong>{formatVnd(paidTotal)}</strong>
          </div>
          <div className="stat-line" style={{ padding: "2px 0" }}>
            <span className="text-muted">Tiền khách đưa</span>
            <strong>{formatVnd(paidCash)}</strong>
          </div>
          <div className="scms-divider my-1" />
          <div className="stat-line" style={{ padding: "2px 0", fontSize: 15 }}>
            <strong>Tiền thừa trả lại khách</strong>
            <strong style={{ fontSize: 17 }}>{formatVnd(paidChange)}</strong>
          </div>
        </div>
      </div>
    );
  }

  if (order.status !== "PENDING") {
    // Đơn đã chốt: chỉ còn hiển thị kết quả thanh toán vừa thực hiện
    // trong phiên này (tiền thừa / xác nhận VietQR) để thu ngân đối chiếu.
    if (cashResult) {
      return renderCashSuccessNotice(cashResult);
    }
    if (payStatus?.orderStatus === "PAID") {
      return (
        <div className="notice mt-3">
          <span>Đã xác nhận thanh toán VietQR{payStatus.paidAt ? ` · ${formatDateTime(payStatus.paidAt)}` : ""}.</span>
        </div>
      );
    }
    return null;
  }

  async function applyVoucher(e) {
    e.preventDefault();
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;
    setVoucherBusy(true);
    setVoucherError(null);
    try {
      const updated = await ordersApi.applyVoucher(order.id, code);
      setVoucherCode("");
      onOrderChanged?.(updated);
    } catch (err) {
      setVoucherError(err.message || "Không áp dụng được voucher.");
    } finally {
      setVoucherBusy(false);
    }
  }

  async function removeVoucher() {
    setVoucherBusy(true);
    setVoucherError(null);
    try {
      const updated = await ordersApi.removeVoucher(order.id);
      onOrderChanged?.(updated);
    } catch (err) {
      setVoucherError(err.message || "Không gỡ được voucher.");
    } finally {
      setVoucherBusy(false);
    }
  }

  async function payCash() {
    setCashBusy(true);
    setCashError(null);
    try {
      const result = await paymentsApi.payCash({
        orderId: order.id,
        cashReceived: received,
        paymentNote: null,
      });
      setCashResult(result);
      const detail = await ordersApi.detail(order.id);
      onOrderChanged?.(detail);
    } catch (err) {
      setCashError(err.message || "Không thu được tiền mặt.");
    } finally {
      setCashBusy(false);
    }
  }

  async function createQr() {
    setQrBusy(true);
    setQrError(null);
    try {
      const data = await paymentsApi.createVietQr(order.id);
      setQr(data);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const st = await paymentsApi.getStatus(order.id);
          setPayStatus(st);
          if (st.orderStatus === "PAID") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            const detail = await ordersApi.detail(order.id);
            onOrderChanged?.(detail);
          }
        } catch {
          // bỏ qua lỗi polling lẻ; người dùng có nút kiểm tra thủ công
        }
      }, 3000);
    } catch (err) {
      setQrError(err.message || "Không tạo được mã VietQR.");
    } finally {
      setQrBusy(false);
    }
  }

  async function checkStatusNow() {
    try {
      const st = await paymentsApi.getStatus(order.id);
      setPayStatus(st);
      if (st.orderStatus === "PAID") {
        const detail = await ordersApi.detail(order.id);
        onOrderChanged?.(detail);
      }
    } catch (err) {
      setQrError(err.message || "Không kiểm tra được trạng thái.");
    }
  }

  return (
    <div>
      {/* Voucher */}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
        {order.voucher ? (
          <div className="d-flex justify-content-between align-items-center">
            <span>
              Voucher <strong className="mono">{order.voucher.voucherCode}</strong> — giảm{" "}
              {formatVnd(order.voucher.discountAmountApplied)}
            </span>
            <Button size="sm" variant="outline-secondary" onClick={removeVoucher} disabled={voucherBusy}>
              Gỡ voucher
            </Button>
          </div>
        ) : (
          <Form onSubmit={applyVoucher} className="d-flex gap-2">
            <Form.Control
              placeholder="Mã voucher"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
              className="mono"
            />
            <Button type="submit" variant="outline-primary" disabled={voucherBusy || !voucherCode.trim()}>
              {voucherBusy ? <Spinner size="sm" /> : "Áp dụng"}
            </Button>
          </Form>
        )}
        {voucherError ? <div className="form-error mt-1">{voucherError}</div> : null}
      </div>

      {/* Tổng tiền từ backend */}
      <div className="mt-3">
        <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
          <span className="text-muted">Tổng tiền</span>
          <strong>{formatVnd(order.totalAmount)}</strong>
        </div>
        <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
          <span className="text-muted">Giảm giá</span>
          <strong>−{formatVnd(order.discountAmount)}</strong>
        </div>
        <div className="stat-line">
          <span className="text-muted">Khách phải trả</span>
          <strong style={{ fontSize: 17 }}>{formatVnd(order.finalAmount)}</strong>
        </div>
      </div>

      {/* Phương thức */}
      <div className="d-flex gap-2 mt-3">
        <Button
          variant={method === "CASH" ? "primary" : "outline-secondary"}
          onClick={() => setMethod("CASH")}
        >
          Tiền mặt
        </Button>
        <Button
          variant={method === "VIETQR" ? "primary" : "outline-secondary"}
          onClick={() => setMethod("VIETQR")}
        >
          VietQR
        </Button>
      </div>

      {method === "CASH" ? (
        <div className="mt-3">
          {cashResult ? (
            renderCashSuccessNotice(cashResult)
          ) : (
            <>
              <Form.Label className="mb-1">Tiền mặt khách đưa (VNĐ)</Form.Label>
              <div className="d-flex gap-2 align-items-stretch">
                <InputGroup>
                  <Form.Control
                    type="text"
                    inputMode="numeric"
                    placeholder="VD: 100.000"
                    value={formatMoneyInput(cashReceived)}
                    onChange={(e) => {
                      setCashReceived(parseMoneyDigits(e.target.value));
                      setCashError(null);
                    }}
                  />
                  <InputGroup.Text>VNĐ</InputGroup.Text>
                </InputGroup>
                <Button
                  type="button"
                  variant="outline-secondary"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={() => {
                    setCashReceived(String(Math.round(finalAmount)));
                    setCashError(null);
                  }}
                >
                  Đúng tiền
                </Button>
              </div>
              <div className="d-flex gap-2 mt-2 flex-wrap">
                {cashPresets.map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={hasEnteredCash && received === v ? "primary" : "outline-secondary"}
                    onClick={() => {
                      setCashReceived(String(v));
                      setCashError(null);
                    }}
                  >
                    {formatVnd(v)}
                  </Button>
                ))}
              </div>
              {shortage > 0 ? (
                <div className="notice notice--warn mt-2">
                  <strong>!</strong>
                  <span>
                    Khách đưa <strong>{formatVnd(received)}</strong> — còn thiếu{" "}
                    <strong>{formatVnd(shortage)}</strong>.
                  </span>
                </div>
              ) : (
                <div
                  className="p-2 px-3 mt-2"
                  style={{
                    background: hasEnteredCash && change > 0 ? "var(--success-soft)" : "var(--paper)",
                    border: hasEnteredCash && change > 0 ? "1px solid #bcc7b5" : "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  {hasEnteredCash ? (
                    <>
                      <div className="stat-line" style={{ padding: "3px 0" }}>
                        <span className="text-muted">Tiền khách đưa</span>
                        <strong>{formatVnd(received)}</strong>
                      </div>
                      <div className="stat-line" style={{ padding: "3px 0" }}>
                        <span className="text-muted">Khách phải trả</span>
                        <strong>{formatVnd(finalAmount)}</strong>
                      </div>
                      <div className="scms-divider my-1" />
                    </>
                  ) : null}
                  <div className="stat-line" style={{ padding: "3px 0", fontSize: 15 }}>
                    <strong>Tiền thừa trả lại khách</strong>
                    <strong style={{ fontSize: 17 }}>{formatVnd(change)}</strong>
                  </div>
                </div>
              )}
              {cashError ? <div className="form-error mt-1">{cashError}</div> : null}
              <Button
                className="w-100 mt-2"
                variant="primary"
                onClick={payCash}
                disabled={cashBusy || (!hasEnteredCash && finalAmount > 0) || received < finalAmount}
              >
                {cashBusy ? <Spinner size="sm" className="me-2" /> : null}
                {hasEnteredCash && change > 0
                  ? `Thu ${formatVnd(received)} · Trả lại ${formatVnd(change)}`
                  : `Thu tiền · ${formatVnd(finalAmount)}`}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3">
          {!qr ? (
            <>
              {qrError ? <div className="form-error mb-2">{qrError}</div> : null}
              <Button className="w-100" variant="primary" onClick={createQr} disabled={qrBusy}>
                {qrBusy ? <Spinner size="sm" className="me-2" /> : null}
                Tạo mã VietQR · {formatVnd(finalAmount)}
              </Button>
            </>
          ) : (
            <div className="text-center">
              {qr.qrImageUrl ? (
                <img
                  src={qr.qrImageUrl}
                  alt="Mã VietQR"
                  style={{ width: 220, height: 220, objectFit: "contain" }}
                />
              ) : null}
              <div className="mono mt-1">
                {qr.bankName} · {qr.accountNumber}
              </div>
              <div>
                Nội dung chuyển khoản: <strong className="mono">{qr.referenceCode}</strong>
              </div>
              <div>
                Số tiền: <strong>{formatVnd(qr.amount)}</strong>
              </div>
              <div className="text-muted">
                Trạng thái: {payStatus?.paymentStatus || qr.status || "PENDING"}
                {payStatus?.message ? ` — ${payStatus.message}` : ""}
              </div>
              {qrError ? <div className="form-error mt-1">{qrError}</div> : null}
              <Button size="sm" variant="outline-secondary" className="mt-2" onClick={checkStatusNow}>
                Kiểm tra trạng thái
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
