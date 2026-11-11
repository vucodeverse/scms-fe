import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import DataTable from "../../components/DataTable.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import FormField from "../../components/FormField.jsx";
import Icon from "../../components/Icon.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { ingredientsApi } from "../../api/ingredientsApi.js";
import { formatNumber, formatVnd } from "../../lib/format.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

export default function IngredientsTab() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modal Thêm / Sửa
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    baseUnit: "g",
    packUnit: "",
    unitsPerPack: "1000",
    unitCost: "0",
    status: "ACTIVE",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ingredientsApi.list(statusFilter, keyword.trim());
      setIngredients(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh mục nguyên vật liệu.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      baseUnit: "g",
      packUnit: "",
      unitsPerPack: "1000",
      unitCost: "0",
      status: "ACTIVE",
    });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || "",
      baseUnit: item.baseUnit || "g",
      packUnit: item.packUnit || "",
      unitsPerPack: item.unitsPerPack != null ? String(item.unitsPerPack) : "1",
      unitCost: item.unitCost != null ? String(item.unitCost) : "0",
      status: item.status || "ACTIVE",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleToggleStatus = async (item) => {
    const newStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const actionText = newStatus === "ACTIVE" ? "kích hoạt lại" : "ngừng hoạt động";
    try {
      await ingredientsApi.changeStatus(item.id, newStatus);
      toastRef.current.success(`Đã ${actionText} nguyên liệu "${item.name}".`);
      load();
    } catch (err) {
      toastRef.current.error(err.message || `Không thể ${actionText} nguyên liệu.`);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError("Tên nguyên vật liệu không được để trống.");
      return;
    }
    if (!formData.baseUnit.trim()) {
      setFormError("Đơn vị cơ sở không được để trống.");
      return;
    }
    const units = Number(formData.unitsPerPack);
    if (isNaN(units) || units <= 0) {
      setFormError("Hệ số quy đổi phải lớn hơn 0.");
      return;
    }
    const cost = Number(formData.unitCost);
    if (isNaN(cost) || cost < 0) {
      setFormError("Giá vốn cơ sở không được âm.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: formData.name.trim(),
      baseUnit: formData.baseUnit.trim(),
      packUnit: formData.packUnit.trim() || null,
      unitsPerPack: units,
      unitCost: cost,
      status: formData.status,
    };

    try {
      if (editingItem) {
        await ingredientsApi.update(editingItem.id, payload);
        toastRef.current.success(`Đã cập nhật nguyên liệu "${payload.name}".`);
      } else {
        await ingredientsApi.create(payload);
        toastRef.current.success(`Đã tạo nguyên liệu "${payload.name}".`);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setFormError(err.message || "Không thể lưu nguyên vật liệu.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "code",
      header: "Mã NL",
      width: 100,
      render: (r) => <span className="mono">{r.code || `ING-${String(r.id).padStart(3, "0")}`}</span>,
    },
    {
      key: "name",
      header: "Tên nguyên vật liệu",
      render: (r) => (
        <div>
          <strong>{r.name}</strong>
          {r.packUnit && (
            <div className="text-muted small">
              Quy cách: {r.packUnit} ({formatNumber(r.unitsPerPack)} {r.baseUnit})
            </div>
          )}
        </div>
      ),
    },
    {
      key: "baseUnit",
      header: "Đơn vị cơ sở",
      width: 120,
      render: (r) => <span className="badge bg-light text-dark border">{r.baseUnit}</span>,
    },
    {
      key: "packUnit",
      header: "Đơn vị đóng gói",
      width: 140,
      render: (r) => r.packUnit || "—",
    },
    {
      key: "unitsPerPack",
      header: "Hệ số quy đổi",
      numeric: true,
      width: 130,
      render: (r) => (
        <span>
          {formatNumber(r.unitsPerPack)} <span className="text-muted small">{r.baseUnit}/kiện</span>
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "Giá vốn cơ sở",
      numeric: true,
      width: 140,
      render: (r) => (
        <span>
          {r.unitCost != null ? formatVnd(r.unitCost) : "—"}
          <span className="text-muted small">/{r.baseUnit}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      render: (r) => <StatusTag status={r.status} label={STATUS_LABELS[r.status] || r.status} />,
    },
    {
      key: "actions",
      header: "Thao tác",
      width: 160,
      numeric: true,
      render: (r) => (
        <div className="d-flex gap-1 justify-content-end">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => openEditModal(r)}
            title="Chỉnh sửa nguyên liệu"
          >
            Sửa
          </Button>
          <Button
            size="sm"
            variant={r.status === "ACTIVE" ? "outline-warning" : "outline-success"}
            onClick={() => handleToggleStatus(r)}
            title={r.status === "ACTIVE" ? "Ngừng dùng nguyên liệu này" : "Kích hoạt lại"}
          >
            {r.status === "ACTIVE" ? "Ngừng" : "Bật"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <Form
          className="d-flex gap-2 flex-wrap align-items-center"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Form.Control
            type="search"
            placeholder="Tìm theo tên nguyên liệu…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <Form.Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 170 }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </Form.Select>
          <Button type="submit" variant="outline-secondary">
            Lọc
          </Button>
        </Form>
        <Button variant="primary" onClick={openCreateModal}>
          <Icon name="plus" size={14} className="me-1" /> Thêm nguyên vật liệu
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={ingredients}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Chưa có nguyên vật liệu nào trong danh mục."
      />

      {/* Modal Thêm / Chỉnh sửa nguyên vật liệu */}
      <Modal show={showModal} onHide={() => !saving && setShowModal(false)} centered backdrop="static">
        <Form onSubmit={handleSave}>
          <Modal.Header closeButton={!saving}>
            <Modal.Title>{editingItem ? "Chỉnh sửa nguyên vật liệu" : "Thêm nguyên vật liệu mới"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {formError && (
              <Alert variant="danger" className="py-2">
                {formError}
              </Alert>
            )}

            <FormField label="Tên nguyên vật liệu" required>
              <Form.Control
                placeholder="VD: Hạt Cà phê Robusta Đắk Lắk, Sữa tươi Dalat Milk..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                autoFocus
              />
            </FormField>

            <div className="row g-2">
              <div className="col-md-6">
                <FormField label="Đơn vị cơ sở (định lượng)" required help="Đơn vị pha chế (g, ml, lon, hộp, quả, cái...)">
                  <Form.Control
                    placeholder="VD: g, ml, lon..."
                    value={formData.baseUnit}
                    onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value })}
                    required
                  />
                </FormField>
              </div>
              <div className="col-md-6">
                <FormField label="Đơn vị đóng gói / kiện" help="Đơn vị khi nhập kho lớn">
                  <Form.Control
                    placeholder="VD: Bao 5kg, Thùng 12 hộp..."
                    value={formData.packUnit}
                    onChange={(e) => setFormData({ ...formData, packUnit: e.target.value })}
                  />
                </FormField>
              </div>
            </div>

            <div className="row g-2">
              <div className="col-md-6">
                <FormField
                  label="Hệ số quy đổi (đơn vị cơ sở / kiện)"
                  required
                  help={`1 kiện = bao nhiêu ${formData.baseUnit || "đơn vị"}`}
                >
                  <Form.Control
                    type="number"
                    min="0.0001"
                    step="any"
                    value={formData.unitsPerPack}
                    onChange={(e) => setFormData({ ...formData, unitsPerPack: e.target.value })}
                    required
                  />
                </FormField>
              </div>
              <div className="col-md-6">
                <FormField
                  label={`Giá vốn cơ sở (VNĐ/${formData.baseUnit || "đơn vị"})`}
                  required
                  help="Ước tính giá vốn 1 đơn vị cơ sở"
                >
                  <Form.Control
                    type="number"
                    min="0"
                    step="any"
                    value={formData.unitCost}
                    onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                    required
                  />
                </FormField>
              </div>
            </div>

            <FormField label="Trạng thái">
              <Form.Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </Form.Select>
            </FormField>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" className="me-1" /> : null}
              {editingItem ? "Lưu thay đổi" : "Tạo nguyên liệu"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
