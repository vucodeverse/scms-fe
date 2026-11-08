import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { categoriesApi } from "../../api/categoriesApi.js";
import { productsApi } from "../../api/productsApi.js";
import { formatDateTime } from "../../lib/format.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };
const PRODUCT_STATUS_LABELS = { AVAILABLE: "Đang bán", UNAVAILABLE: "Tạm hết", INACTIVE: "Ngừng bán" };
const PRODUCT_STATUS_VARIANTS = { AVAILABLE: "dark", UNAVAILABLE: "warn", INACTIVE: "neutral" };

function InfoRow({ label, children }) {
  return (
    <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
      <span className="text-muted">{label}</span>
      <strong style={{ textAlign: "right" }}>{children}</strong>
    </div>
  );
}

// TAB-05 — Chi tiết danh mục (FE-15). Mọi thao tác (Sửa, đổi thứ
// tự, Ngừng/Kích hoạt, Xoá mềm, Xóa hẳn) nằm ở trang này; tab danh
// sách chỉ còn bấm vào tên danh mục để mở chi tiết. Xoá mềm của
// backend chính là chuyển danh mục sang Ngừng hoạt động nên trang
// hiển thị một nút theo trạng thái hiện tại thay vì hai nút trùng.
export default function CategoryDetailPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const categoryId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [confirm, setConfirm] = useState(null); // 'activate' | 'soft' | 'hard'
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!categoryId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // GET /menu-categories/{id} trả DTO chi tiết KHÔNG có status,
      // productCount và mốc thời gian — lấy dòng danh sách (đủ các
      // trường đó) rồi ghép với danh sách sản phẩm theo categoryId.
      const [all, inCategory] = await Promise.all([
        categoriesApi.listAll(),
        productsApi.list({ uiPage: 1, size: 100, categoryId }),
      ]);
      const row = all.find((c) => c.id === categoryId);
      if (!row) {
        setNotFound(true);
        return;
      }
      setCategory(row);
      setProducts(inCategory.items || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được dữ liệu danh mục.");
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(direction) {
    try {
      const all = await categoriesApi.listAll();
      const idx = all.findIndex((c) => c.id === categoryId);
      const swapIdx = idx + direction;
      if (idx < 0 || swapIdx < 0 || swapIdx >= all.length) return;
      const reordered = [...all];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      await categoriesApi.reorder(reordered.map((c, i) => ({ categoryId: c.id, sortOrder: i + 1 })));
      toast.success("Đã cập nhật thứ tự hiển thị.");
      load();
    } catch (err) {
      toast.error(err.message || "Không đổi được thứ tự.");
    }
  }

  async function runConfirm() {
    if (!confirm || !category) return;
    setBusy(true);
    try {
      if (confirm === "activate") {
        await categoriesApi.changeStatus(category.id, "ACTIVE");
        toast.success(`Đã kích hoạt danh mục "${category.name}".`);
        setConfirm(null);
        load();
      } else if (confirm === "soft") {
        await categoriesApi.softDelete(category.id);
        toast.success(`Đã xoá mềm danh mục "${category.name}" (chuyển sang Ngừng hoạt động).`);
        setConfirm(null);
        load();
      } else {
        await categoriesApi.hardDelete(category.id);
        toast.success(`Đã xóa vĩnh viễn danh mục "${category.name}".`);
        navigate("/chain/menu?tab=categories");
      }
    } catch (err) {
      toast.error(err.message || "Thao tác thất bại.");
      setConfirm(null);
    } finally {
      setBusy(false);
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
      title={category ? `Chi tiết danh mục · ${category.name}` : "Chi tiết danh mục"}
      subtitle="Hồ sơ danh mục và các sản phẩm đang thuộc danh mục."
      screenCode="TAB-05"
      codeLabel="Menu & BOM"
      backTo="/chain/menu?tab=categories"
      meta={
        category ? (
          <StatusTag status={category.status} label={STATUS_LABELS[category.status] || category.status} />
        ) : null
      }
    >
      {loading || !category ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Button variant="primary" onClick={() => navigate(`/chain/menu/category-edit?id=${category.id}`)}>
              Sửa danh mục
            </Button>
            <Button variant="outline-secondary" onClick={() => move(-1)}>
              ↑ Lên
            </Button>
            <Button variant="outline-secondary" onClick={() => move(1)}>
              ↓ Xuống
            </Button>
            {category.status === "ACTIVE" ? (
              <Button variant="outline-secondary" onClick={() => setConfirm("soft")}>
                Xoá mềm
              </Button>
            ) : (
              <Button variant="outline-secondary" onClick={() => setConfirm("activate")}>
                Kích hoạt lại
              </Button>
            )}
            <Button variant="outline-danger" onClick={() => setConfirm("hard")}>
              Xóa hẳn
            </Button>
          </div>

          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Thông tin danh mục</h2>
                <p>Thứ tự hiển thị áp dụng cho menu bán hàng toàn chuỗi.</p>
              </div>
            </div>
            <InfoRow label="Mã danh mục">
              <span className="mono">{category.code}</span>
            </InfoRow>
            <InfoRow label="Tên danh mục">{category.name}</InfoRow>
            <InfoRow label="Mô tả">{category.description || "—"}</InfoRow>
            <InfoRow label="Thứ tự hiển thị">{category.sortOrder}</InfoRow>
            <InfoRow label="Số sản phẩm">{category.productCount}</InfoRow>
            <InfoRow label="Tạo lúc">{formatDateTime(category.createdAt)}</InfoRow>
            <InfoRow label="Cập nhật lúc">{formatDateTime(category.updatedAt)}</InfoRow>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Sản phẩm thuộc danh mục</h2>
                <p>{products.length} sản phẩm đang được gán vào danh mục này.</p>
              </div>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => navigate(`/chain/menu/category-edit?id=${category.id}`)}
              >
                Sửa gán sản phẩm
              </Button>
            </div>
            {products.length === 0 ? (
              <div className="empty-state">
                <span>Chưa có sản phẩm nào thuộc danh mục này.</span>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Tên sản phẩm</th>
                      <th>Size mặc định</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            type="button"
                            className="link-btn"
                            style={{ fontWeight: 600, fontSize: "inherit" }}
                            onClick={() => navigate(`/chain/menu/detail?id=${p.id}`)}
                          >
                            {p.name}
                          </button>
                        </td>
                        <td>{p.defaultSize || "—"}</td>
                        <td>
                          <StatusTag
                            status={p.status}
                            label={PRODUCT_STATUS_LABELS[p.status] || p.status}
                            variant={PRODUCT_STATUS_VARIANTS[p.status]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>

          <ConfirmDialog
            show={!!confirm}
            title={
              confirm === "activate"
                ? "Kích hoạt danh mục"
                : confirm === "soft"
                  ? "Xoá mềm danh mục"
                  : "Xóa vĩnh viễn danh mục"
            }
            body={
              confirm === "activate" ? (
                <p className="mb-0">
                  Kích hoạt lại danh mục <strong>{category.name}</strong>?
                </p>
              ) : confirm === "soft" ? (
                <p className="mb-0">
                  Xoá mềm danh mục <strong>{category.name}</strong>? Backend thực hiện xoá mềm bằng cách
                  chuyển danh mục sang trạng thái Ngừng hoạt động; sản phẩm thuộc danh mục không bị xoá
                  và không bị chuyển đi.
                </p>
              ) : (
                <p className="mb-0">
                  Xóa vĩnh viễn danh mục <strong>{category.name}</strong>? Hành động này không thể hoàn
                  tác và sẽ bị chặn nếu danh mục còn sản phẩm đang bán.
                </p>
              )
            }
            confirmLabel={confirm === "hard" ? "Xóa vĩnh viễn" : "Xác nhận"}
            danger={confirm === "hard"}
            busy={busy}
            onConfirm={runConfirm}
            onCancel={() => !busy && setConfirm(null)}
          />
        </>
      )}
    </TaskLayout>
  );
}
