import { useState } from "react";
import { ButtonGroup, Button, Form } from "react-bootstrap";
import KpiStrip from "../../components/KpiStrip.jsx";
import DataTable from "../../components/DataTable.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatNumber, formatVnd } from "../../lib/format.js";
import {
  BranchSelect,
  ExportButton,
  FilterBar,
  FilterField,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import { formatPercent, useBranchOptions, useReport, initialPeriod } from "../../components/reports/reportKit.js";

const LIMITS = [5, 10, 20, 50, 100];

// SCR-16 — Phân tích sản phẩm bán chạy / bán chậm (UC41, chỉ COO).
// Xếp hạng theo số lượng bán (BR-49), mặc định top 10; bán chậm gồm cả món chưa bán được ly nào.
export default function ProductSalesReportPage() {
  const { user } = useAuth();
  const { branches } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(null);
  const [period, setPeriod] = useState(initialPeriod("month"));
  const [ranking, setRanking] = useState("BEST_SELLING");
  const [limit, setLimit] = useState(10);

  const invalidRange = period.from > period.to;
  const params = { branchId, from: period.from, to: period.to, ranking, limit };
  const { data, loading, error, reload } = useReport(reportsApi.productSales, params, { enabled: !invalidRange });
  const slow = ranking === "SLOW_SELLING";
  const maxQty = Math.max(1, ...(data?.items || []).map((i) => Number(i.quantity) || 0));

  return (
    <ReportLayout
      title="Báo cáo sản phẩm"
      description="Xếp hạng sản phẩm theo số lượng bán. Bán chậm bao gồm cả món chưa bán được ly nào trong kỳ."
      actions={<ExportButton type={REPORT_TYPES.PRODUCT_SALES} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        <BranchSelect branches={branches} value={branchId} onChange={setBranchId} allowAll />
        <PeriodPicker value={period} onChange={setPeriod} />
        <FilterField label="Xếp hạng">
          <ButtonGroup>
            <Button variant={!slow ? "primary" : "outline-secondary"} onClick={() => setRanking("BEST_SELLING")}>
              Bán chạy
            </Button>
            <Button variant={slow ? "primary" : "outline-secondary"} onClick={() => setRanking("SLOW_SELLING")}>
              Bán chậm
            </Button>
          </ButtonGroup>
        </FilterField>
        <FilterField label="Số sản phẩm" minWidth={100}>
          <Form.Select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </Form.Select>
        </FilterField>
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState loading={loading} error={error} data={data} onRetry={reload} emptyMessage="Không có sản phẩm nào được bán trong kỳ đã chọn.">
        {data && !data.empty ? (
          <>
            <KpiStrip
              items={[
                { label: "Phạm vi", value: data.branchName || "Toàn chuỗi" },
                { label: "Tổng số lượng bán", value: formatNumber(data.totalQuantity), sub: "ly / sản phẩm" },
                { label: "Tổng doanh thu", value: formatVnd(data.totalRevenue) },
              ]}
            />
            <SectionTitle>{slow ? `Top ${data.limit} bán chậm nhất` : `Top ${data.limit} bán chạy nhất`}</SectionTitle>
            <DataTable
              rowKey={(r) => r.productId}
              rows={data.items}
              columns={[
                { key: "rank", header: "#", width: 50, render: (r) => <strong>{r.rank}</strong> },
                { key: "productName", header: "Sản phẩm", render: (r) => <strong>{r.productName}</strong> },
                {
                  key: "bar",
                  header: "",
                  width: "30%",
                  render: (r) => (
                    <div style={{ background: "var(--paper-2)", height: 8, borderRadius: 4 }}>
                      <div
                        style={{
                          width: `${((Number(r.quantity) || 0) / maxQty) * 100}%`,
                          height: "100%",
                          borderRadius: 4,
                          background: slow ? "var(--line-strong)" : "var(--accent)",
                        }}
                      />
                    </div>
                  ),
                },
                { key: "quantity", header: "Số lượng", numeric: true, render: (r) => formatNumber(r.quantity) },
                { key: "share", header: "Tỷ trọng SL", numeric: true, render: (r) => formatPercent(r.quantitySharePercent) },
                { key: "revenue", header: "Doanh thu", numeric: true, render: (r) => formatVnd(r.revenue) },
              ]}
            />
          </>
        ) : null}
      </ReportState>
    </ReportLayout>
  );
}
