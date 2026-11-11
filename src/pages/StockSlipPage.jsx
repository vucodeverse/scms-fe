import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import { useRouter } from "../router/HashRouter.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import Icon from "../components/Icon.jsx";
import FormField from "../components/FormField.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { isUnassignedBranchManager, roleLabel } from "../auth/landing.js";
import UnassignedManagerNotice from "../components/UnassignedManagerNotice.jsx";
import { buildMenu } from "../config/menu.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";
import { fmtQty } from "./InventoryPage.jsx";
import { parsePackDetails } from "../lib/unitConversion.js";
import CooRequisitionApprovalPage from "./CooRequisitionApprovalPage.jsx";

const META = {
  requisition: {
    title: "Yêu cầu cấp nguyên liệu từ Kho Tổng",
    code: "SCR-14",
    submitLabel: "Gửi yêu cầu cấp hàng",
  },
  grn: {
    title: "Tiếp nhận hàng điều phối từ Kho Tổng",
    code: "SCR-14",
    submitLabel: "Xác nhận nhận hàng",
  },
  receive: {
    title: "Phiếu nhập kho từ Nhà cung cấp",
    code: "SCR-14",
    submitLabel: "Lập phiếu nhập kho",
  },
  issue: {
    title: "Xuất kho nguyên liệu ra Quầy Bar",
    code: "SCR-14",
    submitLabel: "Xác nhận xuất kho ra Quầy Bar",
  },
  dispose: {
    title: "Phiếu xuất hủy nguyên liệu & hàng hỏng",
    code: "SCR-14",
    submitLabel: "Xác nhận xuất hủy",
  },
  approve: {
    title: "Phê duyệt điều phối Kho Tổng",
    code: "SCR-COO-REQUISITION",
    submitLabel: "Phê duyệt điều phối",
  },
};

const RECEIVE_SOURCES = [
  { value: "SUPPLIER", label: "Nhà cung cấp" },
  { value: "INTERNAL_TRANSFER", label: "Điều chuyển nội bộ" },
  { value: "SURPLUS", label: "Thừa kiểm kê" },
];

const DISPOSE_REASONS = [
  { value: "BARISTA_ERROR", label: "Sơ suất pha chế (làm đổ, khét sữa, rơi vỡ)" },
  { value: "EXPIRED_SHELF_LIFE", label: "Hết hạn sử dụng (quá date nhà sản xuất)" },
  { value: "STORAGE_DEFECT", label: "Lỗi thiết bị bảo quản (hỏng tủ mát, mất điện)" },
  { value: "CUSTOMER_COMPLAINT", label: "Khách đổi trả / khiếu nại chất lượng" },
];

/**
 * Task screen lập các loại phiếu kho & đơn cấp hàng (FE-18, UC28–UC30, FEA-01):
 * - requisition: Bước 1 Quán lập đơn xin cấp hàng (PR) nguyên kiện chẵn.
 * - grn: Bước 4 Quán xác nhận nhận hàng điều phối (GRN) từ Kho Tổng, kiểm tra Max Stock và bục hỏng.
 * - receive: Nhập kho trực tiếp từ Nhà cung cấp.
 * - issue: Xuất kho cho quầy pha chế.
 * - dispose: Hủy hàng hỏng/hết hạn.
 * - approve: COO duyệt cấp hàng Kho Tổng.
 */
export default function StockSlipPage() {
  const { query, navigate } = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const rawType = query?.type;
  const type = META[rawType] ? rawType : "requisition";
  const meta = META[type];
  const menu = buildMenu(user);
  const unassignedManager = isUnassignedBranchManager(user);
  const isCoo = user?.role === "COO";

  useEffect(() => {
    setResult(null);
    setFormError(null);
    setFormMessage(null);
  }, [type]);

  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(!unassignedManager);
  const [header, setHeader] = useState({
    source: "SUPPLIER",
    supplierName: "",
    invoiceRef: "",
    purpose: "BAR_DISPENSING",
    destination: "QUẦY BAR CHÍNH",
    destinationBar: "QUẦY BAR CHÍNH",
    baristaName: "",
    reasonCategory: "BARISTA_ERROR",
    reasonCode: "BARISTA_ERROR",
    reason: "",
    explanation: "",
    evidenceFileId: "",
    evidenceImageUrl: "",
    notes: "",
  });
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);
  const [result, setResult] = useState(null);

  // GRN State: Danh sách đơn đã duyệt chờ quán nhận
  const [approvedRequisitions, setApprovedRequisitions] = useState([]);
  const [selectedReqId, setSelectedReqId] = useState("");
  const [selectedReq, setSelectedReq] = useState(null);
  const [grnItems, setGrnItems] = useState([]);

  function selectRequisitionForGrn(req) {
    setSelectedReqId(String(req.requisitionId));
    setSelectedReq(req);
    const items = (req.items || []).map((it) => {
      const approved = it.totalCartonsApproved != null && it.totalCartonsApproved > 0
        ? it.totalCartonsApproved
        : it.cartonsRequested;
      const requested = it.cartonsRequested || approved;
      const alreadyReceived = it.cartonsReceived || 0;
      const remaining = req.status === "PARTIALLY_RECEIVED" ? Math.max(0, approved - alreadyReceived) : approved;
      return {
        ingredientId: it.ingredientId,
        ingredientName: it.ingredientName,
        packUnit: it.packUnit,
        unitsPerPack: it.unitsPerPack || 1,
        baseUnit: it.baseUnit || "đơn vị",
        cartonsRequested: requested,
        cartonsApproved: approved,
        cartonsRemaining: remaining,
        cartonsAccepted: "",
        cartonsRejected: 0,
        damageReason: "",
        evidenceImageUrl: "",
        allocations: it.allocations || [],
      };
    });
    setGrnItems(items);
  }

  const loadStock = useCallback(async () => {
    if (unassignedManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await inventoryApi.getStock({
        branchId: user?.branchId || undefined,
        uiPage: 1,
        size: 100,
      });
      const items = page.content || [];
      setStock(items);

      // Nếu đang ở màn GRN, tải danh sách đơn đã duyệt của chi nhánh
      if (type === "grn") {
        const reqs = await inventoryApi.getRequisitions({
          branchId: user?.branchId || 4,
          status: "APPROVED",
        });
        const approved = (reqs || []).filter((r) => r.status === "APPROVED" || r.status === "PARTIALLY_RECEIVED");
        setApprovedRequisitions(approved);
        if (approved.length > 0) {
          const target = query?.id
            ? approved.find((r) => String(r.requisitionId) === String(query.id))
            : null;
          selectRequisitionForGrn(target || approved[0]);
        }
      }
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh mục nguyên liệu trong kho.");
    } finally {
      setLoading(false);
    }
  }, [unassignedManager, user?.branchId, type, query?.id]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  // Nếu chọn màn hình duyệt điều phối của COO
  if (type === "approve") {
    return <CooRequisitionApprovalPage />;
  }

  function handleRequisitionSelect(e) {
    const id = e.target.value;
    setSelectedReqId(id);
    const req = approvedRequisitions.find((r) => String(r.requisitionId) === String(id));
    if (req) {
      selectRequisitionForGrn(req);
    } else {
      setSelectedReq(null);
      setGrnItems([]);
    }
  }

  function updateGrnItem(ingredientId, patch) {
    setGrnItems((prev) =>
      prev.map((item) => (item.ingredientId === ingredientId ? { ...item, ...patch } : item))
    );
  }

  function set(field, value) {
    setHeader((h) => ({ ...h, [field]: value }));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: Date.now() + Math.random(),
        ingredientId: stock[0]?.ingredientId || "",
        cartons: type === "requisition" ? 1 : "",
        looseUnits: "",
        purchasePrice: "",
        expiryDate: "",
        quantityPacks: type === "issue" ? 1 : "",
        quantityBase: "",
        itemCause: "",
      },
    ]);
  }

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function stockOf(ingredientId) {
    return stock.find((s) => s.ingredientId === Number(ingredientId));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFormMessage(null);

    try {
      let res;

      // ==========================================
      // BƯỚC 1: QUÁN LẬP ĐƠN XIN CẤP HÀNG (PR)
      // ==========================================
      if (type === "requisition") {
        if (!lines.length) {
          setFormMessage("Đơn xin cấp hàng cần ít nhất một mặt hàng.");
          setSaving(false);
          return;
        }

        // Validate Rule 1: Nguyên kiện chẵn cartons >= 1
        for (const l of lines) {
          const qty = Number(l.cartons);
          if (!qty || qty < 1 || !Number.isInteger(qty)) {
            setFormMessage("Số kiện yêu cầu cấp hàng phải là số nguyên dương >= 1 (nguyên kiện chẵn).");
            setSaving(false);
            return;
          }
        }

        const payload = {
          branchId: user?.branchId || 4,
          notes: header.notes?.trim() || null,
          items: lines.map((l) => ({
            ingredientId: Number(l.ingredientId),
            cartonsRequested: Number(l.cartons),
          })),
        };

        res = await inventoryApi.createRequisition(payload);
        setResult(res);
        toast.success(`Đã lập đơn xin cấp hàng ${res.requisitionCode}! Đang chuyển COO phê duyệt điều phối.`);
      }

      // ==========================================
      // BƯỚC 4: QUÁN XÁC NHẬN NHẬN HÀNG (GRN)
      // ==========================================
      else if (type === "grn") {
        if (!selectedReq) {
          setFormMessage("Vui lòng chọn đơn xin cấp hàng cần tiếp nhận.");
          setSaving(false);
          return;
        }

        // Validate Rule 4 & Rule 3
        for (const it of grnItems) {
          const accepted = Number(it.cartonsAccepted || 0);
          const rejected = Number(it.cartonsRejected || 0);

          if (accepted < 0 || rejected < 0) {
            setFormMessage("Số lượng kiện không thể âm.");
            setSaving(false);
            return;
          }

          if (rejected > 0) {
            if (!it.damageReason?.trim()) {
              setFormMessage(`Mặt hàng "${it.ingredientName}" có ${rejected} kiện hỏng: Vui lòng nhập lý do hư hại.`);
              setSaving(false);
              return;
            }
            if (!it.evidenceImageUrl?.trim()) {
              setFormMessage(`Mặt hàng "${it.ingredientName}" có ${rejected} kiện hỏng: Vui lòng đính kèm ảnh chụp hiện trường.`);
              setSaving(false);
              return;
            }
          }
        }

        const payload = {
          requisitionId: selectedReq.requisitionId,
          branchId: user?.branchId || 4,
          items: grnItems.map((it) => ({
            ingredientId: Number(it.ingredientId),
            cartonsAccepted: Number(it.cartonsAccepted || 0),
            cartonsRejected: Number(it.cartonsRejected || 0),
            damageReason: Number(it.cartonsRejected || 0) > 0 ? it.damageReason.trim() : null,
            evidenceImageUrl: Number(it.cartonsRejected || 0) > 0 ? it.evidenceImageUrl.trim() : null,
          })),
        };

        res = await inventoryApi.receive(payload);
        setResult(res);
        toast.success(`Đã tiếp nhận hàng thành công theo đơn ${selectedReq.requisitionCode}! Tồn kho chi nhánh đã được cập nhật.`);
      }

      // ==========================================
      // NHẬP KHO TRỰC TIẾP TỪ NCC
      // ==========================================
      else if (type === "receive") {
        if (!lines.length) {
          setFormMessage("Phiếu cần ít nhất một dòng nguyên liệu.");
          setSaving(false);
          return;
        }
        res = await inventoryApi.receive({
          source: header.source,
          supplierName: header.supplierName.trim(),
          invoiceRef: header.invoiceRef.trim() || null,
          notes: header.notes.trim() || null,
          items: lines.map((l) => ({
            ingredientId: Number(l.ingredientId),
            cartons: Number(l.cartons || 0),
            looseUnits: l.looseUnits === "" ? null : Number(l.looseUnits),
            purchasePrice: Number(l.purchasePrice || 0),
            expiryDate: l.expiryDate || null,
          })),
        });
        setResult(res);
        toast.success(`Đã lập phiếu ${res.slipCode || ""}.`);
      }

      // ==========================================
      // FEA-02: XUẤT KHO NỘI BỘ RA QUẦY BAR (TWO-PARTY TRANSFER)
      // ==========================================
      else if (type === "issue") {
        if (!lines.length) {
          setFormMessage("Phiếu xuất cần ít nhất một dòng nguyên liệu.");
          setSaving(false);
          return;
        }

        // Trường baristaName (người nhận bàn giao) là BẮT BUỘC
        if (!header.baristaName?.trim()) {
          setFormMessage("Vui lòng nhập họ tên nhân viên Barista nhận bàn giao tại quầy.");
          setSaving(false);
          return;
        }

        // Kiểm tra tồn kho lưu trữ
        for (const l of lines) {
          const packs = Number(l.quantityPacks || 0);
          const loose = Number(l.looseUnits || 0);

          if (packs < 0 || loose < 0) {
            setFormMessage("Số lượng xuất (thùng hoặc lẻ) không được âm.");
            setSaving(false);
            return;
          }

          if (packs === 0 && loose === 0) {
            setFormMessage("Vui lòng nhập số lượng thùng chẵn hoặc số lẻ xuất > 0 cho từng món.");
            setSaving(false);
            return;
          }

          const st = stockOf(l.ingredientId);
          if (st) {
            const unitsPerPack = Number(st.unitsPerPack) || 1;
            const baseQty = (packs * unitsPerPack) + loose;
            const currentBase = Number(st.currentQtyBase || 0);
            if (currentBase < baseQty) {
              setFormMessage(
                `Kho lưu trữ không đủ tồn để xuất ra quầy bar: "${st.ingredientName}" hiện còn ${fmtQty(st.currentQtyBase)} ${st.baseUnit}, cần xuất ${fmtQty(baseQty)} ${st.baseUnit}.`
              );
              setSaving(false);
              return;
            }
          }
        }

        const payload = {
          branchId: user?.branchId || 4,
          destination: header.destination?.trim() || header.destinationBar?.trim() || "QUẦY BAR CHÍNH",
          baristaName: header.baristaName.trim(),
          notes: header.notes?.trim() || null,
          items: lines.map((l) => ({
            ingredientId: Number(l.ingredientId),
            quantityPacks: Number(l.quantityPacks || 0),
            looseUnits: Number(l.looseUnits || 0),
          })),
        };

        res = await inventoryApi.issue(payload);
        setResult(res);
        toast.success(`Đã xuất kho nội bộ thành công! Phiếu ${res.slipCode || ""} đã được ghi nhận.`);
      }

      // ==========================================
      // HỦY HÀNG
      // ==========================================
      // FEA-04 / UC30: XUẤT HỦY HÀNG HỎNG & HẾT DATE (WASTE TICKET)
      // ==========================================
      else {
        if (!lines.length) {
          setFormMessage("Phiếu xuất hủy cần ít nhất một dòng nguyên liệu.");
          setSaving(false);
          return;
        }

        const evidence = (header.evidenceImageUrl || header.evidenceFileId || "").trim();
        if (!evidence) {
          setFormMessage("Vui lòng đính kèm ảnh chụp hiện trường hàng hư hỏng/sự cố.");
          setSaving(false);
          return;
        }

        const explanation = (header.explanation || header.reason || "").trim();
        if (explanation.length < 10) {
          setFormMessage("Lý do giải trình hủy phải có tối thiểu 10 ký tự.");
          setSaving(false);
          return;
        }

        const payload = {
          branchId: user?.branchId || 4,
          reasonCode: header.reasonCode || header.reasonCategory || "BARISTA_ERROR",
          explanation,
          evidenceImageUrl: evidence,
          items: lines.map((l) => ({
            ingredientId: Number(l.ingredientId),
            quantityBase: Number(l.quantityBase || l.quantityPacks || 0),
          })),
        };

        res = await inventoryApi.dispose(payload);
        setResult(res);
        toast.success(`Đã lập và ký duyệt phiếu xuất hủy ${res.slipCode || ""}.`);
      }
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) setFormMessage(err.message || "Không thực hiện được giao dịch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title={meta.title}
        screenCode={meta.code}
        description="Nhập thông tin phiếu kho theo đúng quy trình chuẩn của chuỗi."
        actions={
          <Button variant="outline-secondary" onClick={() => navigate("/branch/inventory")}>
            <Icon name="back" size={15} /> Về danh sách tồn kho
          </Button>
        }
      />
      {/* Navigation Switcher giữa các chế độ lập phiếu & điều phối */}
      <div className="d-flex flex-wrap gap-2 mb-3 p-2 bg-white rounded border shadow-sm align-items-center">
        <span className="text-muted small fw-bold me-2">Nghiệp vụ kho:</span>
        <Button
          size="sm"
          variant={type === "requisition" ? "primary" : "outline-secondary"}
          onClick={() => {
            setResult(null);
            navigate("/branch/inventory/slip?type=requisition");
          }}
        >
          Yêu cầu cấp hàng
        </Button>
        <Button
          size="sm"
          variant={type === "grn" ? "primary" : "outline-secondary"}
          onClick={() => {
            setResult(null);
            navigate("/branch/inventory/slip?type=grn");
          }}
        >
          Nhận hàng điều phối
        </Button>
        <Button
          size="sm"
          variant={type === "issue" ? "primary" : "outline-secondary"}
          onClick={() => {
            setResult(null);
            navigate("/branch/inventory/slip?type=issue");
          }}
        >
          Xuất kho ra quầy Bar
        </Button>
        <Button
          size="sm"
          variant={type === "dispose" ? "danger" : "outline-secondary"}
          onClick={() => {
            setResult(null);
            navigate("/branch/inventory/slip?type=dispose");
          }}
        >
          Xuất hủy hàng hỏng
        </Button>

        {isCoo ? (
          <Button
            size="sm"
            variant="outline-dark"
            className="ms-auto"
            onClick={() => navigate("/chain/requisitions/approve")}
          >
            Duyệt cấp hàng Kho Tổng
          </Button>
        ) : null}
      </div>

      {unassignedManager ? (
        <UnassignedManagerNotice />
      ) : result ? (
        <div className="scms-panel panel-pad" style={{ maxWidth: 760 }}>
          <div className="panel-head">
            <div>
              <h2>
                {type === "requisition"
                  ? `Đã gửi đơn xin cấp hàng ${result.requisitionCode}`
                  : `Đã hoàn tất phiếu ${result.slipCode || result.requisitionCode || ""}`}
              </h2>
              <p>
                {result.branchName || user?.branchName || "Chi nhánh"}
                {result.receivedAt ? ` · ${formatDateTime(result.receivedAt)}` : ""}
                {result.issuedAt ? ` · ${formatDateTime(result.issuedAt)}` : ""}
                {result.disposedAt ? ` · ${formatDateTime(result.disposedAt)}` : ""}
                {result.createdAt ? ` · ${formatDateTime(result.createdAt)}` : ""}
              </p>
            </div>
          </div>

          {type === "requisition" ? (
            <Alert variant="info" className="mb-3">
              <div className="fw-bold mb-1">Mã đơn: {result.requisitionCode}</div>
              <div className="small mb-3">
                Đơn xin cấp hàng đã được gửi thành công và đang ở trạng thái <strong>Chờ COO phê duyệt</strong>.
              </div>
              <Button size="sm" variant="primary" onClick={() => navigate("/branch/inventory/requisitions")}>
                Xem tiến độ tại Danh sách đơn cấp hàng →
              </Button>
            </Alert>
          ) : null}

          {type === "issue" ? (
            <>
              <Alert variant="success" className="mb-3">
                <div className="fw-bold mb-1">
                  Phiếu xuất kho quầy Bar: <strong>{result.slipCode}</strong>
                </div>
                <div className="small">
                  Bàn giao 2 bên hoàn tất: Quản lý quán <strong>{result.issuedBy}</strong> đã mở Kho Lưu Trữ (Backroom) xuất hàng cho Barista <strong>{result.baristaName}</strong> tại <strong>{result.destinationBar || "Quầy Bar Chính"}</strong> kiểm đếm và ký nhận.
                </div>
              </Alert>

              {result.items && result.items.length > 0 ? (
                <div className="table-responsive my-3">
                  <table className="table table-sm table-bordered align-middle">
                    <thead className="table-light small">
                      <tr>
                        <th>Nguyên vật liệu</th>
                        <th className="text-center">Số kiện xuất</th>
                        <th className="text-center">Lượng quy đổi trừ kho</th>
                        <th className="text-center">Tồn kho lưu trữ còn lại</th>
                        <th className="text-center">Trạng thái tồn</th>
                      </tr>
                    </thead>
                    <tbody className="small">
                      {result.items.map((it) => (
                        <tr key={it.transactionId || it.ingredientId}>
                          <td>
                            <strong>{it.ingredientName}</strong>
                            <div className="text-muted" style={{ fontSize: 11 }}>
                              Quy cách: {it.packUnit}
                            </div>
                          </td>
                          <td className="text-center fw-bold">
                            {fmtQty(it.quantityPacks)} {it.packUnit}
                          </td>
                          <td className="text-center text-primary fw-bold">
                            {fmtQty(it.quantityBaseDeducted)} {it.baseUnit}
                          </td>
                          <td className="text-center">
                            {fmtQty(it.remainingQtyBase)} {it.baseUnit} ({fmtQty(it.remainingPackUnits)} {it.packUnit})
                          </td>
                          <td className="text-center">
                            {it.lowStockFlag ? (
                              <span className="badge bg-danger">⚠️ Tồn thấp</span>
                            ) : (
                              <span className="badge bg-success">Đủ tồn</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

          {type === "dispose" ? (
            <>
              <Alert
                variant={result.totalFinancialLoss > 1000000 ? "warning" : "danger"}
                className="mb-3"
              >
                <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
                  <div className="fw-bold">
                    Phiếu xuất hủy sự cố: <strong>{result.slipCode}</strong>
                  </div>
                  {result.totalFinancialLoss > 1000000 ? (
                    <span className="badge bg-warning text-dark px-2 py-1">
                      Chờ COO phê duyệt (Thiệt hại &gt; 1.000.000đ)
                    </span>
                  ) : (
                    <span className="badge bg-success px-2 py-1">
                      Đã duyệt &amp; trừ tồn quầy Bar ({result.authorizedBy} ký duyệt)
                    </span>
                  )}
                </div>
                <div className="small">
                  <div>
                    <strong>Lý do xuất hủy:</strong>{" "}
                    <span className="badge bg-secondary">{result.reasonCategory}</span> ·{" "}
                    <strong>Người duyệt:</strong> {result.authorizedBy}
                  </div>
                  <div className="mt-1">
                    <strong>Giải trình:</strong> {result.reason}
                  </div>
                </div>
              </Alert>

              {result.evidenceFileId ? (
                <div className="scms-panel p-3 mb-3 bg-light">
                  <div className="small fw-bold mb-2">Hình ảnh hiện trường / biên bản tại quầy:</div>
                  <div className="d-flex align-items-center gap-3">
                    <img
                      src={result.evidenceFileId}
                      alt="Bằng chứng hiện trường"
                      style={{ maxHeight: 110, maxWidth: 180, objectFit: "cover", borderRadius: 6, border: "1px solid #dee2e6" }}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                    <div className="small text-muted">
                      <div>Đường dẫn: <code>{result.evidenceFileId}</code></div>
                      <a href={result.evidenceFileId} target="_blank" rel="noreferrer" className="small">
                        Mở ảnh kích thước đầy đủ ↗
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}

              {result.items && result.items.length > 0 ? (
                <div className="table-responsive my-3">
                  <table className="table table-sm table-bordered align-middle">
                    <thead className="table-light small">
                      <tr>
                        <th>Nguyên vật liệu</th>
                        <th className="text-center">Số lượng hủy bỏ</th>
                        <th className="text-end">Đơn giá vốn</th>
                        <th className="text-end">Giá trị thiệt hại</th>
                        <th className="text-center">Tồn quầy bar còn lại</th>
                        <th className="text-center">Trạng thái tồn</th>
                      </tr>
                    </thead>
                    <tbody className="small">
                      {result.items.map((it) => (
                        <tr key={it.transactionId || it.ingredientId}>
                          <td>
                            <strong>{it.ingredientName}</strong>
                            <div className="text-muted" style={{ fontSize: 11 }}>
                              Quy cách: {it.packUnit}
                            </div>
                          </td>
                          <td className="text-center fw-bold text-danger">
                            {fmtQty(it.quantityBaseDeducted)} {it.baseUnit}
                          </td>
                          <td className="text-end">{formatVnd(it.unitCost)}</td>
                          <td className="text-end fw-bold text-danger">{formatVnd(it.lineLoss)}</td>
                          <td className="text-center">
                            {fmtQty(it.remainingQtyBase)} {it.baseUnit}
                          </td>
                          <td className="text-center">
                            {it.lowStockFlag ? (
                              <span className="badge bg-danger">⚠️ Tồn thấp</span>
                            ) : (
                              <span className="badge bg-success">Đủ tồn</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-light small fw-bold">
                      <tr>
                        <td colSpan={3} className="text-end">
                          Tổng giá trị thiệt hại tài chính:
                        </td>
                        <td className="text-end text-danger fs-6">
                          {formatVnd(result.totalFinancialLoss)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

          {result.totalAmount != null ? (
            <div className="stat-line">
              <span className="text-muted">Tổng giá trị phiếu</span>
              <strong>{formatVnd(result.totalAmount)}</strong>
            </div>
          ) : null}

          <div className="form-actions mt-4">
            <Button variant="outline-secondary" onClick={() => navigate("/branch/inventory")}>
              Về tồn kho
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setResult(null);
                setLines([]);
                if (type === "grn") loadStock();
              }}
            >
              Lập giao dịch mới
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải dữ liệu…
        </div>
      ) : (
        <Form onSubmit={submit}>
          {/* ========================================================= */}
          {/* GIAO DIỆN BƯỚC 4: NHẬN HÀNG ĐIỀU PHỐI (GRN) */}
          {/* ========================================================= */}
          {type === "grn" ? (
            <div className="d-flex flex-column gap-3">
              <div className="scms-panel panel-pad">
                <div className="panel-head">
                  <div>
                    <h2>Xác nhận nhận hàng điều phối từ Kho Tổng (GRN)</h2>
                    <p>Chi nhánh tiếp nhận: {user?.branchName || "Chi nhánh Cầu Giấy (CG-STORE)"}</p>
                  </div>
                </div>

                {formMessage ? (
                  <div className="notice notice--warn mb-3">
                    <span>{formMessage}</span>
                  </div>
                ) : null}

                <FormField label="Chọn đơn xin cấp hàng (đã được COO phê duyệt)" required>
                  {approvedRequisitions.length === 0 ? (
                    <div className="alert alert-warning mb-0 py-2">
                      Hiện tại không có đơn xin cấp hàng nào ở trạng thái "Đã duyệt phân bổ" (APPROVED) chờ nhận.
                      Quản lý quán có thể lập đơn mới tại tab <strong>"Đơn xin cấp hàng (PR)"</strong>.
                    </div>
                  ) : (
                    <Form.Select value={selectedReqId} onChange={handleRequisitionSelect}>
                      {approvedRequisitions.map((req) => (
                        <option key={req.requisitionId} value={req.requisitionId}>
                          {req.requisitionCode} — Lập lúc {formatDateTime(req.createdAt)} ({req.items?.length || 0} mặt hàng)
                        </option>
                      ))}
                    </Form.Select>
                  )}
                </FormField>
              </div>

              {selectedReq && grnItems.length > 0 ? (
                <div className="scms-panel panel-pad">
                  <div className="panel-head">
                    <div>
                      <h2>Kiểm đếm và ghi nhận chất lượng tiếp nhận</h2>
                      <p>
                        Đơn {selectedReq.requisitionCode} · Vui lòng kiểm đếm số kiện đạt chuẩn và số kiện bục vỡ / hư hại.
                      </p>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-bordered align-middle">
                      <thead className="table-light small">
                        <tr>
                          <th style={{ width: "32%" }}>Nguyên liệu</th>
                          <th style={{ width: "16%" }} className="text-center">Số COO duyệt cấp</th>
                          <th style={{ width: "16%" }} className="text-center">Số kiện đạt chuẩn</th>
                          <th style={{ width: "16%" }} className="text-center">Số kiện bục / hỏng</th>
                          <th style={{ width: "20%" }}>Ghi chú hàng hư hại</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grnItems.map((it) => {
                          const packInfo = parsePackDetails(it.packUnit, it.unitsPerPack, it.baseUnit, it.cartonsApproved, it.ingredientName);

                          return (
                            <tr key={it.ingredientId}>
                              <td>
                                <strong>{it.ingredientName}</strong>
                                <div className="text-muted small">
                                  Quy cách: <strong>{it.packUnit}</strong>
                                </div>
                                {it.cartonsRequested && it.cartonsRequested > it.cartonsApproved ? (
                                  <div className="badge bg-warning text-dark mt-1" style={{ fontSize: 11 }}>
                                    Xin {it.cartonsRequested} {packInfo.cartonName} · COO duyệt {it.cartonsApproved} {packInfo.cartonName}
                                  </div>
                                ) : null}
                                {selectedReq?.status === "PARTIALLY_RECEIVED" && it.cartonsAlreadyReceived > 0 ? (
                                  <div className="badge bg-info text-dark mt-1 d-block text-start" style={{ fontSize: 11 }}>
                                    Đã nhận đợt 1: {it.cartonsAlreadyReceived} {packInfo.cartonName} · Cần nhận đợt 2: {it.cartonsRemaining} {packInfo.cartonName}
                                  </div>
                                ) : null}
                              </td>

                              <td className="text-center">
                                <span className="badge bg-primary fs-6 px-3 py-2">
                                  {it.cartonsRemaining} {packInfo.cartonName}
                                </span>
                                {selectedReq?.status === "PARTIALLY_RECEIVED" ? (
                                  <div className="text-muted small mt-1" style={{ fontSize: 11 }}>
                                    (Tổng duyệt: {it.cartonsApproved} {packInfo.cartonName})
                                  </div>
                                ) : null}
                                {packInfo.hasSubPacks ? (
                                  <div className="text-muted small mt-1" style={{ fontSize: 11 }}>
                                    ({packInfo.totalPacks} {packInfo.itemUnit})
                                  </div>
                                ) : null}
                              </td>

                              <td>
                                <Form.Control
                                  type="number"
                                  min={0}
                                  max={it.cartonsRemaining}
                                  step={1}
                                  placeholder={`Tối đa ${it.cartonsRemaining}`}
                                  value={it.cartonsAccepted !== undefined ? it.cartonsAccepted : ""}
                                  onChange={(e) =>
                                    updateGrnItem(it.ingredientId, {
                                      cartonsAccepted: e.target.value === "" ? "" : Math.min(it.cartonsRemaining, Math.max(0, parseInt(e.target.value, 10) || 0)),
                                    })
                                  }
                                  className="text-center fw-bold form-control-sm"
                                />
                              </td>

                              <td>
                                <Form.Control
                                  type="number"
                                  min={0}
                                  max={it.cartonsRemaining}
                                  step={1}
                                  placeholder="0"
                                  value={it.cartonsRejected !== undefined ? it.cartonsRejected : 0}
                                  onChange={(e) =>
                                    updateGrnItem(it.ingredientId, {
                                      cartonsRejected: e.target.value === "" ? 0 : Math.min(it.cartonsRemaining, Math.max(0, parseInt(e.target.value, 10) || 0)),
                                    })
                                  }
                                  className="text-center fw-bold text-danger form-control-sm"
                                />
                              </td>

                              <td>
                                {Number(it.cartonsRejected) > 0 ? (
                                  <div className="d-flex flex-column gap-1">
                                    <Form.Control
                                      size="sm"
                                      placeholder="Lý do bục vỡ / hư hại (bắt buộc)*"
                                      value={it.damageReason}
                                      onChange={(e) => updateGrnItem(it.ingredientId, { damageReason: e.target.value })}
                                      required
                                    />
                                    <Form.Control
                                      size="sm"
                                      placeholder="Link ảnh hiện trường (bắt buộc)*"
                                      value={it.evidenceImageUrl}
                                      onChange={(e) =>
                                        updateGrnItem(it.ingredientId, { evidenceImageUrl: e.target.value })
                                      }
                                      required
                                    />
                                    <span className="text-muted" style={{ fontSize: 11 }}>
                                      * Hàng bục/hỏng sẽ lập biên bản sự cố khiếu nại bên vận chuyển đền bù.
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted small">Hàng nguyên vẹn, không có sự cố.</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="form-actions mt-3">
                    <Button variant="outline-secondary" onClick={() => navigate("/branch/inventory")} type="button">
                      Hủy bỏ
                    </Button>
                    <Button type="submit" variant="success" disabled={saving}>
                      {saving ? <Spinner size="sm" className="me-2" /> : null}
                      Xác nhận nhận hàng
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            // =========================================================
            // GIAO DIỆN BƯỚC 1: XIN CẤP HÀNG (PR) HOẶC PHIẾU THÔNG THƯỜNG
            // =========================================================
            <>
              <div className="scms-panel panel-pad">
                <div className="panel-head">
                  <div>
                    <h2>Thông tin phiếu</h2>
                    <p>Chi nhánh: {user?.branchName || "Chi nhánh Highlands Cầu Giấy (CG-STORE)"}</p>
                  </div>
                </div>
                {formMessage ? (
                  <div className="notice notice--warn">
                    <span>{formMessage}</span>
                  </div>
                ) : null}

                <div className="form-grid">
                  {/* BƯỚC 1: ĐƠN XIN CẤP HÀNG (PR) */}
                  {type === "requisition" ? (
                    <>
                      <FormField label="Chi nhánh yêu cầu">
                        <Form.Control
                          value={user?.branchName || "Chi nhánh Highlands Cầu Giấy (CG-STORE)"}
                          disabled
                        />
                      </FormField>
                      <FormField label="Thời gian lập đơn">
                        <Form.Control
                          value={new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          disabled
                        />
                      </FormField>
                      <FormField label="Ghi chú xin cấp hàng" className="span-all">
                        <Form.Control
                          placeholder="Ví dụ: Xin bổ sung nguyên liệu cà phê và sữa cho tuần cao điểm..."
                          value={header.notes}
                          onChange={(e) => set("notes", e.target.value)}
                        />
                      </FormField>
                    </>
                  ) : null}

                  {type === "receive" ? (
                    <>
                      <FormField label="Nguồn nhập" required error={formError?.fieldError?.("source") || null}>
                        <Form.Select value={header.source} onChange={(e) => set("source", e.target.value)}>
                          {RECEIVE_SOURCES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Form.Select>
                      </FormField>
                      <FormField
                        label="Nhà cung cấp / đối tác"
                        required
                        error={formError?.fieldError?.("supplierName") || null}
                      >
                        <Form.Control
                          value={header.supplierName}
                          onChange={(e) => set("supplierName", e.target.value)}
                        />
                      </FormField>
                      <FormField label="Số hóa đơn" error={formError?.fieldError?.("invoiceRef") || null}>
                        <Form.Control value={header.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} />
                      </FormField>
                    </>
                  ) : null}

                  {type === "issue" ? (
                    <>
                      <FormField label="Chi nhánh xuất (Kho lưu trữ Backroom)">
                        <Form.Control
                          value={user?.branchName || "Chi nhánh Cầu Giấy (CG-STORE)"}
                          disabled
                        />
                      </FormField>
                      <FormField
                        label="Quầy Bar nhận hàng (Front Bar)"
                        required
                        error={formError?.fieldError?.("destination") || formError?.fieldError?.("destinationBar") || null}
                      >
                        <Form.Select
                          value={header.destination || header.destinationBar || "QUẦY BAR CHÍNH"}
                          onChange={(e) => {
                            set("destination", e.target.value);
                            set("destinationBar", e.target.value);
                          }}
                        >
                          <option value="QUẦY BAR CHÍNH">Quầy Bar Chính - Tầng 1</option>
                          <option value="QUẦY BAR PHỤ">Quầy Bar Phụ - Tầng 2 / Ngoài trời</option>
                          <option value="QUẦY TAKEAWAY">Quầy Pha Chế Takeaway (Mang đi)</option>
                        </Form.Select>
                      </FormField>
                      <FormField
                        label="Nhân viên Barista nhận bàn giao (*)"
                        required
                        error={formError?.fieldError?.("baristaName") || null}
                        help="Barista kiểm đếm và ký nhận nguyên liệu bàn giao tại quầy bar."
                      >
                        <Form.Control
                          placeholder="Nhập hoặc chọn tên Barista (vd: Trần Văn Pha Chế)"
                          value={header.baristaName}
                          onChange={(e) => set("baristaName", e.target.value)}
                          list="barista-suggestions"
                          required
                        />
                        <datalist id="barista-suggestions">
                          <option value="Trần Văn Pha Chế" />
                          <option value="Nguyễn Văn Barista" />
                          <option value="Trần Thị Pha Chế" />
                          <option value="Lê Pha Chế" />
                        </datalist>
                      </FormField>
                      <FormField label="Mã phiếu xuất">
                        <Form.Control value="Hệ thống tự động sinh khi lưu phiếu" disabled />
                      </FormField>
                    </>
                  ) : null}

                  {type === "dispose" ? (
                    <>
                      <FormField
                        label="Lý do xuất hủy (*)"
                        required
                        error={formError?.fieldError?.("reasonCategory") || formError?.fieldError?.("reasonCode") || null}
                        help="Chọn đúng tính chất sự cố theo quy định kiểm soát thất thoát của chuỗi."
                      >
                        <Form.Select
                          value={header.reasonCode || header.reasonCategory}
                          onChange={(e) => {
                            set("reasonCode", e.target.value);
                            set("reasonCategory", e.target.value);
                          }}
                        >
                          {DISPOSE_REASONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Form.Select>
                      </FormField>

                      <FormField
                        label="Hình ảnh hiện trường / biên bản (*)"
                        required
                        error={formError?.fieldError?.("evidenceImageUrl") || formError?.fieldError?.("evidenceFileId") || null}
                        help="Đính kèm đường dẫn ảnh chụp nguyên liệu hư hỏng hoặc biên bản sự cố tại quầy"
                      >
                        <Form.Control
                          placeholder="Ví dụ: https://storage.scms.vn/evidence/20261111-sp-hong.jpg"
                          value={header.evidenceImageUrl || header.evidenceFileId}
                          onChange={(e) => {
                            set("evidenceImageUrl", e.target.value);
                            set("evidenceFileId", e.target.value);
                          }}
                          required
                        />
                        {(header.evidenceImageUrl || header.evidenceFileId) ? (
                          <div className="mt-2 p-1 border rounded bg-white" style={{ maxWidth: 220 }}>
                            <img
                              src={header.evidenceImageUrl || header.evidenceFileId}
                              alt="Preview bằng chứng"
                              style={{ width: "100%", maxHeight: 90, objectFit: "cover", borderRadius: 4 }}
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                          </div>
                        ) : null}
                      </FormField>

                      <FormField
                        label="Lý do giải trình chi tiết sự cố"
                        required
                        error={formError?.fieldError?.("explanation") || formError?.fieldError?.("reason") || null}
                        help="Tối thiểu 10 ký tự. Barista giải trình rõ bối cảnh sự cố tại quầy bar."
                        className="span-all"
                      >
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={header.explanation || header.reason}
                          onChange={(e) => {
                            set("explanation", e.target.value);
                            set("reason", e.target.value);
                          }}
                          placeholder="Ví dụ: Barista làm rơi vỡ chai siro đào trong lúc chuẩn bị ca sáng..."
                          required
                        />
                        <div className="text-muted small mt-1 text-end">
                          {((header.explanation || header.reason) || "").length}/10 ký tự tối thiểu
                        </div>
                      </FormField>
                    </>
                  ) : null}

                  {type !== "dispose" && type !== "requisition" ? (
                    <FormField label="Ghi chú" error={formError?.fieldError?.("notes") || null} className="span-all">
                      <Form.Control value={header.notes} onChange={(e) => set("notes", e.target.value)} />
                    </FormField>
                  ) : null}
                </div>
              </div>

              {/* DÒNG NGUYÊN LIỆU */}
              <div className="scms-panel panel-pad mt-3">
                <div className="panel-head">
                  <div>
                    <h2>{type === "requisition" ? "Danh sách mặt hàng xin cấp" : "Dòng nguyên liệu"}</h2>
                    <p>{lines.length} dòng</p>
                  </div>
                  <Button size="sm" variant="outline-primary" onClick={addLine} type="button">
                    Thêm dòng
                  </Button>
                </div>
                {lines.length === 0 ? (
                  <div className="text-muted">Chưa có dòng nào — bấm Thêm dòng để bắt đầu.</div>
                ) : type === "requisition" ? (
                  <div className="table-responsive">
                    <Table hover className="align-middle mb-0">
                      <thead className="table-light small text-uppercase text-muted">
                        <tr>
                          <th style={{ width: "36%" }}>Mặt hàng xin cấp</th>
                          <th style={{ width: "16%" }} className="text-center">Số kiện / Thùng *</th>
                          <th style={{ width: "16%" }} className="text-center">Số gói / hộp lẻ</th>
                          <th style={{ width: "24%" }}>Tổng khối lượng / Thể tích</th>
                          <th style={{ width: "8%" }} className="text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => {
                          const st = stockOf(l.ingredientId);
                          const packInfo = parsePackDetails(
                            st?.packUnit,
                            st?.unitsPerPack,
                            st?.baseUnit,
                            l.cartons,
                            st?.ingredientName
                          );
                          return (
                            <tr key={l.key}>
                              <td>
                                <Form.Select
                                  value={l.ingredientId}
                                  onChange={(e) => updateLine(l.key, { ingredientId: e.target.value })}
                                  className="form-select-sm fw-medium"
                                >
                                  {stock.map((s) => (
                                    <option key={s.ingredientId} value={s.ingredientId}>
                                      {s.ingredientName}
                                    </option>
                                  ))}
                                </Form.Select>
                              </td>

                              <td className="text-center">
                                <div className="d-flex align-items-center justify-content-center gap-2">
                                  <Form.Control
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={l.cartons}
                                    onChange={(e) => updateLine(l.key, { cartons: e.target.value })}
                                    required
                                    className="form-control-sm fw-bold text-center"
                                    style={{ width: 80 }}
                                  />
                                  <span className="text-muted small fw-medium">{packInfo.cartonName}</span>
                                </div>
                              </td>

                              <td className="text-center">
                                <span className="fw-bold font-monospace text-dark fs-6">
                                  {fmtQty(packInfo.totalPacks)} {packInfo.itemUnit}
                                </span>
                              </td>

                              <td>
                                <span className="fw-bold text-primary font-monospace fs-6">
                                  {packInfo.formattedTotalQty}
                                </span>
                              </td>

                              <td className="text-center">
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  type="button"
                                  onClick={() => removeLine(l.key)}
                                  title="Xóa mặt hàng này"
                                  className="px-2 py-1"
                                >
                                  ✕ Xóa
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  lines.map((l) => {
                    const st = stockOf(l.ingredientId);
                    return (
                      <div
                        key={l.key}
                        className="d-flex gap-2 flex-wrap align-items-end"
                        style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}
                      >
                        <Form.Group style={{ minWidth: 260, flex: "2 1 260px" }}>
                          <Form.Label>Tên mặt hàng (Gói / Hộp lẻ)</Form.Label>
                          <Form.Select
                            value={l.ingredientId}
                            onChange={(e) => updateLine(l.key, { ingredientId: e.target.value })}
                          >
                            {stock.map((s) => (
                              <option key={s.ingredientId} value={s.ingredientId}>
                                {s.ingredientName} {s.packUnit ? `(${s.packUnit})` : ""}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>

                        {type === "receive" ? (
                          <>
                            <Form.Group style={{ width: 110 }}>
                              <Form.Label>Số kiện</Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                step="0.01"
                                value={l.cartons}
                                onChange={(e) => updateLine(l.key, { cartons: e.target.value })}
                              />
                            </Form.Group>
                            <Form.Group style={{ width: 120 }}>
                              <Form.Label>Số lẻ ({st?.baseUnit || "đơn vị"})</Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                step="0.01"
                                value={l.looseUnits}
                                onChange={(e) => updateLine(l.key, { looseUnits: e.target.value })}
                              />
                            </Form.Group>
                            <Form.Group style={{ width: 150 }}>
                              <Form.Label>Đơn giá mua / kiện</Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                step={1000}
                                value={l.purchasePrice}
                                onChange={(e) => updateLine(l.key, { purchasePrice: e.target.value })}
                              />
                            </Form.Group>
                            <Form.Group style={{ width: 150 }}>
                              <Form.Label>Hạn sử dụng</Form.Label>
                              <Form.Control
                                type="date"
                                value={l.expiryDate}
                                onChange={(e) => updateLine(l.key, { expiryDate: e.target.value })}
                              />
                            </Form.Group>
                          </>
                        ) : null}

                        {/* FEA-02: XUẤT KHO NỘI BỘ RA QUẦY BAR (THÙNG/BAO CHẴN + HỘP/GRAM LẺ) */}
                        {type === "issue" ? (
                          <>
                            <Form.Group style={{ width: 130 }}>
                              <Form.Label>Thùng/Bao chẵn</Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                step={1}
                                placeholder="0"
                                value={l.quantityPacks}
                                onChange={(e) => updateLine(l.key, { quantityPacks: e.target.value })}
                              />
                              <div className="text-muted small mt-1">{st?.packUnit || "Kiện"}</div>
                            </Form.Group>

                            <Form.Group style={{ width: 140 }}>
                              <Form.Label>Hộp/Gram lẻ</Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0"
                                value={l.looseUnits}
                                onChange={(e) => updateLine(l.key, { looseUnits: e.target.value })}
                              />
                              <div className="text-muted small mt-1">{st?.baseUnit || "Đơn vị lẻ"}</div>
                            </Form.Group>

                            <div className="pb-2 text-muted small" style={{ minWidth: 220, flex: "1 1 220px" }}>
                              <div>
                                Tổng lượng xuất quy đổi:{" "}
                                <strong className="text-primary">
                                  {fmtQty(
                                    (Number(l.quantityPacks || 0) * (Number(st?.unitsPerPack) || 1)) +
                                      Number(l.looseUnits || 0)
                                  )}{" "}
                                  {st?.baseUnit || ""}
                                </strong>
                              </div>
                              <div>
                                Tồn kho lưu trữ:{" "}
                                <span
                                  className={
                                    Number(st?.currentQtyBase || 0) <
                                    ((Number(l.quantityPacks || 0) * (Number(st?.unitsPerPack) || 1)) +
                                      Number(l.looseUnits || 0))
                                      ? "text-danger fw-bold"
                                      : "fw-bold text-success"
                                  }
                                >
                                  {fmtQty(st?.currentQtyBase || 0)} {st?.baseUnit || ""}
                                </span>{" "}
                                ({fmtQty(st?.currentPackUnits || 0)} {st?.packUnit || "kiện"})
                              </div>
                              {Number(st?.currentQtyBase || 0) <
                              ((Number(l.quantityPacks || 0) * (Number(st?.unitsPerPack) || 1)) +
                                Number(l.looseUnits || 0)) ? (
                                <div className="text-danger small fw-bold">
                                  ⚠️ Lượng xuất vượt quá tồn kho lưu trữ hiện có!
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        {type === "dispose" ? (
                          <>
                            <Form.Group style={{ width: 170 }}>
                              <Form.Label>Lượng bỏ đi thực tế *</Form.Label>
                              <Form.Control
                                type="number"
                                min={0.01}
                                step="any"
                                placeholder="VD: 700"
                                value={l.quantityBase != null ? l.quantityBase : (l.quantityPacks || "")}
                                onChange={(e) => updateLine(l.key, { quantityBase: e.target.value })}
                                required
                                className="fw-bold text-danger"
                              />
                              <div className="text-muted small mt-1">
                                Đơn vị: <strong>{st?.baseUnit || "đơn vị cơ sở"}</strong>
                              </div>
                            </Form.Group>

                            <div className="pb-2 text-muted small" style={{ minWidth: 260, flex: "1 1 260px" }}>
                              <div>
                                Ước tính thiệt hại:{" "}
                                <strong className="text-danger">
                                  {formatVnd(Number(l.quantityBase || l.quantityPacks || 0) * (Number(st?.unitCost) || 0))}
                                </strong>{" "}
                                <span style={{ fontSize: 11 }} className="text-muted">
                                  ({formatVnd(Number(st?.unitCost) || 0)} / {st?.baseUnit || "đơn vị"})
                                </span>
                              </div>
                              <div>
                                Tồn quầy bar:{" "}
                                <span
                                  className={
                                    Number(st?.currentQtyBase || 0) < Number(l.quantityBase || l.quantityPacks || 0)
                                      ? "text-danger fw-bold"
                                      : "fw-bold text-success"
                                  }
                                >
                                  {fmtQty(st?.currentQtyBase || 0)} {st?.baseUnit || ""}
                                </span>
                              </div>
                              {Number(st?.currentQtyBase || 0) < Number(l.quantityBase || l.quantityPacks || 0) ? (
                                <div className="text-danger small fw-bold">
                                  ⚠️ Lượng hủy lớn hơn tồn kho hiện có!
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        <Button variant="outline-danger" size="sm" type="button" onClick={() => removeLine(l.key)}>
                          Xoá dòng
                        </Button>
                      </div>
                    );
                  })
                )}

                {type === "dispose" && lines.length > 0 ? (
                  <div className="my-3 p-3 border rounded bg-light">
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                      <span className="fw-bold">Tổng giá trị thiệt hại tài chính dự kiến:</span>
                      <span className="fs-5 fw-bold text-danger">
                        {formatVnd(
                          lines.reduce((sum, l) => {
                            const st = stockOf(l.ingredientId);
                            return sum + Number(l.quantityBase || l.quantityPacks || 0) * (Number(st?.unitCost) || 0);
                          }, 0)
                        )}
                      </span>
                    </div>
                    {lines.reduce((sum, l) => {
                      const st = stockOf(l.ingredientId);
                      return sum + Number(l.quantityBase || l.quantityPacks || 0) * (Number(st?.unitCost) || 0);
                    }, 0) > 1000000 ? (
                      <Alert variant="warning" className="mt-2 mb-0 py-2 small">
                        <strong>⚠️ Giá trị lô hủy lớn (&gt; 1.000.000 VNĐ):</strong> Đơn sẽ được tự động chuyển lên <strong>COO (Giám đốc Vận hành)</strong> duyệt theo quy định!
                      </Alert>
                    ) : (
                      <div className="small text-success mt-1">
                        ✓ Nằm trong hạn mức tự duyệt của Quản lý quán (&le; 1.000.000 VNĐ).
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="form-actions">
                  <Button variant="outline-secondary" onClick={() => navigate("/branch/inventory")} type="button">
                    Huỷ bỏ
                  </Button>
                  <Button type="submit" variant="primary" disabled={saving}>
                    {saving ? <Spinner size="sm" className="me-2" /> : null}
                    {meta.submitLabel}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Form>
      )}
    </AdminLayout>
  );
}
