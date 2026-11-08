import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { toppingsApi } from "../../api/toppingsApi.js";
import { productsApi } from "../../api/productsApi.js";
import { formatVnd } from "../../lib/format.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

function InfoRow({ label, children }) {
  return (
    <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
      <span className="text-muted">{label}</span>
      <strong style={{ textAlign: "right" }}>{children}</strong>
    </div>
  );
}

// TAB-05 — Chi tiết topping (FE-16). Mọi thao tác (Sửa, Ngừng /
// Kích hoạt lại, Xóa hẳn) nằm ở trang này; tab danh sách chỉ còn
// bấm vào tên topping để mở chi tiết. Backend không có
// GET /toppings/{id} lẫn PATCH status cho topping: trang đọc
// topping từ danh sách, kích hoạt lại đi qua PUT mang status.
export default function ToppingDetailPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const toppingId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [topping, setTopping] = useState(null);
  const [applied, setApplied] = useState([]); // [{ product, extraPrice, isDefault }]
  const [confirm, setConfirm] = useState(null); // 'activate' | 'soft' | 'hard'
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!toppingId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [all, productsPage] = await Promise.all([
        toppingsApi.list(),
        productsApi.list({ uiPage: 1, size: 100 }),
      ]);
      const row = (all || []).find((t) => t.id === toppingId);
      if (!row) {
        setNotFound(true);
        return;
      }
      setTopping(row);
      const uses = [];
      for (const p of productsPage.items || []) {
        const link = (p.toppings || []).find((t) => t.toppingId === toppingId);
        if (link) uses.push({ product: p, extraPrice: link.extraPrice, isDefault: link.isDefault });
      }
      setApplied(uses);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được dữ liệu topping.");
    } finally {
      setLoading(false);
    }
  }, [toppingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runConfirm() {
    if (!confirm || !topping) return;
    setBusy(true);
    try {
      if (confirm === "activate") {
        await toppingsApi.update(topping.id, {
          name: topping.name,
          defaultPrice: Number(topping.defaultPrice),
          status: "ACTIVE",
        });
        toast.success(`Đã kích hoạt lại topping "${topping.name}".`);
        setConfirm(null);
        load();
      } else if (confirm === "soft") {
        await toppingsApi.softDelete(topping.id);
        toast.success(`Đã ngừng hoạt động topping "${topping.name}" (xoá mềm).`);
        setConfirm(null);
        load();
      } else {
        await toppingsApi.hardDelete(topping.id);
        toast.success(`Đã xóa vĩnh viễn topping "${topping.name}".`);
        navigate("/chain/menu?tab=toppings");
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
      title={topping ? `Chi tiết topping · ${topping.name}` : "Chi tiết topping"}
      subtitle="Giá mặc định và các sản phẩm đang áp dụng topping."
      screenCode="TAB-05"
      codeLabel="Menu & BOM"
      backTo="/chain/menu?tab=toppings"
      meta={
        topping ? (
          <StatusTag status={topping.status} label={STATUS_LABELS[topping.status] || topping.status} />
        ) : null
      }
    >
      {loading || !topping ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Button variant="primary" onClick={() => navigate(`/chain/menu/topping-edit?id=${topping.id}`)}>
              Sửa topping
            </Button>
            {topping.status === "ACTIVE" ? (
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
                <h2>Thông tin topping</h2>
                <p>Giá mặc định được dùng khi gắn topping vào sản phẩm mới.</p>
              </div>
            </div>
            <InfoRow label="Tên topping">{topping.name}</InfoRow>
            <InfoRow label="Giá mặc định">{formatVnd(Number(topping.defaultPrice))}</InfoRow>
            <InfoRow label="Số sản phẩm đang áp dụng">{applied.length}</InfoRow>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Sản phẩm đang áp dụng</h2>
                <p>Giá thêm và cờ chọn sẵn là cấu hình riêng của từng sản phẩm.</p>
              </div>
            </div>
            {applied.length === 0 ? (
              <div className="empty-state">
                <span>Chưa có sản phẩm nào áp dụng topping này.</span>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th className="num">Giá thêm</th>
                      <th>Chọn sẵn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applied.map(({ product, extraPrice, isDefault }) => (
                      <tr key={product.id}>
                        <td>
                          <button
                            type="button"
                            className="link-btn"
                            style={{ fontWeight: 600, fontSize: "inherit" }}
                            onClick={() => navigate(`/chain/menu/detail?id=${product.id}`)}
                          >
                            {product.name}
                          </button>
                        </td>
                        <td className="num">{formatVnd(extraPrice)}</td>
                        <td>{isDefault ? "Có" : "Không"}</td>
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
                ? "Kích hoạt lại topping"
                : confirm === "soft"
                  ? "Xoá mềm topping"
                  : "Xóa vĩnh viễn topping"
            }
            body={
              confirm === "activate" ? (
                <p className="mb-0">
                  Kích hoạt lại topping <strong>{topping.name}</strong> để áp dụng cho sản phẩm?
                </p>
              ) : confirm === "soft" ? (
                <p className="mb-0">
                  Xoá mềm topping <strong>{topping.name}</strong>? Topping chuyển sang trạng thái Ngừng
                  hoạt động và không còn hiện trên POS.
                </p>
              ) : (
                <p className="mb-0">
                  Xóa vĩnh viễn topping <strong>{topping.name}</strong>? Topping sẽ bị gỡ khỏi mọi sản
                  phẩm đang áp dụng. Hành động này không thể hoàn tác.
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
