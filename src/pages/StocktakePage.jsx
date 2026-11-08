import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import FormField from "../components/FormField.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";
import { fmtQty } from "./InventoryPage.jsx";

const ROUND_TYPES = [
  { value: "DAILY_CLOSING", label: "Kiểm kê cuối ngày" },
  { value: "PERIODIC_WEEKLY", label: "Kiểm kê định kỳ tuần" },
  { value: "SPOT_AUDIT", label: "Kiểm kê đột xuất" },
];

// Task screen kiểm kê (FE-18, UC31–UC32): mở phiên kiểm kê, nhập số
// đếm thực tế theo đơn vị cơ sở, chốt đối soát — backend điều chỉnh
// tồn kho và trả kết quả chênh lệch.
export default function StocktakePage() {
  const { user } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [counts, setCounts] = useState({});
  const [createForm, setCreateForm] = useState({ roundType: "DAILY_CLOSING", witnessName: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const active = await inventoryApi.getActiveStocktake();
      if (active && active.stocktakeId) {
        setSession(active);
        const init = {};
        (active.lines || []).forEach((l) => {
          init[l.ingredientId] = l.countedQuantity ?? l.bookQuantity ?? "";
        });
        setCounts(init);
      } else {
        setSession(null);
      }
    } catch {
      // Không có phiên đang mở — backend trả lỗi/không có dữ liệu.
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createSession(e) {
    e.preventDefault();
    setBusy(true);
    setFormMessage(null);
    try {
      const created = await inventoryApi.createStocktakeSession({
        roundType: createForm.roundType,
        witnessName: createForm.witnessName.trim() || null,
        notes: createForm.notes.trim() || null,
      });
      setSession(created);
      const init = {};
      (created.lines || []).forEach((l) => {
        init[l.ingredientId] = l.bookQuantity ?? "";
      });
      setCounts(init);
      toast.success(`Đã mở phiên kiểm kê ${created.slipCode || ""}.`);
    } catch (err) {
      setFormMessage(err.message || "Không mở được phiên kiểm kê.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCounts() {
    if (!session) return;
    setBusy(true);
    setFormMessage(null);
    try {
      const payload = (session.lines || []).map((l) => ({
        ingredientId: l.ingredientId,
        countedQuantity: Number(counts[l.ingredientId] ?? 0),
      }));
      const rec = await inventoryApi.submitStocktakeCounts(session.stocktakeId, payload);
      setResult(rec);
      setSession(null);
      toast.success("Đã chốt kiểm kê và điều chỉnh tồn kho.");
    } catch (err) {
      setFormMessage(err.message || "Không chốt được kiểm kê.");
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (ingredientId) => {
    const line = (session?.lines || []).find((l) => l.ingredientId === ingredientId);
    return line ? `${line.ingredientCode} — ${line.ingredientName}` : `Nguyên liệu #${ingredientId}`;
  };

  return (
    <TaskLayout
      title="Kiểm kê kho"
      screenCode="SCR-14 · Kiểm kê"
      backTo="/branch/inventory"
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : result ? (
        <div className="scms-panel panel-pad" style={{ maxWidth: 860 }}>
          <div className="panel-head">
            <div>
              <h2>Kết quả đối soát {result.slipCode}</h2>
              <p>
                {result.closedAt ? `Chốt lúc ${formatDateTime(result.closedAt)} · ` : ""}
                {result.totalItems} mặt hàng · khớp {result.matchedCount} · chênh lệch {result.discrepancyCount}
              </p>
            </div>
            <StatusTag status={result.status} label={result.status} variant="dark" />
          </div>
          <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="text-muted">Giá trị chênh lệch ròng</span>
            <strong>{formatVnd(result.netVarianceValue)}</strong>
          </div>
          {(result.adjustments || []).length ? (
            <div className="table-wrap mt-3">
              <table className="data" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Nguyên liệu</th>
                    <th className="num">Sổ sách</th>
                    <th className="num">Thực đếm</th>
                    <th className="num">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {result.adjustments.map((a, i) => (
                    <tr key={a.ingredientId || i}>
                      <td>{nameOf(a.ingredientId)}</td>
                      <td className="num">{fmtQty(a.bookQuantity)}</td>
                      <td className="num">{fmtQty(a.countedQuantity)}</td>
                      <td className="num">
                        <strong>{fmtQty(a.variance)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted mt-3">Không có mặt hàng nào chênh lệch.</p>
          )}
          <div className="form-actions">
            <Button href="#/branch/inventory">Về tồn kho</Button>
          </div>
        </div>
      ) : !session ? (
        <Form onSubmit={createSession}>
          <div className="scms-panel panel-pad" style={{ maxWidth: 720 }}>
            <div className="panel-head">
              <div>
                <h2>Mở phiên kiểm kê</h2>
                <p>Chưa có phiên kiểm kê nào đang mở cho chi nhánh này.</p>
              </div>
            </div>
            {formMessage ? (
              <div className="notice notice--warn">
                <span>{formMessage}</span>
              </div>
            ) : null}
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
              <FormField label="Người làm chứng">
                <Form.Control
                  value={createForm.witnessName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, witnessName: e.target.value }))}
                />
              </FormField>
              <FormField label="Ghi chú" className="span-all">
                <Form.Control
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="form-actions">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? <Spinner size="sm" className="me-2" /> : null}
                Mở phiên kiểm kê
              </Button>
            </div>
          </div>
        </Form>
      ) : (
        <div className="scms-panel panel-pad">
          <div className="panel-head">
            <div>
              <h2>Phiên {session.slipCode}</h2>
              <p>
                {session.branchName || ""} · mở bởi {session.startedBy || "—"}
                {session.startedAt ? ` · ${formatDateTime(session.startedAt)}` : ""}
                {session.witnessName ? ` · làm chứng: ${session.witnessName}` : ""}
              </p>
            </div>
            <StatusTag status={session.status} label={session.status} variant="warn" />
          </div>
          {formMessage ? (
            <div className="notice notice--warn">
              <span>{formMessage}</span>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="data" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th className="num">Sổ sách</th>
                  <th className="num">Số đếm thực tế</th>
                  <th className="num">Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {(session.lines || []).map((l) => {
                  const counted = counts[l.ingredientId];
                  const variance =
                    counted === "" || counted === undefined ? null : Number(counted) - Number(l.bookQuantity || 0);
                  return (
                    <tr key={l.ingredientId}>
                      <td>
                        <span className="mono">{l.ingredientCode}</span> — {l.ingredientName}
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {fmtQty(l.bookPackUnits)} {l.packUnit || ""} · quy đổi {fmtQty(l.bookQuantity)} {l.baseUnit || ""}
                        </div>
                      </td>
                      <td className="num">
                        {fmtQty(l.bookQuantity)} {l.baseUnit || ""}
                      </td>
                      <td className="num" style={{ width: 170 }}>
                        <Form.Control
                          type="number"
                          min={0}
                          step="0.01"
                          value={counted ?? ""}
                          onChange={(e) =>
                            setCounts((c) => ({ ...c, [l.ingredientId]: e.target.value }))
                          }
                        />
                      </td>
                      <td className="num">
                        {variance === null ? "—" : <strong>{fmtQty(variance)}</strong>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <Button variant="primary" onClick={submitCounts} disabled={busy}>
              {busy ? <Spinner size="sm" className="me-2" /> : null}
              Chốt kiểm kê & điều chỉnh tồn
            </Button>
          </div>
        </div>
      )}
    </TaskLayout>
  );
}
