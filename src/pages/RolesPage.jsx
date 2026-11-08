import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner, Tab, Table, Tabs } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { rolesApi } from "../api/rolesApi.js";
import { usersApi } from "../api/usersApi.js";
import { POSITION_LABELS } from "./EmployeesPage.jsx";

// Nhãn + nhóm cho từng mã quyền của PermissionCatalog (backend).
const PERMISSION_META = {
  BRANCH_MANAGE: ["Quản trị chuỗi", "Quản lý chi nhánh"],
  MANAGER_MANAGE: ["Quản trị chuỗi", "Quản lý tài khoản quản lý"],
  ROLE_ASSIGN: ["Quản trị chuỗi", "Gán vai trò & phân quyền"],
  SETTINGS_MANAGE: ["Quản trị chuỗi", "Quản lý cấu hình"],
  SYNC_PUBLISH: ["Quản trị chuỗi", "Đồng bộ & phát hành"],
  AUDIT_VIEW: ["Quản trị chuỗi", "Xem nhật ký kiểm toán"],
  MENU_MANAGE: ["Menu & bán hàng", "Quản lý menu & BOM"],
  VOUCHER_MANAGE: ["Menu & bán hàng", "Quản lý voucher"],
  POS_OPERATE: ["Menu & bán hàng", "Vận hành POS"],
  ORDER_VIEW: ["Menu & bán hàng", "Xem đơn hàng"],
  REFUND_REQUEST: ["Menu & bán hàng", "Yêu cầu hoàn tiền"],
  REFUND_APPROVE: ["Menu & bán hàng", "Duyệt hoàn tiền"],
  EMPLOYEE_MANAGE: ["Nhân sự & ca", "Quản lý nhân viên"],
  SCHEDULE_MANAGE: ["Nhân sự & ca", "Quản lý lịch làm việc"],
  SHIFT_MANAGE: ["Nhân sự & ca", "Quản lý ca"],
  SHIFT_OPEN: ["Nhân sự & ca", "Mở ca"],
  SHIFT_CLOSE: ["Nhân sự & ca", "Đóng ca"],
  ATTENDANCE_ADJUST: ["Nhân sự & ca", "Điều chỉnh chấm công"],
  KIOSK_ATTENDANCE: ["Nhân sự & ca", "Chấm công tại kiosk"],
  PAYROLL_MANAGE: ["Nhân sự & ca", "Quản lý lương"],
  PAYROLL_APPROVE: ["Nhân sự & ca", "Duyệt lương"],
  INVENTORY_MANAGE: ["Kho & tiền", "Quản lý kho"],
  STOCK_APPROVE: ["Kho & tiền", "Duyệt kho"],
  CASH_IN_OUT: ["Kho & tiền", "Thu / chi tiền mặt"],
  CASH_APPROVE: ["Kho & tiền", "Duyệt thu / chi"],
  REPORT_VIEW: ["Báo cáo", "Xem báo cáo"],
};

const GROUP_ORDER = ["Quản trị chuỗi", "Menu & bán hàng", "Nhân sự & ca", "Kho & tiền", "Báo cáo", "Khác"];

// SCR-16 · TAB-09 — Vai trò & phân quyền (FE-12). Bố cục bám
// prototype (settings > permissions): tab con theo vai trò + panel
// "Ma trận phân quyền · {vai trò}" với bảng quyền theo nhóm.
// Khác prototype theo backend: danh mục quyền là các mã phẳng của
// PermissionCatalog (không phải ma trận hành động theo màn hình);
// sửa phân quyền mặc định TẮT kèm cảnh báo backend chỉ lưu trong
// bộ nhớ — bật lên mới sửa và lưu được qua API.
export default function RolesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const menu = buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [roles, setRoles] = useState([]);
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]); // permissions đang sửa
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignRoleCode, setAssignRoleCode] = useState("");
  const [assigning, setAssigning] = useState(false);

  const loadRoles = useCallback(async () => {
    try {
      const data = await rolesApi.list();
      const list = Array.isArray(data) ? data : [];
      setRoles(list);
      setActiveRoleId((prev) => prev ?? list[0]?.roleId ?? null);
      return list;
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách vai trò.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const page = await usersApi.list({ uiPage: 1, size: 100 });
      setEmployees(page.items || []);
    } catch {
      setEmployees([]);
    }
  }, []);

  useEffect(() => {
    loadRoles();
    loadEmployees();
  }, [loadRoles, loadEmployees]);

  const activeRole = roles.find((r) => r.roleId === activeRoleId) || null;

  const grouped = useMemo(() => {
    if (!activeRole) return [];
    const assigned = new Set(editing ? draft : activeRole.permissions || []);
    const allCodes = new Set([...(activeRole.permissions || []), ...Object.keys(PERMISSION_META), ...draft]);
    const byGroup = new Map();
    for (const code of allCodes) {
      const [group, label] = PERMISSION_META[code] || ["Khác", code];
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push({ code, label, granted: assigned.has(code) });
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      items: byGroup.get(g).sort((a, b) => a.label.localeCompare(b.label, "vi")),
    }));
  }, [activeRole, editing, draft]);

  function startEditing() {
    setDraft([...(activeRole?.permissions || [])]);
    setEditing(true);
  }

  function togglePermission(code, checked) {
    setDraft((d) => (checked ? [...new Set([...d, code])] : d.filter((c) => c !== code)));
  }

  async function savePermissions() {
    if (!activeRole || saving) return;
    setSaving(true);
    try {
      await rolesApi.updatePermissions(activeRole.roleId, draft);
      toast.success(`Đã lưu phân quyền cho ${activeRole.name}. Thay đổi mất khi backend khởi động lại.`);
      setEditing(false);
      await loadRoles();
    } catch (err) {
      toast.error(err.message || "Không lưu được phân quyền.");
    } finally {
      setSaving(false);
    }
  }

  async function runAssign() {
    if (!assignEmployeeId || !assignRoleCode || assigning) return;
    setAssigning(true);
    try {
      const updated = await rolesApi.assign(Number(assignEmployeeId), assignRoleCode);
      toast.success(
        `Đã gán vai trò ${POSITION_LABELS[assignRoleCode] || assignRoleCode} cho ${updated.fullName}. Hiệu lực từ phiên làm việc tiếp theo.`,
      );
      setAssignEmployeeId("");
      setAssignRoleCode("");
      await Promise.all([loadRoles(), loadEmployees()]);
    } catch (err) {
      toast.error(err.message || "Không gán được vai trò.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Vai trò & phân quyền"
        screenCode="SCR-16 · TAB-09"
        description="Ma trận quyền theo vai trò và gán vai trò cho nhân viên."
      />

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : roles.length === 0 ? (
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Không tải được danh sách vai trò.</span>
          </div>
        </div>
      ) : (
        <>
          <Tabs
            activeKey={activeRoleId ?? undefined}
            onSelect={(k) => {
              setActiveRoleId(Number(k));
              setEditing(false);
            }}
            id="role-tabs"
            className="mb-3"
          >
            {roles.map((r) => (
              <Tab
                key={r.roleId}
                eventKey={r.roleId}
                title={`${POSITION_LABELS[r.code] || r.name} (${r.userCount})`}
              />
            ))}
          </Tabs>

          {activeRole ? (
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Ma trận phân quyền · {POSITION_LABELS[activeRole.code] || activeRole.name}</h2>
                  <p>
                    {activeRole.description || "Danh sách quyền chức năng của vai trò."} Việc kiểm soát
                    truy cập thật nằm ở backend theo vai trò; ma trận này là lớp quyền chức năng đi kèm.
                  </p>
                </div>
                <StatusTag
                  status="ACTIVE"
                  label={`${(activeRole.permissions || []).length} quyền · ${activeRole.userCount} người dùng`}
                />
              </div>

              <div className="d-flex align-items-center gap-3 mb-3">
                <Form.Check
                  type="switch"
                  id="toggle-edit-permissions"
                  label="Chỉnh sửa phân quyền"
                  checked={editing}
                  onChange={(e) => (e.target.checked ? startEditing() : setEditing(false))}
                />
                {!editing ? (
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    Đang ở chế độ xem. Bật chỉnh sửa để thay đổi quyền của vai trò này.
                  </span>
                ) : null}
              </div>

              {editing ? (
                <div className="notice notice--warn mb-3">
                  <span>
                    <strong>Cảnh báo:</strong> backend hiện lưu phân quyền trong bộ nhớ — thay đổi sẽ{" "}
                    <strong>mất khi hệ thống khởi động lại</strong> và không thay đổi cơ chế kiểm soát
                    truy cập theo vai trò. Chỉ lưu khi bạn chấp nhận giới hạn này.
                  </span>
                </div>
              ) : null}

              <div className="table-responsive">
                <Table hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Quyền</th>
                      <th>Mã quyền</th>
                      <th style={{ width: 110 }} className="text-center">
                        Áp dụng
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(({ group, items }) => (
                      <Fragment key={group}>
                        <tr>
                          <td colSpan={3} style={{ background: "var(--paper)", fontWeight: 700, fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase" }}>
                            {group}
                          </td>
                        </tr>
                        {items.map((item) => (
                          <tr key={item.code}>
                            <td>{item.label}</td>
                            <td className="mono">{item.code}</td>
                            <td className="text-center">
                              <Form.Check
                                type="checkbox"
                                checked={item.granted}
                                disabled={!editing}
                                onChange={(e) => togglePermission(item.code, e.target.checked)}
                                aria-label={`${item.label} cho ${activeRole.name}`}
                              />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
              </div>

              {editing ? (
                <div className="form-actions">
                  <Button variant="outline-secondary" onClick={() => setEditing(false)} disabled={saving}>
                    Hủy
                  </Button>
                  <Button variant="primary" onClick={savePermissions} disabled={saving}>
                    {saving ? <Spinner size="sm" className="me-2" /> : null}
                    Lưu phân quyền
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Gán vai trò cho nhân viên</h2>
                <p>Vai trò mới có hiệu lực từ phiên làm việc tiếp theo của nhân viên.</p>
              </div>
            </div>
            <div className="d-flex gap-2 align-items-end flex-wrap">
              <div style={{ flex: 1, minWidth: 260 }}>
                <Form.Label>Nhân viên</Form.Label>
                <Form.Select value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)}>
                  <option value="">— Chọn nhân viên —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} · {POSITION_LABELS[emp.roleCode] || emp.roleCode} ·{" "}
                      {emp.branchName || "Toàn chuỗi"}
                    </option>
                  ))}
                </Form.Select>
              </div>
              <div style={{ minWidth: 200 }}>
                <Form.Label>Vai trò mới</Form.Label>
                <Form.Select value={assignRoleCode} onChange={(e) => setAssignRoleCode(e.target.value)}>
                  <option value="">— Chọn vai trò —</option>
                  {roles.map((r) => (
                    <option key={r.roleId} value={r.code}>
                      {POSITION_LABELS[r.code] || r.name}
                    </option>
                  ))}
                </Form.Select>
              </div>
              <Button variant="primary" onClick={runAssign} disabled={assigning || !assignEmployeeId || !assignRoleCode}>
                {assigning ? <Spinner size="sm" className="me-2" /> : null}
                Gán vai trò
              </Button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
