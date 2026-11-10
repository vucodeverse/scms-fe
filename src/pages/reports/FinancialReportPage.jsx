import { useState } from "react";
import { Dropdown, Form } from "react-bootstrap";
import KpiStrip from "../../components/KpiStrip.jsx";
import DataTable from "../../components/DataTable.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatDate, formatNumber, formatVnd } from "../../lib/format.js";
import {
  BarChart,
  ExportButton,
  FilterBar,
  FilterField,
  Notice,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import { COST_GAP_LABELS, formatPercent, formatQty, useBranchOptions, useReport, initialPeriod } from "../../components/reports/reportKit.js";

// Chọn nhiều chi nhánh; rỗng = toàn bộ chuỗi.
function BranchMultiSelect({ branches, value, onChange }) {
  const label = value.length === 0 ? "Tất cả chi nhánh" : `${value.length} chi nhánh`;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <FilterField label="Chi nhánh" minWidth={200}>
      <Dropdown autoClose="outside">
        <Dropdown.Toggle variant="outline-secondary" className="w-100 text-start">
          {label}
        </Dropdown.Toggle>
        <Dropdown.Menu style={{ maxHeight: 320, overflowY: "auto", minWidth: 260 }}>
          <Dropdown.Item onClick={() => onChange([])} active={value.length === 0}>
            Tất cả chi nhánh
          </Dropdown.Item>
          <Dropdown.Divider />
          {branches.map((b) => (
            <div key={b.id} className="px-3 py-1">
              <Form.Check
                id={`fin-branch-${b.id}`}
                type="checkbox"
                label={`${b.code} — ${b.name}`}
                checked={value.includes(b.id)}
                onChange={() => toggle(b.id)}
              />
            </div>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </FilterField>
  );
}

// SCR-16 — Báo cáo tài chính hợp nhất toàn chuỗi (UC40, chỉ COO — TAB-08 Chain P&L).
export default function FinancialReportPage() {
  const { user } = useAuth();
  const { branches } = useBranchOptions(user);
  const [branchIds, setBranchIds] = useState([]);
  const [period, setPeriod] = useState(initialPeriod("month"));

  const invalidRange = period.from > period.to;
  const params = { from: period.from, to: period.to, branchIds };
  const { data, loading, error, reload } = useReport(reportsApi.consolidatedFinancial, params, { enabled: !invalidRange });
  const t = data?.chainTotal;

  return (
    <ReportLayout
      title="Báo cáo tài chính hợp nhất"
      description="Doanh thu, giá vốn (công thức × số ly × đơn giá nguyên liệu) và lãi gộp theo chi nhánh và toàn chuỗi."
      actions={<ExportButton type={REPORT_TYPES.FINANCIAL} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        <BranchMultiSelect branches={branches} value={branchIds} onChange={setBranchIds} />
        <PeriodPicker value={period} onChange={setPeriod} />
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState loading={loading} error={error} data={data} onRetry={reload} emptyMessage="Không có đơn hàng đã thanh toán trong kỳ đã chọn.">
        {data ? (
          <>
            {data.costIncomplete ? (
              <Notice icon="bell">
                Giá vốn chưa đầy đủ: {data.missingCostProducts.length} sản phẩm thiếu công thức hoặc đơn giá nguyên liệu — lãi gộp có thể cao hơn thực tế.
              </Notice>
            ) : null}
            <KpiStrip
              items={[
                { label: "Doanh thu toàn chuỗi", value: formatVnd(t.revenue), sub: `${formatNumber(t.orderCount)} đơn` },
                { label: "Giá vốn (COGS)", value: formatVnd(t.cogs) },
                { label: "Lãi gộp", value: formatVnd(t.grossProfit) },
                { label: "Biên lãi gộp", value: formatPercent(t.grossMarginPercent) },
              ]}
            />

            <SectionTitle>
              Theo chi nhánh · {formatDate(data.from)} – {formatDate(data.to)}
            </SectionTitle>
            <BarChart
              height={150}
              valueFormatter={(v) => `${formatQty(v / 1_000_000, 1)}tr`}
              items={data.branches.map((b) => ({
                key: b.branchId,
                label: b.branchCode,
                value: b.figures.revenue,
                title: `${b.branchName}: ${formatVnd(b.figures.revenue)} · lãi gộp ${formatVnd(b.figures.grossProfit)}`,
              }))}
            />
            <div className="mt-3" />
            <DataTable
              rowKey={(r) => r.branchId}
              rows={data.branches}
              columns={[
                {
                  key: "branchName",
                  header: "Chi nhánh",
                  render: (r) => (
                    <>
                      <strong>{r.branchName}</strong> <span className="mono small text-muted-scms">{r.branchCode}</span>
                      {r.costIncomplete ? (
                        <div className="mt-1">
                          <StatusTag status="WARN" variant="warn" label="Giá vốn chưa đủ" />
                        </div>
                      ) : null}
                    </>
                  ),
                },
                { key: "orderCount", header: "Số đơn", numeric: true, render: (r) => formatNumber(r.figures.orderCount) },
                { key: "revenue", header: "Doanh thu", numeric: true, render: (r) => formatVnd(r.figures.revenue) },
                { key: "cogs", header: "Giá vốn", numeric: true, render: (r) => formatVnd(r.figures.cogs) },
                { key: "grossProfit", header: "Lãi gộp", numeric: true, render: (r) => <strong>{formatVnd(r.figures.grossProfit)}</strong> },
                { key: "margin", header: "Biên LN gộp", numeric: true, render: (r) => formatPercent(r.figures.grossMarginPercent) },
              ]}
            />

            {data.missingCostProducts?.length ? (
              <>
                <SectionTitle>Sản phẩm thiếu dữ liệu giá vốn</SectionTitle>
                <DataTable
                  rowKey={(r) => `${r.productId}-${r.size}-${r.reason}`}
                  rows={data.missingCostProducts}
                  columns={[
                    { key: "productName", header: "Sản phẩm", render: (r) => <strong>{r.productName}</strong> },
                    { key: "size", header: "Size", render: (r) => r.size || "—" },
                    { key: "reason", header: "Lý do", render: (r) => COST_GAP_LABELS[r.reason] || r.reason },
                  ]}
                />
              </>
            ) : null}
          </>
        ) : null}
      </ReportState>
    </ReportLayout>
  );
}
