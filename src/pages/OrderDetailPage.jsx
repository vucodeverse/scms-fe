import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import { useRouter } from "../router/HashRouter.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import OrderPaymentPanel from "../components/OrderPaymentPanel.jsx";
import { ORDER_STATUS_META } from "./OrdersPage.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { ordersApi } from "../api/ordersApi.js";
import { paymentsApi } from "../api/paymentsApi.js";

// Chi tiết đơn hàng — trang chứa toàn bộ thao tác của đơn (chuẩn
// FE-13): thông tin đơn, các dòng món, voucher, thanh toán tiền mặt /
// VietQR (đơn PENDING) và hủy đơn kèm lý do bắt buộc (UC18).
export default function OrderDetailPage() {
  const { query, navigate } = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const menu = buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const id = Number(query?.id);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [payInfo, setPayInfo] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await ordersApi.detail(id);
      setOrder(detail);
      if (detail.status === "PAID") {
        try {
          setPayInfo(await paymentsApi.getStatus(id));
        } catch {
          setPayInfo(null);
        }
      }
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được chi tiết đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function doCancel() {
    if (!cancelReason.trim()) {
      setCancelError("Lý do hủy đơn hàng không được để trống.");
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await ordersApi.cancel(id, cancelReason.trim());
      setOrder(updated);
      setShowCancel(false);
      toast.success("Đã hủy đơn hàng.");
    } catch (err) {
      setCancelError(err.message || "Không hủy được đơn hàng.");
    } finally {
      setCancelling(false);
    }
  }

  const meta = order ? ORDER_STATUS_META[order.status] || { label: order.status, variant: "neutral" } : null;

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title={order ? `Đơn ${order.receiptNo || "#" + order.id}` : "Chi tiết đơn hàng"}
        screenCode="SCR-05 · Chi tiết đơn"
        description="Thông tin đơn, các món đã gọi và các thao tác thanh toán / hủy đơn."
        actions={
          <Button
            variant="outline-secondary"
            onClick={() => navigate("/branch/orders")}
            href="#/branch/orders"
          >
            Quay lại danh sách
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : !order ? (
        <div className="text-muted">Không tìm thấy đơn hàng.</div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 400px", alignItems: "start" }}>
          <div>
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Các món trong đơn</h2>
                  <p>{(order.lines || []).length} dòng món</p>
                </div>
                <StatusTag status={order.status} label={meta.label} variant={meta.variant} />
              </div>
              <div className="table-wrap">
                <table className="data" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Món</th>
                      <th>Tuỳ chọn</th>
                      <th className="num">SL</th>
                      <th className="num">Đơn giá</th>
                      <th className="num">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.lines || []).map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.productName}</strong> · size {l.size}
                          {l.toppings?.length ? (
                            <div className="text-muted" style={{ fontSize: 12 }}>
                              + {l.toppings.map((t) => `${t.toppingName} (${formatVnd(t.extraPrice)})`).join(", ")}
                            </div>
                          ) : null}
                          {l.note ? <div className="text-muted" style={{ fontSize: 12 }}>Ghi chú: {l.note}</div> : null}
                        </td>
                        <td>
                          Đường {l.sugarLevel || "—"} · Đá {l.iceLevel || "—"}
                        </td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{formatVnd(l.unitPrice)}</td>
                        <td className="num">
                          <strong>{formatVnd(l.lineTotal)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3" style={{ maxWidth: 320, marginLeft: "auto" }}>
                <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-muted">Tổng tiền</span>
                  <strong>{formatVnd(order.totalAmount)}</strong>
                </div>
                <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-muted">Giảm giá</span>
                  <strong>−{formatVnd(order.discountAmount)}</strong>
                </div>
                <div className="stat-line">
                  <span className="text-muted">Phải trả</span>
                  <strong style={{ fontSize: 17 }}>{formatVnd(order.finalAmount)}</strong>
                </div>
              </div>
            </div>
          </div>

          <aside>
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Thông tin đơn</h2>
                </div>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Số hóa đơn</span>
                <strong className="mono">{order.receiptNo || `#${order.id}`}</strong>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Thu ngân</span>
                <strong>{order.cashierId ? `NV #${order.cashierId}` : "—"}</strong>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Tạo lúc</span>
                <strong>{formatDateTime(order.createdAt)}</strong>
              </div>
              {order.paidAt ? (
                <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-muted">Thanh toán lúc</span>
                  <strong>{formatDateTime(order.paidAt)}</strong>
                </div>
              ) : null}
              {order.voucher ? (
                <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-muted">Voucher</span>
                  <strong>
                    <span className="mono">{order.voucher.voucherCode}</span> (−
                    {formatVnd(order.voucher.discountAmountApplied)})
                  </strong>
                </div>
              ) : null}
              {payInfo?.paymentMethod ? (
                <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-muted">Phương thức</span>
                  <strong>{payInfo.paymentMethod === "CASH" ? "Tiền mặt" : payInfo.paymentMethod}</strong>
                </div>
              ) : null}
              {order.note ? (
                <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-muted">Ghi chú</span>
                  <strong>{order.note}</strong>
                </div>
              ) : null}
              {order.status === "CANCELLED" ? (
                <div className="stat-line">
                  <span className="text-muted">Lý do hủy</span>
                  <strong>{order.cancelReason || "—"}</strong>
                </div>
              ) : null}

              <OrderPaymentPanel order={order} onOrderChanged={setOrder} />
              {order.status === "PENDING" ? (
                <>
                  <Button
                    variant="outline-danger"
                    className="w-100 mt-3"
                    onClick={() => {
                      setCancelError(null);
                      setCancelReason("");
                      setShowCancel(true);
                    }}
                  >
                    Hủy đơn
                  </Button>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      )}

      <Modal show={showCancel} onHide={() => setShowCancel(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Hủy đơn hàng</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted">
            Đơn bị hủy không thể khôi phục. Nếu đơn đã áp voucher, lượt dùng voucher sẽ được hoàn lại.
          </p>
          <Form.Group>
            <Form.Label>
              Lý do hủy <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ví dụ: Khách đổi ý"
            />
          </Form.Group>
          {cancelError ? <div className="form-error mt-2">{cancelError}</div> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowCancel(false)}>
            Đóng
          </Button>
          <Button variant="danger" onClick={doCancel} disabled={cancelling}>
            {cancelling ? <Spinner size="sm" className="me-2" /> : null}
            Xác nhận hủy đơn
          </Button>
        </Modal.Footer>
      </Modal>
    </AdminLayout>
  );
}
