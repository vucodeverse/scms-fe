import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import Icon from "../components/Icon.jsx";
import FormField from "../components/FormField.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { isUnassignedBranchManager, roleLabel } from "../auth/landing.js";
import UnassignedManagerNotice from "../components/UnassignedManagerNotice.jsx";
import { buildMenu } from "../config/menu.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";
import { fmtQty } from "./InventoryPage.jsx";
import { parsePackDetails } from "../lib/unitConversion.js";

const ROUND_TYPES = [
  { value: "DAILY_CLOSING", label: "Kiểm kê chốt ca cuối ngày (Daily Closing)" },
  { value: "PERIODIC_WEEKLY", label: "Kiểm kê định kỳ tuần (Weekly Audit)" },
  { value: "SPOT_AUDIT", label: "Kiểm kê đột xuất (Spot Audit)" },
];

/**
 * FEA-05: Kiểm kê kho mù 4 mắt & Cân đối chênh lệch ca (Blind Stocktake & Reconciliation).
 * - Bước 1: Quản lý quán mở phiên kiểm kê chốt ca. Hệ thống chụp ảnh snapshot tồn sổ sách nhưng ẩn đi (bookQuantity = null).
 * - Bước 2: Quản lý quán và Barista cùng đếm thực tế (nguyên tắc 4 mắt), nhập witnessName và số lượng thực tế.
 * - Bước 3: Nộp số đếm & đối soát tự động: mở khóa bảng đối chiếu 3 cột (Sổ sách vs Thực đếm vs Chênh lệch).
 * - Bước 4: Cân đối hoặc Báo động:
 *   + |netVarianceValue| <= 50.000 VNĐ: Cho phép cân đối, cập nhật tồn kho, sinh StockTransaction type ADJUST.
 *   + |netVarianceValue| > 50.000 VNĐ: KHÓA cân đối, status DISCREPANCY_ALERT, phát SecurityAlert(HIGH) lên COO.
 */
export default function StocktakePage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const menu = buildMenu(user);
  const unassignedManager = isUnassignedBranchManager(user);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(!unassignedManager);
  const [session, setSession] = useState(null);
  const [witnessName, setWitnessName] = useState("");
  const [counts, setCounts] = useState({});
  const [cartonCounts, setCartonCounts] = useState({});
  const [looseCounts, setLooseCounts] = useState({});
  const [notes, setNotes] = useState({});
  const [createForm, setCreateForm] = useState({
    roundType: "DAILY_CLOSING",
    witnessName: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState(null);
  const [result, setResult] = useState(null);

  function handleCountChange(l, rawCarton, rawLoose) {
    const packInfo = parsePackDetails(l.packUnit, l.unitsPerPack, l.baseUnit, 1, l.ingredientName);

    setCartonCounts((prev) => ({ ...prev, [l.ingredientId]: rawCarton }));
    setLooseCounts((prev) => ({ ...prev, [l.ingredientId]: rawLoose }));

    if ((rawCarton === "" || rawCarton === undefined) && (rawLoose === "" || rawLoose === undefined)) {
      setCounts((prev) => ({ ...prev, [l.ingredientId]: "" }));
      return;
    }

    const c = Math.max(0, parseInt(rawCarton, 10) || 0);
    const loose = Math.max(0, parseInt(rawLoose, 10) || 0);

    const basePerCarton = packInfo.totalBaseQty;
    const basePerLoose = packInfo.itemsPerPack > 1 ? basePerCarton / packInfo.itemsPerPack : basePerCarton;

    const totalBase = c * basePerCarton + loose * basePerLoose;
    setCounts((prev) => ({ ...prev, [l.ingredientId]: totalBase }));
  }

  const load = useCallback(async () => {
    if (unassignedManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const active = await inventoryApi.getActiveStocktake();
      if (active && active.stocktakeId) {
        setSession(active);
        setWitnessName(active.witnessName || "");
        const initCounts = {};
        const initNotes = {};
        (active.lines || []).forEach((l) => {
          // Rule 1: Chế độ đếm mù -> để trống ô đếm thực tế nếu chưa nhập
          initCounts[l.ingredientId] = l.countedQuantity != null ? l.countedQuantity : "";
          initNotes[l.ingredientId] = "";
        });
        setCounts(initCounts);
        setNotes(initNotes);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [unassignedManager]);

  useEffect(() => {
    load();
  }, [load]);

  // Bước 1: Mở phiên kiểm kê ca (Snapshot sổ sách & kích hoạt kiểm kê mù)
  async function createSession(e) {
    e.preventDefault();
    setBusy(true);
    setFormMessage(null);
    try {
      const payload = {
        roundType: createForm.roundType,
        witnessName: createForm.witnessName.trim() || null,
        notes: createForm.notes.trim() || null,
      };
      const created = await inventoryApi.createStocktakeSession(payload);
      setSession(created);
      setWitnessName(createForm.witnessName.trim() || "");
      const initCounts = {};
      const initNotes = {};
      (created.lines || []).forEach((l) => {
        // Blind count: không gán bookQuantity vào ô nhập!
        initCounts[l.ingredientId] = "";
        initNotes[l.ingredientId] = "";
      });
      setCounts(initCounts);
      setNotes(initNotes);
      toast.success(`Đã mở phiên kiểm kê ${created.slipCode || ""} ở chế độ Đếm mù.`);
    } catch (err) {
      setFormMessage(err.message || "Không mở được phiên kiểm kê.");
    } finally {
      setBusy(false);
    }
  }

  // Bước 3: Nộp số đếm & Đối soát tự động 4 mắt (FEA-05)
  async function handleReconcile() {
    if (!session) return;
    setFormMessage(null);

    // Bắt buộc có tên Barista cùng kiểm đếm xác nhận
    if (!witnessName || !witnessName.trim()) {
      setFormMessage("Vui lòng nhập họ tên nhân viên Barista cùng kiểm đếm xác nhận.");
      return;
    }

    // Kiểm tra đã nhập đủ số lượng đếm của toàn bộ danh mục (AF-03)
    const missingItems = (session.lines || []).filter(
      (l) => counts[l.ingredientId] === "" || counts[l.ingredientId] === undefined || isNaN(Number(counts[l.ingredientId]))
    );
    if (missingItems.length > 0) {
      setFormMessage(
        `Vui lòng nhập đủ số lượng đếm thực tế của toàn bộ ${session.lines.length} mặt hàng (còn thiếu ${missingItems.length} món chưa đếm).`
      );
      return;
    }

    setBusy(true);
    try {
      const payload = {
        witnessName: witnessName.trim(),
        counts: (session.lines || []).map((l) => ({
          ingredientId: l.ingredientId,
          countedQuantity: Number(counts[l.ingredientId]),
          notes: (notes[l.ingredientId] || "").trim() || null,
        })),
      };

      const rec = await inventoryApi.reconcileStocktake(session.stocktakeId, payload);
      setResult(rec);
      setSession(null);

      if (rec.status === "DISCREPANCY_ALERT") {
        toast.error(`⚠️ VI PHẠM DUNG SAI! Phiên ${rec.slipCode} lệch > 50.000 VNĐ. Đã gửi cảnh báo an ninh lên COO!`);
      } else {
        toast.success(`✅ Hoàn tất kiểm kê! Phiên ${rec.slipCode} trong dung sai, đã tự động cân đối kho.`);
      }
    } catch (err) {
      setFormMessage(err.message || "Không thực hiện đối soát kiểm kê được.");
    } finally {
      setBusy(false);
    }
  }

  // Quick helper: Điền mẫu số liệu để test nhanh
  function handleFillSample(mode) {
    if (!session || !session.lines) return;
    const newCounts = { ...counts };
    session.lines.forEach((l) => {
      if (mode === "MATCH") {
        // Đếm khớp (nếu biết hoặc số mẫu)
        newCounts[l.ingredientId] = l.bookQuantity != null ? l.bookQuantity : 100;
      } else if (mode === "WITHIN_TOLERANCE") {
        // Lệch rất ít (trong dung sai <= 50.000 VNĐ)
        newCounts[l.ingredientId] = l.bookQuantity != null ? Math.max(0, Number(l.bookQuantity) - 1) : 99;
      } else if (mode === "DISCREPANCY_ALERT") {
        // Lệch cực lớn (> 50.000 VNĐ)
        newCounts[l.ingredientId] = l.bookQuantity != null ? Math.max(0, Number(l.bookQuantity) - 2000) : 0;
      } else if (mode === "CLEAR") {
        newCounts[l.ingredientId] = "";
      }
    });
    setCounts(newCounts);
    if (!witnessName) {
      setWitnessName("Trần Văn Barista (Làm chứng ca)");
    }
  }

  const nameOf = (ingredientId) => {
    const line = (session?.lines || []).find((l) => l.ingredientId === ingredientId);
    return line ? `${line.ingredientCode} — ${line.ingredientName}` : `Nguyên liệu #${ingredientId}`;
  };

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Kiểm kê kho ca"
        screenCode="SCR-14"
        description="Thực hiện kiểm kê nguyên vật liệu thực tế tại quầy pha chế và đối soát cân đối sổ sách cuối ca."
        actions={
          <Button variant="outline-secondary" onClick={() => navigate("/branch/inventory")}>
            <Icon name="back" size={15} /> Về danh sách tồn kho
          </Button>
        }
      />
      {unassignedManager ? (
        <UnassignedManagerNotice />
      ) : loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải dữ liệu kiểm kê…
        </div>
      ) : result ? (
        /* ===================================================================
           BƯỚC 4: KẾT QUẢ ĐỐI SOÁT & CÂN ĐỐI / BÁO ĐỘNG AN NINH
           =================================================================== */
        <div className="scms-panel panel-pad" style={{ maxWidth: 1000 }}>
          <div className="panel-head d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div className="d-flex align-items-center gap-2">
                <h2 className="mb-0">Biên bản đối soát kiểm kê {result.slipCode}</h2>
                {result.status === "DISCREPANCY_ALERT" ? (
                  <Badge bg="danger" className="fs-6 py-2 px-3">
                    Cảnh báo chênh lệch cao
                  </Badge>
                ) : (
                  <Badge bg="success" className="fs-6 py-2 px-3">
                    Đã cân đối kho
                  </Badge>
                )}
              </div>
              <p className="text-muted mt-1 mb-0">
                {result.closedAt ? `Chốt biên bản lúc ${formatDateTime(result.closedAt)} · ` : ""}
                Tổng {result.totalItems} mặt hàng kiểm kê (Khớp: <strong>{result.matchedCount}</strong>, Lệch: <strong>{result.discrepancyCount}</strong>)
              </p>
            </div>
            <Button variant="outline-primary" size="sm" onClick={() => { setResult(null); load(); }}>
              Lập biên bản mới
            </Button>
          </div>

          {result.status === "DISCREPANCY_ALERT" || Math.abs(Number(result.netVarianceValue || 0)) > 50000 ? (
            <Alert variant="danger" className="mt-3 p-3 shadow-sm border-danger">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fs-4">⚠️</span>
                <h5 className="alert-heading fw-bold mb-0 text-danger">
                  CHÊNH LỆCH VƯỢT HẠN MỨC CHO PHÉP (±50.000 VNĐ)
                </h5>
              </div>
              <p className="mb-2">
                Tổng giá trị chênh lệch ròng của ca là{" "}
                <strong className="fs-5 text-danger">{formatVnd(result.netVarianceValue)}</strong>, đã vượt quá hạn mức
                hao hụt cho phép của chuỗi (<strong>&plusmn;50.000 VNĐ</strong>).
              </p>
              <hr className="my-2" />
              <ul className="mb-0 ps-3 small">
                <li>
                  <strong>Hệ thống tạm dừng cân đối tự động:</strong> Tồn kho sổ sách được giữ nguyên số liệu gốc để bảo tồn chứng từ đối chiếu.
                </li>
                <li>
                  <strong>Báo cáo cấp trên:</strong> Cảnh báo an ninh đã được chuyển tới <strong>Giám đốc Vận hành (COO)</strong> để kiểm tra.
                </li>
                <li>
                  <strong>Quy trình xử lý:</strong> Quản lý quán và Barista trực ca vui lòng kiểm tra lại nguyên nhân thất thoát và lập biên bản giải trình theo quy định.
                </li>
              </ul>
            </Alert>
          ) : (
            <Alert variant="success" className="mt-3 p-3 shadow-sm border-success">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fs-4">✅</span>
                <h5 className="alert-heading fw-bold mb-0 text-success">
                  CHÊNH LỆCH TRONG HẠN MỨC CHO PHÉP — ĐÃ CÂN ĐỐI KHO THÀNH CÔNG
                </h5>
              </div>
              <p className="mb-0 small">
                Tổng giá trị chênh lệch ròng là{" "}
                <strong className="text-success">{formatVnd(result.netVarianceValue)}</strong> nằm trong hạn mức hao hụt
                vận hành cho phép. Hệ thống đã tự động cập nhật số lượng tồn kho theo số lượng thực tế đếm được và ghi nhận
                phiếu điều chỉnh kho tương ứng. Ca làm việc đủ điều kiện đóng và bàn giao!
              </p>
            </Alert>
          )}

          {/* Thẻ thống kê tổng hợp */}
          <Row className="g-3 my-2">
            <Col sm={6} md={3}>
              <Card className="text-center p-2 bg-light border">
                <div className="text-muted small">Tổng mặt hàng</div>
                <div className="fs-4 fw-bold">{result.totalItems}</div>
              </Card>
            </Col>
            <Col sm={6} md={3}>
              <Card className="text-center p-2 bg-light border">
                <div className="text-muted small">Mặt hàng khớp (100%)</div>
                <div className="fs-4 fw-bold text-success">{result.matchedCount}</div>
              </Card>
            </Col>
            <Col sm={6} md={3}>
              <Card className="text-center p-2 bg-light border">
                <div className="text-muted small">Mặt hàng lệch</div>
                <div className="fs-4 fw-bold text-warning">{result.discrepancyCount}</div>
              </Card>
            </Col>
            <Col sm={6} md={3}>
              <Card className="text-center p-2 bg-light border">
                <div className="text-muted small">Chênh lệch tiền ròng</div>
                <div
                  className={`fs-4 fw-bold ${
                    Number(result.netVarianceValue) < 0
                      ? "text-danger"
                      : Number(result.netVarianceValue) > 0
                      ? "text-primary"
                      : "text-success"
                  }`}
                >
                  {formatVnd(result.netVarianceValue)}
                </div>
              </Card>
            </Col>
          </Row>

          {/* Bảng chi tiết đối soát 3 cột (Sổ sách vs Thực đếm vs Chênh lệch) */}
          <h5 className="mt-4 mb-2 fw-bold">Bảng chi tiết đối soát từng mặt hàng (3 cột)</h5>
          {(result.adjustments || []).length ? (
            <div className="table-wrap">
              <Table responsive bordered hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Nguyên vật liệu</th>
                    <th className="text-end">Tồn sổ sách (1)</th>
                    <th className="text-end">Thực tế đếm (2)</th>
                    <th className="text-end">Chênh lệch (2 - 1)</th>
                    <th className="text-end">Đơn giá vốn</th>
                    <th className="text-end">Thành tiền lệch</th>
                    <th>Trạng thái &amp; Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {result.adjustments.map((a, i) => {
                    const isMatched = Number(a.variance || 0) === 0;
                    const isDeficit = Number(a.variance || 0) < 0;
                    return (
                      <tr key={a.ingredientId || i} className={isMatched ? "" : isDeficit ? "table-danger" : "table-warning"}>
                        <td>
                          <strong>{a.ingredientName}</strong>
                          <div className="text-muted small">Đơn vị: {a.baseUnit}</div>
                        </td>
                        <td className="text-end font-monospace">{fmtQty(a.bookQuantity)} {a.baseUnit}</td>
                        <td className="text-end font-monospace fw-bold">{fmtQty(a.countedQuantity)} {a.baseUnit}</td>
                        <td className="text-end font-monospace">
                          <strong className={isMatched ? "text-success" : isDeficit ? "text-danger" : "text-primary"}>
                            {Number(a.variance) > 0 ? `+${fmtQty(a.variance)}` : fmtQty(a.variance)} {a.baseUnit}
                          </strong>
                        </td>
                        <td className="text-end small">{formatVnd(a.unitCost)}</td>
                        <td className="text-end fw-bold">
                          <span className={isMatched ? "text-muted" : isDeficit ? "text-danger" : "text-primary"}>
                            {formatVnd(a.varianceFinancialValue)}
                          </span>
                        </td>
                        <td>
                          {isMatched ? (
                            <Badge bg="success">KHỚP (100%)</Badge>
                          ) : isDeficit ? (
                            <Badge bg="danger">THIẾU (Hao hụt)</Badge>
                          ) : (
                            <Badge bg="primary">THỪA</Badge>
                          )}
                          {a.notes ? <div className="small text-muted mt-1">{a.notes}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : (
            <p className="text-muted mt-3">Không có mặt hàng nào chênh lệch.</p>
          )}

          <div className="form-actions mt-4 d-flex justify-content-between">
            <Button variant="outline-secondary" href="#/branch/inventory">
              ← Quay về danh mục kho
            </Button>
            <Button variant="primary" onClick={() => { setResult(null); load(); }}>
              Bắt đầu ca kiểm kê mới
            </Button>
          </div>
        </div>
      ) : !session ? (
        /* ===================================================================
           BƯỚC 1: MỞ PHIÊN KIỂM KÊ CA (BẮT ĐẦU ĐẾM MÙ)
           =================================================================== */
        <Form onSubmit={createSession}>
          <div className="scms-panel panel-pad" style={{ maxWidth: 720 }}>
            <div className="panel-head">
              <div>
                <h2>Mở đợt kiểm kê ca</h2>
                <p>Khởi tạo biên bản kiểm kê, hệ thống tạm thời ghi nhận trạng thái sổ sách hiện tại để chuẩn bị đối soát thực tế tại quầy bar.</p>
              </div>
            </div>

            {formMessage ? (
              <Alert variant="danger" className="py-2">
                {formMessage}
              </Alert>
            ) : null}

            <Alert variant="info" className="py-2 small">
              <strong>Lưu ý kiểm kê:</strong> Nhằm đảm bảo tính khách quan và trung thực, số lượng tồn trên sổ sách sẽ được tạm ẩn trong quá trình kiểm đếm thực tế tại quầy.
            </Alert>

            <div className="form-grid">
              <FormField label="Loại đợt kiểm kê">
                <Form.Select
                  value={createForm.roundType}
                  onChange={(e) => setCreateForm((f) => ({ ...f, roundType: e.target.value }))}
                >
                  {ROUND_TYPES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Form.Select>
              </FormField>

              <FormField label="Nhân viên Barista cùng kiểm đếm (*)" hint="Quy định tối thiểu 2 người cùng kiểm đếm: Quản lý và Barista trực ca">
                <Form.Control
                  placeholder="Ví dụ: Nguyễn Văn Barista"
                  value={createForm.witnessName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, witnessName: e.target.value }))}
                  required
                />
              </FormField>

              <FormField label="Ghi chú đợt kiểm kê" className="span-all">
                <Form.Control
                  placeholder="Ghi chú thêm về ca trực hoặc lý do kiểm kê..."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </FormField>
            </div>

            <div className="form-actions mt-3">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? <Spinner size="sm" className="me-2" /> : null}
                Bắt đầu kiểm kê ca
              </Button>
            </div>
          </div>
        </Form>
      ) : (
        /* ===================================================================
           BƯỚC 2 & 3: MÀN HÌNH ĐẾM KIỂM KÊ (BLIND COUNTING)
           =================================================================== */
        <div className="scms-panel panel-pad" style={{ maxWidth: 960 }}>
          <div className="panel-head d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div className="d-flex align-items-center gap-2">
                <h2 className="mb-0">Biên bản kiểm kê {session.slipCode}</h2>
                <Badge bg="warning" text="dark" className="fs-6 py-2 px-3">
                  Đang kiểm đếm
                </Badge>
              </div>
              <p className="text-muted mt-1 mb-0">
                {session.branchName || "Chi nhánh"} · Mở bởi <strong>{session.startedBy || "Quản lý"}</strong>
                {session.startedAt ? ` · Lúc ${formatDateTime(session.startedAt)}` : ""}
              </p>
            </div>
          </div>

          {formMessage ? (
            <Alert variant="danger" className="my-2 py-2">
              {formMessage}
            </Alert>
          ) : null}

          <Alert variant="secondary" className="my-3 py-2 small">
            Vui lòng thực hiện kiểm đếm số lượng thực tế của từng nguyên vật liệu tại quầy bar và nhập vào cột <strong>Số đếm thực tế</strong> bên dưới.
          </Alert>

          <Card className="p-3 mb-3 bg-light border">
            <Row className="align-items-center g-2">
              <Col md={6}>
                <Form.Label className="fw-bold mb-1">
                  Nhân viên Barista cùng kiểm đếm (*):
                </Form.Label>
                <Form.Control
                  placeholder="Họ tên nhân viên Barista xác nhận kiểm đếm..."
                  value={witnessName}
                  onChange={(e) => setWitnessName(e.target.value)}
                  required
                />
              </Col>
              <Col md={6}>
                <div className="text-muted small mt-2 mt-md-0">
                  Biên bản kiểm kê cần có chữ ký xác nhận của ít nhất 2 nhân sự trực ca (Quản lý và Barista) để đảm bảo tính minh bạch.
                </div>
              </Col>
            </Row>
          </Card>

          <div className="small text-muted fw-bold mb-2">
            Danh sách nguyên vật liệu cần kiểm đếm ({session.lines?.length || 0} mặt hàng):
          </div>

          {/* Bảng nhập số đếm kiểm kê thực tế theo Thùng / Gói / Chai lẻ */}
          <div className="table-wrap">
            <Table responsive bordered hover className="align-middle mb-0">
              <thead className="table-light small text-uppercase text-muted">
                <tr>
                  <th style={{ width: 45 }} className="text-center">STT</th>
                  <th style={{ width: "30%" }}>Nguyên vật liệu</th>
                  <th style={{ width: "18%" }}>Quy cách chuẩn</th>
                  <th style={{ width: "12%" }} className="text-center">Tồn sổ sách</th>
                  <th style={{ width: "26%" }} className="text-center">Thực đếm (Kiện / Gói lẻ)</th>
                  <th style={{ width: "14%" }} className="text-end pe-3">Quy đổi cơ sở</th>
                </tr>
              </thead>
              <tbody>
                {(session.lines || []).map((l, index) => {
                  const packInfo = parsePackDetails(l.packUnit, l.unitsPerPack, l.baseUnit, 1, l.ingredientName);
                  const isEntered = counts[l.ingredientId] !== "" && counts[l.ingredientId] !== undefined;

                  return (
                    <tr key={l.ingredientId}>
                      <td className="text-center text-muted small">{index + 1}</td>
                      <td>
                        <div className="fw-bold">{l.ingredientName}</div>
                        <div className="text-muted small">
                          Mã: <code className="text-dark">{l.ingredientCode}</code>
                        </div>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border">
                          {l.packUnit || l.baseUnit}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="text-muted small fst-italic">Tạm ẩn (Đếm mù)</span>
                      </td>
                      <td>
                        <div className="d-flex align-items-center justify-content-center gap-2">
                          {/* Ô nhập số Kiện / Thùng / Bao */}
                          <div className="d-flex align-items-center gap-1">
                            <Form.Control
                              type="number"
                              min={0}
                              step={1}
                              placeholder="0"
                              value={cartonCounts[l.ingredientId] ?? ""}
                              onChange={(e) =>
                                handleCountChange(l, e.target.value, looseCounts[l.ingredientId] ?? "")
                              }
                              className="form-control-sm text-center fw-bold"
                              style={{ width: 70 }}
                            />
                            <span className="text-muted small">{packInfo.cartonName}</span>
                          </div>

                          {/* Ô nhập số Gói / Chai / Hộp lẻ nếu quy cách có đơn vị con */}
                          {packInfo.hasSubPacks ? (
                            <>
                              <span className="text-muted">+</span>
                              <div className="d-flex align-items-center gap-1">
                                <Form.Control
                                  type="number"
                                  min={0}
                                  step={1}
                                  placeholder="0"
                                  value={looseCounts[l.ingredientId] ?? ""}
                                  onChange={(e) =>
                                    handleCountChange(l, cartonCounts[l.ingredientId] ?? "", e.target.value)
                                  }
                                  className="form-control-sm text-center fw-bold"
                                  style={{ width: 70 }}
                                />
                                <span className="text-muted small">{packInfo.itemUnit}</span>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-end pe-3">
                        {isEntered ? (
                          <div className="fw-bold text-primary font-monospace">
                            {fmtQty(counts[l.ingredientId])} {l.baseUnit}
                          </div>
                        ) : (
                          <span className="text-muted small fst-italic">Chưa đếm</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <div className="form-actions mt-4 d-flex justify-content-between align-items-center">
            <Button variant="outline-secondary" href="#/branch/inventory">
              Quay lại kho
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleReconcile}
              disabled={busy || !witnessName.trim()}
              className="px-4"
            >
              {busy ? <Spinner size="sm" className="me-2" /> : null}
              Xác nhận &amp; Nộp kết quả kiểm đếm
            </Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
