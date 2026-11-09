import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Col, Form, Row, Spinner } from "react-bootstrap";
import Icon from "../Icon.jsx";
import StatusTag from "../StatusTag.jsx";
import { useToast } from "../ToastContext.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { branchesApi } from "../../api/branchesApi.js";
import { authApi } from "../../api/authApi.js";

const PIN_LENGTH = 4;
const NUMPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"];
const POS_BRANCH_KEY = "scms_pos_branch_id";

function formatLockRemaining(untilIso, nowMs) {
  if (!untilIso) return null;
  const diffSec = Math.ceil((new Date(untilIso).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return null;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function sortCashiers(items) {
  return [...items].sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "vi"));
}

// Khung mở khóa ca & két tiền cho Thu ngân bằng PIN 4 số ngay tại #/branch/shifts
// (không cần username/mật khẩu; Quản lý chi nhánh / COO vẫn có thể đăng nhập riêng).
export default function CashierPinUnlockPanel({ initialBranchId = null, onBranchLabelChange }) {
  const { loginWithPin } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();

  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [branchId, setBranchId] = useState(() => {
    if (initialBranchId) return Number(initialBranchId);
    const saved = localStorage.getItem(POS_BRANCH_KEY);
    return saved ? Number(saved) : null;
  });

  const [cashiers, setCashiers] = useState([]);
  const [loadingCashiers, setLoadingCashiers] = useState(false);
  const [cashierLoadError, setCashierLoadError] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredReloadRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoadingBranches(true);
    branchesApi
      .list({ uiPage: 1, size: 100, sortBy: "name", sortDir: "ASC" })
      .then((res) => {
        if (!alive) return;
        const open = (res.items || []).filter((b) => b.status === "OPEN");
        setBranches(open);
        if (open.length > 0) {
          const fromProp = initialBranchId ? open.find((b) => b.id === Number(initialBranchId)) : null;
          const savedRaw = localStorage.getItem(POS_BRANCH_KEY);
          const fromSaved = savedRaw ? open.find((b) => String(b.id) === savedRaw) : null;
          const chosen = fromProp || fromSaved || open[0];
          setBranchId(chosen.id);
          localStorage.setItem(POS_BRANCH_KEY, String(chosen.id));
        }
      })
      .catch((err) => {
        if (alive) setErrorMsg(err.message || "Không tải được danh sách chi nhánh.");
      })
      .finally(() => {
        if (alive) setLoadingBranches(false);
      });
    return () => {
      alive = false;
    };
  }, [initialBranchId]);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId) || null,
    [branches, branchId],
  );

  useEffect(() => {
    onBranchLabelChange?.(selectedBranch?.name);
  }, [selectedBranch, onBranchLabelChange]);

  const loadCashiers = useCallback(async (targetBranchId, { preserveError = false } = {}) => {
    if (!targetBranchId) {
      setCashiers([]);
      setSelectedEmpId("");
      return;
    }
    setLoadingCashiers(true);
    setCashierLoadError("");
    if (!preserveError) setErrorMsg("");
    try {
      const list = await authApi.cashiers(targetBranchId);
      const sorted = sortCashiers(Array.isArray(list) ? list : []);
      setCashiers(sorted);
      setSelectedEmpId((cur) => {
        if (cur && sorted.some((c) => String(c.employeeId) === String(cur))) return cur;
        const preferred = sorted.find((c) => c.hasPin && !c.pinLocked) || sorted[0];
        return preferred ? String(preferred.employeeId) : "";
      });
    } catch (err) {
      setCashiers([]);
      setSelectedEmpId("");
      setCashierLoadError(err.message || "Không tải được danh sách thu ngân của chi nhánh.");
    } finally {
      setLoadingCashiers(false);
    }
  }, []);

  useEffect(() => {
    if (branchId) {
      loadCashiers(branchId);
    }
  }, [branchId, loadCashiers]);

  const selectedCashier = useMemo(
    () => cashiers.find((c) => String(c.employeeId) === String(selectedEmpId)) || null,
    [cashiers, selectedEmpId],
  );

  const lockRemaining = selectedCashier?.pinLocked
    ? formatLockRemaining(selectedCashier.pinLockedUntil, nowMs)
    : null;
  const isPinLocked = Boolean(selectedCashier?.pinLocked && lockRemaining);
  const canUnlock = Boolean(selectedCashier && selectedCashier.hasPin && !isPinLocked);
  const hasAnyLocked = cashiers.some((c) => c.pinLocked);

  useEffect(() => {
    if (!branchId || !hasAnyLocked) return undefined;
    setNowMs(Date.now());
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    const poll = setInterval(() => {
      loadCashiers(branchId, { preserveError: true });
    }, 10000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [branchId, hasAnyLocked, loadCashiers]);

  useEffect(() => {
    if (!branchId || !selectedCashier?.pinLocked || !selectedCashier?.pinLockedUntil) return;
    if (lockRemaining) return;
    const key = `${selectedCashier.employeeId}:${selectedCashier.pinLockedUntil}`;
    if (expiredReloadRef.current === key) return;
    expiredReloadRef.current = key;
    loadCashiers(branchId, { preserveError: true });
  }, [branchId, selectedCashier, lockRemaining, loadCashiers]);

  const submitPin = useCallback(async () => {
    if (!branchId || !selectedCashier || busy) return;
    if (!selectedCashier.hasPin) {
      setErrorMsg(
        `Thu ngân ${selectedCashier.fullName} chưa được cấp mã PIN 4 số. Liên hệ Quản lý chi nhánh để thiết lập PIN.`,
      );
      return;
    }
    if (isPinLocked) {
      setErrorMsg(
        `Mã PIN của ${selectedCashier.fullName} đang tạm khóa (còn ${lockRemaining}). Liên hệ Quản lý chi nhánh hoặc COO để mở khóa sớm.`,
      );
      setPin("");
      return;
    }
    if (pin.length !== PIN_LENGTH) {
      setErrorMsg("Vui lòng nhập đủ 4 chữ số mã PIN.");
      return;
    }

    setBusy(true);
    setErrorMsg("");
    try {
      const res = await loginWithPin({
        branchId: Number(branchId),
        employeeId: Number(selectedCashier.employeeId),
        pin,
      });
      toast.success(`Đã mở khóa ca & két tiền cho ${res?.user?.fullName || selectedCashier.fullName}.`);
      setPin("");
    } catch (err) {
      setErrorMsg(err.message || "Mã PIN không đúng hoặc không thể xác thực.");
      setPin("");
      await loadCashiers(branchId, { preserveError: true });
    } finally {
      setBusy(false);
    }
  }, [branchId, selectedCashier, busy, isPinLocked, lockRemaining, pin, loginWithPin, toast, loadCashiers]);

  const pressKey = useCallback(
    (key) => {
      if (busy || !canUnlock) return;
      setErrorMsg("");
      if (key === "C") {
        setPin("");
        return;
      }
      if (key === "OK") {
        submitPin();
        return;
      }
      setPin((prev) => (prev.length < PIN_LENGTH ? prev + key : prev));
    },
    [busy, canUnlock, submitPin],
  );

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pressKey(e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPin("");
        return;
      }
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A") {
        e.preventDefault();
        pressKey("OK");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pressKey]);

  return (
    <Row className="g-3 align-items-start">
      <Col lg={6}>
        <div className="scms-panel panel-pad">
          <div className="panel-head">
            <div>
              <h2>Mở khóa Thu ngân bằng PIN</h2>
              <p>Chọn chi nhánh &amp; thu ngân đang đứng quầy, sau đó nhập PIN 4 số để kiểm két.</p>
            </div>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>Chi nhánh mở ca</Form.Label>
            <Form.Select
              value={branchId || ""}
              disabled={loadingBranches || branches.length === 0 || busy}
              onChange={(e) => {
                const next = Number(e.target.value);
                setBranchId(next);
                localStorage.setItem(POS_BRANCH_KEY, String(next));
                setPin("");
                setErrorMsg("");
              }}
            >
              {branches.length === 0 ? (
                <option value="">
                  {loadingBranches ? "Đang tải chi nhánh…" : "Không có chi nhánh nào đang mở"}
                </option>
              ) : (
                branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))
              )}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-2">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <Form.Label className="mb-0">Thu ngân tại quầy</Form.Label>
              {selectedCashier ? (
                !selectedCashier.hasPin ? (
                  <StatusTag status="UNASSIGNED" variant="warn" label="Chưa cấp PIN" />
                ) : isPinLocked ? (
                  <StatusTag status="PIN_LOCKED" variant="warn" label={`Khóa PIN · ${lockRemaining}`} />
                ) : (
                  <StatusTag status="ACTIVE" variant="success" label="Sẵn sàng mở khóa" />
                )
              ) : null}
            </div>
            <Form.Select
              value={selectedEmpId}
              disabled={loadingCashiers || cashiers.length === 0 || busy}
              onChange={(e) => {
                setSelectedEmpId(e.target.value);
                setPin("");
                setErrorMsg("");
              }}
            >
              {cashiers.length === 0 ? (
                <option value="">
                  {loadingCashiers ? "Đang tải danh sách thu ngân…" : "Chi nhánh chưa có thu ngân hoạt động"}
                </option>
              ) : (
                cashiers.map((c) => (
                  <option key={c.employeeId} value={c.employeeId}>
                    {c.fullName}
                    {!c.hasPin ? " (Chưa cấp PIN)" : c.pinLocked ? " (Tạm khóa PIN)" : ""}
                  </option>
                ))
              )}
            </Form.Select>
            {cashierLoadError ? <div className="field-error mt-1">{cashierLoadError}</div> : null}
          </Form.Group>

          {selectedCashier && !selectedCashier.hasPin ? (
            <div className="notice notice--warn mt-3">
              <strong>!</strong>
              <span>
                {selectedCashier.fullName} chưa được thiết lập mã PIN 4 số. Quản lý chi nhánh có thể cấp PIN trong mục{" "}
                <strong>Nhân viên</strong>.
              </span>
            </div>
          ) : selectedCashier && isPinLocked ? (
            <div className="notice notice--warn mt-3">
              <strong>!</strong>
              <div className="flex-grow-1">
                <div>
                  Mã PIN của <strong>{selectedCashier.fullName}</strong> đang bị tạm khóa (còn{" "}
                  <strong className="mono">{lockRemaining}</strong>). Liên hệ Quản lý chi nhánh / COO để mở khóa sớm.
                </div>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  className="mt-2"
                  onClick={() => loadCashiers(branchId, { preserveError: true })}
                  disabled={loadingCashiers}
                >
                  Kiểm tra lại trạng thái mở khóa
                </Button>
              </div>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="notice notice--warn mt-3">
              <strong>!</strong>
              <span>{errorMsg}</span>
            </div>
          ) : null}

          <div className="pin-display mt-3" aria-label="Mã PIN thu ngân 4 số">
            {[0, 1, 2, 3].map((idx) => (
              <span key={idx} className={`pin-dot ${idx < pin.length ? "filled" : ""}`} />
            ))}
          </div>

          <div className="numpad">
            {NUMPAD.map((key) => (
              <button
                key={key}
                type="button"
                data-key={key}
                disabled={!canUnlock || busy}
                onClick={() => pressKey(key)}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="small text-muted-scms mt-2">
            Có thể bấm trực tiếp trên phím số bàn phím (<span className="mono">0–9</span>,{" "}
            <span className="mono">Backspace</span>, <span className="mono">Enter</span>).
          </div>

          {busy ? (
            <div className="text-center mt-2">
              <Spinner size="sm" className="me-2" /> Đang xác thực PIN…
            </div>
          ) : null}
        </div>
      </Col>

      <Col lg={6}>
        <div className="scms-panel panel-pad">
          <div className="panel-head">
            <div>
              <h2>Quyền hạn kiểm két &amp; bàn giao ca</h2>
              <p>Phân quyền rõ ràng giữa Thu ngân tại quầy và Quản lý chi nhánh / COO.</p>
            </div>
          </div>

          <ul className="mb-3 ps-3 small" style={{ lineHeight: 1.7 }}>
            <li>
              <strong>Kiểm két đầu ca:</strong> Thu ngân đếm tiền mặt thực tế trong két và đối chiếu trực tiếp với{" "}
              <strong>kết ca trước</strong>. Nếu có chênh lệch, hệ thống cảnh báo và yêu cầu ghi rõ lý do trước khi mở ca.
            </li>
            <li>
              <strong>Bán hàng POS &amp; tiền thối:</strong> Thu tiền mặt và trả tiền thừa cho khách trên đơn thuộc luồng thanh toán riêng —{" "}
              <strong>không phải rút tiền két thủ công</strong>.
            </li>
            <li>
              <strong>Kết thúc ca (Đóng ca):</strong> Thu ngân tự nhập số tiền thực đếm cuối ca để hệ thống chốt chênh lệch &amp; bàn giao cho ca sau.
            </li>
            <li>
              <strong>Nạp / Rút tiền mặt thủ công:</strong> Thu ngân <strong>không</strong> có quyền nạp hoặc rút tiền mặt khỏi két; chỉ{" "}
              <strong>Quản lý chi nhánh</strong> hoặc <strong>COO</strong> thực hiện được nghiệp vụ này.
            </li>
          </ul>

          <div className="d-flex gap-2 flex-wrap">
            <Button variant="primary" onClick={() => navigate("/login")}>
              Đăng nhập Quản lý / COO
            </Button>
            <Button variant="outline-secondary" onClick={() => navigate("/pos")}>
              <Icon name="back" size={14} /> Về quầy POS
            </Button>
          </div>
        </div>
      </Col>
    </Row>
  );
}
