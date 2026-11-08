import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../../layouts/TaskLayout.jsx";
import FormField from "../../components/FormField.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { branchesApi } from "../../api/branchesApi.js";
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

// UC14 — Đồng bộ cấu hình chuỗi xuống chi nhánh mục tiêu.
// Task screen cho phép Giám đốc vận hành (COO) phát lệnh đồng bộ
// Menu danh mục, Sản phẩm & Giá bán, Voucher xuống các chi nhánh.
export default function ChainSyncPage() {
  const { navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [targetBranchIds, setTargetBranchIds] = useState([]);
  const [syncCategories, setSyncCategories] = useState(true);
  const [syncProducts, setSyncProducts] = useState(true);
  const [syncVouchers, setSyncVouchers] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [keyword, setKeyword] = useState("");

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await branchesApi.list({ uiPage: 1, size: 100, sortBy: "code", sortDir: "ASC" });
      const items = res.items || [];
      setBranches(items);
      // Mặc định chọn trước tất cả các chi nhánh đang OPEN
      const openIds = items.filter((b) => b.status === "OPEN").map((b) => b.id);
      setTargetBranchIds(openIds);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách chi nhánh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  function toggleBranch(id) {
    setTargetBranchIds((prev) =>
      prev.includes(id) ? prev.filter((bId) => bId !== id) : [...prev, id]
    );
  }

  function selectAllOpen() {
    const openIds = branches.filter((b) => b.status === "OPEN").map((b) => b.id);
    setTargetBranchIds(openIds);
  }

  function selectAll() {
    setTargetBranchIds(branches.map((b) => b.id));
  }

  function deselectAll() {
    setTargetBranchIds([]);
  }

  async function handleSync(e) {
    e.preventDefault();
    if (targetBranchIds.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 chi nhánh mục tiêu.");
      return;
    }
    if (!syncCategories && !syncProducts && !syncVouchers) {
      toast.error("Vui lòng chọn ít nhất 1 nội dung cấu hình để đồng bộ.");
      return;
    }

    setSyncing(true);
    try {
      const res = await syncConfigApi.syncToBranches({
        targetBranchIds,
        syncCategories,
        syncProducts,
        syncVouchers,
      });
      toast.success(res.message || `Đồng bộ thành công tới ${targetBranchIds.length} chi nhánh.`);
      navigate("/chain/menu");
    } catch (err) {
      toast.error(err.message || "Đồng bộ thất bại, vui lòng thử lại.");
    } finally {
      setSyncing(false);
    }
  }

  const filteredBranches = branches.filter((b) => {
    if (!keyword.trim()) return true;
    const kw = keyword.toLowerCase();
    return (
      b.code?.toLowerCase().includes(kw) ||
      b.name?.toLowerCase().includes(kw) ||
      b.address?.toLowerCase().includes(kw)
    );
  });

  return (
    <TaskLayout
      title="Đồng bộ chuỗi xuống chi nhánh"
      subtitle="Phát hành danh mục, sản phẩm, bảng giá và voucher từ chuỗi xuống các chi nhánh mục tiêu."
      screenCode="UC14"
      codeLabel="Menu & BOM · Đồng bộ chuỗi"
      backTo="/chain/menu"
    >
      <div className="notice notice--warn mb-3">
        <span>
          Lệnh đồng bộ sẽ phát hành cấu hình mới nhất từ trụ sở chuỗi xuống các chi nhánh được chọn.
          Hệ thống sẽ ghi nhận lịch sử kiểm toán vận hành (Audit Log).
        </span>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải dữ liệu chi nhánh…
        </div>
      ) : (
        <Form onSubmit={handleSync}>
          {/* PANEL 1: NỘI DUNG ĐỒNG BỘ */}
          <div className="scms-panel panel-pad mb-3">
            <div className="panel-head">
              <div>
                <h2>Nội dung cấu hình</h2>
                <p>Chọn các thành phần cấu hình chuỗi muốn phát hành xuống chi nhánh.</p>
              </div>
            </div>

            <div className="d-flex flex-column gap-3">
              <Form.Check
                type="checkbox"
                id="sync-categories"
                checked={syncCategories}
                onChange={(e) => setSyncCategories(e.target.checked)}
                label={
                  <div>
                    <strong>Danh mục sản phẩm (Categories)</strong>
                    <div className="text-muted-scms small">
                      Đồng bộ mã danh mục, tên danh mục, thứ tự hiển thị và trạng thái.
                    </div>
                  </div>
                }
              />
              <Form.Check
                type="checkbox"
                id="sync-products"
                checked={syncProducts}
                onChange={(e) => setSyncProducts(e.target.checked)}
                label={
                  <div>
                    <strong>Sản phẩm & Giá bán theo size (Products, Sizes & Toppings)</strong>
                    <div className="text-muted-scms small">
                      Đồng bộ thông tin món, công thức (BOM), giá theo từng size và các topping liên kết.
                    </div>
                  </div>
                }
              />
              <Form.Check
                type="checkbox"
                id="sync-vouchers"
                checked={syncVouchers}
                onChange={(e) => setSyncVouchers(e.target.checked)}
                label={
                  <div>
                    <strong>Chương trình khuyến mãi & Voucher</strong>
                    <div className="text-muted-scms small">
                      Đồng bộ các mã voucher áp dụng theo sản phẩm hoặc danh mục trên toàn chuỗi.
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          {/* PANEL 2: CHI NHÁNH MỤC TIÊU */}
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Chi nhánh mục tiêu</h2>
                <p>
                  Đã chọn <strong>{targetBranchIds.length}</strong> / {branches.length} chi nhánh.
                </p>
              </div>
              <div className="d-flex align-items-center gap-2">
                <Button variant="outline-secondary" size="sm" type="button" onClick={selectAllOpen}>
                  Chỉ chọn chi nhánh đang mở
                </Button>
                <Button variant="outline-secondary" size="sm" type="button" onClick={selectAll}>
                  Chọn tất cả
                </Button>
                <Button variant="outline-secondary" size="sm" type="button" onClick={deselectAll}>
                  Bỏ chọn tất cả
                </Button>
              </div>
            </div>

            <div className="mb-3">
              <Form.Control
                size="sm"
                placeholder="Tìm chi nhánh theo mã, tên hoặc địa chỉ…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            {filteredBranches.length === 0 ? (
              <div className="text-muted text-center py-4">Không tìm thấy chi nhánh phù hợp.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th style={{ width: 120 }}>Mã CN</th>
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

            <div className="form-actions">
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
                disabled={
                  syncing ||
                  targetBranchIds.length === 0 ||
                  (!syncCategories && !syncProducts && !syncVouchers)
                }
              >
                {syncing ? <Spinner size="sm" className="me-2" /> : null}
                Phát lệnh đồng bộ ({targetBranchIds.length} chi nhánh)
              </Button>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}

