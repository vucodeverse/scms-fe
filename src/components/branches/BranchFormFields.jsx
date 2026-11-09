import { Form } from "react-bootstrap";
import FormField from "../FormField.jsx";
import { RouteLink } from "../../router/HashRouter.jsx";
import { BRANCH_STATUS_LABELS } from "../../config/userConstants.js";

export default function BranchFormFields({
  form,
  setForm,
  editingId,
  fe,
  selectedManagerId,
  setSelectedManagerId,
  managerOptions,
}) {
  const isInactive = form.status === "INACTIVE";
  return (
    <div className="form-grid">
      <FormField label="Mã chi nhánh" required error={fe("code")}>
        <Form.Control
          value={form.code}
          disabled={!!editingId}
          maxLength={10}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="Ví dụ: CN02"
        />
      </FormField>
      <FormField label="Tên chi nhánh" required error={fe("name")}>
        <Form.Control
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ví dụ: SCMS Nguyễn Trãi"
        />
      </FormField>
      <FormField label="Địa chỉ" error={fe("address")} className="span-all">
        <Form.Control
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </FormField>
      <FormField label="Số điện thoại" error={fe("phone")}>
        <Form.Control
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="0xxxxxxxxx"
        />
      </FormField>
      <FormField label="Mã số thuế" error={fe("taxCode")}>
        <Form.Control
          value={form.taxCode}
          onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
        />
      </FormField>
      <FormField label="Email" error={fe("email")}>
        <Form.Control
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </FormField>
      <FormField label="Số bàn" error={fe("tableCount")}>
        <Form.Control
          type="number"
          min="0"
          step="1"
          value={form.tableCount}
          onChange={(e) => setForm({ ...form, tableCount: e.target.value })}
        />
      </FormField>
      <FormField label="Giờ mở cửa" required error={fe("openingTime")}>
        <Form.Control
          type="time"
          value={form.openingTime}
          onChange={(e) => setForm({ ...form, openingTime: e.target.value })}
        />
      </FormField>
      <FormField label="Giờ đóng cửa" required error={fe("closingTime")}>
        <Form.Control
          type="time"
          value={form.closingTime}
          onChange={(e) => setForm({ ...form, closingTime: e.target.value })}
        />
      </FormField>
      <FormField label="Trạng thái vận hành" error={fe("status")}>
        <Form.Select
          value={form.status}
          onChange={(e) => {
            const nextStatus = e.target.value;
            setForm({ ...form, status: nextStatus });
            if (nextStatus === "INACTIVE") setSelectedManagerId("");
          }}
        >
          {Object.entries(BRANCH_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Form.Select>
      </FormField>
      <FormField
        label="Quản lý phụ trách"
        error={fe("managerUserId")}
        help={
          isInactive ? (
            "Chi nhánh ngừng hoạt động không thể gắn quản lý."
          ) : (
            <>
              Chỉ chọn từ quản lý đang hoạt động và chưa gắn chi nhánh khác. Tạo tài khoản mới ở mục{" "}
              <RouteLink to="/chain/managers">Tài khoản quản lý</RouteLink>.
            </>
          )
        }
      >
        <Form.Select
          value={isInactive ? "" : selectedManagerId}
          disabled={isInactive}
          onChange={(e) => setSelectedManagerId(e.target.value)}
        >
          <option value="">— Chưa gán quản lý —</option>
          {managerOptions.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.label}
            </option>
          ))}
        </Form.Select>
      </FormField>
    </div>
  );
}
