import Icon from "./Icon.jsx";

export default function UnassignedManagerNotice({
  message = "Tài khoản Quản lý của bạn chưa được gắn vào chi nhánh nào. Vui lòng liên hệ COO để được phân công.",
}) {
  return (
    <div className="scms-panel mb-3">
      <div className="empty-state">
        <span className="empty-state__icon">
          <Icon name="branch" size={18} />
        </span>
        <span>{message}</span>
      </div>
    </div>
  );
}
