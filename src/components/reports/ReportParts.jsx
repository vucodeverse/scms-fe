import { useState } from "react";
import { Alert, Button, Dropdown, Form, Spinner } from "react-bootstrap";
import AdminLayout from "../../layouts/AdminLayout.jsx";
import PageHeader from "../PageHeader.jsx";
import SessionHeaderRight from "../SessionHeader.jsx";
import Icon from "../Icon.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { isUnassignedBranchManager, roleLabel } from "../../auth/landing.js";
import { buildMenu } from "../../config/menu.js";
import { useToast } from "../ToastContext.jsx";
import { reportsApi } from "../../api/reportsApi.js";
import { PERIOD_PRESETS, presetRange } from "./reportKit.js";

// Khung trang báo cáo: Admin shell + tiêu đề màn hình.
export function ReportLayout({ title, screenCode, description, actions, children }) {
  const { user } = useAuth();
  return (
    <AdminLayout
      menu={buildMenu(user)}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader title={title} screenCode={screenCode} description={description} actions={actions} />
      {children}
    </AdminLayout>
  );
}

// Nhãn nhỏ phía trên ô lọc.
function FilterLabel({ children }) {
  return (
    <div className="text-muted-scms" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>
      {children}
    </div>
  );
}

export function FilterField({ label, children, minWidth }) {
  return (
    <div style={{ minWidth }}>
      <FilterLabel>{label}</FilterLabel>
      {children}
    </div>
  );
}

// Chọn chi nhánh (chỉ COO thấy). allowAll = báo cáo cho phép toàn chuỗi (UC41/42).
export function BranchSelect({ branches, value, onChange, allowAll = false }) {
  return (
    <FilterField label="Chi nhánh" minWidth={220}>
      <Form.Select value={value || ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{allowAll ? "Toàn chuỗi" : "— Chọn chi nhánh —"}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code} — {b.name}
          </option>
        ))}
      </Form.Select>
    </FilterField>
  );
}

// Kỳ báo cáo: preset ngày/tuần/tháng/năm + khoảng tùy chọn.
// value: { preset, from, to } ; onChange(next)
export function PeriodPicker({ value, onChange }) {
  const invalid = value.from && value.to && value.from > value.to;
  return (
    <>
      <FilterField label="Kỳ báo cáo" minWidth={150}>
        <Form.Select
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value;
            onChange(preset === "custom" ? { ...value, preset } : { preset, ...presetRange(preset) });
          }}
        >
          {PERIOD_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Form.Select>
      </FilterField>
      <FilterField label="Từ ngày">
        <Form.Control
          type="date"
          value={value.from}
          isInvalid={invalid}
          onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })}
        />
      </FilterField>
      <FilterField label="Đến ngày">
        <Form.Control
          type="date"
          value={value.to}
          isInvalid={invalid}
          onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })}
        />
      </FilterField>
    </>
  );
}

// Thanh lọc chung: children là các ô lọc, onRefresh tải lại.
export function FilterBar({ children, onRefresh, loading }) {
  return (
    <div className="scms-panel p-3 mb-3 d-flex flex-wrap gap-3 align-items-end">
      {children}
      <div className="ms-auto">
        <Button variant="outline-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? <Spinner size="sm" className="me-1" /> : null}
          Làm mới
        </Button>
      </div>
    </div>
  );
}

// UC36 — nút xuất báo cáo Excel / PDF, dùng đúng bộ lọc đang xem (BR-02).
export function ExportButton({ type, params, disabled }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(format) {
    setBusy(true);
    try {
      const name = await reportsApi.export(type, params, format);
      toast.success(`Đã xuất báo cáo: ${name}`);
    } catch (err) {
      if (err.code === "REPORT_NO_DATA_TO_EXPORT") toast.error("Không có dữ liệu để xuất trong kỳ đã chọn.");
      else toast.error(err.message || "Xuất báo cáo thất bại, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dropdown>
      <Dropdown.Toggle variant="primary" disabled={disabled || busy}>
        {busy ? <Spinner size="sm" className="me-1" /> : null}
        Xuất báo cáo
      </Dropdown.Toggle>
      <Dropdown.Menu align="end">
        <Dropdown.Item onClick={() => run("XLSX")}>Excel (.xlsx)</Dropdown.Item>
        <Dropdown.Item onClick={() => run("PDF")}>PDF (.pdf)</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}

// Trạng thái chung: lỗi / đang tải / chưa chọn chi nhánh / rỗng.
export function ReportState({ loading, error, data, needBranch, emptyMessage, onRetry, children }) {
  const { user } = useAuth();
  if (isUnassignedBranchManager(user)) {
    return (
      <Notice icon="branch">
        Tài khoản Quản lý của bạn chưa được gắn vào chi nhánh nào. Vui lòng liên hệ COO để được phân công.
      </Notice>
    );
  }
  if (needBranch) return <Notice icon="branch">Chọn chi nhánh để xem báo cáo.</Notice>;
  if (error) {
    return (
      <Alert variant="light" className="scms-panel d-flex justify-content-between align-items-center">
        <span>{error.message || "Không tải được báo cáo."}</span>
        <Button size="sm" variant="outline-secondary" onClick={onRetry}>
          Thử lại
        </Button>
      </Alert>
    );
  }
  if (!data) {
    return loading ? (
      <div className="text-center py-5">
        <Spinner className="me-2" /> Đang tải báo cáo…
      </div>
    ) : null;
  }
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
      {data.empty ? <Notice icon="search">{emptyMessage || "Không có dữ liệu trong kỳ đã chọn."}</Notice> : null}
      {children}
    </div>
  );
}

export function Notice({ icon = "bell", children }) {
  return (
    <div className="scms-panel mb-3">
      <div className="empty-state">
        <span className="empty-state__icon">
          <Icon name={icon} size={18} />
        </span>
        <span>{children}</span>
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="d-flex justify-content-between align-items-end mt-4 mb-2">
      <div className="text-muted-scms" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {children}
      </div>
      {right}
    </div>
  );
}

// Biểu đồ cột ngang/dọc gọn nhẹ (không thêm thư viện).
// items: [{ key, label, value, display, highlight, title }]
export function BarChart({ items, height = 180, valueFormatter = (v) => v, emptyLabel = "Chưa có dữ liệu" }) {
  const max = Math.max(0, ...items.map((i) => Number(i.value) || 0));
  if (!items.length) return <div className="text-muted-scms p-3">{emptyLabel}</div>;
  return (
    <div className="scms-panel p-3">
      <div className="d-flex align-items-end gap-1" style={{ height }} role="img" aria-label="Biểu đồ cột">
        {items.map((i) => {
          const v = Number(i.value) || 0;
          const pct = max > 0 ? (v / max) * 100 : 0;
          return (
            <div
              key={i.key}
              className="d-flex flex-column justify-content-end align-items-center"
              style={{ flex: 1, minWidth: 0, height: "100%" }}
              title={i.title || `${i.label}: ${valueFormatter(v)}`}
            >
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {v > 0 ? i.display ?? valueFormatter(v) : ""}
              </div>
              <div
                style={{
                  width: "100%",
                  maxWidth: 46,
                  height: `${Math.max(pct, v > 0 ? 2 : 0)}%`,
                  background: i.highlight ? "var(--accent)" : "var(--line-strong)",
                  borderRadius: "3px 3px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="d-flex gap-1 mt-1" style={{ borderTop: "1px solid var(--line)", paddingTop: 4 }}>
        {items.map((i) => (
          <div
            key={i.key}
            style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "var(--muted)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {i.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Thanh tỷ lệ ngang (vd. Cash vs VietQR).
export function SplitBar({ parts }) {
  const total = parts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  if (total <= 0) return <span className="text-muted-scms">—</span>;
  return (
    <div className="d-flex" style={{ height: 8, borderRadius: 4, overflow: "hidden", background: "var(--paper-2)", minWidth: 120 }}>
      {parts.map((p) => (
        <div key={p.key} title={p.label} style={{ width: `${((Number(p.value) || 0) / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}
