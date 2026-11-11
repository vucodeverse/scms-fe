import { useCallback, useEffect, useRef, useState } from "react";
import { branchesApi } from "../../api/branchesApi.js";
import { fetchAllPages } from "../../api/paging.js";

// Tiện ích dùng chung cho các màn hình báo cáo (UC34–UC42).

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Date -> "yyyy-MM-dd" theo giờ máy (máy dùng giờ VN như backend).
export function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Kỳ báo cáo nhanh theo UC35 "ngày / tuần / tháng / năm" (tính tới hôm nay).
export const PERIOD_PRESETS = [
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "week", label: "Tuần này" },
  { key: "month", label: "Tháng này" },
  { key: "lastMonth", label: "Tháng trước" },
  { key: "year", label: "Năm nay" },
  { key: "custom", label: "Tùy chọn" },
];

export function presetRange(key, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: toIsoDate(y), to: toIsoDate(y) };
    }
    case "week": {
      const start = new Date(today);
      const dow = (start.getDay() + 6) % 7; // Thứ Hai = 0
      start.setDate(start.getDate() - dow);
      return { from: toIsoDate(start), to: toIsoDate(today) };
    }
    case "month":
      return { from: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: toIsoDate(today) };
    case "lastMonth":
      return {
        from: toIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "year":
      return { from: toIsoDate(new Date(today.getFullYear(), 0, 1)), to: toIsoDate(today) };
    case "today":
    default:
      return { from: toIsoDate(today), to: toIsoDate(today) };
  }
}

// Giá trị khởi tạo cho PeriodPicker: { preset, from, to }.
export function initialPeriod(preset = "today") {
  return { preset, ...presetRange(preset) };
}

// Phần trăm (BigDecimal từ backend có thể là number hoặc string).
export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`;
}

export function formatQty(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

// Danh sách chi nhánh cho COO (BM có branchId cố định -> không tải).
export function useBranchOptions(user) {
  const isBranchUser = user?.role !== "COO";
  const unassignedManager = user?.role === "BRANCH_MANAGER" && !user?.branchId;
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (isBranchUser) return;
    let alive = true;
    fetchAllPages((p) => branchesApi.list(p))
      .then((items) => alive && setBranches(items))

      .catch(() => alive && setBranches([]));
    return () => {
      alive = false;
    };
  }, [isBranchUser]);
  return { branches, isBranchUser, unassignedManager };
}

// Tải báo cáo theo bộ lọc. `fetcher(params)` trả Promise; khi `enabled=false`
// (vd. COO chưa chọn chi nhánh) không gọi API. Bỏ kết quả của request cũ nếu
// bộ lọc đổi trong lúc đang tải.
export function useReport(fetcher, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const key = JSON.stringify(params);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current(JSON.parse(key))
      .then((data) => id === seq.current && setState({ data, loading: false, error: null }))
      .catch((error) => id === seq.current && setState({ data: null, loading: false, error }));
  }, [key, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

// Nhãn tiếng Việt cho enum của backend.
export const SHIFT_TYPE_LABELS = { MORNING: "Ca sáng", EVENING: "Ca chiều", NIGHT: "Ca tối" };
export const SHIFT_STATUS_LABELS = { SCHEDULED: "Đã lên lịch", OPEN: "Đang mở", CLOSED: "Đã đóng" };
export const PAYMENT_METHOD_LABELS = { CASH: "Tiền mặt", VIETQR: "VietQR" };
export const CASH_TX_LABELS = {
  OPEN: "Mở ca",
  CASH_IN: "Nạp tiền",
  CASH_OUT: "Rút tiền",
  REFUND_OUT: "Hoàn tiền",
  CLOSE: "Đóng ca",
};
export const COUNT_STATUS_LABELS = { MATCHED: "Khớp", VARIANCE: "Chênh lệch", UNCOUNTED: "Chưa kiểm kê" };
export const COST_GAP_LABELS = { NO_RECIPE: "Chưa có công thức", MISSING_UNIT_COST: "Thiếu đơn giá nguyên liệu" };
