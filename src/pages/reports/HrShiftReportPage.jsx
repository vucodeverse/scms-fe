import { useState } from "react";
import KpiStrip from "../../components/KpiStrip.jsx";
import DataTable from "../../components/DataTable.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { roleLabel } from "../../auth/landing.js";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatDate, formatNumber, formatVnd } from "../../lib/format.js";
import {
  BranchSelect,
  ExportButton,
  FilterBar,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import { formatQty, useBranchOptions, useReport, initialPeriod } from "../../components/reports/reportKit.js";

function count(n) {
  return n ? <strong>{formatNumber(n)}</strong> : <span className="text-muted-scms">0</span>;
}

// SCR-15 — Báo cáo tổng hợp ca làm việc và giờ công nhân sự (UC39).
// Không chứa lương (BR-47). Năng suất chỉ áp dụng cho thu ngân.
export default function HrShiftReportPage() {
  const { user } = useAuth();
  const { branches, isBranchUser } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const [period, setPeriod] = useState(initialPeriod("week"));

  const needBranch = !isBranchUser && !branchId;
  const invalidRange = period.from > period.to;
  const params = { branchId: isBranchUser ? undefined : branchId, from: period.from, to: period.to };
  const { data, loading, error, reload } = useReport(reportsApi.hrShifts, params, { enabled: !needBranch && !invalidRange });
  const s = data?.summary;

  return (
    <ReportLayout
      title="Báo cáo nhân sự & ca làm việc"
      screenCode="SCR-15 · UC39"
      description="Ca được phân công / đã làm, vắng, đi muộn, về sớm, quên check-out và tổng giờ công theo nhân viên."
      actions={<ExportButton type={REPORT_TYPES.HR_SHIFTS} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        {!isBranchUser ? <BranchSelect branches={branches} value={branchId} onChange={setBranchId} /> : null}
        <PeriodPicker value={period} onChange={setPeriod} />
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState loading={loading} error={error} data={data} needBranch={needBranch} onRetry={reload} emptyMessage="Không có ca làm việc hoặc chấm công nào trong kỳ đã chọn.">
        {data && !data.empty ? (
          <>
            <KpiStrip
              items={[
                { label: "Nhân viên", value: formatNumber(s.employeeCount) },
                { label: "Tổng giờ công", value: `${formatQty(s.hoursWorked, 1)} giờ`, sub: `${formatNumber(s.attendanceCount)} lượt chấm công` },
                { label: "Ca đã làm", value: `${formatNumber(s.shiftsWorked)} / ${formatNumber(s.shiftsScheduled)}`, sub: "đã làm / phân công" },
                { label: "Vắng", value: formatNumber(s.absentCount) },
                { label: "Muộn / về sớm", value: `${formatNumber(s.lateCount)} / ${formatNumber(s.earlyLeaveCount)}` },
                { label: "Quên check-out", value: formatNumber(s.missingCheckoutCount) },
              ]}
            />

            <SectionTitle>
              {data.branchName} · {formatDate(data.from)} – {formatDate(data.to)}
            </SectionTitle>
            <DataTable
              rowKey={(r) => r.userId}
              rows={data.employees || []}
              columns={[
                {
                  key: "fullName",
                  header: "Nhân viên",
                  render: (r) => (
                    <>
                      <strong>{r.fullName}</strong>
                      <div className="small text-muted-scms">{roleLabel(r.roleCode)}</div>
                    </>
                  ),
                },
                { key: "shifts", header: "Ca làm / phân công", numeric: true, render: (r) => `${formatNumber(r.shiftsWorked)} / ${formatNumber(r.shiftsScheduled)}` },
                { key: "attendanceCount", header: "Lượt chấm công", numeric: true, render: (r) => formatNumber(r.attendanceCount) },
                { key: "hoursWorked", header: "Giờ công", numeric: true, render: (r) => <strong>{formatQty(r.hoursWorked, 1)}</strong> },
                { key: "absentCount", header: "Vắng", numeric: true, render: (r) => count(r.absentCount) },
                { key: "lateCount", header: "Đi muộn", numeric: true, render: (r) => count(r.lateCount) },
                { key: "earlyLeaveCount", header: "Về sớm", numeric: true, render: (r) => count(r.earlyLeaveCount) },
                { key: "missingCheckoutCount", header: "Quên check-out", numeric: true, render: (r) => count(r.missingCheckoutCount) },
                { key: "ordersProcessed", header: "Đơn xử lý", numeric: true, render: (r) => (r.ordersProcessed == null ? "—" : formatNumber(r.ordersProcessed)) },
                { key: "revenue", header: "Doanh thu", numeric: true, render: (r) => (r.revenue == null ? "—" : formatVnd(r.revenue)) },
                { key: "revenuePerHour", header: "Doanh thu / giờ", numeric: true, render: (r) => (r.revenuePerHour == null ? "—" : formatVnd(r.revenuePerHour)) },
              ]}
            />
          </>
        ) : null}
      </ReportState>
    </ReportLayout>
  );
}
