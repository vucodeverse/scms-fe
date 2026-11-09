import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import Icon from "./Icon.jsx";
import SecurityAlertBell from "./SecurityAlertBell.jsx";

// Khối góc phải top rail theo prototype: đồng hồ trực tiếp + avatar
// chữ cái đầu (nền accent-soft) + nút Đăng xuất.
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function initialsOf(name) {
  if (!name) return "SC";
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function SessionHeaderRight() {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const now = useClock();
  const clock = now.toLocaleTimeString("vi-VN", { hour12: false });

  return (
    <>
      <SecurityAlertBell />
      <span className="topbar__clock">
        <Icon name="clock" size={14} />
        {clock}
      </span>
      <span
        className="avatar"
        title={user ? `${user.fullName} · ${roleLabel(user.role)}` : ""}
      >
        {initialsOf(user?.fullName)}
      </span>
      {user && (user.role === "COO" || user.role === "BRANCH_MANAGER") ? (
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => navigate(user.role === "COO" ? "/chain/overview" : "/branch/overview")}
        >
          Trang quản trị
        </Button>
      ) : null}
      {user ? (
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={async () => {
            await logout();
            navigate("/pos");
          }}
        >
          Đăng xuất
        </Button>
      ) : (
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => navigate("/login")}
        >
          Đăng nhập quản trị
        </Button>
      )}
    </>
  );
}
