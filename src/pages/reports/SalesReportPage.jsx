import { useState } from "react";
import { Form } from "react-bootstrap";
import KpiStrip from "../../components/KpiStrip.jsx";
import DataTable from "../../components/DataTable.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatDate, formatNumber, formatVnd } from "../../lib/format.js";
import {
  BarChart,
  BranchSelect,
  ExportButton,
  FilterBar,
  FilterField,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
  SplitBar,
} from "../../components/reports/ReportParts.jsx";
import {
  PAYMENT_METHOD_LABELS,
  SHIFT_TYPE_LABELS,
  formatPercent,
  formatQty,
  useBranchOptions,
  useReport,
  initialPeriod,
} from "../../components/reports/reportKit.js";

// SCR-15 — Báo cáo doanh số chi nhánh theo ngày/tuần/tháng/năm (UC35) + xuất file (UC36).
export default function SalesReportPage() {
  const { user } = useAuth();
  const { branches, isBranchUser } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const [period, setPeriod] = useState(initialPeriod("week"));
  const [paymentMethod, setPaymentMethod] = useState("");

  const needBranch = !isBranchUser && !branchId;
  const invalidRange = period.from > period.to;
  const params = {
    branchId: isBranchUser ? undefined : branchId,
    from: period.from,
    to: period.to,
    paymentMethod: paymentMethod || undefined,
  };
  const { data, loading, error, reload } = useReport(reportsApi.sales, params, { enabled: !needBranch && !invalidRange });

  const s = data?.summary;
  return (
    <ReportLayout
      title="Báo cáo doanh số"
      screenCode="SCR-15 · UC35"
      description="Chỉ tính đơn đã thanh toán. Doanh thu thuần = doanh thu − hoàn tiền."
      actions={<ExportButton type={REPORT_TYPES.SALES} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        {!isBranchUser ? <BranchSelect branches={branches} value={branchId} onChange={setBranchId} /> : null}
        <PeriodPicker value={period} onChange={setPeriod} />
        <FilterField label="Thanh toán" minWidth={150}>
          <Form.Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="CASH">Tiền mặt</option>
            <option value="VIETQR">VietQR</option>
          </Form.Select>
        </FilterField>
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState
        loading={loading}
        error={error}
        data={data}
        needBranch={needBranch}
        onRetry={reload}
        emptyMessage="Không có đơn hàng đã thanh toán trong kỳ đã chọn."
      >
        {data && !data.empty ? (
          <>
            <KpiStrip
              items={[
                { label: "Doanh thu thuần", value: formatVnd(s.netRevenue), sub: `Hoàn tiền: ${formatVnd(s.refundAmount)}` },
                { label: "Doanh thu", value: formatVnd(s.revenue), sub: `Trước giảm giá: ${formatVnd(s.grossAmount)}` },
                { label: "Giảm giá", value: formatVnd(s.discountAmount) },
                { label: "Số đơn", value: formatNumber(s.orderCount) },
                { label: "Giá trị TB / đơn", value: formatVnd(s.averageOrderValue) },
              ]}
            />

            <SectionTitle>
              Doanh thu theo ngày · {data.branchName}
              {data.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[data.paymentMethod]}` : ""}
            </SectionTitle>
            <BarChart
              valueFormatter={(v) => `${formatQty(v / 1000, 0)}k`}
              items={(data.daily || []).map((d) => ({
                key: d.date,
                label: formatDate(d.date).slice(0, 5),
                value: d.revenue,
                title: `${formatDate(d.date)}: ${formatVnd(d.revenue)} · ${formatNumber(d.orderCount)} đơn`,
              }))}
            />

            <SectionTitle>Payment mix theo ca</SectionTitle>
            <DataTable
              rowKey={(r) => r.shiftId ?? `none-${r.shiftDate}`}
              rows={data.shifts || []}
              emptyMessage="Không có dữ liệu theo ca."
              columns={[
                { key: "shiftDate", header: "Ngày", render: (r) => formatDate(r.shiftDate) },
                {
                  key: "shiftType",
                  header: "Ca",
                  render: (r) => (r.shiftId ? `${SHIFT_TYPE_LABELS[r.shiftType] || r.shiftType || "—"} #${r.shiftId}` : "Ngoài ca"),
                },
                { key: "orderCount", header: "Số đơn", numeric: true, render: (r) => formatNumber(r.orderCount) },
                { key: "revenue", header: "Doanh thu", numeric: true, render: (r) => formatVnd(r.revenue) },
                { key: "cashAmount", header: "Tiền mặt", numeric: true, render: (r) => `${formatVnd(r.cashAmount)} (${formatPercent(r.cashPercent)})` },
                { key: "vietQrAmount", header: "VietQR", numeric: true, render: (r) => `${formatVnd(r.vietQrAmount)} (${formatPercent(r.vietQrPercent)})` },
                {
                  key: "mix",
                  header: "Tỷ lệ",
                  render: (r) => (
                    <SplitBar
                      parts={[
                        { key: "cash", label: "Tiền mặt", value: r.cashAmount, color: "var(--accent)" },
                        { key: "qr", label: "VietQR", value: r.vietQrAmount, color: "var(--line-strong)" },
                      ]}
                    />
                  ),
                },
                { key: "refundAmount", header: "Hoàn tiền", numeric: true, render: (r) => formatVnd(r.refundAmount) },
              ]}
            />

            <SectionTitle>Top sản phẩm bán chạy</SectionTitle>
            <DataTable
              rowKey={(r) => r.productId}
              rows={data.topProducts || []}
              columns={[
                { key: "rank", header: "#", width: 50, render: (r) => r.rank },
                { key: "productName", header: "Sản phẩm", render: (r) => <strong>{r.productName}</strong> },
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
