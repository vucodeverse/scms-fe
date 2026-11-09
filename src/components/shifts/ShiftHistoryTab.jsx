import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import DataTable from "../DataTable.jsx";
import StatusTag from "../StatusTag.jsx";
import { useToast } from "../ToastContext.jsx";
import { shiftsApi } from "../../api/shiftsApi.js";
import { formatDate, formatVnd } from "../../lib/format.js";
import { SHIFT_STATUS_META, SHIFT_TYPE_META, formatHm, formatSignedVnd } from "./shiftUtils.js";

const PAGE_SIZE = 10;

// Tab Lịch sử ca làm việc & Đối soát két tiền (UC24–UC27).
export default function ShiftHistoryTab({
  branchId,
  allBranches = false,
  refreshTrigger = 0,
  onViewDetail,
}) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [uiPage, setUiPage] = useState(1);
  const [page, setPage] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [loading, setLoading] = useState(true);

  const invalidRange = startDate && endDate && startDate > endDate;

  const load = useCallback(async () => {
    if ((!branchId && !allBranches) || invalidRange) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await shiftsApi.list({
        branchId: allBranches ? undefined : branchId,
        status: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        uiPage,
        size: PAGE_SIZE,
        sortDir: "DESC",
      });
      setPage(res);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được lịch sử ca làm việc.");
    } finally {
      setLoading(false);
    }
  }, [branchId, allBranches, statusFilter, startDate, endDate, uiPage, invalidRange, refreshTrigger]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    ...(allBranches
      ? [
          {
            key: "branch",
            header: "Chi nhánh",
            render: (r) => <strong>{r.branchName || (r.branchId ? `Chi nhánh #${r.branchId}` : "—")}</strong>,
          },
        ]
      : []),
    {
      key: "shift",
      header: "Ca làm việc",
      render: (r) => (
        <div>
          <strong>{SHIFT_TYPE_META[r.shiftType]?.label || r.shiftType}</strong>{" "}
          <span className="mono text-muted-scms">#{r.id}</span>
          <div className="small text-muted-scms">{formatDate(r.shiftDate)}</div>
        </div>
      ),
    },
    {
      key: "time",
      header: "Giờ thực tế",
      render: (r) =>
        r.openedAt ? (
          <span className="mono small">
            {formatHm(r.openedAt)} → {r.closedAt ? formatHm(r.closedAt) : "Đang mở"}
          </span>
        ) : (
          <span className="mono small text-muted-scms">
            Dự kiến: {formatHm(r.plannedStart)}–{formatHm(r.plannedEnd)}
          </span>
        ),
    },
    {
      key: "openingCash",
      header: "Đầu ca",
      numeric: true,
      render: (r) => formatVnd(r.openingCash),
    },
    {
      key: "cashRevenue",
      header: "Thu TM",
      numeric: true,
      render: (r) => formatVnd(r.cashRevenue),
    },
    {
      key: "transferRevenue",
      header: "QR",
      numeric: true,
      render: (r) => formatVnd(r.transferRevenue),
    },
    {
      key: "expectedCash",
      header: "Dự kiến",
      numeric: true,
      render: (r) => formatVnd(r.expectedCash),
    },
    {
      key: "countedCash",
      header: "Thực đếm",
      numeric: true,
      render: (r) => formatVnd(r.countedCash),
    },
    {
      key: "variance",
      header: "Chênh lệch",
      numeric: true,
      render: (r) => {
        if (r.variance === null || r.variance === undefined) return "—";
        const v = Number(r.variance);
        const hasDiff = Math.abs(v) >= 0.01;
        return (
          <strong style={hasDiff ? { color: "var(--accent-dark)" } : undefined}>
            {formatSignedVnd(v)}
          </strong>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => {
        const meta = SHIFT_STATUS_META[r.status] || { label: r.status, variant: "neutral" };
        return <StatusTag status={r.status} label={meta.label} variant={meta.variant} />;
      },
    },
    {
      key: "actions",
      header: "",
      width: 96,
      render: (r) => (
        <Button size="sm" variant="outline-secondary" onClick={() => onViewDetail?.(r.id)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const toolbar = (
    <div className="d-flex flex-wrap gap-2 align-items-end w-100">
      <div style={{ minWidth: 165 }}>
        <Form.Label className="mb-1">Trạng thái</Form.Label>
        <Form.Select
          size="sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setUiPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="OPEN">Đang mở</option>
          <option value="CLOSED">Đã đóng</option>
          <option value="SCHEDULED">Đã lên lịch</option>
        </Form.Select>
      </div>

      <div style={{ minWidth: 145 }}>
        <Form.Label className="mb-1">Từ ngày</Form.Label>
        <Form.Control
          type="date"
          size="sm"
          value={startDate}
          isInvalid={invalidRange}
          onChange={(e) => {
            setStartDate(e.target.value);
            setUiPage(1);
          }}
        />
      </div>

      <div style={{ minWidth: 145 }}>
        <Form.Label className="mb-1">Đến ngày</Form.Label>
        <Form.Control
          type="date"
          size="sm"
          value={endDate}
          isInvalid={invalidRange}
          onChange={(e) => {
            setEndDate(e.target.value);
            setUiPage(1);
          }}
        />
      </div>

      {statusFilter || startDate || endDate ? (
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => {
            setStatusFilter("");
            setStartDate("");
            setEndDate("");
            setUiPage(1);
          }}
        >
          Xóa lọc
        </Button>
      ) : null}

      <div className="ms-auto">
        <Button size="sm" variant="outline-secondary" onClick={load} disabled={loading}>
          Làm mới
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {invalidRange ? (
        <div className="field-error mb-3">&quot;Từ ngày&quot; không được lớn hơn &quot;Đến ngày&quot;.</div>
      ) : null}
      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Chưa có ca làm việc nào khớp bộ lọc."
        toolbar={toolbar}
        pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
      />
    </>
  );
}
