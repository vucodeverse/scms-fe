import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner, Tab, Tabs, Badge } from "react-bootstrap";
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
// Cho phép COO chọn chi nhánh và chọn chính xác từng Danh mục, Món ăn, Voucher muốn phát hành.
export default function ChainSyncPage() {
  const { navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // 1. Dữ liệu & lựa chọn Chi nhánh
  const [branches, setBranches] = useState([]);
  const [targetBranchIds, setTargetBranchIds] = useState([]);
  const [branchKeyword, setBranchKeyword] = useState("");

  // 2. Dữ liệu & lựa chọn Danh mục
  const [categories, setCategories] = useState([]);
  const [syncCategories, setSyncCategories] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

  // 3. Dữ liệu & lựa chọn Sản phẩm / Món ăn
  const [products, setProducts] = useState([]);
  const [syncProducts, setSyncProducts] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [productKeyword, setProductKeyword] = useState("");
  const [productCatFilter, setProductCatFilter] = useState("");

  // 4. Dữ liệu & lựa chọn Voucher
  const [vouchers, setVouchers] = useState([]);
  const [syncVouchers, setSyncVouchers] = useState(true);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState([]);
  const [voucherKeyword, setVoucherKeyword] = useState("");

  // Tải đồng thời tất cả dữ liệu từ chuỗi
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [brRes, cats, prodPage, voucherRes] = await Promise.all([
        branchesApi.list({ uiPage: 1, size: 100, sortBy: "code", sortDir: "ASC" }).catch(() => ({ items: [] })),
        categoriesApi.listAll().catch(() => []),
        productsApi.list({ uiPage: 1, size: 200 }).catch(() => ({ items: [] })),
        vouchersApi.list({ uiPage: 1, size: 100 }).catch(() => ({ items: [] })),
      ]);

      const brItems = brRes.items || [];
      const catItems = cats || [];
      const prodItems = prodPage.items || [];
      const vItems = voucherRes.items || [];

      setBranches(brItems);
      setCategories(catItems);
      setProducts(prodItems);
      setVouchers(vItems);

      // Mặc định chọn tất cả chi nhánh đang OPEN
      const openBranchIds = brItems.filter((b) => b.status === "OPEN").map((b) => b.id);
      setTargetBranchIds(openBranchIds.length ? openBranchIds : brItems.map((b) => b.id));

      // Mặc định chọn tất cả danh mục active
      setSelectedCategoryIds(catItems.map((c) => c.id));

      // Mặc định chọn tất cả món ăn active/available
      setSelectedProductIds(prodItems.map((p) => p.id));

      // Mặc định chọn tất cả voucher active
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
          p.code?.toLowerCase().includes(kw) ||
          p.name?.toLowerCase().includes(kw)
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
          Lệnh đồng bộ sẽ phát hành các Danh mục, Món ăn và Voucher đã chọn từ trụ sở chuỗi xuống các chi nhánh mục tiêu.
          Hệ thống sẽ ghi nhận lịch sử kiểm toán vận hành (Audit Log).
        </span>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải danh sách dữ liệu cấu hình…
        </div>
      ) : (
        <Form onSubmit={handleSync}>
          <Tabs defaultActiveKey="branches" className="mb-3">
            {/* TAB 1: CHI NHÁNH MỤC TIÊU */}
            <Tab
              eventKey="branches"
              title={
                <span>
                  1. Chi nhánh mục tiêu{" "}
                  <Badge bg={targetBranchIds.length > 0 ? "primary" : "secondary"}>
                    {targetBranchIds.length}/{branches.length}
                  </Badge>
                </span>
              }
            >
              <div className="scms-panel panel-pad mb-3">
                <div className="panel-head">
                  <div>
                    <h2>Chọn chi nhánh nhận đồng bộ</h2>
                    <p>
                      Đã chọn <strong>{targetBranchIds.length}</strong> / {branches.length} chi nhánh.
                    </p>
                  </div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllOpenBranches}>
                      Chỉ chi nhánh đang mở
                    </Button>
                    <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllBranches}>
                      Chọn tất cả
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
                  <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
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
            </Tab>

            {/* TAB 2: DANH MỤC MÓN */}
            <Tab
              eventKey="categories"
              title={
                <span>
                  2. Danh mục món{" "}
                  <Badge bg={syncCategories ? (selectedCategoryIds.length > 0 ? "primary" : "warning") : "secondary"}>
                    {syncCategories ? `${selectedCategoryIds.length}/${categories.length}` : "Tắt"}
                  </Badge>
                </span>
              }
            >
              <div className="scms-panel panel-pad mb-3">
                <div className="panel-head">
                  <div>
                    <Form.Check
                      type="switch"
                      id="toggle-sync-categories"
                      checked={syncCategories}
                      onChange={(e) => setSyncCategories(e.target.checked)}
                      label={<strong className="fs-6">Đồng bộ danh mục món (Categories)</strong>}
                    />
                    <p className="mt-1 mb-0">
                      Đã chọn <strong>{syncCategories ? selectedCategoryIds.length : 0}</strong> / {categories.length} danh mục.
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
                  <div className="text-muted text-center py-4 bg-light rounded">
                    Chức năng đồng bộ danh mục đang tắt. Hãy bật công tắc phía trên nếu muốn đồng bộ danh mục.
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-muted text-center py-4">Chưa có danh mục nào trên hệ thống chuỗi.</div>
                ) : (
                  <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
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
            </Tab>

            {/* TAB 3: MÓN ĂN & BẢNG GIÁ */}
            <Tab
              eventKey="products"
              title={
                <span>
                  3. Món ăn & Bảng giá{" "}
                  <Badge bg={syncProducts ? (selectedProductIds.length > 0 ? "primary" : "warning") : "secondary"}>
                    {syncProducts ? `${selectedProductIds.length}/${products.length}` : "Tắt"}
                  </Badge>
                </span>
              }
            >
              <div className="scms-panel panel-pad mb-3">
                <div className="panel-head">
                  <div>
                    <Form.Check
                      type="switch"
                      id="toggle-sync-products"
                      checked={syncProducts}
                      onChange={(e) => setSyncProducts(e.target.checked)}
                      label={<strong className="fs-6">Đồng bộ món ăn & bảng giá theo size (Products & BOM)</strong>}
                    />
                    <p className="mt-1 mb-0">
                      Đã chọn <strong>{syncProducts ? selectedProductIds.length : 0}</strong> / {products.length} món ăn.
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
                      placeholder="Tìm theo mã hoặc tên món…"
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
                      <option value="">Tất cả danh mục</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Form.Select>
                  </div>
                ) : null}

                {!syncProducts ? (
                  <div className="text-muted text-center py-4 bg-light rounded">
                    Chức năng đồng bộ món ăn đang tắt. Hãy bật công tắc phía trên nếu muốn đồng bộ món ăn.
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-muted text-center py-4">Không tìm thấy món ăn nào khớp bộ lọc.</div>
                ) : (
                  <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
                    <table className="table table-hover align-middle">
                      <thead className="table-light sticky-top">
                        <tr>
                          <th style={{ width: 44 }}></th>
                          <th style={{ width: 120 }}>Mã món</th>
                          <th>Tên món</th>
                          <th style={{ width: 160 }}>Danh mục</th>
                          <th style={{ width: 160 }}>Size mặc định & Giá</th>
                          <th style={{ width: 130 }}>Trạng thái</th>
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
                                <strong>{p.code}</strong>
                              </td>
                              <td>
                                <div className="fw-semibold">{p.name}</div>
                                {p.description ? (
                                  <div className="small text-muted text-truncate" style={{ maxWidth: 280 }}>
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
                                  <div>
                                    {p.sizes.map((s) => (
                                      <span key={s.size} className="me-2 small">
                                        <b>{s.size}</b>: {formatVnd(s.price)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-scms">—</span>
                                )}
                              </td>
                              <td>
                                <StatusTag
                                  status={p.status}
                                  label={p.status === "ACTIVE" || p.status === "AVAILABLE" ? "Đang bán" : "Ngừng bán"}
                                  variant={p.status === "ACTIVE" || p.status === "AVAILABLE" ? "dark" : "neutral"}
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
            </Tab>

            {/* TAB 4: CHƯƠNG TRÌNH KHUYẾN MÃI & VOUCHER */}
            <Tab
              eventKey="vouchers"
              title={
                <span>
                  4. Voucher{" "}
                  <Badge bg={syncVouchers ? (selectedVoucherIds.length > 0 ? "primary" : "warning") : "secondary"}>
                    {syncVouchers ? `${selectedVoucherIds.length}/${vouchers.length}` : "Tắt"}
                  </Badge>
                </span>
              }
            >
              <div className="scms-panel panel-pad mb-3">
                <div className="panel-head">
                  <div>
                    <Form.Check
                      type="switch"
                      id="toggle-sync-vouchers"
                      checked={syncVouchers}
                      onChange={(e) => setSyncVouchers(e.target.checked)}
                      label={<strong className="fs-6">Đồng bộ chương trình khuyến mãi & Voucher</strong>}
                    />
                    <p className="mt-1 mb-0">
                      Đã chọn <strong>{syncVouchers ? selectedVoucherIds.length : 0}</strong> / {vouchers.length} voucher.
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
                  <div className="text-muted text-center py-4 bg-light rounded">
                    Chức năng đồng bộ voucher đang tắt. Hãy bật công tắc phía trên nếu muốn đồng bộ voucher.
                  </div>
                ) : vouchers.length === 0 ? (
                  <div className="text-muted text-center py-4">Chưa có mã voucher nào trên hệ thống chuỗi.</div>
                ) : filteredVouchers.length === 0 ? (
                  <div className="text-muted text-center py-4">Không tìm thấy voucher phù hợp.</div>
                ) : (
                  <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
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
            </Tab>
          </Tabs>

          {/* TỔNG KẾT VÀ NÚT THAO TÁC */}
          <div className="scms-panel panel-pad mt-3">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <h6 className="mb-1 text-muted-scms">TỔNG KẾT PHÁT HÀNH ĐỒNG BỘ</h6>
                <div className="d-flex gap-3 align-items-center flex-wrap">
                  <span>
                    Chi nhánh: <strong>{targetBranchIds.length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Danh mục:{" "}
                    <strong>
                      {syncCategories ? `${selectedCategoryIds.length} danh mục` : "Không đồng bộ"}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Món ăn:{" "}
                    <strong>
                      {syncProducts ? `${selectedProductIds.length} món` : "Không đồng bộ"}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Voucher:{" "}
                    <strong>
                      {syncVouchers ? `${selectedVoucherIds.length} voucher` : "Không đồng bộ"}
                    </strong>
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
