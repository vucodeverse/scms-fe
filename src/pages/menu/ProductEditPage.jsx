import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import FormField from "../../components/FormField.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { categoriesApi } from "../../api/categoriesApi.js";
import { productsApi } from "../../api/productsApi.js";
import { toppingsApi } from "../../api/toppingsApi.js";

const STATUS_LABELS = { AVAILABLE: "Đang bán", UNAVAILABLE: "Tạm hết", INACTIVE: "Ngừng bán" };
const STATUS_VARIANTS = { AVAILABLE: "dark", UNAVAILABLE: "warn", INACTIVE: "neutral" };
const SIZES = ["S", "M", "L"];

const EMPTY_FORM = () => ({
  name: "",
  categoryId: "",
  description: "",
  imageUrl: "",
  defaultSize: "S",
  status: "AVAILABLE",
  prices: { S: "", M: "", L: "" },
  toppings: {}, // toppingId -> { extraPrice: string, isDefault: bool }
});

// SCR-11 TAB-05 — Thêm/Sửa sản phẩm dưới dạng task screen mô phỏng
// menuEdit của prototype: panel Thông tin sản phẩm (tên, danh mục,
// trạng thái, giá từng size, mô tả) + panel Phạm vi áp dụng (topping
// dạng check-row) + form-actions Hủy / Lưu sản phẩm.
// Khác prototype ở dữ liệu thật của backend: không có mã món và
// không có "chi nhánh tạm ngưng"; có thêm Size mặc định (backend yêu
// cầu) và giá cộng thêm/chọn sẵn cho từng topping đã chọn.
// Lưu = tuần tự: sản phẩm -> giá từng size (thêm/sửa/xoá) -> topping.
export default function ProductEditPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const editingId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState([]);
  const [allToppings, setAllToppings] = useState([]);
  const [originalSizes, setOriginalSizes] = useState({}); // size -> price (đã lưu)
  const [formError, setFormError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryList, toppingList] = await Promise.all([
        categoriesApi.listAll(),
        toppingsApi.list(),
      ]);
      setCategories(categoryList || []);
      setAllToppings(toppingList || []);
      if (editingId) {
        // DTO chi tiết có thể lỗi 500 trên DB sạch (bảng recipe) nên
        // lấy sản phẩm từ danh sách + giá từ endpoint sizes như FE-09.
        const page = await productsApi.list({ uiPage: 1, size: 100 });
        const row = (page.items || []).find((p) => p.id === editingId);
        if (!row) {
          setNotFound(true);
          return;
        }
        const sizes = await productsApi.listSizes(editingId).catch(() => row.sizes || []);
        const prices = { S: "", M: "", L: "" };
        const originals = {};
        for (const s of sizes || []) {
          prices[s.size] = String(Number(s.price));
          originals[s.size] = Number(s.price);
        }
        const applied = {};
        for (const t of row.toppings || []) {
          applied[t.toppingId] = {
            extraPrice: String(Number(t.extraPrice)),
            isDefault: !!t.isDefault,
          };
        }
        setOriginalSizes(originals);
        setForm({
          name: row.name || "",
          categoryId: row.categoryId ? String(row.categoryId) : "",
          description: row.description || "",
          imageUrl: row.imageUrl || "",
          defaultSize: row.defaultSize || "S",
          status: row.status || "AVAILABLE",
          prices,
          toppings: applied,
        });
      } else {
        setForm((f) => ({ ...f, categoryId: categoryList?.[0]?.id ? String(categoryList[0].id) : "" }));
      }
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được dữ liệu sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, [editingId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleTopping(topping, checked) {
    setForm((f) => {
      const next = { ...f.toppings };
      if (checked) {
        next[topping.id] = {
          extraPrice: String(Number(topping.defaultPrice ?? 0)),
          isDefault: false,
        };
      } else {
        delete next[topping.id];
      }
      return { ...f, toppings: next };
    });
  }

  function setToppingField(id, field, value) {
    setForm((f) => ({
      ...f,
      toppings: { ...f.toppings, [id]: { ...f.toppings[id], [field]: value } },
    }));
  }

  async function submitForm(e) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    setFormMessage(null);

    // Size mặc định bắt buộc có giá (backend chặn xoá size mặc định).
    if (!form.prices[form.defaultSize] || Number(form.prices[form.defaultSize]) <= 0) {
      setFormMessage(`Size mặc định ${form.defaultSize} phải có giá lớn hơn 0.`);
      return;
    }

    const payload = {
      name: form.name.trim(),
      categoryId: Number(form.categoryId),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      defaultSize: form.defaultSize || null,
      status: form.status,
    };

    setSaving(true);
    let productId = editingId;
    try {
      if (editingId) {
        await productsApi.update(editingId, payload);
      } else {
        const created = await productsApi.create(payload);
        productId = created.id;
      }
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không lưu được sản phẩm.");
      setSaving(false);
      return;
    }

    // Giá size + topping: nếu lỗi ở bước này, sản phẩm đã được lưu —
    // chuyển sang màn hình sửa của chính sản phẩm đó để lưu tiếp.
    try {
      for (const size of SIZES) {
        const raw = form.prices[size];
        const had = originalSizes[size] != null;
        if (raw === "" || raw == null) {
          if (had && size !== form.defaultSize) await productsApi.deleteSize(productId, size);
        } else if (!had || Number(raw) !== originalSizes[size]) {
          await productsApi.upsertSize(productId, { size, price: Number(raw) });
        }
      }
      const items = Object.entries(form.toppings).map(([toppingId, v]) => ({
        toppingId: Number(toppingId),
        extraPrice: v.extraPrice === "" ? 0 : Number(v.extraPrice),
        isDefault: !!v.isDefault,
      }));
      await productsApi.replaceToppings(productId, items);
      toast.success(
        editingId ? `Đã lưu sản phẩm "${payload.name}".` : `Đã tạo sản phẩm "${payload.name}".`,
      );
      navigate("/chain/menu");
    } catch (err) {
      toast.error(
        `Đã lưu thông tin sản phẩm nhưng chưa lưu xong giá/topping: ${err.message || "lỗi không rõ"}`,
      );
      if (!editingId && productId) navigate(`/chain/menu/edit?id=${productId}`);
      else setFormMessage(err.message || "Không lưu được giá/topping.");
    } finally {
      setSaving(false);
    }
  }

  const fe = (name) => formError?.fieldError?.(name) || null;
  const selectedToppings = allToppings.filter((t) => form.toppings[t.id]);

  if (notFound) {
    return (
      <TaskLayout
        title="Không tìm thấy sản phẩm"
        screenCode="TAB-05"
        codeLabel="Menu & BOM"
        backTo="/chain/menu"
      >
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Sản phẩm không tồn tại. Quay lại menu.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  return (
    <TaskLayout
      title={editingId ? `Sửa sản phẩm · ${form.name || ""}` : "Thêm sản phẩm"}
      subtitle="Thông tin menu, giá bán theo size và topping áp dụng."
      screenCode="TAB-05"
      codeLabel="Menu & BOM"
      backTo="/chain/menu"
      meta={
        editingId ? (
          <StatusTag
            status={form.status}
            label={STATUS_LABELS[form.status] || form.status}
            variant={STATUS_VARIANTS[form.status]}
          />
        ) : (
          <StatusTag status="DRAFT" label="Sản phẩm mới" />
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
                <h2>Thông tin sản phẩm</h2>
                <p>Giá bán cấu hình theo từng size; size mặc định bắt buộc có giá.</p>
              </div>
            </div>

            {formMessage ? (
              <div className="notice notice--warn mb-3">
                <span>{formMessage}</span>
              </div>
            ) : null}

            <div className="form-grid">
              <FormField label="Tên món" required error={fe("name")} className="">
                <Form.Control
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ví dụ: Cà phê sữa đá"
                />
              </FormField>
              <FormField label="Danh mục" required error={fe("categoryId")} className="">
                <Form.Select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">— Chọn danh mục —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Form.Select>
              </FormField>
              <FormField label="Trạng thái" error={fe("status")} className="">
                <Form.Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="AVAILABLE">Đang bán</option>
                  <option value="UNAVAILABLE">Tạm hết</option>
                  <option value="INACTIVE">Ngừng bán</option>
                </Form.Select>
              </FormField>
              <FormField label="Size mặc định" error={fe("defaultSize")} className="">
                <Form.Select
                  value={form.defaultSize}
                  onChange={(e) => setForm({ ...form, defaultSize: e.target.value })}
                >
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Form.Select>
              </FormField>
              {SIZES.map((s) => (
                <FormField key={s} label={`Giá size ${s} (VNĐ)`} className="">
                  <Form.Control
                    type="number"
                    min="0"
                    step="1"
                    value={form.prices[s]}
                    onChange={(e) =>
                      setForm({ ...form, prices: { ...form.prices, [s]: e.target.value } })
                    }
                    placeholder="Trống = chưa bán size này"
                  />
                </FormField>
              ))}
              <FormField label="Đường dẫn ảnh" error={fe("imageUrl")} className="">
                <Form.Control
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://…"
                />
              </FormField>
              <FormField label="Mô tả" error={fe("description")} className="span-all">
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </FormField>
            </div>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Phạm vi áp dụng</h2>
                <p>Topping áp dụng cho sản phẩm và giá cộng thêm tương ứng.</p>
              </div>
            </div>

            <FormField label="Topping áp dụng" className="mb-3">
              <div className="check-row">
                {allToppings.length === 0 ? (
                  <span className="text-muted">Chưa có topping.</span>
                ) : (
                  allToppings.map((t) => (
                    <Form.Check
                      key={t.id}
                      type="checkbox"
                      id={`product-topping-${t.id}`}
                      label={t.name}
                      checked={!!form.toppings[t.id]}
                      onChange={(e) => toggleTopping(t, e.target.checked)}
                    />
                  ))
                )}
              </div>
            </FormField>

            {selectedToppings.map((t) => (
              <div key={t.id} className="d-flex align-items-center gap-3 mb-2">
                <span style={{ minWidth: 160 }}>{t.name}</span>
                <Form.Control
                  type="number"
                  min="0"
                  step="1"
                  style={{ maxWidth: 180 }}
                  value={form.toppings[t.id].extraPrice}
                  onChange={(e) => setToppingField(t.id, "extraPrice", e.target.value)}
                  aria-label={`Giá cộng thêm của ${t.name}`}
                />
                <span className="text-muted">VNĐ</span>
                <Form.Check
                  type="checkbox"
                  id={`product-topping-default-${t.id}`}
                  label="Chọn sẵn"
                  checked={!!form.toppings[t.id].isDefault}
                  onChange={(e) => setToppingField(t.id, "isDefault", e.target.checked)}
                />
              </div>
            ))}

            <div className="form-actions">
              <Button variant="outline-secondary" onClick={() => navigate("/chain/menu")} disabled={saving}>
                Hủy
              </Button>
              <Button variant="primary" type="submit" disabled={saving || !form.name.trim() || !form.categoryId}>
                {saving ? <Spinner size="sm" className="me-2" /> : null}
                Lưu sản phẩm
              </Button>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}
