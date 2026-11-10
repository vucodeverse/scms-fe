import { useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import KpiStrip from "../../components/KpiStrip.jsx";
import DataTable from "../../components/DataTable.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatDate, formatNumber } from "../../lib/format.js";
import {
  BranchSelect,
  ExportButton,
  FilterBar,
  FilterField,
  Notice,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import { COUNT_STATUS_LABELS, formatQty, useBranchOptions, useReport, initialPeriod } from "../../components/reports/reportKit.js";

const COUNT_VARIANT = { MATCHED: "dark", VARIANCE: "warn", UNCOUNTED: "neutral" };

function qty(v, unit) {
  return v === null || v === undefined ? "—" : `${formatQty(v)} ${unit || ""}`;
}

// SCR-15 — Báo cáo xuất - nhập - tồn - hao hụt nguyên vật liệu kho (UC38).
export default function InventoryReportPage() {
  const { user } = useAuth();
  const { branches, isBranchUser, unassignedManager } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const [period, setPeriod] = useState(initialPeriod("month"));
  const [view, setView] = useState("ALL");

  const needBranch = !isBranchUser && !branchId;
  const invalidRange = period.from > period.to;
  const params = { branchId: isBranchUser ? undefined : branchId, from: period.from, to: period.to };
  const { data, loading, error, reload } = useReport(reportsApi.inventory, params, {
    enabled: !unassignedManager && !needBranch && !invalidRange,
  });

  const rows = useMemo(() => {
    const items = data?.items || [];
    if (view === "LOW") return items.filter((i) => i.lowStock);
    if (view === "VARIANCE") return items.filter((i) => i.countStatus === "VARIANCE");
    if (view === "UNCOUNTED") return items.filter((i) => i.countStatus === "UNCOUNTED");
    if (view === "DISPOSED") return items.filter((i) => Number(i.disposedQty) > 0);
    return items;
  }, [data, view]);

  const s = data?.summary;
  return (
    <ReportLayout
      title="Báo cáo xuất - nhập - tồn kho"
      description="Tồn đầu kỳ, nhập, xuất quầy bar, hủy (hao hụt), điều chỉnh, tồn cuối kỳ và chênh lệch kiểm kê gần nhất."
      actions={<ExportButton type={REPORT_TYPES.INVENTORY} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        {!isBranchUser ? <BranchSelect branches={branches} value={branchId} onChange={setBranchId} /> : null}
        <PeriodPicker value={period} onChange={setPeriod} />
        <FilterField label="Hiển thị" minWidth={170}>
          <Form.Select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="ALL">Tất cả nguyên liệu</option>
            <option value="LOW">Tồn thấp</option>
            <option value="DISPOSED">Có hao hụt / hủy</option>
            <option value="VARIANCE">Lệch kiểm kê</option>
            <option value="UNCOUNTED">Chưa kiểm kê</option>
          </Form.Select>
        </FilterField>
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState loading={loading} error={error} data={data} needBranch={needBranch} onRetry={reload} emptyMessage="Chi nhánh chưa có nguyên liệu nào.">
        {data && !data.empty ? (
          <>
            {data.noTransactions ? (
              <Notice icon="inventory">Không có giao dịch kho trong kỳ — đang hiển thị tồn kho hiện tại.</Notice>
            ) : null}
            <KpiStrip
              items={[
                { label: "Nguyên liệu", value: formatNumber(s.ingredientCount) },
                { label: "Tồn thấp", value: formatNumber(s.lowStockCount), sub: "≤ ngưỡng an toàn" },
                { label: "Lệch kiểm kê", value: formatNumber(s.varianceCount) },
                { label: "Chưa kiểm kê", value: formatNumber(s.uncountedCount) },
                { label: "Tổng lượng hủy", value: formatQty(s.disposedQtyTotal), sub: "đơn vị cơ bản" },
              ]}
            />

            <SectionTitle>
              {data.branchName} · {formatDate(data.from)} – {formatDate(data.to)}
            </SectionTitle>
            <DataTable
              rowKey={(r) => r.ingredientId}
              rows={rows}
              emptyMessage="Không có nguyên liệu nào khớp bộ lọc."
              columns={[
                {
                  key: "name",
                  header: "Nguyên liệu",
                  render: (r) => (
                    <>
                      <strong>{r.name}</strong>
                      <div className="small text-muted-scms">
                        {r.packUnit ? `1 ${r.packUnit} = ${formatQty(r.unitsPerPack)} ${r.baseUnit}` : r.baseUnit}
                      </div>
                    </>
                  ),
                },
                { key: "openingQty", header: "Tồn đầu", numeric: true, render: (r) => qty(r.openingQty, r.baseUnit) },
                { key: "receivedQty", header: "Nhập", numeric: true, render: (r) => qty(r.receivedQty, r.baseUnit) },
                { key: "issuedQty", header: "Xuất bar", numeric: true, render: (r) => qty(r.issuedQty, r.baseUnit) },
                { key: "disposedQty", header: "Hủy", numeric: true, render: (r) => qty(r.disposedQty, r.baseUnit) },
                { key: "adjustedQty", header: "Điều chỉnh", numeric: true, render: (r) => qty(r.adjustedQty, r.baseUnit) },
                {
                  key: "closingQty",
                  header: "Tồn cuối",
                  numeric: true,
                  render: (r) => (
                    <>
                      <strong>{qty(r.closingQty, r.baseUnit)}</strong>
                      {r.packUnit && r.closingPacks != null ? (
                        <div className="small text-muted-scms">≈ {formatQty(r.closingPacks)} {r.packUnit}</div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "currentQty",
                  header: "Tồn hiện tại",
                  numeric: true,
                  render: (r) => (
                    <>
                      {qty(r.currentQty, r.baseUnit)}
                      <div className="small text-muted-scms">ngưỡng {formatQty(r.safetyStockLevel)}</div>
                    </>
                  ),
                },
                {
                  key: "count",
                  header: "Kiểm kê gần nhất",
                  render: (r) => (
                    <>
                      <StatusTag status={r.countStatus} variant={COUNT_VARIANT[r.countStatus]} label={COUNT_STATUS_LABELS[r.countStatus] || r.countStatus} />
                      {r.countStatus !== "UNCOUNTED" ? (
                        <div className="small text-muted-scms mt-1">
                          {formatDate(r.lastCountedAt)} · sổ {formatQty(r.lastBookQty)} / đếm {formatQty(r.lastCountedQty)}
                          {r.countVariance != null && Number(r.countVariance) !== 0 ? ` (${Number(r.countVariance) > 0 ? "+" : ""}${formatQty(r.countVariance)})` : ""}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "lowStock",
                  header: "Tồn kho",
                  render: (r) => (r.lowStock ? <StatusTag status="LOW" variant="warn" label="Sắp hết" /> : <StatusTag status="OK" variant="dark" label="Đủ" />),
                },
              ]}
            />
          </>
        ) : null}
      </ReportState>
    </ReportLayout>
  );
}
