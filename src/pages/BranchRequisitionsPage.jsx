import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Spinner, Table } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatDateTime } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";

const STATUS_MAP = {
  PENDING: { label: "Chờ COO duyệt", variant: "warning", textClass: "text-dark" },
  APPROVED: { label: "Đã duyệt phân bổ (Đang chuyển)", variant: "info", textClass: "text-white" },
  COMPLETED: { label: "Đã tiếp nhận đủ hàng", variant: "success", textClass: "text-white" },
  REJECTED: { label: "Từ chối duyệt", variant: "danger", textClass: "text-white" },
};

/**
 * SCR-14 — Quản lý & Theo dõi đơn xin cấp hàng từ Kho Tổng của Chi nhánh.
 * Dành riêng cho Quản lý chi nhánh (BRANCH_MANAGER).
 * - Tạo đơn xin cấp hàng mới (PR nguyên kiện).
 * - Theo dõi tình trạng từng đơn: Chờ duyệt -> Đã duyệt -> Đang chuyển -> Đã nhận.
 * - Nhận hàng điều phối (GRN) trực tiếp từ đơn đã được duyệt phân bổ.
 */
export default function BranchRequisitionsPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const menu = buildMenu(user);

  const [loading, setLoading] = useState(true);
  const [requisitions, setRequisitions] = useState([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [expandedId, setExpandedId] = useState(null);

  const branchId = user?.branchId || 4;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await inventoryApi.getRequisitions({
        branchId,
        status: "ALL",
      });
      setRequisitions(data || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách đơn cấp hàng.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = requisitions.filter((r) => {
    if (filterStatus === "ALL") return true;
    return r.status === filterStatus;
  });

  const countPending = requisitions.filter((r) => r.status === "PENDING").length;
  const countApproved = requisitions.filter((r) => r.status === "APPROVED" || r.status === "PARTIALLY_RECEIVED").length;
  const countCompleted = requisitions.filter((r) => r.status === "COMPLETED").length;

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Đơn xin cấp hàng Kho Tổng"
        screenCode="SCR-14"
        description="Theo dõi tình trạng phê duyệt của Kho Tổng, lịch sử cấp hàng và tiếp nhận hàng về cửa hàng."
        actions={
          <div className="d-flex gap-2">
            <Button variant="outline-primary" onClick={loadData} disabled={loading}>
              <Icon name="sync" size={15} /> Làm mới
            </Button>
            <Button variant="primary" onClick={() => navigate("/branch/inventory/slip?type=requisition")}>
              <Icon name="plus" size={15} /> Tạo yêu cầu cấp hàng
            </Button>
          </div>
        }
      />

      {/* Thẻ thống kê tình trạng đơn */}
      <Row className="g-3 mb-4">
        <Col sm={6} md={3}>
          <Card className="p-3 border text-center bg-light">
            <div className="text-muted small">Tổng đơn đã gửi</div>
            <div className="fs-3 fw-bold">{requisitions.length}</div>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="p-3 border text-center border-warning">
            <div className="text-warning small fw-bold">Chờ COO duyệt</div>
            <div className="fs-3 fw-bold text-warning">{countPending}</div>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="p-3 border text-center border-info">
            <div className="text-info small fw-bold">Chờ tiếp nhận hàng</div>
            <div className="fs-3 fw-bold text-info">{countApproved}</div>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="p-3 border text-center border-success">
            <div className="text-success small fw-bold">Đã nhận hoàn tất</div>
            <div className="fs-3 fw-bold text-success">{countCompleted}</div>
          </Card>
        </Col>
      </Row>

      {/* Bộ lọc trạng thái */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div className="d-flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant={filterStatus === "ALL" ? "dark" : "outline-secondary"}
            onClick={() => setFilterStatus("ALL")}
          >
            Tất cả ({requisitions.length})
          </Button>
          <Button
            size="sm"
            variant={filterStatus === "PENDING" ? "warning" : "outline-secondary"}
            onClick={() => setFilterStatus("PENDING")}
          >
            Chờ duyệt ({countPending})
          </Button>
          <Button
            size="sm"
            variant={filterStatus === "APPROVED" ? "info" : "outline-secondary"}
            onClick={() => setFilterStatus("APPROVED")}
          >
            Chờ nhận hàng ({countApproved})
          </Button>
          <Button
            size="sm"
            variant={filterStatus === "COMPLETED" ? "success" : "outline-secondary"}
            onClick={() => setFilterStatus("COMPLETED")}
          >
            Đã nhận ({countCompleted})
          </Button>
        </div>

        <span className="text-muted small">
          Đang hiển thị {filtered.length} đơn
        </span>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải danh sách đơn cấp hàng…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-5 text-center text-muted bg-light">
          <div className="fs-1 mb-2">📦</div>
          <h5>Không có đơn xin cấp hàng nào</h5>
          <p className="small mb-3">
            {filterStatus === "ALL"
              ? "Cửa hàng chưa tạo đơn xin cấp nguyên liệu nào từ Kho Tổng."
              : `Không có đơn nào ở trạng thái ${STATUS_MAP[filterStatus]?.label || filterStatus}.`}
          </p>
          <div>
            <Button variant="primary" onClick={() => navigate("/branch/inventory/slip?type=requisition")}>
              + Tạo yêu cầu cấp hàng ngay
            </Button>
          </div>
        </Card>
      ) : (
        <div className="table-responsive bg-white rounded border shadow-sm">
          <Table hover className="align-middle mb-0">
            <thead className="table-light small">
              <tr>
                <th style={{ width: 140 }}>Mã đơn</th>
                <th style={{ width: 160 }}>Thời gian gửi</th>
                <th>Chi tiết nguyên liệu xin cấp</th>
                <th>Số lượng duyệt / xin</th>
                <th style={{ width: 180 }} className="text-center">Tình trạng</th>
                <th style={{ width: 180 }} className="text-end">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isApproved = r.status === "APPROVED" || r.status === "PARTIALLY_RECEIVED";
                const isPending = r.status === "PENDING";
                const isCompleted = r.status === "COMPLETED";
                const isExpanded = expandedId === r.requisitionId;
                const statusMeta = STATUS_MAP[r.status] || { label: r.status, variant: "secondary", textClass: "" };

                const totalCartonsRequested = (r.items || []).reduce((sum, it) => sum + (it.cartonsRequested || 0), 0);
                const totalCartonsApproved = (r.items || []).reduce((sum, it) => sum + (it.totalCartonsApproved || 0), 0);

                // Tổng hợp các kho tổng phân bổ
                const warehouseSources = [];
                (r.items || []).forEach((it) => {
                  (it.allocations || []).forEach((a) => {
                    const name = a.sourceWarehouseName || (a.sourceWarehouseId === 1 ? "DC Hà Nội" : a.sourceWarehouseId === 2 ? "DC Đà Nẵng" : "DC TP.HCM");
                    if (!warehouseSources.includes(name)) warehouseSources.push(name);
                  });
                });

                return (
                  <tr key={r.requisitionId}>
                    <td>
                      <strong className="text-primary">{r.requisitionCode}</strong>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        ID #{r.requisitionId}
                      </div>
                    </td>
                    <td>
                      <div className="small">{formatDateTime(r.createdAt)}</div>
                      {r.notes ? (
                        <div className="text-muted text-truncate" style={{ maxWidth: 150, fontSize: 11 }} title={r.notes}>
                          {r.notes}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div>
                        <strong>{r.items?.length || 0}</strong> mặt hàng ({totalCartonsRequested} kiện)
                      </div>
                      <div className="text-muted small mt-1">
                        {(r.items || []).slice(0, 2).map((it) => `${it.ingredientName} (${it.cartonsRequested} ${it.packUnit || "kiện"})`).join(", ")}
                        {(r.items || []).length > 2 ? ` và ${(r.items || []).length - 2} món khác…` : ""}
                      </div>
                    </td>
                    <td>
                      {isApproved || isCompleted ? (
                        totalCartonsApproved >= totalCartonsRequested ? (
                          <Badge bg="success" className="px-2 py-1">
                            Duyệt đủ ({totalCartonsApproved}/{totalCartonsRequested} kiện)
                          </Badge>
                        ) : (
                          <Badge bg="warning" text="dark" className="px-2 py-1">
                            Cấp 1 phần ({totalCartonsApproved}/{totalCartonsRequested} kiện)
                          </Badge>
                        )
                      ) : r.status === "REJECTED" ? (
                        <Badge bg="danger" className="px-2 py-1">
                          Từ chối cấp
                        </Badge>
                      ) : (
                        <span className="text-muted small fst-italic">
                          Chờ duyệt ({totalCartonsRequested} kiện)
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <Badge bg={statusMeta.variant} className={`px-3 py-2 ${statusMeta.textClass}`}>
                        {statusMeta.label}
                      </Badge>
                      {isApproved ? (
                        <div className="text-success small fw-bold mt-1">
                          Đã duyệt {totalCartonsApproved}/{totalCartonsRequested} kiện
                        </div>
                      ) : null}
                    </td>
                    <td className="text-end">
                      {isApproved ? (
                        <Button
                          size="sm"
                          variant="success"
                          className="fw-bold"
                          onClick={() => navigate(`/branch/inventory/slip?type=grn&id=${r.requisitionId}`)}
                        >
                          <Icon name="check" size={14} className="me-1" />
                          Tiếp nhận hàng
                        </Button>
                      ) : isPending ? (
                        <span className="text-muted small">
                          Đang chờ duyệt
                        </span>
                      ) : isCompleted ? (
                        <span className="text-success small fw-bold">
                          ✓ Đã nhập kho
                        </span>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </AdminLayout>
  );
}
