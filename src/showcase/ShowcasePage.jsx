import { useState } from "react";
import { Button, Form, Tab, Tabs } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import AuthLayout from "../layouts/AuthLayout.jsx";
import KioskLayout from "../layouts/KioskLayout.jsx";
import TaskLayout from "../layouts/TaskLayout.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import DataTable from "../components/DataTable.jsx";
import FormField from "../components/FormField.jsx";
import KpiStrip from "../components/KpiStrip.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { formatDateTime, formatVnd } from "../lib/format.js";
import { useRouter } from "../router/HashRouter.jsx";

// Trang trưng bày nội bộ của FE-01 (route /_showcase) — chỉ phục vụ
// kiểm chứng design system khi phát triển, không phải màn hình nghiệp vụ.

const MENU = [
  {
    group: "Design system",
    items: [
      { key: "admin", label: "Admin shell + components", path: "/_showcase" },
      { key: "session", label: "Phiên đăng nhập (FE-02)", path: "/_showcase/session" },
      { key: "auth", label: "Auth shell", path: "/_showcase/auth" },
      { key: "kiosk", label: "Kiosk shell", path: "/_showcase/kiosk" },
      { key: "task", label: "Task shell", path: "/_showcase/task" },
    ],
  },
];

const DEMO_ROWS = [
  { code: "ST-01", name: "Trạng thái đang hoạt động", status: "ACTIVE", amount: 45000, at: "2026-11-06T08:30:00" },
  { code: "ST-02", name: "Trạng thái tạm ngưng", status: "INACTIVE", amount: 120000, at: "2026-11-06T09:15:00" },
  { code: "ST-03", name: "Trạng thái cảnh báo", status: "UNAVAILABLE", amount: 0, at: "2026-11-06T10:00:00" },
  { code: "ST-04", name: "Trạng thái đã hết hạn", status: "EXPIRED", amount: 99000, at: "2026-11-06T11:45:00" },
];

export function ShowcaseAdminPage() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);

  return (
    <AdminLayout menu={MENU} branchName="Chi nhánh mẫu" screenCode="FE-01">
      <PageHeader
        title="Design system"
        screenCode="FE-01"
        description="Components chuẩn theo tài liệu thiết kế của prototype."
        actions={<Button variant="primary" onClick={() => toast.success("Toast mẫu: thao tác thành công.")}>Hành động chính</Button>}
      />

      <div className="mb-4">
        <KpiStrip
          items={[
            { label: "Chỉ số mẫu A", value: "128", sub: "Đơn vị mẫu" },
            { label: "Chỉ số mẫu B", value: formatVnd(1250000), sub: "Định dạng tiền vi-VN" },
            { label: "Chỉ số mẫu C", value: "97,5%", sub: "Số liệu dạng tabular" },
          ]}
        />
      </div>

      <Tabs defaultActiveKey="components" className="mb-3">
        <Tab eventKey="components" title="Components">
          <div className="scms-panel p-4 mb-4">
            <h2 className="mb-3">Nút bấm</h2>
            <div className="d-flex gap-2 flex-wrap">
              <Button variant="primary">Nút chính (ink)</Button>
              <Button variant="primary">Hành động chính (accent)</Button>
              <Button variant="outline-secondary">Nút phụ</Button>
              <Button variant="danger">Hành động phá hủy</Button>
              <Button variant="primary" disabled>
                Đang khóa
              </Button>
            </div>
            <h2 className="mt-4 mb-3">Tag trạng thái</h2>
            <div className="d-flex gap-2 flex-wrap">
              <StatusTag status="ACTIVE" label="Đang hoạt động" />
              <StatusTag status="INACTIVE" label="Tạm ngưng" />
              <StatusTag status="UNAVAILABLE" label="Không khả dụng" />
              <StatusTag status="EXPIRED" label="Đã hết hạn" />
            </div>
            <h2 className="mt-4 mb-3">Dialog & Toast</h2>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={() => setConfirmOpen(true)}>
                Mở dialog xác nhận
              </Button>
              <Button variant="outline-secondary" onClick={() => toast.error("Toast mẫu: có lỗi xảy ra.")}>
                Toast lỗi
              </Button>
            </div>
          </div>

          <div className="scms-panel p-4">
            <h2 className="mb-3">Form</h2>
            <Form>
              <FormField label="Trường bắt buộc" required help="Helper text hiển thị khi chưa có lỗi.">
                <Form.Control type="text" placeholder="Nhập giá trị" />
              </FormField>
              <FormField label="Trường có lỗi" error="Thông điệp lỗi hiển thị ngay dưới field.">
                <Form.Control type="text" isInvalid={false} placeholder="Nhập giá trị" />
              </FormField>
              <FormField label="Danh sách chọn">
                <Form.Select>
                  <option>Tùy chọn 1</option>
                  <option>Tùy chọn 2</option>
                </Form.Select>
              </FormField>
            </Form>
          </div>
        </Tab>
        <Tab eventKey="table" title="Bảng dữ liệu">
          <DataTable
            columns={[
              { key: "code", header: "Mã", width: 90 },
              { key: "name", header: "Tên" },
              { key: "status", header: "Trạng thái", render: (r) => <StatusTag status={r.status} /> },
              { key: "amount", header: "Số tiền", numeric: true, render: (r) => formatVnd(r.amount) },
              { key: "at", header: "Thời điểm", render: (r) => formatDateTime(r.at) },
            ]}
            rows={DEMO_ROWS}
            rowKey={(r) => r.code}
            pagination={{ page, totalPages: 3, onChange: setPage }}
          />
        </Tab>
      </Tabs>

      <ConfirmDialog
        show={confirmOpen}
        title="Xác nhận thao tác mẫu"
        body="Đây là dialog xác nhận chuẩn dùng cho các hành động quan trọng."
        confirmLabel="Đồng ý"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast.info("Đã xác nhận thao tác mẫu.");
        }}
      />
    </AdminLayout>
  );
}

export function ShowcaseAuthPage() {
  const { navigate } = useRouter();
  return (
    <AuthLayout screenCode="SCR-01">
      <h2 className="mb-2">Auth shell</h2>
      <p className="text-muted-scms mb-4">
        Khung split-screen cho màn hình đăng nhập. Form đăng nhập thật thuộc issue FE-03.
      </p>
      <Button variant="outline-secondary" onClick={() => navigate("/_showcase")}>
        ← Về showcase
      </Button>
    </AuthLayout>
  );
}

export function ShowcaseKioskPage() {
  const { navigate } = useRouter();
  return (
    <KioskLayout branchName="Chi nhánh mẫu">
      <div className="scms-panel p-4" style={{ maxWidth: 640 }}>
        <h2 className="mb-2">Kiosk shell</h2>
        <p className="text-muted-scms mb-4">
          Khung full-screen với đồng hồ lớn cho kiosk chấm công. Luồng chấm công thật thuộc issue FE-04.
        </p>
        <div className="d-flex gap-3">
          <Button size="lg" variant="primary" style={{ minHeight: 56, minWidth: 160 }}>
            Vùng chạm lớn
          </Button>
          <Button size="lg" variant="outline-secondary" onClick={() => navigate("/_showcase")}>
            Về showcase
          </Button>
        </div>
      </div>
    </KioskLayout>
  );
}

export function ShowcaseTaskPage() {
  const toast = useToast();
  return (
    <TaskLayout
      title="Task shell"
      screenCode="TASK"
      backTo="/_showcase"
      actions={
        <>
          <Button variant="outline-secondary">Hủy</Button>
          <Button variant="primary" onClick={() => toast.success("Task shell: nút lưu ở thanh sticky.")}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="scms-panel p-4" style={{ maxWidth: 720 }}>
        <p className="text-muted-scms mb-0">
          Khung màn hình tác vụ: header có nút quay lại và mã màn hình, thanh hành động dính ở đáy.
          Các màn hình tạo/sửa của từng issue nghiệp vụ sẽ dùng shell này.
        </p>
      </div>
    </TaskLayout>
  );
}
