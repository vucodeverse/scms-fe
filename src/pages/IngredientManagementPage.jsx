import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import FormField from "../components/FormField.jsx";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatNumber, formatVnd } from "../lib/format.js";
import { ingredientApi } from "../api/ingredientApi.js";

const STATUS_LABELS = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
};

/**
 * SCR-MASTER-ING — Quản lý Mặt hàng Kho Tổng (Master Ingredients).
 * Màn hình quản trị dữ liệu nền móng danh mục nguyên vật liệu dành riêng cho COO.
 * Quản lý danh mục nguyên vật liệu dùng chung cho toàn hệ thống.
 */
export default function IngredientManagementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const menu = buildMenu(user);

  const isCoo = user?.role === "COO";

  // Danh sách và bộ lọc
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [keyword, setKeyword] = useState("");

  // Modal Thêm mới / Chỉnh sửa
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    baseUnit: "g",
    packUnit: "",
    unitsPerPack: "1000",
    unitCost: "100",
    status: "ACTIVE",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ingredientApi.list(statusFilter);
      setItems(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không thể tải danh sách mặt hàng nguyên vật liệu.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lọc dữ liệu client-side theo từ khoá tìm kiếm
  const filteredItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(kw)) ||
        (item.baseUnit && item.baseUnit.toLowerCase().includes(kw)) ||
        (item.packUnit && item.packUnit.toLowerCase().includes(kw)) ||
        String(item.id).includes(kw),
    );
  }, [items, keyword]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((i) => i.status === "ACTIVE").length;
    const inactive = items.filter((i) => i.status === "INACTIVE").length;
    return { total, active, inactive };
  }, [items]);

  // Mở modal thêm mới
  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      baseUnit: "g",
      packUnit: "",
      unitsPerPack: "5000",
      unitCost: "150",
      status: "ACTIVE",
    });
    setFormError(null);
    setShowModal(true);
  };

  // Mở modal chỉnh sửa
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

  // Bật / Tắt trạng thái hoạt động (Switch)
  const handleToggleStatus = async (item) => {
    if (!isCoo) {
      toastRef.current.error("Chỉ COO mới có quyền thay đổi trạng thái mặt hàng.");
      return;
    }
    const targetStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const actionText = targetStatus === "ACTIVE" ? "kích hoạt" : "ngừng hoạt động";
    try {
      await ingredientApi.toggleStatus(item.id, targetStatus);
      toastRef.current.success(`Đã ${actionText} mặt hàng "${item.name}".`);
      loadData();
    } catch (err) {
      toastRef.current.error(err.message || `Không thể ${actionText} mặt hàng.`);
    }
  };

  // Lưu thông tin (Thêm mới hoặc Cập nhật)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!isCoo) {
      setFormError("Bạn không có quyền thực hiện thao tác này (yêu cầu quyền COO).");
      return;
    }

    if (!formData.name.trim()) {
      setFormError("Tên nguyên vật liệu không được để trống.");
      return;
    }

    if (!editingItem && !formData.baseUnit.trim()) {
      setFormError("Đơn vị cơ sở không được để trống.");
      return;
    }

    if (!formData.packUnit.trim()) {
      setFormError("Đơn vị đóng gói không được để trống.");
      return;
    }

    const units = Number(formData.unitsPerPack);
    if (isNaN(units) || units <= 0) {
      setFormError("Hệ số quy đổi đơn vị phải lớn hơn 0.");
      return;
    }

    const cost = Number(formData.unitCost);
    if (isNaN(cost) || cost < 0) {
      setFormError("Đơn giá cơ sở không được âm.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingItem) {
        const updatePayload = {
          name: formData.name.trim(),
          packUnit: formData.packUnit.trim(),
          unitsPerPack: units,
          unitCost: cost,
          status: formData.status,
        };
        await ingredientApi.update(editingItem.id, updatePayload);
        toastRef.current.success(`Đã cập nhật mặt hàng "${updatePayload.name}".`);
      } else {
        const createPayload = {
          name: formData.name.trim(),
          baseUnit: formData.baseUnit.trim(),
          packUnit: formData.packUnit.trim(),
          unitsPerPack: units,
          unitCost: cost,
        };
        await ingredientApi.create(createPayload);
        toastRef.current.success(
          `Đã tạo mặt hàng "${createPayload.name}" thành công.`,
        );
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setFormError(err.message || "Không thể lưu dữ liệu mặt hàng nguyên vật liệu.");
    } finally {
      setSaving(false);
    }
  };

  // Cấu hình các cột hiển thị bảng
  const columns = [
    {
      key: "id",
      header: "MÃ NL",
      width: 90,
      render: (r) => <span className="mono fw-bold">#{r.id}</span>,
    },
    {
      key: "name",
      header: "TÊN NGUYÊN VẬT LIỆU",
      render: (r) => (
        <div>
          <div className="fw-semibold text-dark">{r.name}</div>
          <div className="text-muted small">
            Đơn vị đo cơ sở: <span className="badge bg-light text-dark border">{r.baseUnit}</span>
          </div>
        </div>
      ),
    },
    {
      key: "packUnit",
      header: "QUY CÁCH ĐÓNG GÓI",
      width: 160,
      render: (r) => (
        <div>
          <span className="fw-medium">{r.packUnit || "—"}</span>
        </div>
      ),
    },
    {
      key: "unitsPerPack",
      header: "HỆ SỐ QUY ĐỔI",
      numeric: true,
      width: 160,
      render: (r) => (
        <span>
          <strong>{formatNumber(r.unitsPerPack)}</strong>{" "}
          <span className="text-muted small">{r.baseUnit} / kiện</span>
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "GIÁ VỐN CƠ SỞ",
      numeric: true,
      width: 150,
      render: (r) => (
        <span>
          <span className="fw-bold">{r.unitCost != null ? formatVnd(r.unitCost) : "—"}</span>
          <span className="text-muted small">/{r.baseUnit}</span>
        </span>
      ),
    },
    {
      key: "packCost",
      header: "GIÁ TRỊ / KIỆN",
      numeric: true,
      width: 160,
      render: (r) => {
        const totalPack =
          r.unitsPerPack != null && r.unitCost != null ? Number(r.unitsPerPack) * Number(r.unitCost) : null;
        return (
          <span className="text-primary fw-semibold">
            {totalPack != null ? formatVnd(totalPack) : "—"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "TRẠNG THÁI",
      width: 170,
      render: (r) => (
        <div className="d-flex align-items-center gap-2">
          <Form.Check
            type="switch"
            id={`switch-status-${r.id}`}
            checked={r.status === "ACTIVE"}
            disabled={!isCoo}
            onChange={() => handleToggleStatus(r)}
            title={
              !isCoo
                ? "Chỉ COO mới có quyền đổi trạng thái"
                : r.status === "ACTIVE"
                  ? "Bấm để ngừng hoạt động"
                  : "Bấm để kích hoạt lại"
            }
          />
          <StatusTag status={r.status} label={STATUS_LABELS[r.status] || r.status} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "THAO TÁC",
      width: 110,
      numeric: true,
      render: (r) => (
        <div className="d-flex justify-content-end">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={!isCoo}
            onClick={() => openEditModal(r)}
            title={!isCoo ? "Chỉ xem (Read-only)" : "Chỉnh sửa thông tin"}
          >
            Sửa
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Mặt hàng Kho Tổng (Master Ingredients)"
        screenCode="SCR-MASTER-ING"
        description="Quản trị danh mục nguyên vật liệu chuẩn toàn hệ thống và phân phối cho toàn chuỗi."
        actions={
          isCoo ? (
            <Button variant="primary" onClick={openCreateModal}>
              + Thêm mặt hàng mới
            </Button>
          ) : (
            <Badge bg="secondary" className="p-2">
              Chế độ chỉ xem (Read-only)
            </Badge>
          )
        }
      />

      {!isCoo && (
        <Alert variant="info" className="mb-3">
          <Icon name="info" className="me-2" />
          Bạn đang đăng nhập với vai trò <strong>{roleLabel(user?.role)}</strong>. Danh mục mặt hàng
          nguyên vật liệu được hiển thị ở chế độ <strong>Chỉ đọc (Read-only)</strong> để phục vụ lập
          phiếu yêu cầu cấp hàng. Chỉ <strong>COO</strong> mới có quyền thêm mới, cập nhật và đổi
          trạng thái mặt hàng.
        </Alert>
      )}

      {/* Thẻ thống kê nhanh */}
      <Row className="g-3 mb-3">
        <Col sm={6} md={3}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Body className="p-3">
              <div className="text-muted small">Tổng số mặt hàng</div>
              <div className="fs-4 fw-bold mt-1 text-dark">{stats.total}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Body className="p-3">
              <div className="text-muted small">Đang hoạt động (ACTIVE)</div>
              <div className="fs-4 fw-bold mt-1 text-success">{stats.active}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Body className="p-3">
              <div className="text-muted small">Ngừng hoạt động (INACTIVE)</div>
              <div className="fs-4 fw-bold mt-1 text-secondary">{stats.inactive}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="h-100 border-0 shadow-sm bg-light">
            <Card.Body className="p-3">
              <div className="text-muted small">Hệ thống phân phối</div>
              <div className="small fw-semibold mt-1 text-primary">
                Kho Tổng trung tâm
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Thanh công cụ tìm kiếm và lọc */}
      <div className="scms-panel mb-3 p-3">
        <Row className="g-2 align-items-center">
          <Col md={5} lg={4}>
            <Form.Control
              type="search"
              placeholder="Tìm theo tên nguyên liệu, quy cách, mã…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </Col>
          <Col md={4} lg={3}>
            <Form.Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
              <option value="INACTIVE">Ngừng hoạt động (INACTIVE)</option>
            </Form.Select>
          </Col>
          <Col className="text-md-end text-muted small">
            Hiển thị <strong>{filteredItems.length}</strong> / {items.length} mặt hàng
          </Col>
        </Row>
      </div>

      {/* Bảng dữ liệu mặt hàng */}
      <DataTable
        columns={columns}
        rows={filteredItems}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Không tìm thấy mặt hàng nguyên vật liệu nào."
      />

      {/* Modal Thêm mới / Cập nhật */}
      <Modal show={showModal} onHide={() => !saving && setShowModal(false)} centered backdrop="static">
        <Form onSubmit={handleSave}>
          <Modal.Header closeButton={!saving}>
            <Modal.Title>
              {editingItem ? `Chỉnh sửa: ${editingItem.name}` : "Thêm mới mặt hàng nguyên vật liệu"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {formError && (
              <Alert variant="danger" className="py-2 small">
                {formError}
              </Alert>
            )}

            <FormField label="Tên nguyên vật liệu" required>
              <Form.Control
                type="text"
                placeholder="VD: Hạt Cà phê Robusta Đắk Lắk"
                value={formData.name}
                maxLength={150}
                required
                onChange={(e) => setFormData((cur) => ({ ...cur, name: e.target.value }))}
              />
            </FormField>

            {/* Gợi ý quy cách chuẩn F&B */}
            <div className="p-2 mb-3 rounded bg-light border">
              <div className="small fw-bold text-muted mb-1" style={{ fontSize: 11 }}>
                CHỌN NHANH QUY CÁCH ĐÓNG GÓI CHUẨN F&B (GỢI Ý):
              </div>
              <div className="d-flex gap-1 flex-wrap">
                {[
                  { label: "Thùng 4 gói 5kg", pack: "Thùng 4 gói 5kg", base: "g", factor: "20000" },
                  { label: "Thùng 10 túi 1kg", pack: "Thùng 10 túi 1kg", base: "g", factor: "10000" },
                  { label: "Thùng 12 hộp 1L", pack: "Thùng 12 hộp 1L", base: "hộp", factor: "12" },
                  { label: "Thùng 24 lon 380g", pack: "Thùng 24 lon 380g", base: "lon", factor: "24" },
                  { label: "Thùng 6 chai 700ml", pack: "Thùng 6 chai 700ml", base: "ml", factor: "4200" },
                  { label: "Thùng 10 gói 500g", pack: "Thùng 10 gói 500g", base: "g", factor: "5000" },
                  { label: "Thùng 20 cây (50 ly)", pack: "Thùng 20 cây 50 ly", base: "cái", factor: "1000" },
                  { label: "Thùng 20 bịch (100 ống)", pack: "Thùng 20 bịch 100 cái", base: "cái", factor: "2000" },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant="outline-secondary"
                    className="py-0 px-2"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      setFormData((cur) => ({
                        ...cur,
                        packUnit: preset.pack,
                        baseUnit: editingItem ? cur.baseUnit : preset.base,
                        unitsPerPack: preset.factor,
                      }));
                    }}
                  >
                    + {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <Row className="g-2">
              <Col sm={6}>
                <FormField
                  label="Đơn vị cơ sở (Base Unit)"
                  required
                  help={
                    editingItem
                      ? "Cố định để bảo toàn công thức định lượng (BOM)"
                      : "Đơn vị dùng trừ tồn và làm công thức (g, ml, cái, hộp...)"
                  }
                >
                  <Form.Control
                    type="text"
                    placeholder="VD: g, ml, cái"
                    value={formData.baseUnit}
                    disabled={Boolean(editingItem)}
                    maxLength={20}
                    required
                    onChange={(e) => setFormData((cur) => ({ ...cur, baseUnit: e.target.value }))}
                  />
                </FormField>
              </Col>
              <Col sm={6}>
                <FormField
                  label="Đơn vị đóng gói kiện (Pack Unit)"
                  required
                  help="VD: Thùng 4 gói 5kg, Thùng 12 hộp 1L..."
                >
                  <Form.Control
                    type="text"
                    placeholder="VD: Thùng 4 gói 5kg, Thùng 12 hộp 1L"
                    value={formData.packUnit}
                    maxLength={40}
                    required
                    onChange={(e) => setFormData((cur) => ({ ...cur, packUnit: e.target.value }))}
                  />
                </FormField>
              </Col>
            </Row>

            <Row className="g-2">
              <Col sm={6}>
                <FormField
                  label={`Hệ số quy đổi (${formData.baseUnit || "đơn vị"}/kiện)`}
                  required
                  help={`1 ${formData.packUnit || "kiện"} = bao nhiêu ${formData.baseUnit || "đơn vị cơ sở"}?`}
                >
                  <Form.Control
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    placeholder="VD: 20000"
                    value={formData.unitsPerPack}
                    required
                    onChange={(e) =>
                      setFormData((cur) => ({ ...cur, unitsPerPack: e.target.value }))
                    }
                  />
                </FormField>
              </Col>
              <Col sm={6}>
                <FormField
                  label={`Đơn giá cơ sở (VNĐ/${formData.baseUnit || "đơn vị"})`}
                  required
                  help="Giá vốn chuẩn của 1 đơn vị cơ sở"
                >
                  <Form.Control
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="VD: 150"
                    value={formData.unitCost}
                    required
                    onChange={(e) => setFormData((cur) => ({ ...cur, unitCost: e.target.value }))}
                  />
                </FormField>
              </Col>
            </Row>

            {/* Khung xem trước quy đổi */}
            <div className="p-2 mb-3 rounded bg-primary-subtle border border-primary-subtle small">
              <div className="fw-bold text-primary" style={{ fontSize: 11 }}>
                👉 XEM TRƯỚC QUY ĐỔI KHI CHI NHÁNH XIN CẤP HÀNG:
              </div>
              <div className="mt-1">
                • 1 {formData.packUnit || "Kiện"} = <strong>{formatNumber(formData.unitsPerPack || 0)} {formData.baseUnit || "đơn vị"}</strong>
                {formData.baseUnit === "g" && Number(formData.unitsPerPack) >= 1000 ? (
                  <span className="text-muted"> ({formatNumber(Number(formData.unitsPerPack) / 1000)} kg)</span>
                ) : null}
                {formData.baseUnit === "ml" && Number(formData.unitsPerPack) >= 1000 ? (
                  <span className="text-muted"> ({formatNumber(Number(formData.unitsPerPack) / 1000)} lít)</span>
                ) : null}
              </div>
              <div className="text-muted mt-0.5" style={{ fontSize: 11 }}>
                • Ví dụ chi nhánh xin 2 {formData.packUnit || "kiện"} $\rightarrow$ Hệ thống tự tính:{" "}
                <strong>{formatNumber(2 * Number(formData.unitsPerPack || 0))} {formData.baseUnit}</strong>
              </div>
            </div>

            {editingItem && (
              <FormField label="Trạng thái hoạt động">
                <Form.Select
                  value={formData.status}
                  onChange={(e) => setFormData((cur) => ({ ...cur, status: e.target.value }))}
                >
                  <option value="ACTIVE">ACTIVE — Đang sử dụng</option>
                  <option value="INACTIVE">INACTIVE — Ngừng sử dụng (Soft delete)</option>
                </Form.Select>
              </FormField>
            )}

            {!editingItem && (
              <Alert variant="info" className="small mt-2 mb-0">
                <Icon name="check" className="me-1" />
                Khi tạo mặt hàng mới, hệ thống sẽ tự động cập nhật danh mục cho toàn bộ chuỗi.
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>
              Huỷ
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" className="me-2" /> : null}
              {editingItem ? "Lưu thay đổi" : "Tạo mặt hàng"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </AdminLayout>
  );
}
