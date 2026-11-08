import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import OrderPaymentPanel from "../components/OrderPaymentPanel.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatVnd } from "../lib/format.js";
import { productsApi } from "../api/productsApi.js";
import { categoriesApi } from "../api/categoriesApi.js";
import { branchesApi } from "../api/branchesApi.js";
import { ordersApi } from "../api/ordersApi.js";

const LEVELS = ["0%", "30%", "50%", "70%", "100%"];

// SCR-04/05 — POS bán hàng tại quầy (FE-17, UC16–UC19/UC43). Bố cục
// bám prototype views-pos: lưới món bên trái, panel "Đơn hiện tại"
// bên phải. Tạo đơn qua POST /orders (backend tính lại tổng từ giá
// DB); thanh toán tiền mặt/VietQR qua OrderPaymentPanel. Đơn tạo xong
// mà chưa trả tiền vẫn ở trạng thái PENDING trong danh sách đơn hàng
// (đơn chờ) — mở lại từ trang Đơn hàng để thanh toán tiếp.
export default function PosPage() {
  const { user } = useAuth();
  const toast = useToast();
  const menu = buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState(null);

  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState(null); // OrderDetailDto sau khi tạo

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodPage, cats] = await Promise.all([
        productsApi.list({ uiPage: 1, size: 100, status: "AVAILABLE" }),
        categoriesApi.listAll(),
      ]);
      setProducts(prodPage.items || []);
      setCategories((cats || []).filter((c) => c.status === "ACTIVE"));
      if (!user?.branchId) {
        const brPage = await branchesApi.list({ uiPage: 1, size: 100 });
        const open = (brPage.items || []).filter((b) => b.status === "OPEN");
        setBranches(open);
        if (open.length) setBranchId((cur) => cur || open[0].id);
      }
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được menu bán hàng.");
    } finally {
      setLoading(false);
    }
  }, [user?.branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleProducts = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!categoryId || p.categoryId === categoryId) &&
        (!kw || p.name.toLowerCase().includes(kw))
    );
  }, [products, keyword, categoryId]);

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, l) => sum + (l.unitPrice + l.toppings.reduce((s, t) => s + t.extraPrice, 0)) * l.quantity,
        0
      ),
    [cart]
  );

  function priceOf(product, size) {
    const s = (product.sizes || []).find((x) => x.size === size);
    return s ? Number(s.price) : Number(product.sizes?.[0]?.price || 0);
  }

  function addToCart(product) {
    if (order) return;
    const size = product.defaultSize || product.sizes?.[0]?.size || "S";
    const defaultToppings = (product.toppings || [])
      .filter((t) => t.isDefault)
      .map((t) => ({ toppingId: t.toppingId, name: t.name, extraPrice: Number(t.extraPrice) }));
    const key =
      product.id + "|" + size + "|100%|100%|" + defaultToppings.map((t) => t.toppingId).join(",") + "|";
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name: product.name,
          product,
          size,
          quantity: 1,
          sugarLevel: "100%",
          iceLevel: "100%",
          note: "",
          toppings: defaultToppings,
          unitPrice: priceOf(product, size),
        },
      ];
    });
  }

  function updateLine(key, patch) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.size) next.unitPrice = priceOf(l.product, patch.size);
        next.key =
          next.productId + "|" + next.size + "|" + next.sugarLevel + "|" + next.iceLevel + "|" +
          next.toppings.map((t) => t.toppingId).join(",") + "|" + (next.note || "");
        return next;
      })
    );
  }

  function toggleTopping(line, topping) {
    const has = line.toppings.some((t) => t.toppingId === topping.toppingId);
    const toppings = has
      ? line.toppings.filter((t) => t.toppingId !== topping.toppingId)
      : [...line.toppings, { toppingId: topping.toppingId, name: topping.name, extraPrice: Number(topping.extraPrice) }];
    updateLine(line.key, { toppings });
  }

  async function createOrder() {
    if (!branchId) {
      toast.error("Chưa chọn chi nhánh bán hàng.");
      return;
    }
    if (!cart.length) return;
    setCreating(true);
    try {
      const payload = {
        branchId,
        totalAmount: subtotal,
        discountAmount: 0,
        finalAmount: subtotal,
        note: orderNote.trim() || null,
        lines: cart.map((l) => ({
          productId: l.productId,
          size: l.size,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          sugarLevel: l.sugarLevel,
          iceLevel: l.iceLevel,
          note: l.note.trim() || null,
          toppingIds: l.toppings.map((t) => t.toppingId),
        })),
      };
      const created = await ordersApi.create(payload);
      const detail = await ordersApi.detail(created.id);
      setOrder(detail);
      toast.success(`Đã tạo đơn ${detail.receiptNo || "#" + detail.id}.`);
    } catch (err) {
      toast.error(err.message || "Không tạo được đơn hàng.");
    } finally {
      setCreating(false);
    }
  }

  function resetAll() {
    setCart([]);
    setOrderNote("");
    setOrder(null);
  }

  const locked = !!order;

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Bán hàng tại quầy"
        screenCode="SCR-04 · POS"
        description="Chọn món, tạo đơn và thu tiền mặt hoặc VietQR."
        actions={
          !user?.branchId ? (
            <Form.Select
              value={branchId || ""}
              onChange={(e) => setBranchId(Number(e.target.value))}
              style={{ minWidth: 220 }}
              disabled={locked}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Form.Select>
          ) : null
        }
      />

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 400px", alignItems: "start" }}>
          {/* Menu món */}
          <div>
            <div className="d-flex gap-2 flex-wrap mb-3 align-items-center">
              <Button
                size="sm"
                variant={!categoryId ? "primary" : "outline-secondary"}
                onClick={() => setCategoryId(null)}
              >
                Tất cả
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={categoryId === c.id ? "primary" : "outline-secondary"}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </Button>
              ))}
              <Form.Control
                placeholder="Tìm món…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ maxWidth: 220, marginLeft: "auto" }}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 10,
              }}
            >
              {visibleProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="scms-panel panel-pad text-start"
                  onClick={() => addToCart(p)}
                  disabled={locked}
                  style={{ cursor: locked ? "not-allowed" : "pointer" }}
                >
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {p.categoryName || ""}
                  </div>
                  <div className="mt-1">
                    <strong>{formatVnd(priceOf(p, p.defaultSize || p.sizes?.[0]?.size))}</strong>
                    <span className="text-muted"> · size {p.defaultSize || p.sizes?.[0]?.size || "—"}</span>
                  </div>
                </button>
              ))}
              {visibleProducts.length === 0 ? (
                <div className="text-muted">Không có món nào đang bán trong nhóm này.</div>
              ) : null}
            </div>
          </div>

          {/* Đơn hiện tại */}
          <div className="scms-panel panel-pad" style={{ position: "sticky", top: 12 }}>
            <div className="panel-head">
              <div>
                <h2>Đơn hiện tại</h2>
                <p>
                  {order
                    ? `${order.receiptNo || "Đơn #" + order.id} · ${order.lines?.length || 0} dòng`
                    : `${cart.reduce((s, l) => s + l.quantity, 0)} món trong giỏ`}
                </p>
              </div>
              {order ? (
                <StatusTag
                  status={order.status}
                  variant={order.status === "PAID" ? "dark" : "warn"}
                  label={order.status === "PAID" ? "Đã thanh toán" : "Chờ thanh toán"}
                />
              ) : null}
            </div>

            {!order ? (
              <>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {cart.length === 0 ? (
                    <div className="text-muted py-3">Giỏ hàng trống — chọn món từ menu để bắt đầu đơn mới.</div>
                  ) : (
                    cart.map((l) => {
                      const lineTotal =
                        (l.unitPrice + l.toppings.reduce((s, t) => s + t.extraPrice, 0)) * l.quantity;
                      return (
                        <div key={l.key} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
                          <div className="d-flex justify-content-between">
                            <strong>{l.name}</strong>
                            <strong>{formatVnd(lineTotal)}</strong>
                          </div>
                          <div className="d-flex gap-2 mt-1 flex-wrap">
                            <Form.Select
                              size="sm"
                              value={l.size}
                              onChange={(e) => updateLine(l.key, { size: e.target.value })}
                              style={{ width: 76 }}
                            >
                              {(l.product.sizes || []).map((s) => (
                                <option key={s.size} value={s.size}>
                                  {s.size} · {formatVnd(s.price)}
                                </option>
                              ))}
                            </Form.Select>
                            <Form.Select
                              size="sm"
                              value={l.sugarLevel}
                              onChange={(e) => updateLine(l.key, { sugarLevel: e.target.value })}
                              style={{ width: 108 }}
                            >
                              {LEVELS.map((v) => (
                                <option key={v} value={v}>
                                  Đường {v}
                                </option>
                              ))}
                            </Form.Select>
                            <Form.Select
                              size="sm"
                              value={l.iceLevel}
                              onChange={(e) => updateLine(l.key, { iceLevel: e.target.value })}
                              style={{ width: 96 }}
                            >
                              {LEVELS.map((v) => (
                                <option key={v} value={v}>
                                  Đá {v}
                                </option>
                              ))}
                            </Form.Select>
                            <div className="d-flex align-items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() =>
                                  updateLine(l.key, { quantity: Math.max(1, l.quantity - 1) })
                                }
                              >
                                −
                              </Button>
                              <span style={{ minWidth: 22, textAlign: "center" }}>{l.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => updateLine(l.key, { quantity: l.quantity + 1 })}
                              >
                                +
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => setCart((prev) => prev.filter((x) => x.key !== l.key))}
                              >
                                Xoá
                              </Button>
                            </div>
                          </div>
                          {(l.product.toppings || []).length ? (
                            <div className="d-flex gap-2 flex-wrap mt-1">
                              {l.product.toppings.map((t) => (
                                <Form.Check
                                  key={t.toppingId}
                                  type="checkbox"
                                  id={`tp-${l.key}-${t.toppingId}`}
                                  label={`${t.name} +${formatVnd(t.extraPrice)}`}
                                  checked={l.toppings.some((x) => x.toppingId === t.toppingId)}
                                  onChange={() => toggleTopping(l, t)}
                                />
                              ))}
                            </div>
                          ) : null}
                          <Form.Control
                            size="sm"
                            className="mt-1"
                            placeholder="Ghi chú dòng…"
                            value={l.note}
                            onChange={(e) => updateLine(l.key, { note: e.target.value })}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
                <Form.Control
                  className="mt-2"
                  placeholder="Ghi chú đơn (tuỳ chọn)"
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                />
                <div className="stat-line mt-2">
                  <span className="text-muted">Tạm tính</span>
                  <strong style={{ fontSize: 17 }}>{formatVnd(subtotal)}</strong>
                </div>
                <Button
                  className="w-100 mt-2"
                  variant="primary"
                  onClick={createOrder}
                  disabled={creating || !cart.length}
                >
                  {creating ? <Spinner size="sm" className="me-2" /> : null}
                  Tạo đơn & thanh toán
                </Button>
              </>
            ) : (
              <>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {(order.lines || []).map((l) => (
                    <div key={l.id} className="d-flex justify-content-between" style={{ padding: "4px 0" }}>
                      <span>
                        {l.productName} ({l.size}) × {l.quantity}
                        <span className="text-muted">
                          {" "}
                          · Đường {l.sugarLevel || "—"} · Đá {l.iceLevel || "—"}
                          {l.toppings?.length
                            ? " · " + l.toppings.map((t) => t.toppingName || t.name).filter(Boolean).join(", ")
                            : ""}
                        </span>
                      </span>
                      <strong>{formatVnd(l.lineTotal)}</strong>
                    </div>
                  ))}
                </div>
                <OrderPaymentPanel order={order} onOrderChanged={setOrder} />
                <div className="d-flex gap-2 mt-3">
                  <Button variant="outline-secondary" onClick={resetAll}>
                    {order.status === "PENDING" ? "Để đơn chờ & làm đơn mới" : "Đơn mới"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
