import { useState } from "react";
import { Button, Col, Row } from "react-bootstrap";
import KpiStrip from "../../components/KpiStrip.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { RouteLink } from "../../router/HashRouter.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { reportsApi } from "../../api/reportsApi.js";
import { formatDate, formatDateTime, formatNumber, formatTime, formatVnd } from "../../lib/format.js";
import {
  BarChart,
  BranchSelect,
  FilterBar,
  ReportLayout,
  ReportState,
  SectionTitle,
} from "../../components/reports/ReportParts.jsx";
import { SHIFT_TYPE_LABELS, formatPercent, formatQty, useBranchOptions, useReport } from "../../components/reports/reportKit.js";

function Change({ value }) {
  if (value === null || value === undefined) return <span>so với hôm qua: —</span>;
  const n = Number(value);
  const sign = n > 0 ? "▲" : n < 0 ? "▼" : "•";
  return (
    <span>
      {sign} {formatPercent(Math.abs(n))} so với hôm qua
    </span>
  );
}

// Một widget độc lập: lỗi ở widget này không làm hỏng các widget khác (UC34 AT1).
function Widget({ title, widget, onRetry, children, footer }) {
  return (
    <div className="scms-panel h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center px-3 py-2" style={{ borderBottom: "1px solid var(--line)" }}>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        {footer}
      </div>
      <div className="p-3 flex-grow-1">
        {widget?.status === "OK" && widget.data ? (
          children(widget.data)
        ) : (
          <div className="d-flex flex-column align-items-start gap-2">
            <span className="text-muted-scms">{widget?.message || "Không tải được dữ liệu widget này."}</span>
            <Button size="sm" variant="outline-secondary" onClick={onRetry}>
              Thử lại
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className="d-flex justify-content-between py-1" style={{ borderBottom: "1px dashed var(--line)" }}>
      <span className="text-muted-scms">{label}</span>
      <span className="num" style={{ fontWeight: strong ? 700 : 500 }}>
        {value}
      </span>
    </div>
  );
}

// SCR-07 — Dashboard chi nhánh trong ngày (UC34).
export default function BranchDashboardPage() {
  const { user } = useAuth();
  const { branches, isBranchUser, unassignedManager } = useBranchOptions(user);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const needBranch = !isBranchUser && !branchId;
  const params = { branchId: isBranchUser ? undefined : branchId };
  const { data, loading, error, reload } = useReport(reportsApi.dashboard, params, {
    enabled: !unassignedManager && !needBranch,
  });

  return (
    <ReportLayout
      title="Tổng quan chi nhánh"
      screenCode="SCR-07 · UC34"
      description={
        data
          ? `${data.branchName} · ngày ${formatDate(data.date)} · cập nhật lúc ${formatTime(data.generatedAt)}`
          : "Số liệu trong ngày của chi nhánh: doanh thu, đơn hàng, két tiền, tồn kho và chấm công."
      }
    >
      <FilterBar onRefresh={reload} loading={loading}>
        {!isBranchUser ? <BranchSelect branches={branches} value={branchId} onChange={setBranchId} /> : null}
      </FilterBar>

      <ReportState loading={loading} error={error} data={data} needBranch={needBranch} onRetry={reload}>
        {data ? <DashboardBody data={data} reload={reload} /> : null}
      </ReportState>
    </ReportLayout>
  );
}

function DashboardBody({ data, reload }) {
  const sales = data.sales?.status === "OK" ? data.sales.data : null;
  return (
    <>
      {sales ? (
        <KpiStrip
          items={[
            { label: "Doanh thu hôm nay", value: formatVnd(sales.revenue), sub: <Change value={sales.revenueChangePercent} /> },
            { label: "Đơn đã thanh toán", value: formatNumber(sales.orderCount), sub: <Change value={sales.orderChangePercent} /> },
            { label: "Giá trị TB / đơn", value: formatVnd(sales.averageOrderValue), sub: "Average order value" },
            { label: "Hôm qua", value: formatVnd(sales.yesterdayRevenue), sub: `${formatNumber(sales.yesterdayOrderCount)} đơn` },
          ]}
        />
      ) : (
        <Widget title="Doanh thu hôm nay" widget={data.sales} onRetry={reload}>
          {() => null}
        </Widget>
      )}

      {sales ? (
        <>
          <SectionTitle right={<RouteLink to="/reports/sales" className="small">Báo cáo doanh số →</RouteLink>}>
            Doanh thu 7 ngày gần nhất
          </SectionTitle>
          <BarChart
            height={160}
            valueFormatter={(v) => formatQty(v / 1000, 0) + "k"}
            items={(sales.last7Days || []).map((d, idx, arr) => ({
              key: d.date,
              label: formatDate(d.date).slice(0, 5),
              value: d.revenue,
              highlight: idx === arr.length - 1,
              title: `${formatDate(d.date)}: ${formatVnd(d.revenue)} · ${formatNumber(d.orderCount)} đơn`,
            }))}
          />
        </>
      ) : null}

      <Row className="g-3 mt-1">
        <Col lg={4}>
          <Widget
            title="Két tiền ca hiện tại"
            widget={data.cashDrawer}
            onRetry={reload}
            footer={<RouteLink to="/reports/cash-flow" className="small">Dòng tiền →</RouteLink>}
          >
            {(c) =>
              c.shiftOpen ? (
                <>
                  <div className="mb-2 small text-muted-scms">
                    {SHIFT_TYPE_LABELS[c.shiftType] || c.shiftType} · mở lúc {formatDateTime(c.openedAt)}
                  </div>
                  <Line label="Tiền đầu ca" value={formatVnd(c.openingCash)} />
                  <Line label="Thu tiền mặt" value={formatVnd(c.cashSales)} />
                  <Line label="Nạp thêm" value={formatVnd(c.cashIn)} />
                  <Line label="Rút ra" value={formatVnd(c.cashOut)} />
                  <Line label="Hoàn tiền" value={formatVnd(c.cashRefunds)} />
                  <Line label="Tiền dự kiến trong két" value={formatVnd(c.expectedCash)} strong />
                </>
              ) : (
                <span className="text-muted-scms">Hiện không có ca nào đang mở.</span>
              )
            }
          </Widget>
        </Col>
        <Col lg={4}>
          <Widget
            title="Cảnh báo tồn thấp"
            widget={data.lowStock}
            onRetry={reload}
            footer={<RouteLink to="/reports/inventory" className="small">Báo cáo kho →</RouteLink>}
          >
            {(w) =>
              w.lowStockCount === 0 ? (
                <span className="text-muted-scms">Không có nguyên liệu nào dưới ngưỡng an toàn.</span>
              ) : (
                <>
                  <div className="mb-2">
                    <StatusTag status="LOW" variant="warn" label={`${w.lowStockCount} nguyên liệu sắp hết`} />
                  </div>
                  {w.items.map((i) => (
                    <Line
                      key={i.ingredientId}
                      label={i.name}
                      value={`${formatQty(i.currentQty)} / ${formatQty(i.safetyStockLevel)} ${i.baseUnit || ""}`}
                    />
                  ))}
                  {w.lowStockCount > w.items.length ? (
                    <div className="small text-muted-scms mt-2">và {w.lowStockCount - w.items.length} nguyên liệu khác…</div>
                  ) : null}
                </>
              )
            }
          </Widget>
        </Col>
        <Col lg={4}>
          <Widget
            title="Chấm công hôm nay"
            widget={data.attendance}
            onRetry={reload}
            footer={<RouteLink to="/reports/hr-shifts" className="small">Nhân sự →</RouteLink>}
          >
            {(a) => (
              <>
                <Line label="Nhân viên được xếp ca" value={formatNumber(a.scheduledEmployees)} />
                <Line label="Đã check-in" value={formatNumber(a.checkedInEmployees)} />
                <Line label="Đang trong ca" value={formatNumber(a.onDutyNow)} strong />
                <Line label="Đi muộn" value={formatNumber(a.lateCount)} />
                <Line label="Vắng mặt" value={formatNumber(a.absentCount)} />
                <Line label="Quên check-out" value={formatNumber(a.missingCheckoutCount)} />
              </>
            )}
          </Widget>
        </Col>
      </Row>
    </>
  );
}
