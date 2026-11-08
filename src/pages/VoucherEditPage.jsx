import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import FormField from "../components/FormField.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { vouchersApi } from "../api/vouchersApi.js";
import { productsApi } from "../api/productsApi.js";
import { categoriesApi } from "../api/categoriesApi.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ISO instant -> giá trị input type="date" theo giờ địa phương.
function isoToDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Ngày bắt đầu = đầu ngày, ngày kết thúc = cuối ngày (giờ địa phương).
function dateInputToIso(value, endOfDay) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
}

const EMPTY_FORM = () => ({
  code: "",
  discountType: "PERCENT",
  discountValue: "10",
  minOrderAmount: "",
  startDate: todayPlus(0),
  endDate: todayPlus(30),
  usageLimit: "",
  status: "ACTIVE",
  productIds: [],
  categoryIds: [],
});

// SCR-12 — Thêm/Sửa voucher dưới dạng task screen như promotionEdit
// của prototype: panel "Thông tin voucher" (form-grid) + panel
// "Phạm vi áp dụng" (check-row) + form-actions Hủy / Lưu voucher.
// Khác prototype ở dữ liệu thật: phạm vi của backend là sản phẩm /
// danh mục (không phải chi nhánh); voucher đã có lượt dùng bị
// backend chặn sửa (422 VOUCHER_IN_USE) nên FE báo trước và khoá Lưu.
export default function VoucherEditPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const editingId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [usedCount, setUsedCount] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productPage, categoryList] = await Promise.all([
        productsApi.list({ uiPage: 1, size: 100 }),
        categoriesApi.listAll(),
      ]);
      setProducts(productPage.items || []);
      setCategories(categoryList || []);
      if (editingId) {
        const detail = await vouchersApi.detail(editingId);
        setUsedCount(detail.usedCount || 0);
        setForm({
          code: detail.code || "",
          discountType: detail.discountType || "PERCENT",
          discountValue: detail.discountValue != null ? String(Number(detail.discountValue)) : "",
          minOrderAmount: detail.minOrderAmount != null ? String(Number(detail.minOrderAmount)) : "",
          startDate: isoToDateInput(detail.startDate),
          endDate: isoToDateInput(detail.endDate),
          usageLimit: detail.usageLimit != null ? String(detail.usageLimit) : "",
          status: detail.status || "ACTIVE",
          productIds: (detail.products || []).map((p) => p.id),
          categoryIds: (detail.categories || []).map((c) => c.id),
        });
      }
    } catch (err) {
      if (editingId && err.status === 404) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu voucher.");
    } finally {
      setLoading(false);
    }
  }, [editingId]);

  useEffect(() => {
    load();
  }, [load]);

  const locked = editingId != null && usedCount > 0;

  function toggleId(field, id, checked) {
    setForm((f) => ({
      ...f,
      [field]: checked ? [...f[field], id] : f[field].filter((x) => x !== id),
    }));
  }

  async function submitForm(e) {
    e.preventDefault();
    if (locked || saving) return;
    setFormError(null);
    const payload = {
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: form.discountValue === "" ? null : Number(form.discountValue),
      minOrderAmount: form.minOrderAmount === "" ? null : Number(form.minOrderAmount),
      startDate: dateInputToIso(form.startDate, false),
      endDate: dateInputToIso(form.endDate, true),
      usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
      status: form.status,
      productIds: form.productIds,
      categoryIds: form.categoryIds,
    };
    setSaving(true);
    try {
      if (editingId) {
        await vouchersApi.update(editingId, payload);
        toast.success(`Đã lưu voucher ${payload.code}.`);
      } else {
        await vouchersApi.create(payload);
        toast.success(`Đã tạo voucher ${payload.code}.`);
      }
      navigate("/chain/vouchers");
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không lưu được voucher.");
    } finally {
      setSaving(false);
    }
  }

  const fe = (name) => formError?.fieldError?.(name) || null;
  const formMessage =
    formError && !formError.fieldErrors?.length ? formError.message : null;

  if (notFound) {
    return (
      <TaskLayout
        title="Không tìm thấy voucher"
        screenCode="SCR-12"
        codeLabel="Khuyến mãi & Voucher"
        backTo="/chain/vouchers"
      >
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Voucher không tồn tại. Quay lại danh sách.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  return (
    <TaskLayout
      title={editingId ? `Sửa voucher · ${form.code || ""}` : "Thêm voucher"}
      subtitle="Điều kiện áp dụng, thời gian hiệu lực và phạm vi áp dụng."
      screenCode="SCR-12"
      codeLabel="Khuyến mãi & Voucher"
      backTo="/chain/vouchers"
      meta={
        editingId ? (
          <StatusTag status={form.status} label={STATUS_LABELS[form.status] || form.status} />
        ) : (
          <StatusTag status="DRAFT" label="Voucher mới" />
        )
      }
    >
      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <Form onSubmit={submitForm}>
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Thông tin voucher</h2>
                <p>
                  {editingId
                    ? "Mã voucher không thay đổi được sau khi tạo."
                    : "Mã được chuẩn hóa tự động sang chữ hoa."}
                </p>
              </div>
            </div>

            {locked ? (
              <div className="notice notice--warn mb-3">
                <span>
                  Voucher đã có <strong>{usedCount} lượt dùng</strong> — backend không cho phép sửa voucher
                  đã được sử dụng. Có thể ngừng hoạt động hoặc tạo voucher mới.
                </span>
              </div>
            ) : null}
            {formMessage ? (
              <div className="notice notice--warn mb-3">
                <span>{formMessage}</span>
              </div>
            ) : null}

            <div className="form-grid">
              <FormField label="Mã voucher" required error={fe("code")} className="">
                <Form.Control
                  value={form.code}
                  disabled={!!editingId || locked}
                  maxLength={15}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="Ví dụ: KHAITRUONG"
                />
              </FormField>
              <FormField label="Loại giảm" error={fe("discountType")} className="">
                <Form.Select
                  value={form.discountType}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                >
                  <option value="PERCENT">Phần trăm</option>
                  <option value="FIXED">Số tiền</option>
                </Form.Select>
              </FormField>
              <FormField
                label={form.discountType === "PERCENT" ? "Giá trị (%)" : "Giá trị (VNĐ)"}
                required
                error={fe("discountValue")}
                className=""
              >
                <Form.Control
                  type="number"
                  min="0"
                  step="1"
                  value={form.discountValue}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                />
              </FormField>
              <FormField label="Đơn tối thiểu (VNĐ)" error={fe("minOrderAmount")} className="">
                <Form.Control
                  type="number"
                  min="0"
                  step="1"
                  value={form.minOrderAmount}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                  placeholder="0 = không yêu cầu"
                />
              </FormField>
              <FormField label="Bắt đầu" required error={fe("startDate")} className="">
                <Form.Control
                  type="date"
                  value={form.startDate}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </FormField>
              <FormField label="Kết thúc" required error={fe("endDate")} className="">
                <Form.Control
                  type="date"
                  value={form.endDate}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </FormField>
              <FormField
                label="Giới hạn lượt dùng"
                error={fe("usageLimit")}
                help={editingId ? `Đã dùng: ${usedCount} lượt.` : null}
                className=""
              >
                <Form.Control
                  type="number"
                  min="1"
                  step="1"
                  value={form.usageLimit}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Trống = không giới hạn"
                />
              </FormField>
              <FormField label="Trạng thái" error={fe("status")} className="">
                <Form.Select
                  value={form.status}
                  disabled={locked}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Ngừng hoạt động</option>
                </Form.Select>
              </FormField>
            </div>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Phạm vi áp dụng</h2>
                <p>Không chọn sản phẩm hay danh mục nào nghĩa là áp dụng cho toàn bộ menu.</p>
              </div>
            </div>
            <FormField label="Sản phẩm áp dụng" error={fe("productIds")} className="mb-3">
              <div className="check-row">
                {products.length === 0 ? (
                  <span className="text-muted">Chưa có sản phẩm.</span>
                ) : (
                  products.map((p) => (
                    <Form.Check
                      key={p.id}
                      type="checkbox"
                      id={`voucher-product-${p.id}`}
                      label={p.name}
                      checked={form.productIds.includes(p.id)}
                      disabled={locked}
                      onChange={(e) => toggleId("productIds", p.id, e.target.checked)}
                    />
                  ))
                )}
              </div>
            </FormField>
            <FormField label="Danh mục áp dụng" error={fe("categoryIds")} className="">
              <div className="check-row">
                {categories.length === 0 ? (
                  <span className="text-muted">Chưa có danh mục.</span>
                ) : (
                  categories.map((c) => (
                    <Form.Check
                      key={c.id}
                      type="checkbox"
                      id={`voucher-category-${c.id}`}
                      label={c.name}
                      checked={form.categoryIds.includes(c.id)}
                      disabled={locked}
                      onChange={(e) => toggleId("categoryIds", c.id, e.target.checked)}
                    />
                  ))
                )}
              </div>
            </FormField>

            <div className="form-actions">
              <Button variant="outline-secondary" onClick={() => navigate("/chain/vouchers")} disabled={saving}>
                Hủy
              </Button>
              <Button variant="primary" type="submit" disabled={saving || locked}>
                {saving ? <Spinner size="sm" className="me-2" /> : null}
                Lưu voucher
              </Button>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}
