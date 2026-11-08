import { useCallback, useEffect, useRef, useState } from "react";
import { Form, Spinner, Table } from "react-bootstrap";
import StatusTag from "../../components/StatusTag.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { productsApi } from "../../api/productsApi.js";
import { formatNumber, formatVnd } from "../../lib/format.js";

const SIZES = ["S", "M", "L"];

// TAB-06 — Recipe BOM (FE-10, chỉ đọc) mô phỏng renderBomTab của
// prototype: hàng lọc .report-filters (Sản phẩm + Size), panel
// "BOM · {sản phẩm} · {size}" với bảng định lượng, panel bên
// "Hiệu quả món". Backend chỉ có API đọc (GET /products/{id}/recipe)
// và không trả đơn giá nguyên liệu nên các cột Đơn giá/Chi phí/Tỷ
// trọng của prototype không hiển thị — không dựng số liệu giả.
// Trạng thái rỗng nói đúng bản chất: chưa có dữ liệu công thức và
// backend chưa hỗ trợ nhập công thức.
export default function RecipeTab() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [size, setSize] = useState("M");
  const [lines, setLines] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    productsApi
      .list({ uiPage: 1, size: 100 })
      .then((page) => {
        const items = page.items || [];
        setProducts(items);
        if (items.length) setProductId(String(items[0].id));
      })
      .catch((err) => toastRef.current.error(err.message || "Không tải được danh sách sản phẩm."))
      .finally(() => setLoadingProducts(false));
  }, []);

  const loadRecipe = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await productsApi.recipe(Number(productId), size);
      setLines(Array.isArray(data) ? data : []);
    } catch (err) {
      setLines([]);
      setLoadError(err.message || "Không tải được dữ liệu công thức.");
    } finally {
      setLoading(false);
    }
  }, [productId, size]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const product = products.find((p) => String(p.id) === String(productId)) || null;
  const priceForSize = product?.sizes?.find((s) => s.size === size)?.price;

  return (
    <>
      <div className="report-filters">
        <div className="field grow">
          <Form.Label>Sản phẩm</Form.Label>
          <Form.Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={loadingProducts || products.length === 0}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Form.Select>
        </div>
        <div className="field">
          <Form.Label>Size</Form.Label>
          <Form.Select value={size} onChange={(e) => setSize(e.target.value)}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                Size {s}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>

      {loadingProducts ? (
        <div className="text-center py-4">
          <Spinner size="sm" className="me-2" /> Đang tải…
        </div>
      ) : products.length === 0 ? (
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Chưa có sản phẩm nào. Thêm sản phẩm trước khi xem công thức.</span>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>
                  BOM · {product?.name || ""} · {size}
                </h2>
                <p>Định lượng chuẩn cho một phần bán ra.</p>
              </div>
              {lines.length > 0 ? <StatusTag status="ACTIVE" label="Chuẩn" /> : null}
            </div>

            {loading ? (
              <div className="text-center py-4">
                <Spinner size="sm" className="me-2" /> Đang tải…
              </div>
            ) : loadError ? (
              <div className="notice notice--warn">
                <span>
                  Không tải được dữ liệu công thức cho sản phẩm này. Backend hiện chưa có dữ liệu
                  công thức khả dụng.
                </span>
              </div>
            ) : lines.length === 0 ? (
              <div className="empty-state">
                <span>
                  <strong>Chưa có công thức.</strong>
                  <br />
                  Sản phẩm này chưa có dữ liệu công thức. Backend hiện chỉ có API đọc và chưa hỗ
                  trợ nhập công thức.
                </span>
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
                    {lines.map((l, i) => (
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

          <aside>
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Hiệu quả món</h2>
                  <p>Giá bán và định mức lý thuyết.</p>
                </div>
              </div>
              <div className="stat-line">
                <span>Giá bán size {size}</span>
                <strong>{priceForSize != null ? formatVnd(priceForSize) : "Chưa cấu hình"}</strong>
              </div>
              <div className="stat-line">
                <span>Số dòng định mức</span>
                <strong>{lines.length}</strong>
              </div>
              <div className="stat-line">
                <span>Chi phí nguyên liệu</span>
                <strong>Chưa có dữ liệu đơn giá</strong>
              </div>
              <div className="notice mt-2">
                <span>
                  BOM là dữ liệu chuẩn để tính COGS và tiêu hao lý thuyết, không thay thế kiểm kê
                  thực tế.
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
