import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { productsApi } from "../../api/productsApi.js";
import { formatNumber, formatVnd } from "../../lib/format.js";

const STATUS_LABELS = { AVAILABLE: "Đang bán", UNAVAILABLE: "Tạm hết", INACTIVE: "Ngừng bán" };
const STATUS_VARIANTS = { AVAILABLE: "dark", UNAVAILABLE: "warn", INACTIVE: "neutral" };
const SIZE_ORDER = ["S", "M", "L"];

function InfoRow({ label, children }) {
  return (
    <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
      <span className="text-muted">{label}</span>
      <strong style={{ textAlign: "right" }}>{children}</strong>
    </div>
  );
}

// TAB-05 — Chi tiết món (FE-13). Mọi thao tác (Sửa, Xoá mềm, Xóa
// hẳn) nằm ở trang này; tab danh sách chỉ còn bấm vào tên món để mở
// chi tiết. Dữ liệu ghép từ dòng danh sách + GET sizes + GET recipe
// (không gọi GET /products/{id} vì endpoint đó lỗi 500 trên môi
// trường chưa có bảng recipe — xem FE-09).
export default function ProductDetailPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const productId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [product, setProduct] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [recipeLines, setRecipeLines] = useState([]);
  const [recipeError, setRecipeError] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'soft' | 'hard'
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!productId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await productsApi.list({ uiPage: 1, size: 100 });
      const row = (page.items || []).find((p) => p.id === productId);
      if (!row) {
        setNotFound(true);
        return;
      }
      setProduct(row);
      const [sizeList, recipe] = await Promise.allSettled([
        productsApi.listSizes(productId),
        productsApi.recipe(productId),
      ]);
      setSizes(sizeList.status === "fulfilled" ? sizeList.value || [] : row.sizes || []);
      if (recipe.status === "fulfilled") {
        setRecipeLines(Array.isArray(recipe.value) ? recipe.value : []);
        setRecipeError(false);
      } else {
        setRecipeLines([]);
        setRecipeError(true);
      }
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được dữ liệu sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === "soft") {
        await productsApi.softDelete(productId);
        toast.success(`Đã ngừng bán sản phẩm "${product.name}" (xoá mềm).`);
        setConfirm(null);
        load();
      } else {
        await productsApi.hardDelete(productId);
        toast.success(`Đã xóa vĩnh viễn sản phẩm "${product.name}".`);
        navigate("/chain/menu");
      }
    } catch (err) {
      toast.error(err.message || "Không xoá được sản phẩm.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <TaskLayout title="Không tìm thấy sản phẩm" screenCode="TAB-05" codeLabel="Menu & BOM" backTo="/chain/menu">
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Sản phẩm không tồn tại. Quay lại menu.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  const sortedSizes = [...sizes].sort(
    (a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size),
  );

  return (
    <TaskLayout
      title={product ? `Chi tiết món · ${product.name}` : "Chi tiết món"}
      subtitle="Thông tin món, giá theo size, topping áp dụng và công thức."
      screenCode="TAB-05"
      codeLabel="Menu & BOM"
      backTo="/chain/menu"
      meta={
        product ? (
          <StatusTag
            status={product.status}
            label={STATUS_LABELS[product.status] || product.status}
            variant={STATUS_VARIANTS[product.status]}
          />
        ) : null
      }
    >
      {loading || !product ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Button variant="primary" onClick={() => navigate(`/chain/menu/edit?id=${product.id}`)}>
              Sửa sản phẩm
            </Button>
            <Button
              variant="outline-secondary"
              disabled={product.status === "INACTIVE"}
              onClick={() => setConfirm("soft")}
            >
              Xoá mềm
            </Button>
            <Button variant="outline-danger" onClick={() => setConfirm("hard")}>
              Xóa hẳn
            </Button>
          </div>

          <div className="grid-2">
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Thông tin món</h2>
                  <p>Hồ sơ món trong menu toàn chuỗi.</p>
                </div>
              </div>
              <InfoRow label="Tên món">{product.name}</InfoRow>
              <InfoRow label="Danh mục">{product.categoryName || "—"}</InfoRow>
              <InfoRow label="Size mặc định">{product.defaultSize || "—"}</InfoRow>
              <InfoRow label="Mô tả">{product.description || "—"}</InfoRow>
              {product.imageUrl ? (
                <div className="mt-3">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, objectFit: "cover" }}
                  />
                </div>
              ) : null}
            </div>

            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Giá theo size</h2>
                  <p>Giá bán hiện hành của từng size.</p>
                </div>
              </div>
              {sortedSizes.length === 0 ? (
                <div className="empty-state">
                  <span>Chưa cấu hình giá cho món này.</span>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover className="mb-0">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th className="num">Giá bán</th>
                        <th>Mặc định</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSizes.map((s) => (
                        <tr key={s.size}>
                          <td>Size {s.size}</td>
                          <td className="num">{formatVnd(s.price)}</td>
                          <td>
                            {product.defaultSize === s.size ? (
                              <StatusTag status="ACTIVE" label="Mặc định" />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Topping áp dụng</h2>
                <p>Các topping khách có thể chọn thêm cho món này.</p>
              </div>
            </div>
            {(product.toppings || []).length === 0 ? (
              <div className="empty-state">
                <span>Món này chưa áp dụng topping nào.</span>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Topping</th>
                      <th className="num">Giá thêm</th>
                      <th>Chọn sẵn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.toppings.map((t) => (
                      <tr key={t.toppingId}>
                        <td>{t.name}</td>
                        <td className="num">{formatVnd(t.extraPrice)}</td>
                        <td>{t.isDefault ? "Có" : "Không"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Công thức (BOM)</h2>
                <p>Định lượng nguyên liệu của món ở mọi size.</p>
              </div>
              <Button size="sm" variant="outline-secondary" onClick={() => navigate("/chain/menu?tab=recipe")}>
                Mở tab Công thức
              </Button>
            </div>
            {recipeError ? (
              <div className="notice notice--warn">
                <span>Không tải được dữ liệu công thức cho món này.</span>
              </div>
            ) : recipeLines.length === 0 ? (
              <div className="empty-state">
                <span>Món này chưa có dữ liệu công thức.</span>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Nguyên liệu</th>
                      <th>Đơn vị gốc</th>
                      <th className="num">Định lượng</th>
                      <th>Áp dụng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipeLines.map((l, i) => (
                      <tr key={`${l.ingredientId}-${l.size || "all"}-${i}`}>
                        <td>{l.ingredientName || `Nguyên liệu #${l.ingredientId}`}</td>
                        <td>{l.baseUnit || "—"}</td>
                        <td className="num">{formatNumber(l.quantityBase)}</td>
                        <td>{l.size ? `Size ${l.size}` : "Mọi size"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>

          <ConfirmDialog
            show={!!confirm}
            title={confirm === "hard" ? "Xóa vĩnh viễn sản phẩm" : "Xoá mềm sản phẩm"}
            body={
              confirm === "hard" ? (
                <p className="mb-0">
                  Xóa vĩnh viễn sản phẩm <strong>{product.name}</strong>? Hành động này không thể hoàn tác
                  và sẽ bị chặn nếu sản phẩm đang được gắn với voucher.
                </p>
              ) : (
                <p className="mb-0">
                  Xoá mềm sản phẩm <strong>{product.name}</strong>? Sản phẩm chuyển sang trạng thái Ngừng
                  bán và không còn xuất hiện ở menu bán hàng.
                </p>
              )
            }
            confirmLabel={confirm === "hard" ? "Xóa vĩnh viễn" : "Xoá mềm"}
            danger={confirm === "hard"}
            busy={busy}
            onConfirm={runDelete}
            onCancel={() => !busy && setConfirm(null)}
          />
        </>
      )}
    </TaskLayout>
  );
}
