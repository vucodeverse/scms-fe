import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import Icon from "../components/Icon.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { attendanceApi } from "../api/attendanceApi.js";
import { formatTime } from "../lib/format.js";
import { POSITION_LABELS } from "./EmployeesPage.jsx";

const BRANCH_KEY = "scms.kioskBranchId";
const NUMPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"];

// SCR-02 — Kiosk chấm công (FE-04), mô phỏng views-auth kiosk của
// prototype: panel trái mực với đồng hồ lớn + đầu đọc thẻ, panel
// phải chọn nhân viên, hiển thị PIN dạng chấm, numpad cảm ứng và
// banner kết quả. Nhân viên đang trong ca thì OK = check-out, chưa
// vào ca thì OK = check-in (đúng hành vi prototype). Kiosk không
// đăng nhập; chi nhánh được thiết lập một lần (query ?branchId=
// hoặc nhập tại máy) và lưu ở localStorage của máy kiosk.
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
      const items = Array.isArray(list) ? list : [];
      setEmployees(items);
      setSelectedId((prev) =>
        items.some((e) => String(e.employeeId) === String(prev))
          ? prev
          : items[0]
            ? String(items[0].employeeId)
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

  const selected = employees.find((e) => String(e.employeeId) === String(selectedId)) || null;

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
    if (!selected || busy || pin.length < 4) {
      if (selected && pin.length < 4) {
        showResult({
          kind: "error",
          title: "PIN chưa đủ 4 chữ số",
          lines: [
            ["Nhân viên", selected.fullName],
            ["Vui lòng", "Nhập đủ ít nhất 4 số"],
          ],
        });
      }
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
        title: "Không chấm công được",
        lines: [
          ["Nhân viên", selected.fullName],
          ["Lý do", err.message || "Đã xảy ra lỗi."],
        ],
      });
      setPin("");
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
        lines: [["Lý do", err.message || "Thẻ không hợp lệ ở chi nhánh này."]],
      });
    } finally {
      setBusy(false);
    }
  }

  function pressKey(key) {
    if (busy) return;
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "OK") {
      submitPin();
      return;
    }
    setPin((p) => (p.length < 6 ? p + key : p));
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
          <Button
            size="sm"
            variant="outline-light"
            onClick={() => navigate("/login")}
            style={{ background: "transparent" }}
          >
            Đăng nhập
          </Button>
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
          <p>Quẹt thẻ nhân viên hoặc nhập PIN 4 số để chấm công.</p>
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
          <p>Chọn nhân viên, nhập PIN và xác nhận check-in/check-out.</p>

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
                <Form.Label>Nhân viên</Form.Label>
                <Form.Select
                  size="lg"
                  value={selectedId}
                  disabled={loadingEmployees || employees.length === 0}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setPin("");
                    setResult(null);
                  }}
                >
                  {employees.map((e) => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.fullName} · {POSITION_LABELS[e.role] || e.role}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  {employeeError
                    ? employeeError
                    : selected
                      ? `${selected.fullName} · Chi nhánh #${branchId}`
                      : loadingEmployees
                        ? "Đang tải danh sách…"
                        : "Chưa có nhân viên ở chi nhánh này."}
                </Form.Text>
              </Form.Group>

              <div className="d-flex justify-content-between align-items-center mt-2">
                <span className="small text-muted">
                  {selected
                    ? selected.isCheckedIn
                      ? "Đang trong ca — OK để check-out"
                      : "Chưa vào ca — OK để check-in"
                    : ""}
                </span>
                {selected ? (
                  selected.isCheckedIn ? (
                    <StatusTag status="ACTIVE" label="Trong ca" />
                  ) : (
                    <StatusTag status="INACTIVE" label="Chưa vào ca" />
                  )
                ) : null}
              </div>

              <div className="pin-display" aria-label="PIN đã nhập">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={`pin-dot ${i < pin.length ? "filled" : ""}`} />
                ))}
              </div>

              <div className="numpad">
                {NUMPAD.map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-key={key}
                    disabled={!selected || busy}
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
                      Kết quả: <strong>Sẵn sàng nhận PIN</strong>
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
