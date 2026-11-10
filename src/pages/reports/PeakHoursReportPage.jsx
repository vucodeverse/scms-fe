import { useState } from "react";
import KpiStrip from "../../components/KpiStrip.jsx";
import DataTable from "../../components/DataTable.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatNumber, formatVnd } from "../../lib/format.js";
import {
  BarChart,
  BranchSelect,
  ExportButton,
  FilterBar,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import { formatQty, useBranchOptions, useReport, initialPeriod } from "../../components/reports/reportKit.js";

// SCR-15/16 — Biểu đồ khung giờ cao điểm trong ngày (UC42).
// Khung 1 giờ từ 06:00 đến 23:00 theo giờ tạo đơn; khung cao điểm khi ≥ 80% khung cao nhất (BR-04).
// COO bỏ trống chi nhánh = toàn chuỗi; BM chỉ xem chi nhánh mình.
export default function PeakHoursReportPage() {
  const { user } = useAuth();
  const { branches, isBranchUser, unassignedManager } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(null);
  const [period, setPeriod] = useState(initialPeriod("week"));

  const invalidRange = period.from > period.to;
  const params = { branchId: isBranchUser ? undefined : branchId, from: period.from, to: period.to };
  const { data, loading, error, reload } = useReport(reportsApi.peakHours, params, {
    enabled: !unassignedManager && !invalidRange,
  });
  const peaks = (data?.slots || []).filter((s) => s.peak);

  return (
    <ReportLayout
      title="Báo cáo giờ cao điểm"
      description="Số đơn theo từng khung giờ trong ngày (06:00–23:00). Cột đậm là khung giờ cao điểm."
      actions={<ExportButton type={REPORT_TYPES.PEAK_HOURS} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        {!isBranchUser ? <BranchSelect branches={branches} value={branchId} onChange={setBranchId} allowAll /> : null}
        <PeriodPicker value={period} onChange={setPeriod} />
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState loading={loading} error={error} data={data} onRetry={reload} emptyMessage="Không có đơn hàng đã thanh toán trong kỳ đã chọn.">
        {data && !data.empty ? (
          <>
            <KpiStrip
              items={[
                { label: "Phạm vi", value: data.branchName || "Toàn chuỗi" },
                { label: "Tổng số đơn", value: formatNumber(data.totalOrders), sub: `trong ${formatNumber(data.dayCount)} ngày` },
                { label: "Đơn / khung cao nhất", value: formatNumber(data.peakOrderCount) },
                { label: "Khung cao điểm", value: peaks.map((p) => `${String(p.hour).padStart(2, "0")}h`).join(", ") || "—" },
              ]}
            />

            <SectionTitle>Số đơn theo khung giờ</SectionTitle>
            <BarChart
              height={220}
              valueFormatter={(v) => formatNumber(v)}
              items={data.slots.map((s) => ({
                key: s.hour,
                label: `${String(s.hour).padStart(2, "0")}h`,
                value: s.orderCount,
                highlight: s.peak,
                title: `${s.label}: ${formatNumber(s.orderCount)} đơn · TB ${formatQty(s.averageOrdersPerDay, 1)} đơn/ngày · ${formatVnd(s.revenue)}`,
              }))}
            />

            <SectionTitle>Chi tiết</SectionTitle>
            <DataTable
              rowKey={(r) => r.hour}
              rows={data.slots}
              columns={[
                { key: "label", header: "Khung giờ", render: (r) => <span className="mono">{r.label}</span> },
                { key: "orderCount", header: "Số đơn", numeric: true, render: (r) => formatNumber(r.orderCount) },
                { key: "avg", header: "TB đơn / ngày", numeric: true, render: (r) => formatQty(r.averageOrdersPerDay, 1) },
                { key: "revenue", header: "Doanh thu", numeric: true, render: (r) => formatVnd(r.revenue) },
                { key: "peak", header: "", render: (r) => (r.peak ? <StatusTag status="PEAK" variant="warn" label="Cao điểm" /> : null) },
              ]}
            />
          </>
        ) : null}
      </ReportState>
    </ReportLayout>
  );
}
