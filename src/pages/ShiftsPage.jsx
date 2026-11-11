import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner, Tab, Tabs } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import UnassignedManagerNotice from "../components/UnassignedManagerNotice.jsx";
import DataTable from "../components/DataTable.jsx";
import KpiStrip from "../components/KpiStrip.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { isUnassignedBranchManager, roleLabel } from "../auth/landing.js";
import { buildMenu, buildPosMenu } from "../config/menu.js";
import { BRANCH_STATUS_LABELS, BRANCH_STATUS_VARIANTS } from "../config/userConstants.js";
import { formatDateTime, formatVnd } from "../lib/format.js";
import { branchesApi } from "../api/branchesApi.js";
import { usersApi } from "../api/usersApi.js";
import { attendanceApi } from "../api/attendanceApi.js";
import { shiftsApi } from "../api/shiftsApi.js";
import CashierPinUnlockPanel from "../components/shifts/CashierPinUnlockPanel.jsx";
import ShiftOperationsTab from "../components/shifts/ShiftOperationsTab.jsx";
import ShiftScheduleTab from "../components/shifts/ShiftScheduleTab.jsx";
import ShiftHistoryTab from "../components/shifts/ShiftHistoryTab.jsx";
import { CashAdjustmentModal, CloseShiftModal } from "../components/shifts/ShiftCashModals.jsx";
import {
  AcceptHandoverModal,
  CancelHandoverModal,
  InitiateHandoverModal,
} from "../components/shifts/ShiftHandoverModals.jsx";
import ShiftScheduleModal from "../components/shifts/ShiftScheduleModal.jsx";
import ShiftDetailModal from "../components/shifts/ShiftDetailModal.jsx";
import { SHIFT_TYPE_META, addDaysIso, todayIso, weekRange } from "../components/shifts/shiftUtils.js";

const ALLOWED_ROLES = ["COO", "BRANCH_MANAGER", "CASHIER"];

// SCR-08 / UC08, UC24–UC27 — Kiểm két tiền, Mở/Đóng ca & Phân ca (hỗ trợ Thu ngân mở khóa PIN,
// Quản lý chi nhánh thao tác két & COO xem tất cả chi nhánh hoặc chuyển từng chi nhánh).
export default function ShiftsPage() {
  const { user, status, logout } = useAuth();
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const isCoo = user?.role === "COO";
  const isManager = user?.role === "BRANCH_MANAGER";
  const isCashier = user?.role === "CASHIER";
  const canViewSchedule = isCoo || isManager;
  const canManageSchedule = isManager;
  const canAdjustCash = isManager;
  const unassignedManager = isUnassignedBranchManager(user);

  const [unlockBranchName, setUnlockBranchName] = useState(undefined);
  const [branches, setBranches] = useState([]);
  const [cooScope, setCooScope] = useState(() => {
    if (query.branchId) {
      const parsed = Number(query.branchId);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return "ALL";
  });

  const isAllBranchesMode = isCoo && cooScope === "ALL";
  const branchId = isCoo
    ? cooScope === "ALL"
      ? null
      : Number(cooScope)
    : user?.branchId || null;

  const [activeTab, setActiveTab] = useState(() =>
    query.tab === "schedule" || query.tab === "history" ? query.tab : "operations",
  );
  const [preselectedScheduledId, setPreselectedScheduledId] = useState(null);

  // Tổng quan chuỗi khi COO chọn "Tất cả chi nhánh"
  const [branchesOverview, setBranchesOverview] = useState([]);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Dữ liệu ca hiện tại & kết ca trước (chế độ 1 chi nhánh)
  const [currentSummary, setCurrentSummary] = useState(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [openShiftError, setOpenShiftError] = useState(null);
  const [previousClosed, setPreviousClosed] = useState(null);
  const [loadingPreviousClosed, setLoadingPreviousClosed] = useState(false);

  // Dữ liệu lịch ca tuần + ca chờ mở quanh hôm nay
  const initialWeek = useMemo(() => weekRange(todayIso()), []);
  const [scheduleStart, setScheduleStart] = useState(initialWeek.startDate);
  const [scheduleEnd, setScheduleEnd] = useState(initialWeek.endDate);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [nearTodaySchedules, setNearTodaySchedules] = useState([]);

  // Dữ liệu nhân sự & chấm công trong ngày
  const [employees, setEmployees] = useState([]);
  const [cooActors, setCooActors] = useState([]);
  const [checkedInIds, setCheckedInIds] = useState(() => new Set());
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Modal states
  const [cashModalMode, setCashModalMode] = useState(null); // "IN" | "OUT" | null
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showInitiateHandover, setShowInitiateHandover] = useState(false);
  const [showAcceptHandover, setShowAcceptHandover] = useState(false);
  const [showCancelHandover, setShowCancelHandover] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null); // { mode, shift }
  const [detailShiftId, setDetailShiftId] = useState(null);

  // Đồng bộ scope khi COO điều hướng qua URL ?branchId=...
  useEffect(() => {
    if (!isCoo) return;
    if (query.branchId) {
      const parsed = Number(query.branchId);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setCooScope(parsed);
        return;
      }
    }
    setCooScope("ALL");
  }, [isCoo, query.branchId]);

  useEffect(() => {
    if (!isCoo) return;
    branchesApi
      .list({ uiPage: 1, size: 100, sortBy: "name", sortDir: "ASC" })
      .then((res) => {
        setBranches(res.items || []);
      })
      .catch((err) => {
        toastRef.current.error(err.message || "Không tải được danh sách chi nhánh.");
      });
  }, [isCoo]);

  const selectCooScope = useCallback(
    (nextScope, nextTab = "operations") => {
      setPreselectedScheduledId(null);
      if (nextScope === "ALL") {
        setCooScope("ALL");
        if (nextTab === "history") setActiveTab("history");
        else setActiveTab("operations");
        navigate("/branch/shifts");
      } else {
        const numericId = Number(nextScope);
        const normalizedTab =
          nextTab === "schedule" || nextTab === "history" ? nextTab : "operations";
        setCooScope(numericId);
        setActiveTab(normalizedTab);
        navigate(`/branch/shifts?branchId=${numericId}`);
      }
    },
    [navigate],
  );

  const loadBranchesOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await shiftsApi.branchesOverview();
      setBranchesOverview(Array.isArray(res) ? res : []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được tổng quan két tiền các chi nhánh.");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadDirectory = useCallback(
    async (targetBranchId) => {
      if (!targetBranchId) return;
      try {
        const kioskPromise = attendanceApi.kioskEmployees(targetBranchId);
        const usersPromise = canViewSchedule
          ? usersApi.list({ uiPage: 1, size: 100, branchId: targetBranchId })
          : Promise.resolve({ items: [] });
        const cooPromise = canViewSchedule
          ? usersApi.list({ uiPage: 1, size: 20, role: "COO" })
          : Promise.resolve({ items: [] });

        const [kioskRes, usersRes, cooRes] = await Promise.allSettled([
          kioskPromise,
          usersPromise,
          cooPromise,
        ]);
        const kioskList = kioskRes.status === "fulfilled" ? kioskRes.value || [] : [];
        const userList = usersRes.status === "fulfilled" ? usersRes.value?.items || [] : [];
        const cooList = cooRes.status === "fulfilled" ? cooRes.value?.items || [] : [];

        const checkedSet = new Set();
        const kioskMap = {};
        for (const k of kioskList) {
          if (k.isCheckedIn) checkedSet.add(k.employeeId);
          kioskMap[k.employeeId] = k;
        }

        if (!canViewSchedule) {
          setCheckedInIds(checkedSet);
          setEmployees([]);
          setCooActors([]);
          return;
        }

        const merged = new Map();
        for (const u of userList) {
          const k = kioskMap[u.id];
          merged.set(u.id, {
            id: u.id,
            fullName: u.fullName,
            roleCode: u.roleCode || k?.role,
            phone: u.phone,
            hasPin: u.hasPin,
            status: u.status,
            isCheckedIn: Boolean(k?.isCheckedIn),
          });
        }
        for (const k of kioskList) {
          if (!merged.has(k.employeeId)) {
            merged.set(k.employeeId, {
              id: k.employeeId,
              fullName: k.fullName,
              roleCode: k.role,
              phone: null,
              hasPin: true,
              status: "ACTIVE",
              isCheckedIn: Boolean(k.isCheckedIn),
            });
          }
        }

        setCheckedInIds(checkedSet);
        setEmployees(Array.from(merged.values()));
        setCooActors(cooList);
      } catch {
        // Bỏ qua nếu không tải được toàn bộ danh bạ
      }
    },
    [canViewSchedule],
  );

  const loadCurrent = useCallback(async (targetBranchId) => {
    if (!targetBranchId) {
      setCurrentSummary(null);
      setLoadingCurrent(false);
      return;
    }
    setLoadingCurrent(true);
    setOpenShiftError(null);
    try {
      const sum = await shiftsApi.current(targetBranchId);
      setCurrentSummary(sum);
    } catch (err) {
      setCurrentSummary(null);
      setOpenShiftError(err);
    } finally {
      setLoadingCurrent(false);
    }
  }, []);

  const loadPreviousClosed = useCallback(async (targetBranchId) => {
    if (!targetBranchId) {
      setPreviousClosed(null);
      setLoadingPreviousClosed(false);
      return;
    }
    setLoadingPreviousClosed(true);
    try {
      const res = await shiftsApi.previousClosed(targetBranchId);
      setPreviousClosed(res || null);
    } catch {
      setPreviousClosed(null);
    } finally {
      setLoadingPreviousClosed(false);
    }
  }, []);

  const loadNearToday = useCallback(
    async (targetBranchId) => {
      if (!targetBranchId) return;
      try {
        if (canViewSchedule) {
          const t = todayIso();
          const res = await shiftsApi.schedules({
            branchId: targetBranchId,
            startDate: addDaysIso(t, -1),
            endDate: addDaysIso(t, 3),
          });
          setNearTodaySchedules(res || []);
        } else {
          const res = await shiftsApi.openCandidates(targetBranchId);
          setNearTodaySchedules(res || []);
        }
      } catch {
        setNearTodaySchedules([]);
      }
    },
    [canViewSchedule],
  );

  const loadSchedules = useCallback(
    async (targetBranchId, start, end) => {
      if (!canViewSchedule || !targetBranchId || !start || !end || start > end) {
        setSchedules([]);
        return;
      }
      setLoadingSchedules(true);
      try {
        const res = await shiftsApi.schedules({ branchId: targetBranchId, startDate: start, endDate: end });
        setSchedules(res || []);
      } catch (err) {
        toastRef.current.error(err.message || "Không tải được lịch phân ca.");
      } finally {
        setLoadingSchedules(false);
      }
    },
    [canViewSchedule],
  );

  const reloadAll = useCallback(async () => {
    if (status !== "authenticated" || !user || !ALLOWED_ROLES.includes(user.role) || unassignedManager) {
      return;
    }
    if (isAllBranchesMode) {
      await loadBranchesOverview();
      setHistoryRefreshKey((k) => k + 1);
      return;
    }
    if (!branchId) return;
    await Promise.all([
      loadDirectory(branchId),
      loadCurrent(branchId),
      loadPreviousClosed(branchId),
      loadNearToday(branchId),
      canViewSchedule ? loadSchedules(branchId, scheduleStart, scheduleEnd) : Promise.resolve(),
    ]);
    setHistoryRefreshKey((k) => k + 1);
  }, [
    status,
    user,
    unassignedManager,
    isAllBranchesMode,
    branchId,
    scheduleStart,
    scheduleEnd,
    canViewSchedule,
    loadBranchesOverview,
    loadDirectory,
    loadCurrent,
    loadPreviousClosed,
    loadNearToday,
    loadSchedules,
  ]);

  useEffect(() => {
    if (status !== "authenticated" || !user || !ALLOWED_ROLES.includes(user.role) || unassignedManager) {
      return;
    }
    if (isAllBranchesMode) {
      setCurrentSummary(null);
      setPreviousClosed(null);
      loadBranchesOverview();
      return;
    }
    if (!branchId) {
      setLoadingCurrent(false);
      return;
    }
    setPreviousClosed(null);
    loadDirectory(branchId);
    loadCurrent(branchId);
    loadPreviousClosed(branchId);
    loadNearToday(branchId);
  }, [
    status,
    user,
    unassignedManager,
    isAllBranchesMode,
    branchId,
    canViewSchedule,
    loadBranchesOverview,
    loadDirectory,
    loadCurrent,
    loadPreviousClosed,
    loadNearToday,
  ]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !user ||
      !canViewSchedule ||
      unassignedManager ||
      isAllBranchesMode ||
      !branchId
    ) {
      return;
    }
    loadSchedules(branchId, scheduleStart, scheduleEnd);
  }, [
    status,
    user,
    canViewSchedule,
    unassignedManager,
    isAllBranchesMode,
    branchId,
    scheduleStart,
    scheduleEnd,
    loadSchedules,
  ]);

  const employeeMap = useMemo(() => {
    const map = {};
    for (const c of cooActors) map[c.id] = c;
    for (const e of employees) map[e.id] = e;
    if (user?.id && !map[user.id]) {
      map[user.id] = { id: user.id, fullName: user.fullName, roleCode: user.role };
    }
    return map;
  }, [cooActors, employees, user]);

  const modalSchedules = useMemo(() => {
    const map = new Map();
    for (const s of schedules || []) map.set(s.shiftId, s);
    for (const s of nearTodaySchedules || []) {
      if (!map.has(s.shiftId)) map.set(s.shiftId, s);
    }
    return Array.from(map.values());
  }, [schedules, nearTodaySchedules]);

  const scheduledCandidates = useMemo(
    () => (nearTodaySchedules || []).filter((s) => s.status === "SCHEDULED"),
    [nearTodaySchedules],
  );

  const selectedBranchName = isAllBranchesMode
    ? "Toàn chuỗi"
    : user?.branchName || branches.find((b) => b.id === branchId)?.name || undefined;

  const overviewStats = useMemo(() => {
    const total = branchesOverview.length;
    const openCount = branchesOverview.filter((b) => b.hasOpenShift).length;
    const closedWaitingCount = branchesOverview.filter(
      (b) => b.branchStatus === "OPEN" && !b.hasOpenShift,
    ).length;
    const totalCashInDrawers = branchesOverview.reduce(
      (sum, b) => sum + (b.hasOpenShift ? Number(b.currentCashBalance || 0) : 0),
      0,
    );
    const totalCashSales = branchesOverview.reduce(
      (sum, b) => sum + (b.hasOpenShift ? Number(b.cashRevenue || 0) : 0),
      0,
    );
    return { total, openCount, closedWaitingCount, totalCashInDrawers, totalCashSales };
  }, [branchesOverview]);

  const overviewColumns = [
    {
      key: "branch",
      header: "Chi nhánh",
      render: (r) => (
        <div>
          <strong>{r.branchName}</strong>{" "}
          <span className="mono small text-muted-scms">({r.branchCode})</span>
          <div className="mt-1">
            <StatusTag
              status={r.branchStatus}
              variant={BRANCH_STATUS_VARIANTS[r.branchStatus] || "neutral"}
              label={BRANCH_STATUS_LABELS[r.branchStatus] || r.branchStatus}
            />
          </div>
        </div>
      ),
    },
    {
      key: "shiftState",
      header: "Ca hiện tại",
      render: (r) =>
        r.hasOpenShift ? (
          <div>
            <div className="d-flex gap-1 flex-wrap align-items-center">
              <StatusTag
                status="OPEN"
                variant="dark"
                label={`${SHIFT_TYPE_META[r.openShiftType]?.label || r.openShiftType} #${r.openShiftId}`}
              />
              {r.handoverPending ? (
                <StatusTag status="PENDING_RECEIVE" variant="warn" label="Chờ bàn giao két" />
              ) : null}
            </div>
            <div className="small text-muted-scms mt-1">
              Mở lúc {formatDateTime(r.openedAt)} · Giữ két:{" "}
              <strong>{r.activeCashierName || r.openedByName || `NV #${r.activeCashierId || r.openedBy || "—"}`}</strong>
            </div>
          </div>
        ) : (
          <StatusTag status="CLOSED" variant="neutral" label="Chưa mở ca" />
        ),
    },
    {
      key: "baseline",
      header: "Đầu ca / Kết ca cũ",
      numeric: true,
      render: (r) =>
        r.hasOpenShift ? (
          <div>
            <strong>{formatVnd(r.openingCash)}</strong>
            {r.previousClosingCash !== null && r.previousClosingCash !== undefined ? (
              <div className="small text-muted-scms">Ca trước: {formatVnd(r.previousClosingCash)}</div>
            ) : null}
          </div>
        ) : r.previousClosingCash !== null && r.previousClosingCash !== undefined ? (
          <div>
            <strong>{formatVnd(r.previousClosingCash)}</strong>
            <div className="small text-muted-scms">Kết ca #{r.previousClosedShiftId}</div>
          </div>
        ) : (
          <span className="text-muted-scms">—</span>
        ),
    },
    {
      key: "cashRevenue",
      header: "Thu tiền mặt",
      numeric: true,
      render: (r) => (r.hasOpenShift ? formatVnd(r.cashRevenue) : "—"),
    },
    {
      key: "currentBalance",
      header: "Két dự kiến hiện tại",
      numeric: true,
      render: (r) =>
        r.hasOpenShift ? <strong>{formatVnd(r.currentCashBalance)}</strong> : "—",
    },
    {
      key: "actions",
      header: "",
      width: 240,
      render: (r) => (
        <div className="d-flex gap-1 justify-content-end flex-wrap">
          {r.hasOpenShift ? (
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setDetailShiftId(r.openShiftId)}
            >
              Chi tiết ca
            </Button>
          ) : r.previousClosedShiftId ? (
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setDetailShiftId(r.previousClosedShiftId)}
            >
              Xem ca cũ
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={r.hasOpenShift ? "outline-primary" : "primary"}
            onClick={() => selectCooScope(r.branchId, "operations")}
          >
            Xem chi nhánh →
          </Button>
        </div>
      ),
    },
  ];

  // Trạng thái đang khôi phục phiên
  if (status === "restoring") {
    return (
      <AdminLayout
        menu={buildPosMenu({ unlocked: false, shiftOpen: false })}
        headerRight={<SessionHeaderRight />}
        userName="Quầy thu ngân"
        userRole="Đang tải"
      >
        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "55vh" }}>
          <Spinner className="me-2" /> Đang khôi phục phiên làm việc…
        </div>
      </AdminLayout>
    );
  }

  // Trạng thái chưa đăng nhập -> Thu ngân mở khóa trực tiếp bằng PIN 4 số
  if (status === "anonymous" || !user) {
    return (
      <AdminLayout
        menu={buildPosMenu({ unlocked: false, shiftOpen: false })}
        branchName={unlockBranchName}
        headerRight={<SessionHeaderRight />}
        userName="Quầy thu ngân"
        userRole="Chờ mở khóa PIN"
      >
        <PageHeader
          title="Kiểm két & Ca làm việc"
          screenCode="SCR-08 · PIN UNLOCK"
          description="Thu ngân chọn tên và nhập mã PIN 4 số để kiểm két đầu ca (so với kết ca cũ), tự động check-in khi mở ca và nhập PIN xác nhận check-out khi đóng ca."
        />
        <CashierPinUnlockPanel
          initialBranchId={query.branchId ? Number(query.branchId) : null}
          onBranchLabelChange={setUnlockBranchName}
        />
      </AdminLayout>
    );
  }

  const isHandoverPending = Boolean(currentSummary?.shift?.handoverPending);
  const resolvedMenu = isCashier
    ? buildPosMenu({
        unlocked: true,
        shiftOpen: Boolean(currentSummary?.shift),
        handoverPending: isHandoverPending,
      })
    : buildMenu(user);

  const singleBranchAllowedTabs = isCashier
    ? ["operations", "history"]
    : ["operations", "schedule", "history"];
  const effectiveSingleBranchTab = singleBranchAllowedTabs.includes(activeTab)
    ? activeTab
    : "operations";

  // Đã đăng nhập nhưng sai vai trò
  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <AdminLayout
        menu={resolvedMenu}
        branchName={user.branchName || undefined}
        headerRight={<SessionHeaderRight />}
        userName={user.fullName}
        userRole={roleLabel(user.role)}
      >
        <div className="scms-panel p-4" style={{ maxWidth: 560, margin: "40px auto" }}>
          <h2 className="mb-2">Không có quyền truy cập</h2>
          <p className="text-muted-scms">
            Vai trò hiện tại ({user.role}) không được phép thao tác ca làm việc &amp; kiểm két.
          </p>
          <Button variant="outline-secondary" onClick={() => navigate("/")}>
            Về trang chính
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      menu={resolvedMenu}
      branchName={selectedBranchName}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title={
          isAllBranchesMode
            ? "Tổng quan ca & két toàn chuỗi"
            : isCoo
              ? "Theo dõi ca & két chi nhánh"
              : "Kiểm két & Ca làm việc"
        }
        screenCode="SCR-08"
        description={
          isCashier
            ? "Thu ngân kiểm két đầu ca so với kết ca cũ, mở ca bán hàng và nhập tiền thực đếm cuối ca."
            : isCoo
              ? "Theo dõi trạng thái ca làm việc, số dư két tiền, lịch phân ca và lịch sử đối soát chi tiết (chế độ xem COO)."
              : "Theo dõi két tiền chi nhánh, nạp/rút tiền mặt, xếp lịch phân ca và đối soát mở/đóng ca."
        }
        actions={
          unassignedManager ? null : (
            <div className="d-flex gap-2 align-items-center flex-wrap">
              {isCoo && branches.length > 0 ? (
                <Form.Select
                  value={isAllBranchesMode ? "ALL" : String(branchId || "")}
                  onChange={(e) => selectCooScope(e.target.value, activeTab)}
                  style={{ minWidth: 240 }}
                  aria-label="Chọn phạm vi chi nhánh"
                >
                  <option value="ALL">Tất cả chi nhánh ({branches.length})</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Form.Select>
              ) : null}
              {isCashier ? (
                <Button variant="outline-primary" onClick={() => logout()}>
                  Đổi thu ngân
                </Button>
              ) : null}
              {!isCoo ? (
                <>
                  <Button variant="outline-secondary" onClick={() => navigate("/kiosk")}>
                    Kiosk chấm công
                  </Button>
                  {currentSummary?.shift ? (
                    isHandoverPending ? (
                      <Button
                        variant="outline-secondary"
                        disabled
                        title="Két tiền đang tạm khóa chờ người nhận kiểm két bàn giao giữa ca"
                      >
                        Quầy POS (Chờ bàn giao)
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={() => navigate("/pos")}>
                        Mở quầy POS →
                      </Button>
                    )
                  ) : (
                    <Button
                      variant="outline-secondary"
                      disabled
                      title="Kiểm két và mở ca trước khi vào Gọi món (POS)"
                    >
                      Quầy POS (Chưa mở ca)
                    </Button>
                  )}
                </>
              ) : null}
              <Button
                variant="outline-secondary"
                onClick={reloadAll}
                disabled={loadingCurrent || loadingSchedules || loadingOverview}
              >
                {loadingCurrent || loadingSchedules || loadingOverview ? (
                  <Spinner size="sm" className="me-1" />
                ) : null}
                Làm mới
              </Button>
            </div>
          )
        }
      />

      {unassignedManager ? (
        <UnassignedManagerNotice />
      ) : isAllBranchesMode ? (
        <>
          <Tabs
            activeKey={activeTab === "history" ? "history" : "overview"}
            onSelect={(k) => setActiveTab(k || "overview")}
            className="mb-3"
          >
            <Tab eventKey="overview" title={`Tổng quan két các chi nhánh (${overviewStats.total})`}>
              <div className="mb-3">
                <KpiStrip
                  items={[
                    {
                      label: "Chi nhánh đang mở ca",
                      value: `${overviewStats.openCount}/${overviewStats.total}`,
                      sub:
                        overviewStats.closedWaitingCount > 0
                          ? `${overviewStats.closedWaitingCount} chi nhánh đang mở cửa chưa mở ca`
                          : "Trạng thái vận hành trực tiếp",
                    },
                    {
                      label: "Tổng tiền mặt trong két",
                      value: formatVnd(overviewStats.totalCashInDrawers),
                      sub: "Cộng dồn các ca đang mở",
                    },
                    {
                      label: "Thu tiền mặt ca hiện tại",
                      value: formatVnd(overviewStats.totalCashSales),
                      sub: "Từ quầy POS toàn chuỗi",
                    },
                  ]}
                />
              </div>
              <DataTable
                columns={overviewColumns}
                rows={branchesOverview}
                rowKey={(r) => r.branchId}
                loading={loadingOverview}
                emptyMessage="Chưa có chi nhánh nào trong hệ thống."
              />
            </Tab>

            <Tab eventKey="history" title="Lịch sử ca toàn chuỗi">
              <ShiftHistoryTab
                allBranches
                refreshTrigger={historyRefreshKey}
                onViewDetail={(id) => setDetailShiftId(id)}
              />
            </Tab>
          </Tabs>

          <ShiftDetailModal
            show={Boolean(detailShiftId)}
            shiftId={detailShiftId}
            employeeMap={employeeMap}
            onClose={() => setDetailShiftId(null)}
          />
        </>
      ) : !branchId ? (
        <div className="scms-panel panel-pad text-center text-muted-scms py-5">
          Chưa xác định chi nhánh làm việc.
        </div>
      ) : (
        <>
          <Tabs
            activeKey={effectiveSingleBranchTab}
            onSelect={(k) => setActiveTab(k || "operations")}
            className="mb-3"
          >
            <Tab
              eventKey="operations"
              title={
                isCoo
                  ? currentSummary?.shift
                    ? `Ca hiện tại (#${currentSummary.shift.id}${isHandoverPending ? " · chờ bàn giao" : " đang mở"})`
                    : "Trạng thái ca hiện tại"
                  : currentSummary?.shift
                    ? isHandoverPending
                      ? `Bàn giao két ca #${currentSummary.shift.id} (Chờ nhận)`
                      : `Kiểm két & Đóng/Mở ca (Ca #${currentSummary.shift.id} đang mở)`
                    : "Kiểm két & Mở ca"
              }
            >
              <ShiftOperationsTab
                branchId={branchId}
                userRole={user.role}
                currentUserId={user.id}
                currentSummary={currentSummary}
                loadingCurrent={loadingCurrent}
                openShiftError={openShiftError}
                previousClosed={previousClosed}
                loadingPreviousClosed={loadingPreviousClosed}
                scheduledCandidates={scheduledCandidates}
                preselectedScheduledId={preselectedScheduledId}
                todaySchedules={nearTodaySchedules}
                employeeMap={employeeMap}
                checkedInIds={checkedInIds}
                canManage={canManageSchedule}
                readOnly={isCoo}
                hideStaffSchedule={isCashier}
                onClearPreselectedScheduled={() => setPreselectedScheduledId(null)}
                onReloadAll={reloadAll}
                onOpenCashModal={(mode) => setCashModalMode(mode)}
                onOpenCloseModal={() => setShowCloseModal(true)}
                onOpenInitiateHandover={() => setShowInitiateHandover(true)}
                onOpenAcceptHandover={() => setShowAcceptHandover(true)}
                onOpenCancelHandover={() => setShowCancelHandover(true)}
                onChangeCashier={() => logout()}
                onOpenScheduleModal={(mode, shift) => setScheduleModal({ mode, shift })}
                onViewDetail={(id) => setDetailShiftId(id)}
                onSwitchTab={(nextTab) => setActiveTab(nextTab)}
              />
            </Tab>

            {canViewSchedule ? (
              <Tab eventKey="schedule" title={`Lịch phân ca (${schedules.length})`}>
                <ShiftScheduleTab
                  schedules={schedules}
                  loading={loadingSchedules}
                  startDate={scheduleStart}
                  endDate={scheduleEnd}
                  onChangeDateRange={(s, e) => {
                    setScheduleStart(s);
                    setScheduleEnd(e);
                  }}
                  employees={employees}
                  employeeMap={employeeMap}
                  checkedInIds={checkedInIds}
                  currentUserId={user.id}
                  hasOpenShift={Boolean(currentSummary?.shift)}
                  canManage={canManageSchedule}
                  readOnly={isCoo}
                  onRefresh={reloadAll}
                  onOpenCreate={(prefill) => setScheduleModal({ mode: "create", shift: prefill || null })}
                  onOpenEdit={(s) => setScheduleModal({ mode: "edit", shift: s })}
                  onQuickOpenScheduledShift={(s) => {
                    setPreselectedScheduledId(s.shiftId);
                    setActiveTab("operations");
                  }}
                  onViewDetail={(id) => setDetailShiftId(id)}
                />
              </Tab>
            ) : null}

            <Tab
              eventKey="history"
              title={isCashier ? "Ca trước & Đối soát" : "Lịch sử ca & Đối soát"}
            >
              <ShiftHistoryTab
                branchId={branchId}
                cashierPreviousOnly={isCashier}
                refreshTrigger={historyRefreshKey}
                onViewDetail={(id) => setDetailShiftId(id)}
              />
            </Tab>
          </Tabs>

          {canAdjustCash ? (
            <CashAdjustmentModal
              show={Boolean(cashModalMode)}
              mode={cashModalMode || "IN"}
              shift={currentSummary?.shift}
              currentCashBalance={currentSummary?.currentCashBalance}
              userRole={user.role}
              onClose={() => setCashModalMode(null)}
              onSuccess={reloadAll}
            />
          ) : null}

          {!isCoo ? (
            <>
              <CloseShiftModal
                show={showCloseModal}
                summary={currentSummary}
                userRole={user.role}
                isCheckedIn={Boolean(user?.id && checkedInIds.has(user.id))}
                onClose={() => setShowCloseModal(false)}
                onSuccess={reloadAll}
              />
              <InitiateHandoverModal
                show={showInitiateHandover}
                summary={currentSummary}
                userRole={user.role}
                branchId={branchId}
                currentUserId={user.id}
                employees={employees}
                employeeMap={employeeMap}
                onClose={() => setShowInitiateHandover(false)}
                onSuccess={reloadAll}
              />
              <AcceptHandoverModal
                show={showAcceptHandover}
                summary={currentSummary}
                userRole={user.role}
                currentUserId={user.id}
                currentUserName={user.fullName}
                employees={employees}
                employeeMap={employeeMap}
                onClose={() => setShowAcceptHandover(false)}
                onSuccess={reloadAll}
              />
              <CancelHandoverModal
                show={showCancelHandover}
                shift={currentSummary?.shift}
                userRole={user.role}
                onClose={() => setShowCancelHandover(false)}
                onSuccess={reloadAll}
              />
            </>
          ) : null}

          {canManageSchedule ? (
            <ShiftScheduleModal
              show={Boolean(scheduleModal)}
              mode={scheduleModal?.mode || "create"}
              initialShift={scheduleModal?.shift}
              branchId={branchId}
              employees={employees}
              schedules={modalSchedules}
              checkedInIds={checkedInIds}
              onClose={() => setScheduleModal(null)}
              onSuccess={reloadAll}
            />
          ) : null}

          <ShiftDetailModal
            show={Boolean(detailShiftId)}
            shiftId={detailShiftId}
            employeeMap={employeeMap}
            hideAssignedStaff={isCashier}
            onClose={() => setDetailShiftId(null)}
          />
        </>
      )}
    </AdminLayout>
  );
}
