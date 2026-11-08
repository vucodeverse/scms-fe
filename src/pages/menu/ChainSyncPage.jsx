import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner, Badge } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { formatVnd, formatDateTime } from "../../lib/format.js";
import { branchesApi } from "../../api/branchesApi.js";
import { categoriesApi } from "../../api/categoriesApi.js";
import { productsApi } from "../../api/productsApi.js";
import { vouchersApi } from "../../api/vouchersApi.js";
import { syncConfigApi } from "../../api/syncConfigApi.js";

const BRANCH_STATUS_LABELS = {
  OPEN: "Đang mở",
  TEMP_CLOSED: "Tạm đóng",
  MAINTENANCE: "Bảo trì",
  INACTIVE: "Ngừng hoạt động",
};

const BRANCH_STATUS_VARIANTS = {
  OPEN: "dark",
  TEMP_CLOSED: "warn",
  MAINTENANCE: "warn",
  INACTIVE: "neutral",
};

const PRODUCT_STATUS_LABELS = {
  AVAILABLE: "Đang bán",
  UNAVAILABLE: "Tạm hết",
  INACTIVE: "Ngừng bán",
};

const PRODUCT_STATUS_VARIANTS = {
  AVAILABLE: "dark",
  UNAVAILABLE: "warn",
  INACTIVE: "neutral",
};

const VOUCHER_STATUS_LABELS = {
  ACTIVE: "Đang áp dụng",
  INACTIVE: "Ngừng áp dụng",
  EXPIRED: "Hết hạn",
};

const VOUCHER_STATUS_VARIANTS = {
  ACTIVE: "dark",
  INACTIVE: "neutral",
  EXPIRED: "warn",
};

// UC14 — Đồng bộ cấu hình chuỗi xuống chi nhánh mục tiêu.
// Cho phép Giám đốc vận hành (COO) chọn chi nhánh nhận đồng bộ và
// chọn chi tiết từng Danh mục, Món ăn kèm Bảng giá và Voucher muốn phát hành.
export default function ChainSyncPage() {
  const { navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // 1. Dữ liệu Chi nhánh
  const [branches, setBranches] = useState([]);
  const [targetBranchIds, setTargetBranchIds] = useState([]);
  const [branchKeyword, setBranchKeyword] = useState("");

  // 2. Dữ liệu Danh mục
  const [categories, setCategories] = useState([]);
  const [syncCategories, setSyncCategories] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

  // 3. Dữ liệu Món ăn & Bảng giá
  const [products, setProducts] = useState([]);
  const [syncProducts, setSyncProducts] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [productKeyword, setProductKeyword] = useState("");
  const [productCatFilter, setProductCatFilter] = useState("");

  // 4. Dữ liệu Voucher
  const [vouchers, setVouchers] = useState([]);
  const [syncVouchers, setSyncVouchers] = useState(true);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState([]);
  const [voucherKeyword, setVoucherKeyword] = useState("");

  // Tải đồng thời tất cả dữ liệu từ hệ thống chuỗi
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      let brItems = [];
      let catItems = [];
      let prodItems = [];
      let vItems = [];

      try {
        const preview = await syncConfigApi.getPreview();
        if (preview) {
          brItems = preview.branches || [];
          catItems = preview.categories || [];
          prodItems = preview.products || [];
          vItems = preview.vouchers || [];
        }
      } catch {
        const [brRes, cats, prods, voucherRes] = await Promise.all([
          branchesApi.list({ uiPage: 1, size: 100, sortBy: "code", sortDir: "ASC" }).catch(() => ({ items: [] })),
          categoriesApi.listAll().catch(() => []),
          syncConfigApi.getProducts().catch(() => productsApi.list({ uiPage: 1, size: 200 }).then((r) => r.items || []).catch(() => [])),
          vouchersApi.list({ uiPage: 1, size: 100 }).catch(() => ({ items: [] })),
        ]);

        brItems = brRes.items || [];
        catItems = cats || [];
        prodItems = Array.isArray(prods) ? prods : prods.items || [];
        vItems = voucherRes.items || [];
      }

      setBranches(brItems);
      setCategories(catItems);
      setProducts(prodItems);
      setVouchers(vItems);

      // Mặc định chọn tất cả chi nhánh đang mở (OPEN)
      const openBranchIds = brItems.filter((b) => b.status === "OPEN").map((b) => b.id);
      setTargetBranchIds(openBranchIds.length ? openBranchIds : brItems.map((b) => b.id));

      // Mặc định chọn tất cả danh mục
      setSelectedCategoryIds(catItems.map((c) => c.id));

      // Mặc định chọn tất cả món ăn
      setSelectedProductIds(prodItems.map((p) => p.id));

      // Mặc định chọn tất cả voucher
      setSelectedVoucherIds(vItems.map((v) => v.id));
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được đầy đủ dữ liệu cấu hình chuỗi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Map danh mục để tra cứu tên
  const categoryMap = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  // Handlers cho Chi nhánh
  function toggleBranch(id) {
    setTargetBranchIds((prev) =>
      prev.includes(id) ? prev.filter((bId) => bId !== id) : [...prev, id]
    );
  }
  function selectAllOpenBranches() {
    setTargetBranchIds(branches.filter((b) => b.status === "OPEN").map((b) => b.id));
  }
  function selectAllBranches() {
    setTargetBranchIds(branches.map((b) => b.id));
  }
  function deselectAllBranches() {
    setTargetBranchIds([]);
  }

  // Handlers cho Danh mục
  function toggleCategory(id) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((cId) => cId !== id) : [...prev, id]
    );
  }
  function selectAllCategories() {
    setSelectedCategoryIds(categories.map((c) => c.id));
  }
  function deselectAllCategories() {
    setSelectedCategoryIds([]);
  }

  // Handlers cho Món ăn
  function toggleProduct(id) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  }
  function selectAllFilteredProducts(items) {
    const ids = items.map((p) => p.id);
    setSelectedProductIds((prev) => Array.from(new Set([...prev, ...ids])));
  }
  function selectAllProducts() {
    setSelectedProductIds(products.map((p) => p.id));
  }
  function deselectAllProducts() {
    setSelectedProductIds([]);
  }

  // Handlers cho Voucher
  function toggleVoucher(id) {
    setSelectedVoucherIds((prev) =>
      prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
    );
  }
  function selectAllVouchers() {
    setSelectedVoucherIds(vouchers.map((v) => v.id));
  }
  function deselectAllVouchers() {
    setSelectedVoucherIds([]);
  }

  // Filter chi nhánh
  const filteredBranches = useMemo(() => {
    if (!branchKeyword.trim()) return branches;
    const kw = branchKeyword.toLowerCase();
    return branches.filter(
      (b) =>
        b.code?.toLowerCase().includes(kw) ||
        b.name?.toLowerCase().includes(kw) ||
        b.address?.toLowerCase().includes(kw)
    );
  }, [branches, branchKeyword]);

  // Filter món ăn
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (productCatFilter && String(p.categoryId) !== String(productCatFilter)) {
        return false;
      }
      if (productKeyword.trim()) {
        const kw = productKeyword.toLowerCase();
        return (
          p.name?.toLowerCase().includes(kw) ||
          String(p.id).includes(kw) ||
          p.categoryName?.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [products, productCatFilter, productKeyword]);

  // Filter voucher
  const filteredVouchers = useMemo(() => {
    if (!voucherKeyword.trim()) return vouchers;
    const kw = voucherKeyword.toLowerCase();
    return vouchers.filter(
      (v) =>
        v.code?.toLowerCase().includes(kw) ||
        (v.discountType && v.discountType.toLowerCase().includes(kw))
    );
  }, [vouchers, voucherKeyword]);

  // Submit đồng bộ
  async function handleSync(e) {
    e.preventDefault();
    if (targetBranchIds.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 chi nhánh mục tiêu để nhận đồng bộ.");
      return;
    }
    if (!syncCategories && !syncProducts && !syncVouchers) {
      toast.error("Vui lòng bật ít nhất 1 nội dung cấu hình (Danh mục, Món ăn hoặc Voucher).");
      return;
    }
    if (syncCategories && selectedCategoryIds.length === 0) {
      toast.error("Bạn đã bật đồng bộ danh mục nhưng chưa chọn danh mục nào.");
      return;
    }
    if (syncProducts && selectedProductIds.length === 0) {
      toast.error("Bạn đã bật đồng bộ món ăn nhưng chưa chọn món ăn nào.");
      return;
    }
    if (syncVouchers && selectedVoucherIds.length === 0 && vouchers.length > 0) {
      toast.error("Bạn đã bật đồng bộ voucher nhưng chưa chọn voucher nào.");
      return;
    }

    setSyncing(true);
    try {
      const payload = {
        targetBranchIds,
        syncCategories,
        syncProducts,
        syncVouchers,
        categoryIds: syncCategories ? selectedCategoryIds : [],
        productIds: syncProducts ? selectedProductIds : [],
        voucherIds: syncVouchers ? selectedVoucherIds : [],
      };

      const res = await syncConfigApi.syncToBranches(payload);
      toast.success(res.message || `Đồng bộ thành công tới ${targetBranchIds.length} chi nhánh.`);
      navigate("/chain/menu");
    } catch (err) {
      toast.error(err.message || "Đồng bộ thất bại, vui lòng thử lại.");
    } finally {
      setSyncing(false);
    }
  }

  const isFormValid =
    targetBranchIds.length > 0 &&
    ((syncCategories && selectedCategoryIds.length > 0) ||
      (syncProducts && selectedProductIds.length > 0) ||
      (syncVouchers && (selectedVoucherIds.length > 0 || vouchers.length === 0)));

  return (
    <TaskLayout
      title="Đồng bộ chuỗi xuống chi nhánh"
      subtitle="Phát hành danh mục, sản phẩm, bảng giá và voucher được chọn từ chuỗi xuống các chi nhánh mục tiêu."
      screenCode="UC14"
      codeLabel="Menu & BOM · Đồng bộ chuỗi"
      backTo="/chain/menu"
    >
      <div className="notice notice--warn mb-3">
        <span>
          Lệnh đồng bộ sẽ phát hành các Danh mục, Món ăn kèm Bảng giá và Voucher đã chọn từ trụ sở chuỗi xuống các chi nhánh mục tiêu.
          Hệ thống sẽ ghi nhận lịch sử kiểm toán vận hành (Audit Log).
        </span>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải danh sách dữ liệu cấu hình…
        </div>
      ) : (
        <Form onSubmit={handleSync}>
          {/* ========================================================= */}
          {/* PANEL 1: CHI NHÁNH MỤC TIÊU */}
          {/* ========================================================= */}
          <div className="scms-panel panel-pad mb-4" id="panel-branches">
            <div className="panel-head">
              <div>
                <h2>1. Chi nhánh mục tiêu</h2>
                <p>
                  Đã chọn <strong>{targetBranchIds.length}</strong> / {branches.length} chi nhánh nhận đồng bộ.
                </p>
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllOpenBranches}>
                  Chỉ chi nhánh đang mở
                </Button>
                <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllBranches}>
                  Chọn tất cả ({branches.length})
                </Button>
                <Button variant="outline-secondary" size="sm" type="button" onClick={deselectAllBranches}>
                  Bỏ chọn tất cả
                </Button>
              </div>
            </div>

            <div className="mb-3">
              <Form.Control
                size="sm"
                placeholder="Tìm chi nhánh theo mã, tên hoặc địa chỉ…"
                value={branchKeyword}
                onChange={(e) => setBranchKeyword(e.target.value)}
                style={{ maxWidth: 360 }}
              />
            </div>

            {filteredBranches.length === 0 ? (
              <div className="text-muted text-center py-4">Không tìm thấy chi nhánh phù hợp.</div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="table table-hover align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th style={{ width: 130 }}>Mã CN</th>
                      <th>Tên chi nhánh</th>
                      <th>Địa chỉ</th>
                      <th style={{ width: 140 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBranches.map((b) => {
                      const isChecked = targetBranchIds.includes(b.id);
                      return (
                        <tr
                          key={b.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleBranch(b.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <Form.Check
                              type="checkbox"
                              id={`branch-check-${b.id}`}
                              checked={isChecked}
                              onChange={() => toggleBranch(b.id)}
                            />
                          </td>
                          <td>
                            <strong>{b.code}</strong>
                          </td>
                          <td>{b.name}</td>
                          <td className="text-muted-scms">{b.address || "—"}</td>
                          <td>
                            <StatusTag
                              status={b.status}
                              label={BRANCH_STATUS_LABELS[b.status] || b.status}
                              variant={BRANCH_STATUS_VARIANTS[b.status]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* PANEL 2: DANH MỤC MÓN */}
          {/* ========================================================= */}
          <div className="scms-panel panel-pad mb-4" id="panel-categories">
            <div className="panel-head">
              <div>
                <Form.Check
                  type="switch"
                  id="toggle-sync-categories"
                  checked={syncCategories}
                  onChange={(e) => setSyncCategories(e.target.checked)}
                  label={<h2 className="d-inline ms-2">2. Danh mục sản phẩm (Categories)</h2>}
                />
                <p className="mt-1 mb-0">
                  {syncCategories ? (
                    <>Đã chọn <strong>{selectedCategoryIds.length}</strong> / {categories.length} danh mục.</>
                  ) : (
                    <span className="text-muted">Đang tắt đồng bộ danh mục.</span>
                  )}
                </p>
              </div>
              {syncCategories ? (
                <div className="d-flex align-items-center gap-2">
                  <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllCategories}>
                    Chọn tất cả ({categories.length})
                  </Button>
                  <Button variant="outline-secondary" size="sm" type="button" onClick={deselectAllCategories}>
                    Bỏ chọn tất cả
                  </Button>
                </div>
              ) : null}
            </div>

            {!syncCategories ? (
              <div className="text-muted text-center py-3 bg-light rounded">
                Chức năng đồng bộ danh mục đang tắt. Bật công tắc phía trên nếu muốn đồng bộ danh mục.
              </div>
            ) : categories.length === 0 ? (
              <div className="text-muted text-center py-4">Chưa có danh mục nào trên hệ thống chuỗi.</div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="table table-hover align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th style={{ width: 140 }}>Mã danh mục</th>
                      <th>Tên danh mục</th>
                      <th style={{ width: 120 }}>Thứ tự</th>
                      <th style={{ width: 140 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => {
                      const isChecked = selectedCategoryIds.includes(c.id);
                      return (
                        <tr
                          key={c.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleCategory(c.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <Form.Check
                              type="checkbox"
                              id={`cat-check-${c.id}`}
                              checked={isChecked}
                              onChange={() => toggleCategory(c.id)}
                            />
                          </td>
                          <td>
                            <strong>{c.code}</strong>
                          </td>
                          <td>{c.name}</td>
                          <td className="text-muted-scms">{c.sortOrder ?? "—"}</td>
                          <td>
                            <StatusTag
                              status={c.status}
                              label={c.status === "ACTIVE" ? "Hoạt động" : "Tạm khóa"}
                              variant={c.status === "ACTIVE" ? "dark" : "neutral"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* PANEL 3: MÓN ĂN & BẢNG GIÁ (HIỂN THỊ TRỰC TIẾP TRÊN FORM) */}
          {/* ========================================================= */}
          <div className="scms-panel panel-pad mb-4 border-primary border-opacity-25" id="panel-products">
            <div className="panel-head">
              <div>
                <Form.Check
                  type="switch"
                  id="toggle-sync-products"
                  checked={syncProducts}
                  onChange={(e) => setSyncProducts(e.target.checked)}
                  label={<h2 className="d-inline ms-2 ">3. Món ăn & Bảng giá theo size (Products & BOM)</h2>}
                />
                <p className="mt-1 mb-0">
                  {syncProducts ? (
                    <>
                      Đã chọn <strong>{selectedProductIds.length}</strong> / {products.length} món ăn kèm bảng giá chi tiết.
                    </>
                  ) : (
                    <span className="text-muted">Đang tắt đồng bộ món ăn.</span>
                  )}
                </p>
              </div>
              {syncProducts ? (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    type="button"
                    onClick={() => selectAllFilteredProducts(filteredProducts)}
                  >
                    Chọn món đang lọc ({filteredProducts.length})
                  </Button>
                  <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllProducts}>
                    Chọn toàn bộ ({products.length})
                  </Button>
                  <Button variant="outline-secondary" size="sm" type="button" onClick={deselectAllProducts}>
                    Bỏ chọn tất cả
                  </Button>
                </div>
              ) : null}
            </div>

            {syncProducts ? (
              <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                <Form.Control
                  size="sm"
                  placeholder="Tìm theo tên món hoặc mã món…"
                  value={productKeyword}
                  onChange={(e) => setProductKeyword(e.target.value)}
                  style={{ maxWidth: 260 }}
                />
                <Form.Select
                  size="sm"
                  value={productCatFilter}
                  onChange={(e) => setProductCatFilter(e.target.value)}
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Tất cả danh mục ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Form.Select>
              </div>
            ) : null}

            {!syncProducts ? (
              <div className="text-muted text-center py-3 bg-light rounded">
                Chức năng đồng bộ món ăn đang tắt. Bật công tắc phía trên nếu muốn phát hành món ăn & bảng giá.
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-muted text-center py-4">Không tìm thấy món ăn nào khớp bộ lọc.</div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="table table-hover align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th style={{ width: 80 }}>Mã #</th>
                      <th style={{ minWidth: 200 }}>Tên món ăn</th>
                      <th style={{ width: 150 }}>Danh mục</th>
                      <th style={{ minWidth: 240 }}>Bảng giá theo Size (S, M, L)</th>
                      <th style={{ minWidth: 160 }}>Topping đi kèm</th>
                      <th style={{ width: 120 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const isChecked = selectedProductIds.includes(p.id);
                      return (
                        <tr
                          key={p.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleProduct(p.id)}
                          className={isChecked ? "table-active" : ""}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <Form.Check
                              type="checkbox"
                              id={`prod-check-${p.id}`}
                              checked={isChecked}
                              onChange={() => toggleProduct(p.id)}
                            />
                          </td>
                          <td>
                            <strong className="text-muted font-monospace">#{p.id}</strong>
                          </td>
                          <td>
                            <div className="fw-bold text-dark">{p.name}</div>
                            {p.description ? (
                              <div className="small text-muted text-truncate" style={{ maxWidth: 300 }}>
                                {p.description}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <span className="badge bg-light text-dark border">
                              {p.categoryName || categoryMap[p.categoryId] || "Chưa phân loại"}
                            </span>
                          </td>
                          <td>
                            {p.sizes && p.sizes.length > 0 ? (
                              <div className="d-flex flex-wrap gap-2">
                                {p.sizes.map((s) => (
                                  <span
                                    key={s.id || s.size}
                                    className={`badge ${s.size === p.defaultSize
                                      ? "bg-primary text-white"
                                      : "bg-light text-dark border"
                                      }`}
                                    title={s.size === p.defaultSize ? "Size mặc định" : ""}
                                  >
                                    <strong>{s.size}</strong>: {formatVnd(s.price)}
                                    {s.size === p.defaultSize ? " ★" : ""}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-scms small">Chưa cấu hình giá</span>
                            )}
                          </td>
                          <td>
                            {p.toppings && p.toppings.length > 0 ? (
                              <div className="small text-muted-scms">
                                {p.toppings.map((t) => t.name).join(", ")}
                              </div>
                            ) : (
                              <span className="text-muted-scms small">—</span>
                            )}
                          </td>
                          <td>
                            <StatusTag
                              status={p.status}
                              label={PRODUCT_STATUS_LABELS[p.status] || p.status}
                              variant={PRODUCT_STATUS_VARIANTS[p.status] || "neutral"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* PANEL 4: CHƯƠNG TRÌNH KHUYẾN MÃI & VOUCHER */}
          {/* ========================================================= */}
          <div className="scms-panel panel-pad mb-4" id="panel-vouchers">
            <div className="panel-head">
              <div>
                <Form.Check
                  type="switch"
                  id="toggle-sync-vouchers"
                  checked={syncVouchers}
                  onChange={(e) => setSyncVouchers(e.target.checked)}
                  label={<h2 className="d-inline ms-2">4. Chương trình khuyến mãi & Voucher</h2>}
                />
                <p className="mt-1 mb-0">
                  {syncVouchers ? (
                    <>Đã chọn <strong>{selectedVoucherIds.length}</strong> / {vouchers.length} voucher.</>
                  ) : (
                    <span className="text-muted">Đang tắt đồng bộ voucher.</span>
                  )}
                </p>
              </div>
              {syncVouchers && vouchers.length > 0 ? (
                <div className="d-flex align-items-center gap-2">
                  <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllVouchers}>
                    Chọn tất cả ({vouchers.length})
                  </Button>
                  <Button variant="outline-secondary" size="sm" type="button" onClick={deselectAllVouchers}>
                    Bỏ chọn tất cả
                  </Button>
                </div>
              ) : null}
            </div>

            {syncVouchers && vouchers.length > 0 ? (
              <div className="mb-3">
                <Form.Control
                  size="sm"
                  placeholder="Tìm voucher theo mã…"
                  value={voucherKeyword}
                  onChange={(e) => setVoucherKeyword(e.target.value)}
                  style={{ maxWidth: 260 }}
                />
              </div>
            ) : null}

            {!syncVouchers ? (
              <div className="text-muted text-center py-3 bg-light rounded">
                Chức năng đồng bộ voucher đang tắt. Bật công tắc phía trên nếu muốn đồng bộ voucher.
              </div>
            ) : vouchers.length === 0 ? (
              <div className="text-muted text-center py-4">Chưa có mã voucher nào trên hệ thống chuỗi.</div>
            ) : filteredVouchers.length === 0 ? (
              <div className="text-muted text-center py-4">Không tìm thấy voucher phù hợp.</div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="table table-hover align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th style={{ width: 140 }}>Mã voucher</th>
                      <th>Loại & Mức giảm</th>
                      <th>Đơn tối thiểu</th>
                      <th>Thời gian áp dụng</th>
                      <th style={{ width: 130 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVouchers.map((v) => {
                      const isChecked = selectedVoucherIds.includes(v.id);
                      return (
                        <tr
                          key={v.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleVoucher(v.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <Form.Check
                              type="checkbox"
                              id={`voucher-check-${v.id}`}
                              checked={isChecked}
                              onChange={() => toggleVoucher(v.id)}
                            />
                          </td>
                          <td>
                            <strong className="text-primary font-monospace">{v.code}</strong>
                          </td>
                          <td>
                            {v.discountType === "PERCENT"
                              ? `Giảm ${v.discountValue}%`
                              : `Giảm ${formatVnd(v.discountValue)}`}
                          </td>
                          <td>{v.minOrderAmount ? formatVnd(v.minOrderAmount) : "Không yêu cầu"}</td>
                          <td className="small text-muted-scms">
                            {v.startDate ? formatDateTime(v.startDate) : "Ngay"} →{" "}
                            {v.endDate ? formatDateTime(v.endDate) : "Vô thời hạn"}
                          </td>
                          <td>
                            <StatusTag
                              status={v.status}
                              label={VOUCHER_STATUS_LABELS[v.status] || v.status}
                              variant={VOUCHER_STATUS_VARIANTS[v.status]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* PANEL 5: TỔNG KẾT VÀ NÚT PHÁT LỆNH ĐỒNG BỘ */}
          {/* ========================================================= */}
          <div className="scms-panel panel-pad mt-4 shadow-sm border">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <h6 className="mb-2 text-muted-scms font-monospace">TỔNG KẾT NỘI DUNG ĐỒNG BỘ</h6>
                <div className="d-flex gap-3 align-items-center flex-wrap">
                  <span className="badge bg-secondary p-2">
                    Chi nhánh: <strong>{targetBranchIds.length}</strong>
                  </span>
                  <span className="badge bg-light text-dark border p-2">
                    Danh mục: <strong>{syncCategories ? `${selectedCategoryIds.length}` : "Tắt"}</strong>
                  </span>
                  <span className="badge bg-primary p-2">
                    Món ăn: <strong>{syncProducts ? `${selectedProductIds.length}` : "Tắt"}</strong>
                  </span>
                  <span className="badge bg-light text-dark border p-2">
                    Voucher: <strong>{syncVouchers ? `${selectedVoucherIds.length}` : "Tắt"}</strong>
                  </span>
                </div>
              </div>

              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  type="button"
                  onClick={() => navigate("/chain/menu")}
                  disabled={syncing}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  size="lg"
                  disabled={syncing || !isFormValid}
                >
                  {syncing ? <Spinner size="sm" className="me-2" /> : null}
                  Phát lệnh đồng bộ ({targetBranchIds.length} chi nhánh)
                </Button>
              </div>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}
