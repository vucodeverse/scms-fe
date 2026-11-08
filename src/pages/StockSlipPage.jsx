import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { useRouter } from "../router/HashRouter.jsx";
import TaskLayout from "../layouts/TaskLayout.jsx";
import FormField from "../components/FormField.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";
import { fmtQty } from "./InventoryPage.jsx";

const META = {
  receive: {
    title: "Phiếu nhập kho",
    code: "SCR-14 · Nhập kho",
    submitLabel: "Lập phiếu nhập",
  },
  issue: {
    title: "Phiếu xuất quầy bar",
    code: "SCR-14 · Xuất kho",
    submitLabel: "Lập phiếu xuất",
  },
  dispose: {
    title: "Phiếu hủy hàng",
    code: "SCR-14 · Hủy hàng",
    submitLabel: "Lập phiếu hủy",
  },
};

const RECEIVE_SOURCES = [
  { value: "SUPPLIER", label: "Nhà cung cấp" },
  { value: "INTERNAL_TRANSFER", label: "Điều chuyển nội bộ" },
  { value: "SURPLUS", label: "Thừa kiểm kê" },
];

const DISPOSE_REASONS = [
  { value: "COOLING_FAILURE", label: "Hỏng thiết bị lạnh" },
  { value: "EXPIRED", label: "Hết hạn sử dụng" },
  { value: "PACKAGING_DAMAGE", label: "Hỏng bao bì" },
  { value: "DEGRADATION", label: "Xuống cấp chất lượng" },
];

// Task screen lập phiếu nhập / xuất / hủy (FE-18, UC28–UC30). Chi
// nhánh lấy theo ngữ cảnh đăng nhập (backend không nhận branchId
// trong thân phiếu). Backend chưa có API tra cứu phiếu đã lập nên
// sau khi lập, màn hình hiển thị tóm tắt phiếu từ response.
export default function StockSlipPage() {
  const { query, navigate } = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const type = META[query?.type] ? query.type : "receive";
  const meta = META[type];

  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState({
    source: "SUPPLIER",
    supplierName: "",
    invoiceRef: "",
    purpose: "",
    destinationBar: "",
    baristaName: "",
    reasonCategory: "EXPIRED",
    reason: "",
    evidenceFileId: "",
    notes: "",
  });
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await inventoryApi.getStock({ branchId: user?.branchId || undefined, uiPage: 1, size: 100 });
      setStock(page.content || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh mục nguyên liệu trong kho.");
    } finally {
      setLoading(false);
    }
  }, [user?.branchId]);

  useEffect(() => {
    load();
  }, [load]);

  function set(field, value) {
    setHeader((h) => ({ ...h, [field]: value }));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: Date.now() + Math.random(),
        ingredientId: stock[0]?.ingredientId || "",
        cartons: "",
        looseUnits: "",
        purchasePrice: "",
        expiryDate: "",
        quantityPacks: "",
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
    if (!lines.length) {
      setFormMessage("Phiếu cần ít nhất một dòng nguyên liệu.");
      return;
    }
    setSaving(true);
    setFormError(null);
    setFormMessage(null);
    try {
      let res;
      if (type === "receive") {
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
      } else if (type === "issue") {
        res = await inventoryApi.issue({
          purpose: header.purpose.trim(),
          destinationBar: header.destinationBar.trim(),
          baristaName: header.baristaName.trim(),
          notes: header.notes.trim() || null,
          items: lines.map((l) => ({
            ingredientId: Number(l.ingredientId),
            quantityPacks: Number(l.quantityPacks || 0),
          })),
        });
      } else {
        res = await inventoryApi.dispose({
          reasonCategory: header.reasonCategory,
          reason: header.reason.trim(),
          evidenceFileId: header.evidenceFileId.trim() || null,
          items: lines.map((l) => ({
            ingredientId: Number(l.ingredientId),
            quantityPacks: Number(l.quantityPacks || 0),
            itemCause: l.itemCause.trim() || null,
          })),
        });
      }
      setResult(res);
      toast.success(`Đã lập phiếu ${res.slipCode || ""}.`);
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) setFormMessage(err.message || "Không lập được phiếu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TaskLayout
      title={meta.title}
      screenCode={meta.code}
      backTo="/branch/inventory"
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      {result ? (
        <div className="scms-panel panel-pad" style={{ maxWidth: 720 }}>
          <div className="panel-head">
            <div>
              <h2>Đã lập phiếu {result.slipCode}</h2>
              <p>
                {result.branchName || user?.branchName || ""}
                {result.receivedAt ? ` · ${formatDateTime(result.receivedAt)}` : ""}
                {result.issuedAt ? ` · ${formatDateTime(result.issuedAt)}` : ""}
                {result.disposedAt ? ` · ${formatDateTime(result.disposedAt)}` : ""}
              </p>
            </div>
          </div>
          {result.totalAmount != null ? (
            <div className="stat-line">
              <span className="text-muted">Tổng giá trị phiếu</span>
              <strong>{formatVnd(result.totalAmount)}</strong>
            </div>
          ) : null}
          {result.subtotalAmount != null ? (
            <div className="stat-line">
              <span className="text-muted">Tạm tính (chưa VAT)</span>
              <strong>{formatVnd(result.subtotalAmount)}</strong>
            </div>
          ) : null}
          <div className="form-actions">
            <Button variant="outline-secondary" onClick={() => navigate("/branch/inventory")}>
              Về tồn kho
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setResult(null);
                setLines([]);
              }}
            >
              Lập phiếu mới
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <Form onSubmit={submit}>
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Thông tin phiếu</h2>
                <p>Chi nhánh: {user?.branchName || "theo ngữ cảnh tài khoản"}</p>
              </div>
            </div>
            {formMessage ? (
              <div className="notice notice--warn">
                <span>{formMessage}</span>
              </div>
            ) : null}
            <div className="form-grid">
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
                  <FormField label="Mục đích xuất" required error={formError?.fieldError?.("purpose") || null}>
                    <Form.Control value={header.purpose} onChange={(e) => set("purpose", e.target.value)} />
                  </FormField>
                  <FormField
                    label="Quầy nhận hàng"
                    required
                    error={formError?.fieldError?.("destinationBar") || null}
                  >
                    <Form.Control
                      value={header.destinationBar}
                      onChange={(e) => set("destinationBar", e.target.value)}
                    />
                  </FormField>
                  <FormField
                    label="Người nhận"
                    required
                    error={formError?.fieldError?.("baristaName") || null}
                  >
                    <Form.Control value={header.baristaName} onChange={(e) => set("baristaName", e.target.value)} />
                  </FormField>
                </>
              ) : null}
              {type === "dispose" ? (
                <>
                  <FormField
                    label="Phân loại nguyên nhân"
                    required
                    error={formError?.fieldError?.("reasonCategory") || null}
                  >
                    <Form.Select value={header.reasonCategory} onChange={(e) => set("reasonCategory", e.target.value)}>
                      {DISPOSE_REASONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Form.Select>
                  </FormField>
                  <FormField label="Ảnh bằng chứng (mã/đường dẫn)" error={formError?.fieldError?.("evidenceFileId") || null}>
                    <Form.Control
                      value={header.evidenceFileId}
                      onChange={(e) => set("evidenceFileId", e.target.value)}
                    />
                  </FormField>
                  <FormField
                    label="Lý do hủy chi tiết"
                    required
                    error={formError?.fieldError?.("reason") || null}
                    help="Bắt buộc mô tả chi tiết, tối thiểu 10 ký tự."
                    className="span-all"
                  >
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={header.reason}
                      onChange={(e) => set("reason", e.target.value)}
                    />
                  </FormField>
                </>
              ) : null}
              {type !== "dispose" ? (
                <FormField label="Ghi chú" error={formError?.fieldError?.("notes") || null} className="span-all">
                  <Form.Control value={header.notes} onChange={(e) => set("notes", e.target.value)} />
                </FormField>
              ) : null}
            </div>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Dòng nguyên liệu</h2>
                <p>{lines.length} dòng</p>
              </div>
              <Button size="sm" variant="outline-primary" onClick={addLine} type="button">
                Thêm dòng
              </Button>
            </div>
            {lines.length === 0 ? (
              <div className="text-muted">Chưa có dòng nào — bấm Thêm dòng để bắt đầu.</div>
            ) : (
              lines.map((l) => {
                const st = stockOf(l.ingredientId);
                return (
                  <div
                    key={l.key}
                    className="d-flex gap-2 flex-wrap align-items-end"
                    style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}
                  >
                    <Form.Group style={{ minWidth: 230, flex: "1 1 230px" }}>
                      <Form.Label>Nguyên liệu</Form.Label>
                      <Form.Select
                        value={l.ingredientId}
                        onChange={(e) => updateLine(l.key, { ingredientId: e.target.value })}
                      >
                        {stock.map((s) => (
                          <option key={s.ingredientId} value={s.ingredientId}>
                            {s.ingredientCode} — {s.ingredientName} (tồn {fmtQty(s.currentPackUnits)} kiện)
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
                          <Form.Label>
                            Số lẻ ({st?.baseUnit || "đơn vị"})
                          </Form.Label>
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
                    ) : (
                      <Form.Group style={{ width: 130 }}>
                        <Form.Label>Số kiện {type === "issue" ? "xuất" : "hủy"}</Form.Label>
                        <Form.Control
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.quantityPacks}
                          onChange={(e) => updateLine(l.key, { quantityPacks: e.target.value })}
                        />
                      </Form.Group>
                    )}
                    {type === "dispose" ? (
                      <Form.Group style={{ minWidth: 200, flex: "1 1 200px" }}>
                        <Form.Label>Tình trạng mặt hàng</Form.Label>
                        <Form.Control
                          value={l.itemCause}
                          onChange={(e) => updateLine(l.key, { itemCause: e.target.value })}
                        />
                      </Form.Group>
                    ) : null}
                    <Button variant="outline-danger" size="sm" type="button" onClick={() => removeLine(l.key)}>
                      Xoá dòng
                    </Button>
                  </div>
                );
              })
            )}
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
        </Form>
      )}
    </TaskLayout>
  );
}
