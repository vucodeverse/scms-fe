import { useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { formatVnd, formatDateTime } from "../lib/format.js";
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
  const received = Number(cashReceived || 0);
  const change = received >= finalAmount ? received - finalAmount : 0;

  useEffect(() => {
    setCashResult(null);
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

  if (order.status !== "PENDING") {
    // Đơn đã chốt: chỉ còn hiển thị kết quả thanh toán vừa thực hiện
    // trong phiên này (tiền thừa / xác nhận VietQR) để thu ngân đối chiếu.
    if (cashResult) {
      return (
        <div className="notice mt-3">
          <span>
            Đã thu tiền mặt. Tiền thừa trả khách:{" "}
            <strong>{formatVnd(cashResult.changeReturned)}</strong>
            {cashResult.paidAt ? ` · ${formatDateTime(cashResult.paidAt)}` : ""}
          </span>
        </div>
      );
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
            <div className="notice">
              <span>
                Đã thu tiền mặt. Tiền thừa trả khách:{" "}
                <strong>{formatVnd(cashResult.changeReturned)}</strong>
                {cashResult.paidAt ? ` · ${formatDateTime(cashResult.paidAt)}` : ""}
              </span>
            </div>
          ) : (
            <>
              <div className="d-flex gap-2 align-items-start">
                <Form.Control
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="Số tiền khách đưa"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
                <Button onClick={() => setCashReceived(String(finalAmount))}>Đúng tiền</Button>
              </div>
              <div className="d-flex gap-2 mt-2 flex-wrap">
                {[50000, 100000, 200000, 500000].map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setCashReceived(String(v))}
                  >
                    {formatVnd(v)}
                  </Button>
                ))}
              </div>
              <div className="stat-line mt-2">
                <span className="text-muted">Tiền thừa</span>
                <strong>{formatVnd(change)}</strong>
              </div>
              {cashError ? <div className="form-error mt-1">{cashError}</div> : null}
              <Button
                className="w-100 mt-2"
                variant="primary"
                onClick={payCash}
                disabled={cashBusy || received < finalAmount}
              >
                {cashBusy ? <Spinner size="sm" className="me-2" /> : null}
                Thu tiền · {formatVnd(finalAmount)}
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
