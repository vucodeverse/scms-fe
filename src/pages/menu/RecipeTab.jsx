import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import StatusTag from "../../components/StatusTag.jsx";
import Icon from "../../components/Icon.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { productsApi } from "../../api/productsApi.js";
import { ingredientsApi } from "../../api/ingredientsApi.js";
import { fetchAllPages } from "../../api/paging.js";
import { formatNumber, formatVnd } from "../../lib/format.js";

const SIZES = ["S", "M", "L"];

export default function RecipeTab() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [size, setSize] = useState("M");
  const [recipeData, setRecipeData] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Danh sách nguyên vật liệu có sẵn trong hệ thống
  const [ingredients, setIngredients] = useState([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);

  // Modal thêm/sửa công thức
  const [showEditModal, setShowEditModal] = useState(false);
  const [editScope, setEditScope] = useState("COMMON"); // 'COMMON' (mọi size) hoặc 'S' | 'M' | 'L'
  const [editLines, setEditLines] = useState([]); // [{ ingredientId, quantityBase }]
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Tải danh mục sản phẩm và nguyên liệu
  useEffect(() => {
    fetchAllPages((p) => productsApi.list(p))
      .then((items) => {
        setProducts(items);
        if (items.length) {
          const first = items[0];
          setProductId(String(first.id));
          if (first.defaultSize && SIZES.includes(first.defaultSize)) {
            setSize(first.defaultSize);
          }
        }
      })
      .catch((err) => toastRef.current.error(err.message || "Không tải được danh sách sản phẩm."))
      .finally(() => setLoadingProducts(false));

    setLoadingIngredients(true);
    ingredientsApi
      .list("ACTIVE")
      .then((data) => {
        setIngredients(Array.isArray(data) ? data : data?.data || []);
      })
      .catch((err) => toastRef.current.error(err.message || "Không tải được danh mục nguyên vật liệu."))
      .finally(() => setLoadingIngredients(false));
  }, []);

  // Tải dữ liệu công thức của sản phẩm theo size
  const loadRecipe = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await productsApi.recipe(Number(productId), size);
      setRecipeData(data || null);
    } catch (err) {
      setRecipeData(null);
      setLoadError(err.message || "Không tải được dữ liệu công thức.");
    } finally {
      setLoading(false);
    }
  }, [productId, size]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const product = products.find((p) => String(p.id) === String(productId)) || null;
  const availableSizes = useMemo(() => {
    const configured = (product?.sizes || [])
      .map((s) => s.size)
      .filter((s) => SIZES.includes(s))
      .sort((a, b) => SIZES.indexOf(a) - SIZES.indexOf(b));
    return configured.length > 0 ? configured : SIZES;
  }, [product]);

  useEffect(() => {
    if (availableSizes.length > 0 && !availableSizes.includes(size)) {
      const preferred =
        product?.defaultSize && availableSizes.includes(product.defaultSize)
          ? product.defaultSize
          : availableSizes[0];
      setSize(preferred);
    }
  }, [availableSizes, size, product?.defaultSize]);

  const priceForSize = product?.sizes?.find((s) => s.size === size)?.price;
  const lines = recipeData?.items || [];
  const estimatedCogs = recipeData?.estimatedCogs || 0;

  // Lợi nhuận gộp & tỷ suất
  const grossProfit = priceForSize != null ? priceForSize - estimatedCogs : null;
  const marginPct =
    priceForSize && priceForSize > 0
      ? Math.round(((priceForSize - estimatedCogs) / priceForSize) * 1000) / 10
      : null;

  // Mở modal tạo / chỉnh sửa công thức
  const openEditModal = async (scope = "COMMON") => {
    setEditScope(scope);

    // Lọc các dòng đang áp dụng cho scope tương ứng nếu có
    const targetScopeSize = scope === "COMMON" ? null : scope;
    let sourceLines = lines;
    if (targetScopeSize && targetScopeSize !== size && productId) {
      try {
        const fetched = await productsApi.recipe(Number(productId), targetScopeSize);
        sourceLines = fetched?.items || [];
      } catch {
        sourceLines = [];
      }
    }
    const existing = sourceLines
      .filter((l) => (targetScopeSize === null ? !l.size : l.size === targetScopeSize))
      .map((l) => ({
        ingredientId: l.ingredientId,
        quantityBase: l.quantityBase,
      }));

    if (existing.length > 0) {
      setEditLines(existing);
    } else {
      // Mặc định 1 dòng trống
      const firstIng = ingredients[0];
      setEditLines(firstIng ? [{ ingredientId: firstIng.id, quantityBase: 10 }] : []);
    }
    setShowEditModal(true);
  };

  // Thêm 1 dòng nguyên liệu trong modal
  const addEditRow = () => {
    const usedIds = new Set(editLines.map((l) => Number(l.ingredientId)));
    const nextIng = ingredients.find((ing) => !usedIds.has(Number(ing.id))) || ingredients[0];
    if (!nextIng) return;
    setEditLines((prev) => [...prev, { ingredientId: nextIng.id, quantityBase: 10 }]);
  };

  // Cập nhật dòng trong modal
  const updateEditRow = (idx, field, val) => {
    setEditLines((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  // Xóa dòng trong modal
  const removeEditRow = (idx) => {
    setEditLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Tính trước chi phí của modal
  const modalEstimatedCogs = useMemo(() => {
    let sum = 0;
    for (const line of editLines) {
      const ing = ingredients.find((i) => Number(i.id) === Number(line.ingredientId));
      if (ing && line.quantityBase > 0) {
        sum += Number(ing.unitCost || 0) * Number(line.quantityBase);
      }
    }
    return sum;
  }, [editLines, ingredients]);

  // Lưu công thức
  const handleSaveRecipe = async () => {
    if (!productId) return;
    if (editLines.length === 0) {
      toastRef.current.warn("Vui lòng thêm ít nhất một nguyên liệu.");
      return;
    }

    // Kiểm tra trùng lặp
    const ids = editLines.map((l) => Number(l.ingredientId));
    if (new Set(ids).size !== ids.length) {
      toastRef.current.error("Có nguyên liệu bị trùng lặp trong danh sách. Vui lòng gộp dòng.");
      return;
    }

    for (const l of editLines) {
      if (!l.quantityBase || Number(l.quantityBase) <= 0) {
        toastRef.current.error("Định lượng nguyên liệu phải lớn hơn 0.");
        return;
      }
    }

    setSavingRecipe(true);
    try {
      const sizeParam = editScope === "COMMON" ? null : editScope;
      await productsApi.saveRecipe(Number(productId), {
        size: sizeParam,
        items: editLines.map((l) => ({
          ingredientId: Number(l.ingredientId),
          quantityBase: Number(l.quantityBase),
        })),
      });

      toastRef.current.success("Lưu công thức thành công!");
      setShowEditModal(false);
      loadRecipe();
    } catch (err) {
      toastRef.current.error(err.message || "Không thể lưu công thức.");
    } finally {
      setSavingRecipe(false);
    }
  };

  // Xóa công thức
  const handleDeleteRecipe = async (scope) => {
    if (!productId) return;
    const scopeLabel = scope === "COMMON" ? "chung (mọi size)" : `size ${scope}`;
    if (!window.confirm(`Bạn có chắc muốn xoá định lượng công thức ${scopeLabel} của món này không?`)) {
      return;
    }

    setSavingRecipe(true);
    try {
      const sizeParam = scope === "COMMON" ? null : scope;
      await productsApi.deleteRecipe(Number(productId), sizeParam);
      toastRef.current.success(`Đã xoá công thức ${scopeLabel}!`);
      setShowEditModal(false);
      loadRecipe();
    } catch (err) {
      toastRef.current.error(err.message || "Không thể xoá công thức.");
    } finally {
      setSavingRecipe(false);
    }
  };

  return (
    <>
      <div className="report-filters d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div className="d-flex align-items-center gap-3 flex-grow-1 flex-wrap">
          <div className="field grow" style={{ minWidth: 260 }}>
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
          <div className="field" style={{ minWidth: 120 }}>
            <Form.Label>Size xem</Form.Label>
            <Form.Select value={size} onChange={(e) => setSize(e.target.value)}>
              {availableSizes.map((s) => (
                <option key={s} value={s}>
                  Size {s}
                </option>
              ))}
            </Form.Select>
          </div>
        </div>

        <div className="d-flex gap-2 align-items-end mt-2 mt-md-0">
          <Button
            variant="outline-secondary"
            onClick={() => openEditModal("COMMON")}
            disabled={!product}
            className="d-flex align-items-center gap-1"
          >
            <Icon name="settings" size={15} /> Định lượng chung
          </Button>
          <Button
            variant="primary"
            onClick={() => openEditModal(size)}
            disabled={!product}
            className="d-flex align-items-center gap-1"
          >
            <Icon name="plus" size={15} /> Lên công thức Size {size}
          </Button>
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
        <div className="grid-2 mt-3" style={{ gridTemplateColumns: "1fr 340px", alignItems: "start" }}>
          {/* Bảng BOM */}
          <div className="scms-panel panel-pad">
            <div className="panel-head d-flex justify-content-between align-items-start mb-3">
              <div>
                <h2 className="mb-1">
                  BOM · {product?.name || ""} · Size {size}
                </h2>
                <p className="text-muted mb-0">Định lượng nguyên vật liệu chuẩn cho 1 phần thành phẩm.</p>
              </div>
              <div className="d-flex gap-2 align-items-center">
                {lines.length > 0 ? (
                  <StatusTag status="ACTIVE" label={`${lines.length} nguyên liệu`} />
                ) : (
                  <StatusTag status="INACTIVE" label="Chưa có BOM" />
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-4">
                <Spinner size="sm" className="me-2" /> Đang tải công thức…
              </div>
            ) : loadError ? (
              <div className="notice notice--warn">
                <span>{loadError}</span>
              </div>
            ) : lines.length === 0 ? (
              <div className="empty-state text-center py-5">
                <div className="mb-2" style={{ color: "var(--muted)", fontSize: 32 }}>
                  📖
                </div>
                <h5>Chưa có công thức cho Size {size}</h5>
                <p className="text-muted" style={{ maxWidth: 440, margin: "0 auto 16px" }}>
                  Sản phẩm này chưa được thiết lập công thức định lượng nguyên vật liệu. Bấm nút bên dưới để
                  bắt đầu lên công thức cho món.
                </p>
                <div className="d-flex justify-content-center gap-2">
                  <Button variant="outline-primary" onClick={() => openEditModal("COMMON")}>
                    Lên định lượng chung
                  </Button>
                  <Button variant="primary" onClick={() => openEditModal(size)}>
                    Lên công thức Size {size}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Nguyên liệu</th>
                      <th>Đơn vị gốc</th>
                      <th className="num">Định lượng</th>
                      <th className="num">Đơn giá vốn</th>
                      <th className="num">Thành tiền</th>
                      <th className="num">Tỷ trọng COGS</th>
                      <th>Phạm vi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const sharePct =
                        estimatedCogs > 0 && l.lineCost
                          ? Math.round((Number(l.lineCost) / estimatedCogs) * 1000) / 10
                          : 0;
                      return (
                        <tr key={`${l.ingredientId}-${l.size || "all"}-${i}`}>
                          <td className="text-muted">{i + 1}</td>
                          <td>
                            <strong>{l.ingredientName || `Nguyên liệu #${l.ingredientId}`}</strong>
                          </td>
                          <td>
                            <code>{l.baseUnit || "—"}</code>
                          </td>
                          <td className="num fw-bold">{formatNumber(l.quantityBase)}</td>
                          <td className="num text-muted">{l.unitCost != null ? formatVnd(l.unitCost) : "—"}</td>
                          <td className="num fw-bold text-primary">
                            {l.lineCost != null ? formatVnd(l.lineCost) : "—"}
                          </td>
                          <td className="num">{sharePct > 0 ? `${sharePct}%` : "—"}</td>
                          <td>
                            {l.size ? (
                              <span className="badge bg-secondary">Riêng Size {l.size}</span>
                            ) : (
                              <span className="badge bg-light text-dark border">Chung</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-subtle, #f8f9fa)", fontWeight: 600 }}>
                      <td colSpan={5} className="text-end">
                        Tổng giá vốn ước tính (COGS):
                      </td>
                      <td className="num text-primary" style={{ fontSize: 16 }}>
                        {formatVnd(estimatedCogs)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            )}
          </div>

          {/* Panel bên: Hiệu quả món */}
          <aside>
            <div className="scms-panel panel-pad">
              <div className="panel-head mb-3">
                <div>
                  <h2>Hiệu quả món</h2>
                  <p className="text-muted mb-0">Ước tính giá vốn & biên lợi nhuận</p>
                </div>
              </div>

              <div className="stat-line d-flex justify-content-between py-2 border-bottom">
                <span className="text-muted">Giá bán Size {size}</span>
                <strong>{priceForSize != null ? formatVnd(priceForSize) : "Chưa cấu hình"}</strong>
              </div>
              <div className="stat-line d-flex justify-content-between py-2 border-bottom">
                <span className="text-muted">Giá vốn COGS ước tính</span>
                <strong className="text-danger">{formatVnd(estimatedCogs)}</strong>
              </div>
              <div className="stat-line d-flex justify-content-between py-2 border-bottom">
                <span className="text-muted">Lợi nhuận gộp</span>
                <strong className={grossProfit != null && grossProfit >= 0 ? "text-success" : "text-danger"}>
                  {grossProfit != null ? formatVnd(grossProfit) : "—"}
                </strong>
              </div>
              <div className="stat-line d-flex justify-content-between py-2 border-bottom align-items-center">
                <span className="text-muted">Tỷ suất lợi nhuận gộp</span>
                <div>
                  {marginPct != null ? (
                    <span
                      className={`badge ${
                        marginPct >= 65 ? "bg-success" : marginPct >= 45 ? "bg-primary" : "bg-warning text-dark"
                      }`}
                      style={{ fontSize: 13 }}
                    >
                      {marginPct}% {marginPct >= 65 ? "(Tốt)" : marginPct >= 45 ? "(Chuẩn)" : "(Thấp)"}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="stat-line d-flex justify-content-between py-2 border-bottom">
                <span className="text-muted">Số nguyên liệu</span>
                <strong>{lines.length} loại</strong>
              </div>

              <div className="notice mt-3 mb-3 p-2 bg-light rounded" style={{ fontSize: 12 }}>
                💡 <strong>Gợi ý:</strong> Tỷ suất F&B tiêu chuẩn thường dao động từ 60% – 70% giá bán. Định
                lượng chính xác giúp kiểm soát thất thoát và chuẩn hóa chất lượng chuỗi.
              </div>

              <div className="d-grid gap-2">
                <Button variant="primary" onClick={() => openEditModal(size)}>
                  <Icon name="edit" size={14} /> Chỉnh sửa công thức Size {size}
                </Button>
                <Button variant="outline-secondary" onClick={() => openEditModal("COMMON")}>
                  <Icon name="settings" size={14} /> Chỉnh sửa định lượng chung
                </Button>
                {lines.some((l) => l.size === size) ? (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    className="mt-1"
                    onClick={() => handleDeleteRecipe(size)}
                  >
                    <Icon name="trash" size={13} /> Xóa định lượng riêng Size {size}
                  </Button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Modal Lên / Chỉnh sửa công thức */}
      <Modal show={showEditModal} onHide={() => !savingRecipe && setShowEditModal(false)} size="lg" centered>
        <Modal.Header closeButton={!savingRecipe}>
          <Modal.Title>
            Thiết lập công thức · {product?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <Form.Label className="fw-bold">Phạm vi áp dụng</Form.Label>
            <div className="d-flex gap-2">
              <Button
                size="sm"
                variant={editScope === "COMMON" ? "primary" : "outline-secondary"}
                onClick={() => openEditModal("COMMON")}
              >
                Chung cho mọi size
              </Button>
              {availableSizes.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={editScope === s ? "primary" : "outline-secondary"}
                  onClick={() => openEditModal(s)}
                >
                  Riêng Size {s}
                </Button>
              ))}
            </div>
            <div className="text-muted mt-1" style={{ fontSize: 12 }}>
              {editScope === "COMMON"
                ? "Định lượng chung sẽ tự động áp dụng cho tất cả các size thành phẩm."
                : `Định lượng này chỉ áp dụng riêng cho Size ${editScope} (bổ sung hoặc điều chỉnh thêm).`}
            </div>
          </div>

          <div className="table-responsive border rounded mb-3">
            <Table className="mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ minWidth: 220 }}>Nguyên liệu</th>
                  <th style={{ width: 90 }}>Đơn vị</th>
                  <th className="num" style={{ width: 110 }}>Đơn giá</th>
                  <th style={{ width: 130 }}>Định lượng</th>
                  <th className="num" style={{ width: 110 }}>Thành tiền</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {editLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted">
                      Chưa có nguyên liệu nào. Nhấn "+ Thêm nguyên liệu" bên dưới.
                    </td>
                  </tr>
                ) : (
                  editLines.map((line, idx) => {
                    const ing = ingredients.find((i) => Number(i.id) === Number(line.ingredientId));
                    const lineCost =
                      ing && line.quantityBase > 0 ? Number(ing.unitCost || 0) * Number(line.quantityBase) : 0;

                    return (
                      <tr key={idx}>
                        <td>
                          <Form.Select
                            size="sm"
                            value={line.ingredientId}
                            onChange={(e) => updateEditRow(idx, "ingredientId", Number(e.target.value))}
                          >
                            {ingredients.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name}
                              </option>
                            ))}
                          </Form.Select>
                        </td>
                        <td>
                          <code>{ing?.baseUnit || "—"}</code>
                        </td>
                        <td className="num text-muted" style={{ fontSize: 13 }}>
                          {ing?.unitCost != null ? formatVnd(ing.unitCost) : "—"}
                        </td>
                        <td>
                          <Form.Control
                            type="number"
                            size="sm"
                            step="0.01"
                            min="0.0001"
                            value={line.quantityBase}
                            onChange={(e) => updateEditRow(idx, "quantityBase", e.target.value)}
                            placeholder="Định lượng"
                          />
                        </td>
                        <td className="num fw-bold text-primary" style={{ fontSize: 13 }}>
                          {formatVnd(lineCost)}
                        </td>
                        <td className="text-center">
                          <Button
                            variant="light"
                            size="sm"
                            className="text-danger p-1"
                            onClick={() => removeEditRow(idx)}
                            title="Xóa nguyên liệu này"
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>

          <div className="d-flex justify-content-between align-items-center mb-3">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={addEditRow}
              disabled={loadingIngredients || ingredients.length === 0}
              className="d-flex align-items-center gap-1"
            >
              <Icon name="plus" size={14} /> Thêm nguyên liệu
            </Button>
            <div className="text-end">
              <span className="text-muted me-2">Chi phí ước tính:</span>
              <strong className="text-primary" style={{ fontSize: 16 }}>
                {formatVnd(modalEstimatedCogs)}
              </strong>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <div>
            <Button
              variant="outline-danger"
              size="sm"
              disabled={savingRecipe}
              onClick={() => handleDeleteRecipe(editScope)}
            >
              Xoá định lượng này
            </Button>
          </div>
          <div className="d-flex gap-2">
            <Button variant="secondary" onClick={() => setShowEditModal(false)} disabled={savingRecipe}>
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveRecipe}
              disabled={savingRecipe || editLines.length === 0}
              className="d-flex align-items-center gap-1"
            >
              {savingRecipe ? <Spinner size="sm" /> : <Icon name="check" size={15} />}
              Lưu công thức
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </>
  );
}
