import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatDateTime } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";
import { fmtQty } from "./InventoryPage.jsx";
import { parsePackDetails } from "../lib/unitConversion.js";

const STATUS_MAP = {
  PENDING: { label: "Chờ duyệt", variant: "warn" },
  APPROVED: { label: "Đã duyệt cấp hàng", variant: "info" },
  PARTIALLY_RECEIVED: { label: "Tiếp nhận một phần", variant: "warn" },
  COMPLETED: { label: "Đã tiếp nhận đủ", variant: "success" },
  REJECTED: { label: "Từ chối cấp", variant: "danger" },
};

export default function CooRequisitionApprovalPage() {
  const { user } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const menu = buildMenu(user);

  const [activeTab, setActiveTab] = useState("pending");
  const [pendingList, setPendingList] = useState([]);
  const [allList, setAllList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal Chi tiết & Duyệt đơn
  const [detailModal, setDetailModal] = useState({
    show: false,
    req: null,
    isReadOnly: false,
    submitting: false,
  });

  // State nhập số lượng duyệt trong modal: { [rowKey]: number | "" } (rowKey = `${ingId}_${index}`)
  const [modalQtys, setModalQtys] = useState({});

  // Modal từ chối đơn
  const [rejectModal, setRejectModal] = useState({
    show: false,
    reqId: null,
    reqCode: "",
    branchName: "",
    reason: "",
    submitting: false,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, all] = await Promise.all([
        inventoryApi.getPendingRequisitions().catch(() => []),
        inventoryApi.getRequisitions().catch(() => []),
      ]);
      setPendingList(pending || []);
      setAllList(all || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách đơn cấp hàng.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mở modal duyệt: không cho nhập sẵn số (để trống để COO chủ động nhập), khóa trần không quá số lượng yêu cầu
  function openApproveModal(req, isReadOnly = false) {
    const initial = {};
    (req.items || []).forEach((item, index) => {
      const key = `${item.ingredientId}_${index}`;
      if (isReadOnly) {
        initial[key] = item.totalCartonsApproved || item.cartonsRequested || 0;
      } else {
        // Không nhập sẵn số -> để rỗng ""
        initial[key] = "";
      }
    });
    setModalQtys(initial);
    setDetailModal({
      show: true,
      req,
      isReadOnly,
      submitting: false,
    });
  }

  // Xử lý nhập số lượng duyệt: không được quá số lượng yêu cầu
  function handleQtyChange(rowKey, requestedQty, rawValue) {
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      setModalQtys((prev) => ({ ...prev, [rowKey]: "" }));
      return;
    }
    const parsed = parseInt(rawValue, 10);
    if (isNaN(parsed)) return;

    // Giới hạn trong khoảng [0, requestedQty]
    const clamped = Math.max(0, Math.min(requestedQty, parsed));
    setModalQtys((prev) => ({ ...prev, [rowKey]: clamped }));
  }

  // Nút duyệt đủ nhanh cho 1 dòng
  function handleFillFull(rowKey, requestedQty) {
    setModalQtys((prev) => ({ ...prev, [rowKey]: requestedQty }));
  }

  // Phê duyệt cấp hàng
  async function handleConfirmApprove() {
    const req = detailModal.req;
    if (!req) return;

    // Kiểm tra đã nhập đầy đủ chưa
    for (let i = 0; i < (req.items || []).length; i++) {
      const item = req.items[i];
      const key = `${item.ingredientId}_${i}`;
      const qty = modalQtys[key];

      if (qty === "" || qty === undefined || qty === null) {
        toast.error(`Vui lòng nhập số kiện duyệt cho mặt hàng "${item.ingredientName}".`);
        return;
      }
      if (Number(qty) <= 0) {
        toast.error(`Số kiện duyệt cho "${item.ingredientName}" phải >= 1. Nếu không thể cấp, bạn vui lòng bấm Từ chối đơn.`);
        return;
      }
    }

    setDetailModal((prev) => ({ ...prev, submitting: true }));
    try {
      const approvedItems = (req.items || []).map((item, index) => {
        const key = `${item.ingredientId}_${index}`;
        const approvedCartons = Number(modalQtys[key]);
        return {
          ingredientId: item.ingredientId,
          totalCartonsApproved: approvedCartons,
        };
      });

      const payload = {
        requisitionId: req.requisitionId,
        approvedItems,
      };

      const res = await inventoryApi.approveRequisition(payload);
      toast.success(
        `Phê duyệt cấp hàng cho đơn ${res.requisitionCode || req.requisitionCode} thành công! Kho Tổng đã xác nhận xuất hàng cho chi nhánh.`
      );
      setDetailModal({ show: false, req: null, isReadOnly: false, submitting: false });
      await loadData();
    } catch (err) {
      toast.error(err.message || "Phê duyệt cấp hàng thất bại.");
      setDetailModal((prev) => ({ ...prev, submitting: false }));
    }
  }

  // Mở modal từ chối
  function openRejectModal(req) {
    setRejectModal({
      show: true,
      reqId: req.requisitionId,
      reqCode: req.requisitionCode,
      branchName: req.branchName,
      reason: "",
      submitting: false,
    });
  }

  // Xác nhận từ chối đơn
  async function handleConfirmReject() {
    if (!rejectModal.reqId) return;
    setRejectModal((prev) => ({ ...prev, submitting: true }));
    try {
      await inventoryApi.rejectRequisition(rejectModal.reqId, rejectModal.reason);
      toast.success(`Đã từ chối đơn ${rejectModal.reqCode}.`);
      setRejectModal({ show: false, reqId: null, reqCode: "", branchName: "", reason: "", submitting: false });
      if (detailModal.show) {
        setDetailModal({ show: false, req: null, isReadOnly: false, submitting: false });
      }
      await loadData();
    } catch (err) {
      toast.error(err.message || "Không thể từ chối đơn.");
      setRejectModal((prev) => ({ ...prev, submitting: false }));
    }
  }

  const approvedCount = allList.filter((r) => r.status === "APPROVED" || r.status === "PARTIALLY_RECEIVED").length;

  return (
    <AdminLayout
      menu={menu}
      branchName="Văn phòng Điều hành Chuỗi (COO)"
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Duyệt cấp hàng Kho Tổng"
        description="Xem xét các đơn xin cấp hàng từ các chi nhánh, phê duyệt số lượng cấp (đủ hoặc một phần) hoặc từ chối cấp hàng."
        actions={
          <div className="d-flex gap-2">
            <Button variant="outline-primary" onClick={loadData} disabled={loading}>
              <Icon name="sync" size={15} /> Làm mới
            </Button>
          </div>
        }
      />

      {/* KPI Overview */}
      <Row className="g-3 mb-4">
        <Col md={4}>
          <Card className="h-100 shadow-sm border-0 border-start border-warning border-4">
            <Card.Body>
              <div className="text-muted small fw-medium">Đơn chờ COO phê duyệt</div>
              <div className="d-flex align-items-baseline gap-2 mt-2">
                <span className="fs-3 fw-bold text-dark">{pendingList.length}</span>
                <span className="text-muted small">đơn xin cấp hàng</span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="h-100 shadow-sm border-0 border-start border-primary border-4">
            <Card.Body>
              <div className="text-muted small fw-medium">Đơn đã phê duyệt cấp hàng</div>
              <div className="d-flex align-items-baseline gap-2 mt-2">
                <span className="fs-3 fw-bold text-primary">{approvedCount}</span>
                <span className="text-muted small">đơn đang chuyển / chờ nhận</span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="h-100 shadow-sm border-0 border-start border-success border-4">
            <Card.Body>
              <div className="text-muted small fw-medium">Tổng số đơn cấp hàng toàn chuỗi</div>
              <div className="d-flex align-items-baseline gap-2 mt-2">
                <span className="fs-3 fw-bold text-success">{allList.length}</span>
                <span className="text-muted small">tất cả trạng thái</span>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || "pending")} className="mb-3">
        {/* TAB 1: DANH SÁCH ĐƠN CHỜ PHÊ DUYỆT */}
        <Tab eventKey="pending" title={`Đơn chờ duyệt (${pendingList.length})`}>
          {loading && !pendingList.length ? (
            <div className="text-center py-5">
              <Spinner className="me-2" /> Đang tải danh sách đơn chờ duyệt…
            </div>
          ) : pendingList.length === 0 ? (
            <Card className="text-center py-5 border-dashed">
              <Card.Body>
                <div className="text-muted mb-3" style={{ fontSize: "2rem" }}>
                  📦
                </div>
                <h5>Không có đơn xin cấp hàng nào đang chờ duyệt</h5>
                <p className="text-muted small">
                  Tất cả các đơn xin cấp hàng từ các chi nhánh đã được xử lý hoàn tất.
                </p>
              </Card.Body>
            </Card>
          ) : (
            <div className="table-responsive bg-white rounded border shadow-sm">
              <Table hover className="align-middle mb-0">
                <thead className="table-light small text-uppercase text-muted">
                  <tr>
                    <th style={{ width: "16%" }}>Mã đơn</th>
                    <th style={{ width: "24%" }}>Chi nhánh yêu cầu</th>
                    <th style={{ width: "18%" }}>Số lượng mặt hàng</th>
                    <th style={{ width: "18%" }}>Thời gian gửi</th>
                    <th style={{ width: "24%" }} className="text-end">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingList.map((req) => {
                    const totalCartons = (req.items || []).reduce(
                      (acc, it) => acc + (Number(it.cartonsRequested) || 0),
                      0
                    );

                    return (
                      <tr key={req.requisitionId}>
                        <td>
                          <span className="badge bg-primary fs-6 px-3 py-2 font-monospace">
                            {req.requisitionCode}
                          </span>
                        </td>
                        <td>
                          <div className="fw-bold fs-6">{req.branchName}</div>
                          {req.notes ? (
                            <div className="text-muted small text-truncate" style={{ maxWidth: 260 }} title={req.notes}>
                              Ghi chú: {req.notes}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className="fw-bold">{req.items?.length || 0}</span> món ({totalCartons} kiện)
                        </td>
                        <td className="small text-muted">{formatDateTime(req.createdAt)}</td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-2">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => openRejectModal(req)}
                            >
                              Từ chối
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              className="fw-bold"
                              onClick={() => openApproveModal(req, false)}
                            >
                              <Icon name="check" size={14} className="me-1" />
                              Duyệt cấp hàng
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Tab>

        {/* TAB 2: LỊCH SỬ ĐIỀU PHỐI (TOÀN BỘ ĐƠN) */}
        <Tab eventKey="history" title={`Lịch sử phê duyệt (${allList.length})`}>
          {allList.length === 0 ? (
            <div className="text-center py-5 text-muted">Chưa có lịch sử cấp hàng nào.</div>
          ) : (
            <div className="table-responsive bg-white rounded border shadow-sm">
              <Table hover className="align-middle mb-0">
                <thead className="table-light small text-uppercase text-muted">
                  <tr>
                    <th style={{ width: "16%" }}>Mã đơn</th>
                    <th style={{ width: "22%" }}>Chi nhánh nhận</th>
                    <th style={{ width: "16%" }}>Trạng thái</th>
                    <th style={{ width: "18%" }}>Ngày lập</th>
                    <th style={{ width: "18%" }}>Chi tiết duyệt</th>
                    <th style={{ width: "10%" }} className="text-end">Xem</th>
                  </tr>
                </thead>
                <tbody>
                  {allList.map((req) => {
                    const st = STATUS_MAP[req.status] || { label: req.status, variant: "neutral" };
                    return (
                      <tr key={req.requisitionId}>
                        <td>
                          <span className="font-monospace fw-bold text-primary">{req.requisitionCode}</span>
                        </td>
                        <td>
                          <strong>{req.branchName}</strong>
                        </td>
                        <td>
                          <StatusTag status={req.status} label={st.label} variant={st.variant} />
                        </td>
                        <td className="small text-muted">{formatDateTime(req.createdAt)}</td>
                        <td>
                          <div className="small">
                            {req.items?.length || 0} món
                            {req.status === "APPROVED" || req.status === "COMPLETED" ? (
                              <span className="text-success ms-1 fw-medium">(Đã duyệt)</span>
                            ) : req.status === "REJECTED" ? (
                              <span className="text-danger ms-1 fw-medium">(Đã từ chối)</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-end">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => openApproveModal(req, true)}
                          >
                            Chi tiết
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Tab>
      </Tabs>

      {/* MODAL CHI TIẾT & PHÊ DUYỆT ĐƠN */}
      <Modal
        show={detailModal.show}
        onHide={() => !detailModal.submitting && setDetailModal({ show: false, req: null, isReadOnly: false, submitting: false })}
        size="lg"
        centered
      >
        <Modal.Header closeButton={!detailModal.submitting}>
          <Modal.Title className="fs-5">
            {detailModal.isReadOnly ? "Chi tiết đơn cấp hàng" : "Phê duyệt cấp hàng"}{" "}
            <span className="text-primary font-monospace fw-bold">{detailModal.req?.requisitionCode}</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailModal.req ? (
            <>
              {/* Thông tin đơn */}
              <div className="p-3 bg-light rounded border mb-3">
                <Row className="g-2 small">
                  <Col sm={6}>
                    <div>
                      Chi nhánh yêu cầu: <strong>{detailModal.req.branchName}</strong>
                    </div>
                  </Col>
                  <Col sm={6}>
                    <div>
                      Thời gian gửi: <strong>{formatDateTime(detailModal.req.createdAt)}</strong>
                    </div>
                  </Col>
                  {detailModal.req.notes ? (
                    <Col sm={12} className="mt-1">
                      <div className="text-muted">Ghi chú: {detailModal.req.notes}</div>
                    </Col>
                  ) : null}
                </Row>
              </div>

              {/* Bảng danh sách mặt hàng */}
              <div className="table-responsive">
                {detailModal.isReadOnly && detailModal.req.status === "COMPLETED" ? (
                  // BẢNG ĐỐI SOÁT 3 CHIỀU (3-WAY MATCHING RECONCILIATION) CHO ĐƠN ĐÃ TIẾP NHẬN
                  <>
                    <div className="alert alert-info py-2 px-3 small d-flex align-items-center justify-content-between mb-3">
                      <div>
                        <strong>Biên bản đối soát giao nhận:</strong> Đối chiếu số lượng giữa 3 bên (Quán đề xuất — Kho Tổng xuất — Thực tế tiếp nhận).
                      </div>
                      <Badge bg="success">Đã đối soát hoàn tất</Badge>
                    </div>

                    <Table hover bordered className="align-middle mb-3">
                      <thead className="table-light small text-uppercase text-muted">
                        <tr>
                          <th style={{ width: "26%" }}>Mặt hàng</th>
                          <th style={{ width: "12%" }} className="text-center">Số xin</th>
                          <th style={{ width: "14%" }} className="text-center">COO duyệt xuất</th>
                          <th style={{ width: "16%" }} className="text-center">Thực nhận (Vào kho)</th>
                          <th style={{ width: "14%" }} className="text-center">Bục vỡ / Hỏng</th>
                          <th style={{ width: "18%" }}>Đối soát & Khiếu nại</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailModal.req.items || []).map((item, index) => {
                          const rowKey = `${item.ingredientId}_${index}`;
                          const requestedQty = Number(item.cartonsRequested || 1);
                          const approvedQty = Number(item.totalCartonsApproved || requestedQty);
                          const receivedQty = item.cartonsReceived != null ? Number(item.cartonsReceived) : approvedQty;
                          const damagedQty = Number(item.cartonsDamaged || 0);

                          const packInfo = parsePackDetails(
                            item.packUnit,
                            item.unitsPerPack,
                            item.baseUnit,
                            approvedQty,
                            item.ingredientName
                          );

                          const hasDamage = damagedQty > 0;

                          return (
                            <tr key={rowKey} className={hasDamage ? "table-warning" : ""}>
                              {/* Cột 1: Tên */}
                              <td>
                                <div className="fw-bold">{item.ingredientName}</div>
                                {item.packUnit ? (
                                  <div className="text-muted small" style={{ fontSize: 11 }}>
                                    Quy cách: <strong>{item.packUnit}</strong>
                                  </div>
                                ) : null}
                              </td>

                              {/* Cột 2: Số xin */}
                              <td className="text-center">
                                <span className="badge bg-light text-dark border">
                                  {requestedQty} {packInfo.cartonName}
                                </span>
                              </td>

                              {/* Cột 3: COO duyệt xuất */}
                              <td className="text-center">
                                <span className="fw-bold text-primary">
                                  {approvedQty} {packInfo.cartonName}
                                </span>
                              </td>

                              {/* Cột 4: Thực nhận (Tăng tồn) */}
                              <td className="text-center">
                                <span className="badge bg-success fs-6 px-2 py-1">
                                  ✓ {receivedQty} {packInfo.cartonName}
                                </span>
                                <div className="text-success small mt-1" style={{ fontSize: 10 }}>
                                  (Đã tăng tồn kho)
                                </div>
                              </td>

                              {/* Cột 5: Bục vỡ/hỏng (Không tăng tồn) */}
                              <td className="text-center">
                                {damagedQty > 0 ? (
                                  <div>
                                    <span className="badge bg-danger fs-6 px-2 py-1">
                                      ⚠️ {damagedQty} {packInfo.cartonName}
                                    </span>
                                    <div className="text-danger small mt-1" style={{ fontSize: 10 }}>
                                      (Không tăng tồn)
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted small">0 (Nguyên vẹn)</span>
                                )}
                              </td>

                              {/* Cột 6: Ghi chú sự cố & Bằng chứng */}
                              <td>
                                {damagedQty > 0 ? (
                                  <div className="small">
                                    <div className="text-danger fw-medium">{item.damageReason || "Bục vỡ khi vận chuyển"}</div>
                                    {item.evidenceImageUrl ? (
                                      <a
                                        href={item.evidenceImageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn-outline-danger btn-sm py-0 px-1 mt-1 text-decoration-none"
                                        style={{ fontSize: 11 }}
                                      >
                                        📷 Xem ảnh hiện trường
                                      </a>
                                    ) : null}
                                    <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                                      * Hồ sơ claim bên vận chuyển đền bù
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-success small">✓ Đạt chuẩn 100%</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>

                    <div className="p-3 bg-light rounded border small">
                      <div className="fw-bold text-dark mb-1">📋 Kết luận kiểm toán chuỗi cung ứng:</div>
                      <div className="text-muted">
                        Kho quán chỉ tăng tồn đúng theo <strong>Số thực nhận đạt chuẩn</strong>. Mọi kiện hàng bục vỡ / hư hại đều được ghi nhận bằng chứng số (lý do & ảnh hiện trường) làm căn cứ kế toán đối soát gửi đơn vị vận chuyển (3PL) yêu cầu bồi thường 100% giá trị, đảm bảo số liệu minh bạch, chống thất thoát.
                      </div>
                    </div>
                  </>
                ) : (
                  // BẢNG DUYỆT CẤP HÀNG (COO APPROVAL TABLE)
                  <Table hover className="align-middle mb-0">
                    <thead className="table-light small text-uppercase text-muted">
                      <tr>
                        <th style={{ width: "35%" }}>Mặt hàng xin cấp</th>
                        <th style={{ width: "20%" }} className="text-center">Số xin (kiện)</th>
                        <th style={{ width: "22%" }} className="text-center">Số COO duyệt cấp</th>
                        <th style={{ width: "23%" }} className="text-center">Tổng xuất quy đổi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailModal.req.items || []).map((item, index) => {
                        const rowKey = `${item.ingredientId}_${index}`;
                        const requestedQty = Number(item.cartonsRequested || 1);
                        const currentVal = modalQtys[rowKey];
                        const approvedQty = currentVal !== "" && currentVal !== undefined ? Number(currentVal) : 0;

                        const packInfo = parsePackDetails(
                          item.packUnit,
                          item.unitsPerPack,
                          item.baseUnit,
                          approvedQty,
                          item.ingredientName
                        );

                        return (
                          <tr key={rowKey}>
                            {/* Cột 1: Tên mặt hàng */}
                            <td>
                              <div className="fw-bold">{item.ingredientName}</div>
                              {item.packUnit ? (
                                <div className="text-muted small mt-1" style={{ fontSize: 11 }}>
                                  Quy cách: <strong>{item.packUnit}</strong>
                                </div>
                              ) : null}
                            </td>

                            {/* Cột 2: Số xin cấp */}
                            <td className="text-center">
                              <span className="badge bg-light text-dark border px-3 py-2 fs-6">
                                {requestedQty} {packInfo.cartonName}
                              </span>
                            </td>

                            {/* Cột 3: Số COO duyệt cấp (COO tự nhập tay, không tự động điền) */}
                            <td className="text-center">
                              {detailModal.isReadOnly ? (
                                <span className="fw-bold text-success fs-6">
                                  {item.totalCartonsApproved || 0} {packInfo.cartonName}
                                </span>
                              ) : (
                                <div className="d-flex align-items-center justify-content-center gap-1">
                                  <Form.Control
                                    type="number"
                                    min={0}
                                    max={requestedQty}
                                    step={1}
                                    placeholder="0"
                                    value={currentVal !== undefined ? currentVal : ""}
                                    onChange={(e) => handleQtyChange(rowKey, requestedQty, e.target.value)}
                                    className="form-control-sm fw-bold text-center"
                                    style={{ width: 75 }}
                                  />
                                  <span className="text-muted small ms-1">{packInfo.cartonName}</span>
                                </div>
                              )}
                            </td>

                            {/* Cột 4: Tổng xuất quy đổi */}
                            <td className="text-center">
                              {approvedQty > 0 ? (
                                <div>
                                  <div className="fw-bold text-primary font-monospace fs-6">
                                    {packInfo.formattedTotalQty}
                                  </div>
                                  {packInfo.hasSubPacks ? (
                                    <div className="text-muted small" style={{ fontSize: 11 }}>
                                      ({packInfo.totalPacks} {packInfo.itemUnit})
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-muted small fst-italic">Nhập số lượng để quy đổi</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setDetailModal({ show: false, req: null, isReadOnly: false, submitting: false })}
            disabled={detailModal.submitting}
          >
            Đóng
          </Button>

          {!detailModal.isReadOnly ? (
            <>
              <Button
                variant="outline-danger"
                onClick={() => {
                  const reqToReject = detailModal.req;
                  setDetailModal({ show: false, req: null, isReadOnly: false, submitting: false });
                  openRejectModal(reqToReject);
                }}
                disabled={detailModal.submitting}
              >
                Từ chối đơn
              </Button>
              <Button
                variant="success"
                onClick={handleConfirmApprove}
                disabled={detailModal.submitting}
              >
                {detailModal.submitting ? (
                  <>
                    <Spinner size="sm" className="me-2" /> Đang phê duyệt…
                  </>
                ) : (
                  <>
                    <Icon name="check" size={14} className="me-1" />
                    Xác nhận phê duyệt
                  </>
                )}
              </Button>
            </>
          ) : null}
        </Modal.Footer>
      </Modal>

      {/* Modal xác nhận từ chối đơn */}
      <Modal
        show={rejectModal.show}
        onHide={() => !rejectModal.submitting && setRejectModal({ show: false, reqId: null, reqCode: "", branchName: "", reason: "", submitting: false })}
        centered
      >
        <Modal.Header closeButton={!rejectModal.submitting}>
          <Modal.Title className="text-danger fs-5">
            <Icon name="x-circle" className="me-2" />
            Từ chối đơn xin cấp hàng
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Bạn có chắc chắn muốn <strong>từ chối</strong> đơn xin cấp hàng{" "}
            <span className="text-primary font-monospace fw-bold">{rejectModal.reqCode}</span> của chi nhánh{" "}
            <strong>{rejectModal.branchName}</strong> không?
          </p>
          <Form.Group className="mt-3">
            <Form.Label className="small fw-medium">Lý do từ chối (tùy chọn):</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Ví dụ: Kho Tổng đang hết hàng tạm thời / Cửa hàng vẫn còn tồn kho an toàn…"
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setRejectModal({ show: false, reqId: null, reqCode: "", branchName: "", reason: "", submitting: false })}
            disabled={rejectModal.submitting}
          >
            Đóng
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmReject}
            disabled={rejectModal.submitting}
          >
            {rejectModal.submitting ? (
              <>
                <Spinner size="sm" className="me-2" /> Đang từ chối…
              </>
            ) : (
              "Xác nhận từ chối"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </AdminLayout>
  );
}
