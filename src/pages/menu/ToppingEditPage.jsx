import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import FormField from "../../components/FormField.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { toppingsApi } from "../../api/toppingsApi.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

// TAB-05 — Thêm/Sửa topping (FE-16, task screen thay modal cũ).
// Backend không có GET /toppings/{id}: bản ghi sửa được đọc từ
// danh sách topping.
export default function ToppingEditPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const editingId = query.id ? Number(query.id) : null;
  const isEdit = editingId != null;

  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [statusTag, setStatusTag] = useState(null);
  const [name, setName] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);

  const load = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    try {
      const all = await toppingsApi.list();
      const row = (all || []).find((t) => t.id === editingId);
      if (!row) {
        setNotFound(true);
        return;
      }
      setStatusTag(row.status);
      setName(row.name);
      setDefaultPrice(String(row.defaultPrice));
      setStatus(row.status);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được dữ liệu topping.");
    } finally {
      setLoading(false);
    }
  }, [editingId, isEdit]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    const price = Number(defaultPrice);
    if (defaultPrice === "" || Number.isNaN(price) || !Number.isInteger(price) || price < 0) {
      setFormError({
        fieldError: (f) => (f === "defaultPrice" ? "Giá phải là số nguyên VNĐ không âm." : null),
        fieldErrors: [{ field: "defaultPrice" }],
      });
      return;
    }
    setSaving(true);
    setFormError(null);
    setFormMessage(null);
    const payload = { name: name.trim(), defaultPrice: price, status };
    try {
      if (isEdit) {
        await toppingsApi.update(editingId, payload);
        toast.success(`Đã cập nhật topping "${payload.name}".`);
        navigate(`/chain/menu/topping-detail?id=${editingId}`);
      } else {
        const created = await toppingsApi.create(payload);
        toast.success(`Đã tạo topping "${payload.name}".`);
        navigate(`/chain/menu/topping-detail?id=${created.id}`);
      }
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) setFormMessage(err.message || "Không lưu được topping.");
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <TaskLayout title="Không tìm thấy topping" screenCode="TAB-05" codeLabel="Menu & BOM" backTo="/chain/menu?tab=toppings">
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Topping không tồn tại. Quay lại Menu & BOM.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  return (
    <TaskLayout
      title={isEdit ? `Sửa topping · ${name}` : "Thêm topping"}
      subtitle="Tên và giá mặc định của topping dùng chung toàn chuỗi."
      screenCode="TAB-05"
      codeLabel="Menu & BOM"
      backTo={isEdit ? `/chain/menu/topping-detail?id=${editingId}` : "/chain/menu?tab=toppings"}
      meta={
        isEdit && statusTag ? (
          <StatusTag status={statusTag} label={STATUS_LABELS[statusTag] || statusTag} />
        ) : (
          <StatusTag status="DRAFT" label="Topping mới" variant="neutral" />
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
                <h2>Thông tin topping</h2>
                <p>Giá cộng thêm mặc định khi topping được gắn vào sản phẩm; từng sản phẩm có thể đặt lại giá riêng.</p>
              </div>
            </div>
            {formMessage ? (
              <div className="notice notice--warn">
                <span>{formMessage}</span>
              </div>
            ) : null}
            <div className="form-grid">
              <FormField label="Tên topping" required error={formError?.fieldError?.("name") || null}>
                <Form.Control
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Kem tươi"
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
                label="Giá mặc định (VNĐ)"
                required
                error={formError?.fieldError?.("defaultPrice") || null}
              >
                <Form.Control
                  type="number"
                  min="0"
                  step="500"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  placeholder="Ví dụ: 8000"
                />
              </FormField>
            </div>
            <div className="form-actions">
              <Button
                variant="outline-secondary"
                onClick={() =>
                  navigate(isEdit ? `/chain/menu/topping-detail?id=${editingId}` : "/chain/menu?tab=toppings")
                }
                disabled={saving}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
                {saving ? <Spinner size="sm" className="me-2" /> : null}
                {isEdit ? "Lưu thay đổi" : "Tạo topping"}
              </Button>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}
