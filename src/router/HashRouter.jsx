import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Router hash tối giản (prototype cũng điều hướng bằng hash).
// Đường dẫn dạng "#/chain/menu" -> path "/chain/menu".
// Giữ ở tầng common để mọi màn hình dùng chung một cơ chế điều hướng.

const RouterContext = createContext({ path: "/", query: {}, navigate: () => {} });

// Tách path và query: "#/chain/menu/edit?id=3" -> path "/chain/menu/edit",
// query { id: "3" } — cùng quy ước điều hướng của prototype.
function parseHash() {
  const raw = window.location.hash.replace(/^#/, "");
  const full = !raw ? "/" : raw.startsWith("/") ? raw : `/${raw}`;
  const qIndex = full.indexOf("?");
  if (qIndex < 0) return { path: full, query: {} };
  const query = {};
  for (const [k, v] of new URLSearchParams(full.slice(qIndex + 1))) query[k] = v;
  return { path: full.slice(0, qIndex) || "/", query };
}

function fullFromHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function HashRouter({ children }) {
  const [route, setRoute] = useState(() => parseHash());

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to) => {
    const target = to.startsWith("/") ? to : `/${to}`;
    if (fullFromHash() === target) {
      setRoute(parseHash());
    } else {
      window.location.hash = target;
    }
  }, []);

  const value = useMemo(
    () => ({ path: route.path, query: route.query, navigate }),
    [route, navigate],
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  return useContext(RouterContext);
}

// Khớp path với mẫu có tham số: matchPath("/orders/:id", "/orders/12") -> { id: "12" }
export function matchPath(pattern, path) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// Chọn route đầu tiên khớp trong danh sách [{ pattern, render(params) }].
export function Routes({ routes, fallback = null }) {
  const { path } = useRouter();
  for (const route of routes) {
    const params = matchPath(route.pattern, path);
    if (params) return route.render(params);
  }
  return fallback;
}

export function RouteLink({ to, className, children, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
