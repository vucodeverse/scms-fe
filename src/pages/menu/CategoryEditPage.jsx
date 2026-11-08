import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import FormField from "../../components/FormField.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { categoriesApi } from "../../api/categoriesApi.js";
import { productsApi } from "../../api/productsApi.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

// TAB-05 — Thêm/Sửa danh mục (FE-15, task screen thay modal cũ).
// Panel gán sản phẩm: gửi productIds khi lưu — backend chuyển các
// sản phẩm được chọn vào danh mục này, sản phẩm thuộc danh mục mà
// bị bỏ chọn sẽ chuyển về danh mục mặc định (chưa phân loại).
export default function CategoryEditPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const editingId = query.id ? Number(query.id) : null;
  const isEdit = editingId != null;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [code, setCode] = useState("");
  const [statusTag, setStatusTag] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(1);
  const [status, setStatus] = useState("ACTIVE");
  const [allProducts, setAllProducts] = useState([]);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsPage, inCategory] = await Promise.all([
        productsApi.list({ uiPage: 1, size: 100 }),
        isEdit ? productsApi.list({ uiPage: 1, size: 100, categoryId: editingId }) : Promise.resolve(null),
      ]);
      setAllProducts(productsPage.items || []);
      if (isEdit) {
        // DTO chi tiết của backend không có status — lấy từ dòng
        // danh sách như CategoryDetailPage.
        const all = await categoriesApi.listAll();
        const row = all.find((c) => c.id === editingId);
        if (!row) {
          setNotFound(true);
          return;
        }
        setCode(row.code);
        setStatusTag(row.status);
        setName(row.name);
        setDescription(row.description || "");
        setSortOrder(row.sortOrder);
        setStatus(row.status);
        setCheckedIds(new Set((inCategory.items || []).map((p) => p.id)));
      } else {
        const all = await categoriesApi.listAll();
        setSortOrder(all.length + 1);
      }
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu danh mục.");
    } finally {
      setLoading(false);
    }
  }, [editingId, isEdit]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleProduct(id, on) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFormMessage(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      sortOrder: Number(sortOrder),
      status,
      productIds: [...checkedIds],
    };
    try {
      if (isEdit) {
        await categoriesApi.update(editingId, payload);
        toast.success(`Đã cập nhật danh mục "${payload.name}".`);
        navigate(`/chain/menu/category-detail?id=${editingId}`);
      } else {
        const created = await categoriesApi.create(payload);
        toast.success(`Đã tạo danh mục "${payload.name}".`);
        navigate(`/chain/menu/category-detail?id=${created.id}`);
      }
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) setFormMessage(err.message || "Không lưu được danh mục.");
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <TaskLayout title="Không tìm thấy danh mục" screenCode="TAB-05" codeLabel="Menu & BOM" backTo="/chain/menu?tab=categories">
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Danh mục không tồn tại. Quay lại Menu & BOM.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  return (
    <TaskLayout
      title={isEdit ? `Sửa danh mục · ${name || code}` : "Thêm danh mục"}
      subtitle="Tên, thứ tự hiển thị trên menu và các sản phẩm thuộc danh mục."
      screenCode="TAB-05"
      codeLabel="Menu & BOM"
      backTo={isEdit ? `/chain/menu/category-detail?id=${editingId}` : "/chain/menu?tab=categories"}
      meta={
        isEdit && statusTag ? (
          <StatusTag status={statusTag} label={STATUS_LABELS[statusTag] || statusTag} />
        ) : (
          <StatusTag status="DRAFT" label="Danh mục mới" variant="neutral" />
        )
      }
    >
      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <Form onSubmit={submit}>
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Thông tin danh mục</h2>
                <p>
                  {isEdit
                    ? `Mã danh mục ${code} do hệ thống sinh và không thay đổi được.`
                    : "Mã danh mục do hệ thống tự sinh khi tạo."}
                </p>
              </div>
            </div>
            {formMessage ? (
              <div className="notice notice--warn">
                <span>{formMessage}</span>
              </div>
            ) : null}
            <div className="form-grid">
              <FormField label="Tên danh mục" required error={formError?.fieldError?.("name") || null}>
                <Form.Control
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Cà phê"
                  autoFocus
                />
              </FormField>
              <FormField label="Trạng thái">
                <Form.Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Ngừng hoạt động</option>
                </Form.Select>
              </FormField>
              <FormField
                label="Thứ tự hiển thị"
                required
                error={formError?.fieldError?.("sortOrder") || null}
              >
                <Form.Control
                  type="number"
                  min={1}
                  max={9999}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </FormField>
              <FormField label="Mô tả" error={formError?.fieldError?.("description") || null}>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </FormField>
            </div>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Sản phẩm thuộc danh mục</h2>
                <p>
                  Sản phẩm được chọn sẽ thuộc danh mục này. Sản phẩm đang thuộc danh mục mà bị bỏ chọn sẽ
                  chuyển về danh mục mặc định (chưa phân loại) khi lưu.
                </p>
              </div>
            </div>
            {allProducts.length === 0 ? (
              <div className="empty-state">
                <span>Chưa có sản phẩm nào trong hệ thống.</span>
              </div>
            ) : (
              <div className="check-row">
                {allProducts.map((p) => (
                  <Form.Check
                    key={p.id}
                    type="checkbox"
                    id={`cat-product-${p.id}`}
                    label={p.name}
                    checked={checkedIds.has(p.id)}
                    onChange={(e) => toggleProduct(p.id, e.target.checked)}
                  />
                ))}
              </div>
            )}
            <div className="form-actions">
              <Button
                variant="outline-secondary"
                onClick={() =>
                  navigate(isEdit ? `/chain/menu/category-detail?id=${editingId}` : "/chain/menu?tab=categories")
                }
                disabled={saving}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
                {saving ? <Spinner size="sm" className="me-2" /> : null}
                {isEdit ? "Lưu thay đổi" : "Tạo danh mục"}
              </Button>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}
