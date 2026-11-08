import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { RouteLink } from "../router/HashRouter.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import Icon from "../components/Icon.jsx";

// Trang đích sau đăng nhập theo vai trò (landing SCR-10 / SCR-07 / SCR-04).
// Nội dung: thông tin phiên thật + lối vào các chức năng theo quyền.
// Các màn hình tổng quan có số liệu sẽ thay thế khi backend có API báo cáo.
export default function RoleHomePage({ title, screenCode }) {
  const { user } = useAuth();
  const menu = buildMenu(user);

  const headerRight = <SessionHeaderRight />;

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={headerRight}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader title={title} screenCode={screenCode} description={`Xin chào ${user?.fullName || ""}. Chọn chức năng để bắt đầu làm việc.`} />
      {menu.length === 0 ? (
        <div className="scms-panel p-4">
          <p className="mb-0 text-muted-scms">
            Tài khoản hiện chưa được cấp quyền cho chức năng nào trong khu vực này.
          </p>
        </div>
      ) : (
        menu.map((section) => (
          <div key={section.group} className="mb-4">
            <div
              className="text-muted-scms mb-2"
              style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              {section.group}
            </div>
            <div className="scms-panel">
              {section.items.map((item, idx) => (
                <RouteLink
                  key={item.key}
                  to={item.path}
                  className="d-flex justify-content-between align-items-center px-4 py-3 text-decoration-none"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--line)", color: "var(--ink)" }}
                >
                  <span style={{ fontWeight: 600 }}>{item.label}</span>
                  <span className="text-muted-scms d-inline-flex"><Icon name="arrowRight" size={15} /></span>
                </RouteLink>
              ))}
            </div>
          </div>
        ))
      )}
    </AdminLayout>
  );
}
