import { Fragment, useState } from "react";
import { Button, Table } from "react-bootstrap";
import KpiStrip from "../../components/KpiStrip.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { REPORT_TYPES, reportsApi } from "../../api/reportsApi.js";
import { formatDate, formatDateTime, formatNumber, formatTime, formatVnd } from "../../lib/format.js";
import {
  BranchSelect,
  ExportButton,
  FilterBar,
  PeriodPicker,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import {
  CASH_TX_LABELS,
  SHIFT_STATUS_LABELS,
  SHIFT_TYPE_LABELS,
  useBranchOptions,
  useReport,
  initialPeriod,
} from "../../components/reports/reportKit.js";

// SCR-15 — Báo cáo dòng tiền thu/chi thực tế tại quầy theo ca (UC37).
// Tiền dự kiến = đầu ca + thu tiền mặt + nạp − rút − hoàn tiền (BR-39);
// chênh lệch = thực đếm − dự kiến (BR-38). Ca chưa đóng = chưa đối soát.
export default function CashFlowReportPage() {
  const { user } = useAuth();
  const { branches, isBranchUser, unassignedManager } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const [period, setPeriod] = useState(initialPeriod("today"));
  const [expanded, setExpanded] = useState({});

  const needBranch = !isBranchUser && !branchId;
  const invalidRange = period.from > period.to;
  const params = { branchId: isBranchUser ? undefined : branchId, from: period.from, to: period.to };
  const { data, loading, error, reload } = useReport(reportsApi.cashFlow, params, {
    enabled: !unassignedManager && !needBranch && !invalidRange,
  });
  const s = data?.summary;

  return (
    <ReportLayout
      title="Báo cáo dòng tiền két"
      screenCode="SCR-15 · UC37"
      description="Dòng tiền mặt thu/chi thực tế tại quầy theo từng ca và chênh lệch khi đối soát két."
      actions={<ExportButton type={REPORT_TYPES.CASH_FLOW} params={params} disabled={!data || data.empty || loading} />}
    >
      <FilterBar onRefresh={reload} loading={loading}>
        {!isBranchUser ? <BranchSelect branches={branches} value={branchId} onChange={setBranchId} /> : null}
        <PeriodPicker value={period} onChange={setPeriod} />
      </FilterBar>
      {invalidRange ? <div className="field-error mb-3">"Từ ngày" không được lớn hơn "Đến ngày".</div> : null}

      <ReportState loading={loading} error={error} data={data} needBranch={needBranch} onRetry={reload} emptyMessage="Không có ca làm việc nào trong kỳ đã chọn.">
        {data && !data.empty ? (
          <>
            <KpiStrip
              items={[
                { label: "Số ca", value: formatNumber(s.shiftCount), sub: `${formatNumber(s.unreconciledCount)} ca chưa đối soát` },
                { label: "Thu tiền mặt", value: formatVnd(s.cashSales) },
                { label: "Nạp / Rút", value: `${formatVnd(s.cashIn)}`, sub: `Rút: ${formatVnd(s.cashOut)}` },
                { label: "Hoàn tiền", value: formatVnd(s.cashRefunds) },
                { label: "Tiền dự kiến", value: formatVnd(s.expectedCash), sub: `Thực đếm: ${formatVnd(s.countedCash)}` },
                {
                  label: "Tổng chênh lệch",
                  value: formatVnd(s.totalVariance),
                  sub: `${formatNumber(s.varianceShiftCount)} ca lệch tiền`,
                },
              ]}
            />

            <SectionTitle>Chi tiết theo ca · {data.branchName}</SectionTitle>
            <div className="scms-panel">
              <div className="table-responsive">
                <Table hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Ca</th>
                      <th>Mở / đóng</th>
                      <th className="num">Đầu ca</th>
                      <th className="num">Thu TM</th>
                      <th className="num">Nạp</th>
                      <th className="num">Rút</th>
                      <th className="num">Hoàn</th>
                      <th className="num">Dự kiến</th>
                      <th className="num">Thực đếm</th>
                      <th className="num">Chênh lệch</th>
                      <th>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((r) => {
                      const open = Boolean(expanded[r.shiftId]);
                      return (
                        <Fragment key={r.shiftId}>
                          <tr style={r.hasVariance ? { background: "var(--warn-soft)" } : undefined}>
                            <td>
                              <strong>{SHIFT_TYPE_LABELS[r.shiftType] || r.shiftType}</strong> #{r.shiftId}
                              <div className="small text-muted-scms">{formatDate(r.shiftDate)} · {SHIFT_STATUS_LABELS[r.shiftStatus] || r.shiftStatus}</div>
                            </td>
                            <td className="small">
                              {formatTime(r.openedAt)} → {r.closedAt ? formatTime(r.closedAt) : "…"}
                            </td>
                            <td className="num">{formatVnd(r.openingCash)}</td>
                            <td className="num">{formatVnd(r.cashSales)}</td>
                            <td className="num">{formatVnd(r.cashIn)}</td>
                            <td className="num">{formatVnd(r.cashOut)}</td>
                            <td className="num">{formatVnd(r.cashRefunds)}</td>
                            <td className="num">{formatVnd(r.expectedCash)}</td>
                            <td className="num">{formatVnd(r.countedCash)}</td>
                            <td className="num" style={{ fontWeight: r.hasVariance ? 700 : 400 }}>
                              {r.variance === null || r.variance === undefined ? "—" : formatVnd(r.variance)}
                            </td>
                            <td>
                              {r.reconcileStatus === "UNRECONCILED" ? (
                                <StatusTag status="UNRECONCILED" variant="neutral" label="Chưa đối soát" />
                              ) : r.hasVariance ? (
                                <StatusTag status="VARIANCE" variant="warn" label="Lệch tiền" />
                              ) : (
                                <StatusTag status="RECONCILED" variant="dark" label="Khớp" />
                              )}
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => setExpanded((e) => ({ ...e, [r.shiftId]: !open }))}
                                disabled={!r.movements?.length && !r.discrepancyReason}
                              >
                                {open ? "Ẩn" : "Chi tiết"}
                              </Button>
                            </td>
                          </tr>
                          {open ? (
                            <tr>
                              <td colSpan={12} style={{ background: "var(--paper)" }}>
                                {r.discrepancyReason ? (
                                  <div className="mb-2">
                                    <strong>Lý do chênh lệch:</strong> {r.discrepancyReason}
                                  </div>
                                ) : null}
                                {r.movements?.length ? (
                                  <Table size="sm" className="mb-0">
                                    <thead>
                                      <tr>
                                        <th>Thời điểm</th>
                                        <th>Loại</th>
                                        <th className="num">Số tiền</th>
                                        <th>Lý do</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.movements.map((m, i) => (
                                        <tr key={i}>
                                          <td>{formatDateTime(m.createdAt)}</td>
                                          <td>{CASH_TX_LABELS[m.type] || m.type}</td>
                                          <td className="num">{formatVnd(m.amount)}</td>
                                          <td>{m.reason || "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </Table>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </div>
          </>
        ) : null}
      </ReportState>
    </ReportLayout>
  );
}
