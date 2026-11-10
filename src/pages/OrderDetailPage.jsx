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
import { buildMenu, buildPosMenu } from "../config/menu.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { ordersApi } from "../api/ordersApi.js";
import { paymentsApi } from "../api/paymentsApi.js";
import { shiftsApi } from "../api/shiftsApi.js";

// Chi tiết đơn hàng — trang chứa toàn bộ thao tác của đơn (chuẩn
// FE-13): thông tin đơn, các dòng món, voucher, thanh toán tiền mặt /
// VietQR (đơn PENDING) và hủy đơn kèm lý do bắt buộc (UC18).
export default function OrderDetailPage() {
  const { query, navigate } = useRouter();
  const { user, status: authStatus } = useAuth();
  const toast = useToast();
  const [shiftState, setShiftState] = useState({ open: false, handoverPending: false, earlyClosePending: false });
  const isManagerRole = user?.role === "COO" || user?.role === "BRANCH_MANAGER";
  const isCashierScope = Boolean(user && !isManagerRole);
  const menu =
    !user || authStatus !== "authenticated"
      ? buildPosMenu({ unlocked: false, shiftOpen: false, handoverPending: false, earlyClosePending: false })
      : isCashierScope
        ? buildPosMenu({
            unlocked: true,
            shiftOpen: shiftState.open,
            handoverPending: shiftState.handoverPending,
            earlyClosePending: shiftState.earlyClosePending,
          })
        : buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const id = Number(query?.id);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [order, setOrder] = useState(null);
  const [payInfo, setPayInfo] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    if (authStatus === "anonymous") {
      navigate("/branch/shifts");
    }
  }, [authStatus, navigate]);

  const effectiveBranchId = user?.branchId || order?.branchId || null;

  const refreshShiftState = useCallback(() => {
    if (
      authStatus !== "authenticated" ||
      !user ||
      user.role === "COO" ||
      !effectiveBranchId
    ) {
      setShiftState({ open: false, handoverPending: false, earlyClosePending: false });
      return;
    }
    shiftsApi
      .current(effectiveBranchId)
      .then((sum) =>
        setShiftState({
          open: true,
          handoverPending: Boolean(sum?.shift?.handoverPending),
          earlyClosePending: Boolean(sum?.shift?.earlyClosePending),
        }),
      )
      .catch(() => setShiftState({ open: false, handoverPending: false, earlyClosePending: false }));
  }, [authStatus, user, effectiveBranchId]);

  useEffect(() => {
    refreshShiftState();
  }, [refreshShiftState]);

  const load = useCallback(async () => {
    if (authStatus !== "authenticated" || !user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const detail = await ordersApi.detail(id);
      setOrder(detail);
      if (detail.status === "PAID") {
        try {
          setPayInfo(await paymentsApi.getStatus(id));
        } catch {
          setPayInfo(null);
        }
      } else {
        setPayInfo(null);
      }
    } catch (err) {
      setOrder(null);
      setLoadError(err.message || "Không tải được chi tiết đơn hàng.");
      toastRef.current.error(err.message || "Không tải được chi tiết đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, [authStatus, user, id]);

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
          <div className="d-flex gap-2">
            {isCashierScope && !shiftState.open ? (
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => navigate("/branch/shifts")}
                href="#/branch/shifts"
              >
                Kiểm két &amp; Mở ca →
              </Button>
            ) : shiftState.earlyClosePending ? (
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => navigate("/branch/shifts")}
                href="#/branch/shifts"
              >
                Chờ duyệt đóng ca →
              </Button>
            ) : shiftState.handoverPending ? (
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => navigate("/branch/shifts")}
                href="#/branch/shifts"
              >
                Kiểm két nhận ca →
              </Button>
            ) : (
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => navigate("/pos")}
                href="#/pos"
              >
                Về quầy POS
              </Button>
            )}
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => navigate("/branch/orders")}
              href="#/branch/orders"
            >
              Quay lại danh sách
            </Button>
          </div>
        }
      />

      {shiftState.earlyClosePending ? (
        <div className="notice notice--warn mb-3 justify-content-between align-items-center flex-wrap">
          <span>
            <strong>Ca hiện tại đang chờ Quản lý xác nhận đóng ca sớm:</strong> tạm dừng thu tiền mặt, tạo VietQR hoặc hoàn tiền cho đến khi Quản lý duyệt đóng ca hoặc yêu cầu được hủy/từ chối.
          </span>
          <Button size="sm" variant="outline-secondary" onClick={() => navigate("/branch/shifts")}>
            Mở Ca &amp; két tiền →
          </Button>
        </div>
      ) : shiftState.handoverPending ? (
        <div className="notice notice--warn mb-3 justify-content-between align-items-center flex-wrap">
          <span>
            <strong>Két tiền ca hiện tại đang tạm khóa chờ xác nhận bàn giao giữa ca:</strong> tạm dừng thu tiền mặt, tạo VietQR hoặc hoàn tiền cho đến khi người nhận kiểm két nhận ca.
          </span>
          <Button size="sm" variant="outline-secondary" onClick={() => navigate("/branch/shifts")}>
            Mở Ca &amp; két tiền →
          </Button>
        </div>
      ) : null}

      {authStatus !== "authenticated" || loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : loadError ? (
        <div className="scms-panel panel-pad">
          <div className="notice notice--warn mb-3">
            <strong>!</strong>
            <span>{loadError}</span>
          </div>
          <Button variant="outline-secondary" onClick={() => navigate("/branch/orders")}>
            Quay lại danh sách đơn hàng
          </Button>
        </div>
      ) : !order ? (
        <div className="text-muted">Không tìm thấy đơn hàng.</div>
      ) : (
        <div className="pos-split-grid">
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
              {payInfo?.paymentMethod === "CASH" &&
              payInfo?.receivedAmount !== null &&
              payInfo?.receivedAmount !== undefined ? (
                <>
                  <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                    <span className="text-muted">Tiền khách đưa</span>
                    <strong>{formatVnd(payInfo.receivedAmount)}</strong>
                  </div>
                  <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                    <span className="text-muted">Tiền thừa trả lại khách</span>
                    <strong>
                      {formatVnd(
                        Math.max(0, Number(payInfo.receivedAmount) - Number(order.finalAmount || 0)),
                      )}
                    </strong>
                  </div>
                </>
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

              <OrderPaymentPanel
                order={order}
                onOrderChanged={async (nextOrder) => {
                  setOrder(nextOrder);
                  refreshShiftState();
                  if (nextOrder?.status === "PAID") {
                    try {
                      setPayInfo(await paymentsApi.getStatus(id));
                    } catch {
                      // giữ nguyên trạng thái đã hiển thị ở panel thanh toán
                    }
                  }
                }}
              />
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
