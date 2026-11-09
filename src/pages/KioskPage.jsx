import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import Icon from "../components/Icon.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { attendanceApi } from "../api/attendanceApi.js";
import { formatTime } from "../lib/format.js";
import { POSITION_LABELS } from "./EmployeesPage.jsx";

const BRANCH_KEY = "scms.kioskBranchId";
const PIN_LENGTH = 4;
const NUMPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"];

function sortKioskEmployees(items) {
  return [...items].sort((a, b) => {
    const aAssigned = Boolean(a.hasAssignedShift);
    const bAssigned = Boolean(b.hasAssignedShift);
    if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
    return (a.fullName || "").localeCompare(b.fullName || "", "vi");
  });
}

function formatLockRemaining(untilIso, nowMs) {
  if (!untilIso) return null;
  const diffSec = Math.ceil((new Date(untilIso).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return null;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// SCR-02 — Kiosk chấm công (FE-04), mô phỏng views-auth kiosk của
// prototype: panel trái mực với đồng hồ lớn + đầu đọc thẻ, panel
// phải chọn nhân viên, hiển thị PIN 4 chấm, numpad cảm ứng và
// banner kết quả. Chỉ nhân viên đã được phân công ca phù hợp mới
// check-in / check-out được (BR phân ca). Kiosk không đăng nhập;
// chi nhánh được thiết lập một lần (query ?branchId= hoặc nhập tại máy).
export default function KioskPage() {
  const { query, navigate } = useRouter();

  const [branchId, setBranchId] = useState(() => {
    const fromQuery = query.branchId ? Number(query.branchId) : null;
    if (fromQuery) {
      localStorage.setItem(BRANCH_KEY, String(fromQuery));
      return fromQuery;
    }
    const saved = localStorage.getItem(BRANCH_KEY);
    return saved ? Number(saved) : null;
  });
  const [branchInput, setBranchInput] = useState("");
  const [employees, setEmployees] = useState([]);
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeError, setEmployeeError] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [result, setResult] = useState(null); // {kind: idle|success|error, title, lines:[[k,v]]}
  const [busy, setBusy] = useState(false);
  const [cardCode, setCardCode] = useState("");
  const [now, setNow] = useState(() => new Date());
  const resultTimer = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadEmployees = useCallback(async (branch) => {
    if (!branch) return;
    setLoadingEmployees(true);
    setEmployeeError(null);
    try {
      const list = await attendanceApi.kioskEmployees(branch);
      const items = sortKioskEmployees(Array.isArray(list) ? list : []);
      setEmployees(items);
      const preferred = items.find((e) => e.hasAssignedShift) || items[0] || null;
      setSelectedId((prev) =>
        items.some((e) => String(e.employeeId) === String(prev))
          ? prev
          : preferred
            ? String(preferred.employeeId)
            : "",
      );
    } catch (err) {
      setEmployees([]);
      setEmployeeError(err.message || "Không tải được danh sách nhân viên của chi nhánh.");
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    if (branchId) loadEmployees(branchId);
  }, [branchId, loadEmployees]);

  const displayedEmployees = useMemo(
    () => (onlyAssigned ? employees.filter((e) => e.hasAssignedShift) : employees),
    [employees, onlyAssigned],
  );

  useEffect(() => {
    if (displayedEmployees.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!displayedEmployees.some((e) => String(e.employeeId) === String(selectedId))) {
      setSelectedId(String(displayedEmployees[0].employeeId));
      setPin("");
    }
  }, [displayedEmployees, selectedId]);

  const assignedCount = useMemo(
    () => employees.filter((e) => e.hasAssignedShift).length,
    [employees],
  );

  const selected =
    displayedEmployees.find((e) => String(e.employeeId) === String(selectedId)) || null;

  const lockRemaining = selected?.pinLocked ? formatLockRemaining(selected.pinLockedUntil, now.getTime()) : null;
  const isPinLocked = Boolean(selected?.pinLocked && lockRemaining);
  const canAttend = Boolean(selected?.hasAssignedShift) && !isPinLocked;

  const hasAnyLockedEmployee = employees.some((e) => e.pinLocked);
  const expiredReloadRef = useRef(null);

  useEffect(() => {
    if (!branchId || !hasAnyLockedEmployee) return undefined;
    const t = setInterval(() => loadEmployees(branchId), 10000);
    return () => clearInterval(t);
  }, [branchId, hasAnyLockedEmployee, loadEmployees]);

  useEffect(() => {
    if (!branchId || !selected?.pinLocked || !selected?.pinLockedUntil) return;
    if (lockRemaining) return;
    const key = `${selected.employeeId}:${selected.pinLockedUntil}`;
    if (expiredReloadRef.current === key) return;
    expiredReloadRef.current = key;
    loadEmployees(branchId);
  }, [branchId, selected, lockRemaining, loadEmployees]);

  const showResult = useCallback((r) => {
    setResult(r);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    if (r.kind !== "idle") {
      resultTimer.current = setTimeout(() => setResult(null), 12000);
    }
  }, []);

  function applyBranch() {
    const id = Number(branchInput);
    if (!id) return;
    localStorage.setItem(BRANCH_KEY, String(id));
    setBranchId(id);
    setResult(null);
  }

  function resetBranch() {
    localStorage.removeItem(BRANCH_KEY);
    setBranchId(null);
    setEmployees([]);
    setSelectedId("");
    setPin("");
    setResult(null);
  }

  async function submitPin() {
    if (!selected || busy) return;
    if (isPinLocked) {
      showResult({
        kind: "error",
        title: "PIN đang bị tạm khóa",
        lines: [
          ["Nhân viên", selected.fullName],
          ["Còn lại", lockRemaining || "Đang chờ mở khóa"],
          ["Hướng dẫn", "Liên hệ Quản lý chi nhánh / COO để mở khóa sớm."],
        ],
      });
      setPin("");
      return;
    }
    if (!selected.hasAssignedShift) {
      showResult({
        kind: "error",
        title: "Chưa được phân công ca",
        lines: [
          ["Nhân viên", selected.fullName],
          ["Lý do", "Chỉ nhân viên đã được gán ca làm việc mới check-in / check-out được."],
        ],
      });
      setPin("");
      return;
    }
    if (pin.length < PIN_LENGTH) {
      showResult({
        kind: "error",
        title: "PIN chưa đủ 4 chữ số",
        lines: [
          ["Nhân viên", selected.fullName],
          ["Vui lòng", "Nhập đủ 4 chữ số PIN cá nhân"],
        ],
      });
      return;
    }
    setBusy(true);
    const payload = { employeeId: selected.employeeId, pin, branchId };
    try {
      const dto = selected.isCheckedIn
        ? await attendanceApi.checkOut(payload)
        : await attendanceApi.checkIn(payload);
      showResult({
        kind: "success",
        title: dto.checkOutTime ? "Check-out thành công" : "Check-in thành công",
        lines: [
          ["Nhân viên", dto.employeeName || selected.fullName],
          ...(dto.checkOutTime
            ? [
                ["Giờ vào", formatTime(dto.checkInTime)],
                ["Giờ ra", formatTime(dto.checkOutTime)],
                ["Đã làm", `${dto.workedMinutes ?? 0} phút`],
              ]
            : [["Giờ vào", formatTime(dto.checkInTime)]]),
        ],
      });
      setPin("");
      await loadEmployees(branchId);
    } catch (err) {
      showResult({
        kind: "error",
        title: err.code === "PIN_LOCKED" ? "PIN đã bị tạm khóa" : "Không chấm công được",
        lines: [
          ["Nhân viên", selected.fullName],
          ["Lý do", err.message || "Đã xảy ra lỗi."],
        ],
      });
      setPin("");
      await loadEmployees(branchId);
    } finally {
      setBusy(false);
    }
  }

  async function submitCard(e) {
    e.preventDefault();
    if (!cardCode.trim() || busy || !branchId) return;
    setBusy(true);
    try {
      const dto = await attendanceApi.cardSwipe({ cardCode: cardCode.trim(), branchId });
      showResult({
        kind: "success",
        title: dto.checkOutTime ? "Check-out bằng thẻ thành công" : "Check-in bằng thẻ thành công",
        lines: [
          ["Nhân viên", dto.employeeName || ""],
          ...(dto.checkOutTime
            ? [
                ["Giờ vào", formatTime(dto.checkInTime)],
                ["Giờ ra", formatTime(dto.checkOutTime)],
                ["Đã làm", `${dto.workedMinutes ?? 0} phút`],
              ]
            : [["Giờ vào", formatTime(dto.checkInTime)]]),
        ],
      });
      setCardCode("");
      if (dto.employeeId) setSelectedId(String(dto.employeeId));
      await loadEmployees(branchId);
    } catch (err) {
      showResult({
        kind: "error",
        title: "Không đọc được thẻ",
        lines: [["Lý do", err.message || "Thẻ không hợp lệ hoặc nhân viên chưa được gán ca."]],
      });
    } finally {
      setBusy(false);
    }
  }

  function pressKey(key) {
    if (busy || !canAttend) return;
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "OK") {
      submitPin();
      return;
    }
    setPin((p) => (p.length < PIN_LENGTH ? p + key : p));
  }

  const dateLine = now.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="kiosk">
      <section className="kiosk-left">
        <div className="d-flex justify-content-between align-items-center" style={{ position: "relative", zIndex: 1 }}>
          <div className="d-flex align-items-center gap-2" style={{ color: "var(--surface)", fontWeight: 600 }}>
            <span className="brand__mark">SC</span>
            <span>SCMS · Kiosk</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Button
              size="sm"
              variant="outline-light"
              onClick={() => navigate("/pos")}
              style={{ background: "transparent" }}
            >
              Quầy bán hàng (POS)
            </Button>
            <Button
              size="sm"
              variant="outline-light"
              onClick={() => navigate("/login")}
              style={{ background: "transparent" }}
            >
              Đăng nhập
            </Button>
          </div>
        </div>

        <div className="kiosk-clock-wrap">
          <div className="time">
            {now.toLocaleTimeString("vi-VN", { hour12: false })}
          </div>
          <div className="date">{dateLine}</div>
          <div className="server-note">
            Đồng hồ hệ thống{branchId ? ` · Kiosk chi nhánh #${branchId}` : " · Chưa thiết lập chi nhánh"}
          </div>
        </div>

        <div className="kiosk-reader">
          <div className="kiosk-reader__status">
            <span className="kiosk-reader__dot" />
            Đầu đọc RFID/QR sẵn sàng
          </div>
          <p>Quẹt thẻ nhân viên hoặc nhập PIN 4 số để chấm công (yêu cầu đã phân ca).</p>
          <Form onSubmit={submitCard}>
            <Form.Control
              value={cardCode}
              onChange={(e) => setCardCode(e.target.value)}
              placeholder="Mã thẻ — quẹt hoặc nhập rồi nhấn Enter"
              disabled={!branchId || busy}
            />
            <Button
              type="submit"
              variant="outline-light"
              className="mt-2"
              disabled={!branchId || busy || !cardCode.trim()}
              style={{ background: "transparent" }}
            >
              Quẹt thẻ
            </Button>
          </Form>
        </div>
      </section>

      <section className="kiosk-right">
        <div className="kiosk-panel">
          <div className="page-code mb-2">
            SCR-02 <b>ATTENDANCE KIOSK</b>
          </div>
          <h1>Chấm công ca làm</h1>
          <p>Chọn nhân viên đã phân ca, nhập PIN 4 số và xác nhận check-in/check-out.</p>

          {!branchId ? (
            <div>
              <Form.Group className="mb-3">
                <Form.Label>Thiết lập kiosk — ID chi nhánh</Form.Label>
                <Form.Control
                  size="lg"
                  type="number"
                  min="1"
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  placeholder="Ví dụ: 1"
                />
                <Form.Text className="text-muted">
                  ID chi nhánh được quản trị viên cung cấp khi lắp máy kiosk; thiết lập được lưu trên máy
                  này.
                </Form.Text>
              </Form.Group>
              <Button variant="primary" size="lg" className="w-100" onClick={applyBranch} disabled={!branchInput}>
                Bắt đầu chấm công
              </Button>
            </div>
          ) : (
            <>
              <Form.Group className="mb-2">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                  <Form.Label className="mb-0">
                    Nhân viên ({assignedCount}/{employees.length} đã gán ca)
                  </Form.Label>
                  <Form.Check
                    type="switch"
                    id="kiosk-only-assigned"
                    label="Chỉ hiện người có ca"
                    checked={onlyAssigned}
                    onChange={(e) => setOnlyAssigned(e.target.checked)}
                    className="small mb-0"
                    disabled={loadingEmployees || employees.length === 0}
                  />
                </div>
                <Form.Select
                  size="lg"
                  value={selectedId}
                  disabled={loadingEmployees || displayedEmployees.length === 0}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setPin("");
                    setResult(null);
                  }}
                >
                  {displayedEmployees.length === 0 ? (
                    <option value="">
                      {onlyAssigned
                        ? "Chưa có nhân viên nào được phân ca hôm nay"
                        : "Chưa có nhân viên ở chi nhánh này"}
                    </option>
                  ) : (
                    displayedEmployees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.fullName} · {POSITION_LABELS[e.role] || e.role} —{" "}
                        {e.hasAssignedShift ? e.shiftLabel || "Đã gán ca" : "Chưa gán ca"}
                        {e.pinLocked ? " (Tạm khóa PIN)" : ""}
                      </option>
                    ))
                  )}
                </Form.Select>
                <Form.Text className="text-muted">
                  {employeeError
                    ? employeeError
                    : selected
                      ? `${selected.fullName} · Chi nhánh #${branchId}${selected.shiftLabel ? ` · ${selected.shiftLabel}` : ""}`
                      : loadingEmployees
                        ? "Đang tải danh sách…"
                        : onlyAssigned
                          ? "Chưa có nhân viên nào được phân ca phù hợp."
                          : "Chưa có nhân viên ở chi nhánh này."}
                </Form.Text>
              </Form.Group>

              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2">
                <span className="small text-muted">
                  {selected
                    ? isPinLocked
                      ? `PIN đang tạm khóa (còn ${lockRemaining})`
                      : !selected.hasAssignedShift
                        ? "Không có phân công ca phù hợp"
                        : selected.isCheckedIn
                          ? "Đang trong ca — OK để check-out"
                          : "Chưa vào ca — OK để check-in"
                    : ""}
                </span>
                {selected ? (
                  <div className="d-flex align-items-center gap-1 flex-wrap">
                    {selected.hasAssignedShift ? (
                      <StatusTag
                        status={selected.shiftStatus || "SCHEDULED"}
                        variant={selected.shiftStatus === "OPEN" ? "success" : "neutral"}
                        label={selected.shiftStatus === "OPEN" ? "Ca đang mở" : selected.shiftStatus === "CLOSED" ? "Ca vừa đóng" : "Đã phân ca"}
                      />
                    ) : (
                      <StatusTag status="UNASSIGNED" variant="warn" label="Chưa gán ca" />
                    )}
                    {isPinLocked ? (
                      <StatusTag status="PIN_LOCKED" variant="warn" label={`Khóa PIN · ${lockRemaining}`} />
                    ) : null}
                    <StatusTag
                      status={selected.isCheckedIn ? "ACTIVE" : "INACTIVE"}
                      label={selected.isCheckedIn ? "Trong ca" : "Chưa vào ca"}
                    />
                  </div>
                ) : null}
              </div>

              {selected && isPinLocked ? (
                <div className="notice notice--warn mt-2 mb-1">
                  <strong>!</strong>
                  <div className="flex-grow-1">
                    <div>
                      Mã PIN của <strong>{selected.fullName}</strong> đang bị tạm khóa (còn{" "}
                      <strong className="mono">{lockRemaining}</strong>) do nhập sai quá 3 lần. Liên hệ Quản lý chi nhánh hoặc COO để mở khóa sớm.
                    </div>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      className="mt-2"
                      onClick={() => loadEmployees(branchId)}
                      disabled={loadingEmployees}
                    >
                      Kiểm tra lại trạng thái mở khóa
                    </Button>
                  </div>
                </div>
              ) : selected && !selected.hasAssignedShift ? (
                <div className="notice notice--warn mt-2 mb-1">
                  <strong>!</strong>
                  <span>
                    {selected.fullName} chưa được phân công ca làm việc phù hợp hôm nay — chỉ nhân viên được gán ca mới check-in / check-out được.
                  </span>
                </div>
              ) : null}

              <div className="pin-display" aria-label="PIN 4 số đã nhập">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`pin-dot ${i < pin.length ? "filled" : ""}`} />
                ))}
              </div>

              <div className="numpad">
                {NUMPAD.map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-key={key}
                    disabled={!selected || !canAttend || busy}
                    onClick={() => pressKey(key)}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {result ? (
                <div className="result-banner">
                  <div className="result-banner__title">
                    <span className="result-banner__mark">
                      {result.kind === "error" ? "!" : result.kind === "success" ? "✓" : "i"}
                    </span>
                    {result.title}
                  </div>
                  <div className="result-banner__meta">
                    {result.lines.map(([k, v]) => (
                      <span key={k}>
                        {k}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="result-banner">
                  <div className="result-banner__title">
                    <span className="result-banner__mark">i</span>
                    Chờ thao tác
                  </div>
                  <div className="result-banner__meta">
                    <span>
                      Trạng thái:{" "}
                      <strong>
                        {selected && isPinLocked
                          ? `PIN đang tạm khóa (${lockRemaining})`
                          : selected && !selected.hasAssignedShift
                            ? "Chưa được phân ca"
                            : "Sẵn sàng nhận PIN 4 số"}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between align-items-center">
                <button type="button" className="kiosk-back" onClick={() => navigate("/login")}>
                  <Icon name="back" /> Về đăng nhập
                </button>
                <button type="button" className="kiosk-back" onClick={resetBranch}>
                  Đổi chi nhánh kiosk
                </button>
              </div>
              {busy ? (
                <div className="text-center mt-2">
                  <Spinner size="sm" className="me-2" /> Đang gửi…
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
