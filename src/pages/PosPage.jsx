import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import FormField from "../components/FormField.jsx";
import Icon from "../components/Icon.jsx";
import OrderPaymentPanel from "../components/OrderPaymentPanel.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import { POS_MENU } from "../config/menu.js";
import { formatNumber, formatVnd } from "../lib/format.js";
import { productsApi } from "../api/productsApi.js";
import { categoriesApi } from "../api/categoriesApi.js";
import { branchesApi } from "../api/branchesApi.js";
import { ordersApi } from "../api/ordersApi.js";
import { attendanceApi } from "../api/attendanceApi.js";
import { shiftsApi } from "../api/shiftsApi.js";
import { SHIFT_TYPE_META } from "../components/shifts/shiftUtils.js";


const LEVELS = ["0%", "30%", "50%", "70%", "100%"];

function formatLockRemaining(untilIso, nowMs) {
  if (!untilIso) return null;
  const diffSec = Math.ceil((new Date(untilIso).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return null;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// SCR-04/05 — POS bán hàng tại quầy (FE-17, UC16–UC19/UC43). Bố cục
// bám prototype views-pos: lưới món bên trái, panel "Đơn hiện tại"
// bên phải. Tạo đơn qua POST /orders (backend tính lại tổng từ giá
// DB); thanh toán tiền mặt/VietQR qua OrderPaymentPanel. Đơn tạo xong
// mà chưa trả tiền vẫn ở trạng thái PENDING trong danh sách đơn hàng
// (đơn chờ) — mở lại từ trang Đơn hàng để thanh toán tiếp.
export default function PosPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  // Màn POS chỉ hiển thị các chức năng của quầy POS (Gọi món, Đơn quầy, Chấm công)
  const menu = POS_MENU;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(() => {
    if (user?.branchId) return user.branchId;
    const saved = localStorage.getItem("scms_pos_branch_id");
    return saved ? Number(saved) : null;
  });
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState(null);

  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState(null); // OrderDetailDto sau khi tạo

  // Trạng thái modal Check in / Check out
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attEmployees, setAttEmployees] = useState([]);
  const [loadingAttEmployees, setLoadingAttEmployees] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [attPin, setAttPin] = useState("");
  const [attBusy, setAttBusy] = useState(false);
  const [attMessage, setAttMessage] = useState(null);
  const [attNowMs, setAttNowMs] = useState(() => Date.now());
  const attExpiredReloadRef = useRef(null);

  // Trạng thái modal Công thức pha chế (Barista BOM)
  const [recipeModalProduct, setRecipeModalProduct] = useState(null);
  const [recipeModalSize, setRecipeModalSize] = useState("M");
  const [recipeData, setRecipeData] = useState(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [recipeError, setRecipeError] = useState(null);
  const [shiftBanner, setShiftBanner] = useState(null);

  const checkShiftStatus = useCallback(async (targetBranchId) => {
    if (!user || !targetBranchId) {
      setShiftBanner(null);
      return;
    }
    try {
      const sum = await shiftsApi.current(targetBranchId);
      setShiftBanner({ open: true, shift: sum.shift, cashBalance: sum.currentCashBalance });
    } catch (err) {
      if (err?.detailCode === "SHIFT_NOT_OPEN") {
        setShiftBanner({ open: false });
      } else {
        setShiftBanner(null);
      }
    }
  }, [user]);

  useEffect(() => {
    checkShiftStatus(branchId);
  }, [checkShiftStatus, branchId]);

  const openRecipeModal = (prod, defaultSz) => {
    if (!prod) return;
    setRecipeModalProduct(prod);
    const sz = defaultSz || prod.defaultSize || prod.sizes?.[0]?.size || "M";
    setRecipeModalSize(sz);
  };

  useEffect(() => {
    if (!recipeModalProduct) {
      setRecipeData(null);
      return;
    }
    setLoadingRecipe(true);
    setRecipeError(null);
    productsApi
      .recipe(recipeModalProduct.id, recipeModalSize)
      .then((data) => {
        setRecipeData(data || null);
      })
      .catch((err) => {
        setRecipeError(err.message || "Không tải được công thức của món này.");
        setRecipeData(null);
      })
      .finally(() => {
        setLoadingRecipe(false);
      });
  }, [recipeModalProduct, recipeModalSize]);

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
        if (open.length) {
          setBranchId((cur) => {
            const saved = localStorage.getItem("scms_pos_branch_id");
            const match = open.find((b) => String(b.id) === saved);
            const val = match ? match.id : (cur || open[0].id);
            localStorage.setItem("scms_pos_branch_id", String(val));
            return val;
          });
        }
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

  const loadAttendanceEmployees = useCallback(async (bId, { preserveMessage = false } = {}) => {
    if (!bId) return;
    setLoadingAttEmployees(true);




    if (!preserveMessage) {
      setAttMessage(null);
  
    }



    try {
      const raw = await attendanceApi.kioskEmployees(bId);
      const list = [...(Array.isArray(raw) ? raw : [])].sort((a, b) => {
        const aOk = Boolean(a.hasAssignedShift);
        const bOk = Boolean(b.hasAssignedShift);
        if (aOk !== bOk) return aOk ? -1 : 1;
        return (a.fullName || "").localeCompare(b.fullName || "", "vi");
      });
      setAttEmployees(list);
      if (list.length > 0) {
        const preferred = list.find((e) => e.hasAssignedShift) || list[0];
        setSelectedEmpId((cur) =>
          list.some((e) => String(e.employeeId) === String(cur))
            ? cur
            : String(preferred.employeeId),
        );
      } else {
        setSelectedEmpId("");
      }
    } catch (err) {
      setAttMessage({ type: "error", text: err.message || "Không tải được danh sách nhân sự." });
    } finally {
      setLoadingAttEmployees(false);
    }
  }, []);

  useEffect(() => {
    if (showAttendanceModal) {
      loadAttendanceEmployees(branchId || 1);
      setAttMessage(null);
      setAttPin("");
  
    }
  }, [showAttendanceModal, branchId, loadAttendanceEmployees]);

  const selectedAttEmp = useMemo(
    () => attEmployees.find((x) => String(x.employeeId) === String(selectedEmpId)) || null,
    [attEmployees, selectedEmpId],
  );
  const attLockRemaining = selectedAttEmp?.pinLocked
    ? formatLockRemaining(selectedAttEmp.pinLockedUntil, attNowMs)
    : null;
  const attPinLocked = Boolean(selectedAttEmp?.pinLocked && attLockRemaining);
  const attHasAnyLocked = attEmployees.some((e) => e.pinLocked);

  useEffect(() => {
    if (!showAttendanceModal || !attHasAnyLocked) return undefined;
    setAttNowMs(Date.now());
    const tick = setInterval(() => setAttNowMs(Date.now()), 1000);
    const poll = setInterval(() => {
      loadAttendanceEmployees(branchId || 1, { preserveMessage: true });
    }, 10000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [showAttendanceModal, attHasAnyLocked, branchId, loadAttendanceEmployees]);

  useEffect(() => {
    if (!showAttendanceModal || !selectedAttEmp?.pinLocked || !selectedAttEmp?.pinLockedUntil) return;
    if (attLockRemaining) return;
    const key = `${selectedAttEmp.employeeId}:${selectedAttEmp.pinLockedUntil}`;
    if (attExpiredReloadRef.current === key) return;
    attExpiredReloadRef.current = key;
    loadAttendanceEmployees(branchId || 1, { preserveMessage: true });
  }, [showAttendanceModal, selectedAttEmp, attLockRemaining, branchId, loadAttendanceEmployees]);

  async function handleAttendanceSubmit(e) {
    e?.preventDefault();
    if (!selectedEmpId || attBusy) return;
    const emp = attEmployees.find((x) => String(x.employeeId) === String(selectedEmpId));
    if (!emp) return;
    if (attPinLocked) {
      setAttMessage({
        type: "error",
        text: `Mã PIN của ${emp.fullName} đang tạm khóa (còn ${attLockRemaining}). Liên hệ Quản lý chi nhánh / COO để mở khóa sớm.`,
      });
      setAttPin("");
      return;
    }
    if (!emp.hasAssignedShift) {
      setAttMessage({
        type: "error",
        text: `${emp.fullName} chưa được phân công ca làm việc phù hợp hôm nay nên không thể chấm công.`,
      });
      return;
    }
    const cleanPin = attPin.trim();
    if (cleanPin.length !== 4) {
      setAttMessage({ type: "error", text: "Mã PIN cá nhân phải gồm đúng 4 chữ số." });
      return;
    }

    setAttBusy(true);
    setAttMessage(null);

    const targetBranch = branchId || 1;
    const payload = {
      branchId: targetBranch,
      employeeId: Number(selectedEmpId),
      pin: cleanPin,
    };

    try {
      const dto = emp.isCheckedIn
        ? await attendanceApi.checkOut(payload)
        : await attendanceApi.checkIn(payload);

      const actionText = emp.isCheckedIn ? "Check-out (Tan ca)" : "Check-in (Vào ca)";
      const successMsg = `${actionText} thành công cho ${dto.employeeName || emp.fullName}!`;
      setAttMessage({ type: "success", text: successMsg });
      toast.success(successMsg);
      setAttPin("");
      await loadAttendanceEmployees(targetBranch);
    } catch (err) {
      setAttMessage({ type: "error", text: err.message || "Mã PIN không đúng hoặc đã xảy ra lỗi." });
      setAttPin("");
      await loadAttendanceEmployees(targetBranch, { preserveMessage: true });
    } finally {
      setAttBusy(false);
    }
  }

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
      branchName={user?.branchName || branches.find((b) => b.id === branchId)?.name || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName || "Quầy thu ngân"}
      userRole={roleLabel(user?.role) || "POS tại quầy"}
    >
      <PageHeader
        title="Bán hàng tại quầy"
        screenCode="SCR-04 · POS"
        description="Chọn món, tạo đơn và thu tiền mặt hoặc VietQR."
        actions={
          <div className="d-flex align-items-center gap-2">
            {!user?.branchId ? (
              <Form.Select
                value={branchId || ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setBranchId(val);
                  localStorage.setItem("scms_pos_branch_id", String(val));
                }}
                style={{ minWidth: 200 }}
                disabled={locked}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Form.Select>
            ) : null}
            <Button
              variant="outline-secondary"
              className="d-flex align-items-center gap-1"
              onClick={() => openRecipeModal(visibleProducts[0] || products[0])}
              disabled={products.length === 0}
            >
              <Icon name="book" size={15} /> Công thức pha chế
            </Button>
            <Button
              variant="outline-primary"
              className="d-flex align-items-center gap-1"
              onClick={() => setShowAttendanceModal(true)}
            >
              <Icon name="clock" size={15} /> Check in / Check out
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          {!user ? (
            <div className="notice mb-3 justify-content-between align-items-center flex-wrap">
              <span>
                <strong>Quầy POS chưa mở khóa Thu ngân:</strong> Mở khóa bằng PIN 4 số để kiểm két đầu ca (so với kết ca cũ), mở ca hoặc chốt tiền mặt cuối ca.
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => navigate(`/branch/shifts${branchId ? `?branchId=${branchId}` : ""}`)}
              >
                Kiểm két / Mở khóa Thu ngân (PIN) →
              </Button>
            </div>
          ) : null}
          {shiftBanner ? (
            shiftBanner.open ? (
              <div className="notice mb-3 justify-content-between align-items-center flex-wrap">
                <span>
                  <strong>Ca đang mở:</strong>{" "}
                  {SHIFT_TYPE_META[shiftBanner.shift?.shiftType]?.label || shiftBanner.shift?.shiftType} #
                  {shiftBanner.shift?.id} · Két hiện tại:{" "}
                  <strong>{formatVnd(shiftBanner.cashBalance)}</strong>
                </span>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => navigate(`/branch/shifts${branchId ? `?branchId=${branchId}` : ""}`)}
                >
                  Quản lý ca &amp; két →
                </Button>
              </div>
            ) : (
              <div className="notice notice--warn mb-3 justify-content-between align-items-center flex-wrap">
                <span>
                  <strong>Chi nhánh chưa mở ca bán hàng:</strong> Cần mở ca &amp; khai báo tiền đầu ca (BR-36) trước khi thu tiền tại quầy.
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate(`/branch/shifts${branchId ? `?branchId=${branchId}` : ""}`)}
                >
                  Mở ca &amp; két tiền →
                </Button>
              </div>
            )
          ) : null}
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
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              {visibleProducts.map((p) => (
                <div
                  key={p.id}
                  className="scms-panel panel-pad text-start d-flex flex-column justify-content-between"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line, #e2e8f0)",
                    background: "#fff",
                  }}
                >
                  <div
                    onClick={() => !locked && addToCart(p)}
                    style={{ cursor: locked ? "not-allowed" : "pointer" }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {p.categoryName || ""}
                    </div>
                    <div className="mt-1">
                      <strong>{formatVnd(priceOf(p, p.defaultSize || p.sizes?.[0]?.size))}</strong>
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        {" "}· size {p.defaultSize || p.sizes?.[0]?.size || "—"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-link p-0 text-decoration-none d-flex align-items-center gap-1 text-secondary"
                      style={{ fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openRecipeModal(p);
                      }}
                      title="Xem công thức pha chế"
                    >
                      <Icon name="book" size={13} /> Công thức
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary py-0 px-2"
                      style={{ fontSize: 12, lineHeight: "20px" }}
                      onClick={() => !locked && addToCart(p)}
                      disabled={locked}
                    >
                      + Chọn
                    </button>
                  </div>
                </div>
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
                <OrderPaymentPanel
                  order={order}
                  onOrderChanged={(nextOrder) => {
                    setOrder(nextOrder);
                    checkShiftStatus(branchId);
                  }}
                />
                <div className="d-flex gap-2 mt-3">
                  <Button variant="outline-secondary" onClick={resetAll}>
                    {order.status === "PENDING" ? "Để đơn chờ & làm đơn mới" : "Đơn mới"}
                  </Button>
                </div>
              </>
            )}
          </div>
          </div>
        </>
      )}

      {/* Modal Check in / Check out ngay trên quầy POS */}
      <Modal
        show={showAttendanceModal}
        onHide={() => setShowAttendanceModal(false)}
        centered
        backdrop="static"
      >
        <Modal.Header closeButton={!attBusy}>
          <Modal.Title as="h2">Chấm công nhân viên</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAttendanceSubmit}>
          <Modal.Body>
            <div className="text-muted-scms small mb-3">
              Ghi nhận giờ vào ca (Check-in) hoặc hết ca (Check-out) bằng mã PIN cá nhân.
            </div>

            {attMessage ? (
              <div
                className={`notice mb-3 ${
                  attMessage.type === "success" ? "" : "notice--warn text-danger"
                }`}
              >
                <strong>{attMessage.type === "success" ? "✓" : "!"}</strong>
                <span>{attMessage.text}</span>
              </div>
            ) : null}

            {loadingAttEmployees ? (
              <div className="text-center py-4">
                <Spinner size="sm" className="me-2" /> Đang tải nhân sự chi nhánh…
              </div>
            ) : (
              <>
                <FormField label="Chọn nhân viên" required className="mb-3">
                  <Form.Select
                    value={selectedEmpId}
                    onChange={(e) => {
                      setSelectedEmpId(e.target.value);
                      setAttMessage(null);
                      setAttPin("");
                  
                    }}
                    disabled={attBusy}
                  >
                    {attEmployees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.fullName} ({e.role}) — {e.hasAssignedShift ? e.shiftLabel || "Đã gán ca" : "Chưa gán ca"} · {e.isCheckedIn ? "Trong ca" : "Chưa vào ca"}{e.pinLocked ? " (Tạm khóa PIN)" : ""}
                      </option>
                    ))}
                  </Form.Select>
                </FormField>

                {(() => {
                  const emp = attEmployees.find((x) => String(x.employeeId) === String(selectedEmpId));
                  if (!emp) return null;
                  return (
                    <>
                      <div
                        className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-2 rounded mb-2"
                        style={{ background: "var(--paper-2)" }}
                      >
                        <span className="small text-muted-scms">
                          {emp.hasAssignedShift ? `Ca: ${emp.shiftLabel}` : "Phân công ca:"}
                        </span>
                        <div className="d-flex gap-1 align-items-center flex-wrap">
                          {attPinLocked ? (
                            <StatusTag status="PIN_LOCKED" variant="warn" label={`Khóa PIN · ${attLockRemaining}`} />
                          ) : null}
                          <StatusTag
                            status={emp.hasAssignedShift ? emp.shiftStatus || "SCHEDULED" : "UNASSIGNED"}
                            label={emp.hasAssignedShift ? "Đã gán ca" : "Chưa gán ca"}
                            variant={emp.hasAssignedShift ? "success" : "warn"}
                          />
                          <StatusTag
                            status={emp.isCheckedIn ? "CHECKED_IN" : "DRAFT"}
                            label={emp.isCheckedIn ? "Đang trong ca" : "Chưa vào ca"}
                            variant={emp.isCheckedIn ? "dark" : "neutral"}
                          />
                        </div>
                      </div>
                      {attPinLocked ? (
                        <div className="notice notice--warn mb-3">
                          <strong>!</strong>
                          <div className="flex-grow-1">
                            <div>
                              Mã PIN của <strong>{emp.fullName}</strong> đang tạm khóa (còn{" "}
                              <strong className="mono">{attLockRemaining}</strong>) do nhập sai quá 3 lần. Liên hệ Quản lý chi nhánh hoặc COO để mở khóa sớm.
                            </div>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              className="mt-2"
                              onClick={() => loadAttendanceEmployees(branchId || 1, { preserveMessage: true })}
                              disabled={loadingAttEmployees}
                            >
                              Kiểm tra lại trạng thái mở khóa
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {!emp.hasAssignedShift ? (
                        <div className="notice notice--warn mb-3">
                          <strong>!</strong>
                          <span>Chỉ nhân viên đã được phân công ca làm việc hôm nay mới check-in / check-out được.</span>
                        </div>
                      ) : null}
                    </>
                  );
                })()}

                <FormField label="Mã PIN cá nhân (4 số)" required className="mb-2">
                  <Form.Control
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    autoFocus
                    placeholder="••••"
                    value={attPin}
                    onChange={(e) => setAttPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    disabled={attBusy || !selectedAttEmp?.hasAssignedShift || attPinLocked}
                    style={{ fontSize: 18, letterSpacing: 4, textAlign: "center" }}
                  />
                </FormField>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="d-flex justify-content-between">
            <Button
              variant="link"
              size="sm"
              className="p-0 text-muted-scms"
              type="button"
              onClick={() => {
                setShowAttendanceModal(false);
                navigate("/kiosk");
              }}
            >
              Mở Kiosk toàn màn hình →
            </Button>
            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                type="button"
                onClick={() => setShowAttendanceModal(false)}
                disabled={attBusy}
              >
                Đóng
              </Button>
              {(() => {
                const emp = attEmployees.find((x) => String(x.employeeId) === String(selectedEmpId));
                const isOut = emp?.isCheckedIn;
                return (
                  <Button
                    variant={isOut ? "outline-danger" : "primary"}
                    type="submit"
                    disabled={attBusy || !emp?.hasAssignedShift || attPinLocked || attPin.trim().length !== 4 || !selectedEmpId}
                  >
                    {attBusy ? <Spinner size="sm" className="me-2" /> : null}
                    {isOut ? "Check Out (Tan ca)" : "Check In (Vào ca)"}
                  </Button>
                );
              })()}
            </div>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modal Công thức pha chế (POS Barista BOM) */}
      <Modal
        show={Boolean(recipeModalProduct)}
        onHide={() => setRecipeModalProduct(null)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <div className="d-flex align-items-center gap-2">
            <Icon name="book" size={20} />
            <div>
              <Modal.Title style={{ fontSize: 18 }}>
                Công thức pha chế · {recipeModalProduct?.name}
              </Modal.Title>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Định lượng chuẩn và quy trình pha chế
              </div>
            </div>
          </div>
        </Modal.Header>
        <Modal.Body>
          {recipeModalProduct && (
            <>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 pb-2 border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-bold">Chọn món khác:</span>
                  <Form.Select
                    size="sm"
                    value={recipeModalProduct.id}
                    onChange={(e) => {
                      const found = products.find((p) => String(p.id) === e.target.value);
                      if (found) openRecipeModal(found);
                    }}
                    style={{ minWidth: 200 }}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.categoryName || "Món"})
                      </option>
                    ))}
                  </Form.Select>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <span className="fw-bold">Size:</span>
                  <div className="btn-group btn-group-sm">
                    {["S", "M", "L"].map((s) => {
                      const szObj = (recipeModalProduct.sizes || []).find((x) => x.size === s);
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`btn ${
                            recipeModalSize === s ? "btn-primary" : "btn-outline-secondary"
                          }`}
                          onClick={() => setRecipeModalSize(s)}
                        >
                          Size {s} {szObj ? `(${formatVnd(szObj.price)})` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {loadingRecipe ? (
                <div className="text-center py-5">
                  <Spinner size="sm" className="me-2" /> Đang tải công thức pha chế…
                </div>
              ) : recipeError ? (
                <div className="alert alert-warning mb-0">{recipeError}</div>
              ) : !recipeData?.items || recipeData.items.length === 0 ? (
                <div className="text-center py-4">
                  <div className="text-muted mb-2" style={{ fontSize: 32 }}>
                    ☕
                  </div>
                  <h5>Chưa có định lượng cho món này</h5>
                  <p className="text-muted mb-0">
                    Món chưa được thiết lập công thức trong hệ thống (Menu & BOM &gt; Công thức).
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-responsive border rounded mb-3">
                    <Table hover className="mb-0 align-middle">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Nguyên liệu</th>
                          <th className="num" style={{ width: 140 }}>
                            Định lượng chuẩn
                          </th>
                          <th style={{ width: 120 }}>Đơn vị</th>
                          <th style={{ width: 140 }}>Phạm vi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeData.items.map((line, idx) => (
                          <tr key={idx}>
                            <td className="text-muted">{idx + 1}</td>
                            <td>
                              <strong>{line.ingredientName}</strong>
                            </td>
                            <td className="num fw-bold text-primary" style={{ fontSize: 15 }}>
                              {formatNumber(line.quantityBase)}
                            </td>
                            <td>
                              <code>{line.baseUnit}</code>
                            </td>
                            <td>
                              {line.size ? (
                                <span className="badge bg-secondary">Riêng Size {line.size}</span>
                              ) : (
                                <span className="badge bg-light text-dark border">Chung</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  <div className="p-3 bg-light rounded border">
                    <h6 className="fw-bold mb-2">📋 Quy trình pha chế chuẩn F&B:</h6>
                    <ol className="mb-0 ps-3 text-secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
                      <li>Đong chính xác định lượng nguyên liệu theo bảng trên vào ca/ly lường.</li>
                      <li>Khuấy đều hoặc sục sữa/đánh bọt (nếu là món nóng/matcha/latte) đạt nhiệt độ 65-70°C.</li>
                      <li>Cho đá viên đúng vạch ly chuẩn size {recipeModalSize}, rót thành phẩm vào ly.</li>
                      <li>Thêm topping đi kèm theo yêu cầu của khách hàng (nếu có).</li>
                      <li>Đậy nắp hoặc dán màng bọc kín, lau sạch miệng ly trước khi chuyển quầy trả đồ.</li>
                    </ol>
                  </div>
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <Button
            variant="outline-primary"
            onClick={() => {
              if (recipeModalProduct && !locked) {
                addToCart(recipeModalProduct);
                toast.success(`Đã thêm ${recipeModalProduct.name} vào đơn!`);
              }
            }}
            disabled={locked || !recipeModalProduct}
          >
            + Thêm món này vào đơn
          </Button>
          <Button variant="secondary" onClick={() => setRecipeModalProduct(null)}>
            Đóng
          </Button>
        </Modal.Footer>
      </Modal>
    </AdminLayout>
  );
}
