import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  Blocks,
  BookOpen,
  Bot,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  CreditCard,
  FileKey2,
  FileText,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import axios from "axios";
import { API, apiClient, apiHealthUrl } from "./lib/api";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function useLoad(url: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);
  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    apiClient
      .get(`${API}${url}`)
      .then((r) => live && setData(r.data.data ?? r.data))
      .catch(
        (e) =>
          live &&
          setError(
            axios.isAxiosError(e)
              ? (e.response?.data?.error?.message ?? "Could not load data.")
              : "Could not load data.",
          ),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [url, tick]);
  return { data, loading, error, refresh, setData };
}
function ErrorNote({ text }: { text: string }) {
  return text ? (
    <div className="inline-alert">
      <AlertCircle size={15} />
      {text}
    </div>
  ) : null;
}
function BusyButton({
  busy,
  children,
  onClick,
  kind = "button-primary",
}: {
  busy: boolean;
  children: React.ReactNode;
  onClick: () => void;
  kind?: string;
}) {
  return (
    <button className={`button ${kind}`} disabled={busy} onClick={onClick}>
      {busy && <span className="spinner" />}
      {children}
    </button>
  );
}
const nav = [
  { label: "Overview", path: "/", icon: LayoutDashboard, group: "WORKSPACE" },
  { label: "Projects", path: "/projects", icon: Blocks, group: "WORKSPACE" },
  { label: "AI Providers", path: "/providers", icon: Bot, group: "WORKSPACE" },
  { label: "Models", path: "/models", icon: GitBranch, group: "WORKSPACE" },
  {
    label: "Credentials",
    path: "/credentials",
    icon: FileKey2,
    group: "WORKSPACE",
  },
  {
    label: "API Playground",
    path: "/playground",
    icon: Command,
    group: "WORKSPACE",
  },
  { label: "Analytics", path: "/analytics", icon: Activity, group: "INSIGHTS" },
  { label: "Request Logs", path: "/logs", icon: FileText, group: "INSIGHTS" },
  {
    label: "Budgets & Limits",
    path: "/budgets",
    icon: CreditCard,
    group: "INSIGHTS",
  },
  {
    label: "Prompt Library",
    path: "/prompts",
    icon: BookOpen,
    group: "INSIGHTS",
  },
  { label: "Team", path: "/team", icon: Users, group: "MANAGE" },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    group: "MANAGE",
  },
  { label: "Audit Logs", path: "/audit", icon: ShieldCheck, group: "MANAGE" },
  {
    label: "System Health",
    path: "/health",
    icon: HeartPulse,
    group: "MANAGE",
  },
  { label: "Settings", path: "/settings", icon: Settings, group: "MANAGE" },
];
type Project = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  status: string;
  environment: string;
  aiEnabled: boolean;
  provider?: string;
  model?: string;
};
type AuthUser = { id: string; email: string; name: string; role: string };

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [csrf, setCsrf] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [ownerConfigured, setOwnerConfigured] = useState(false);
  const [databaseReady, setDatabaseReady] = useState<boolean | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const current =
    nav.find((item) => item.path === location.pathname) ??
    nav.find((item) => item.path === "/projects");
  useEffect(() => {
    apiClient.defaults.withCredentials = true;
    apiClient
      .get(`${API}/auth/me`)
      .then((r) => {
        setAuthUser(r.data.data.user);
        setCsrf(r.data.data.csrf);
      })
      .catch(() =>
        apiClient
          .get(`${API}/auth/status`)
          .then((r) => {
            setOwnerConfigured(r.data.configured);
            setDatabaseReady(r.data.database === true);
          })
          .catch(() => {
            setOwnerConfigured(false);
            setDatabaseReady(null);
          }),
      )
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    if (!authUser) return;
    apiClient.defaults.headers.common["X-CSRF-Token"] = csrf;
    apiClient
      .get(`${API}/projects`)
      .then((r) => setProjectCount(r.data.total ?? 0))
      .catch(() => setProjectCount(null));
  }, [authUser, csrf]);
  const onAuthenticated = (user: AuthUser, token: string) => {
    setAuthUser(user);
    setCsrf(token);
    setAuthReady(true);
  };
  const logout = async () => {
    try {
      await apiClient.post(
        `${API}/auth/logout`,
        {},
        { headers: { "X-CSRF-Token": csrf } },
      );
    } finally {
      delete apiClient.defaults.headers.common["X-CSRF-Token"];
      setAuthUser(null);
      setCsrf("");
      setAuthReady(true);
    }
  };
  const close = () => setMobileOpen(false);
  if (!authReady)
    return (
      <div className="auth-loading">
        <span className="spinner" />
        Checking your session…
      </div>
    );
  if (!authUser)
    return (
      <AuthScreen
        ownerConfigured={ownerConfigured}
        databaseReady={databaseReady}
        onAuthenticated={onAuthenticated}
      />
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <Link className="brand" to="/" onClick={close}>
          <span className="brand-mark">
            <img src="/assets/Fully%20Transparent%20logo.png" />
          </span>
          <span>
            <b>KENORA</b>
            <small>AI HUB</small>
          </span>
          <button
            className="mobile-close"
            onClick={(e) => {
              e.preventDefault();
              close();
            }}
          >
            <X size={17} />
          </button>
        </Link>
        <div className="workspace-select">
          <span className="workspace-avatar">K</span>
          <span className="workspace-copy">
            <b>KenoraTech</b>
            <small>Owner workspace</small>
          </span>
        </div>
        <nav className="side-nav">
          {["WORKSPACE", "INSIGHTS", "MANAGE"].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-heading">{group}</div>
              {nav
                .filter((i) => i.group === group)
                .map(({ label, path, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={path === "/"}
                    onClick={close}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "active" : ""}`
                    }
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    <span>{label}</span>
                    {label === "Projects" && projectCount !== null && (
                      <em className="nav-count">{projectCount}</em>
                    )}
                    {label === "Notifications" && (
                      <i className="notification-dot" />
                    )}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-top">
              <span className="usage-icon">
                <Zap size={15} />
              </span>
              <span>Usage this month</span>
            </div>
            <div className="usage-value">No usage yet</div>
            <div className="usage-line">
              <span style={{ width: "0%" }} />
            </div>
            <div className="usage-foot">
              <span>Connect a provider to begin</span>
              <span>—</span>
            </div>
          </div>
          <div className="user-row">
            <div className="avatar user-avatar">K</div>
            <span className="user-label">
              <b>Workspace owner</b>
              <small>Owner</small>
            </span>
          </div>
        </div>
      </aside>
      <button className="logout-fixed" onClick={logout}>
        Sign out
      </button>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="mobile-backdrop"
          onClick={close}
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-sep">/</span>
            <b>{current?.label ?? "Projects"}</b>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => {
                navigate("/projects");
                window.setTimeout(
                  () => document.getElementById("global-search")?.focus(),
                  40,
                );
              }}
            >
              <Search size={15} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            <Link
              to="/notifications"
              className="icon-button notification-button"
              title="Notifications"
            >
              <Bell size={17} />
              <i />
            </Link>
            <div className="top-divider" />
            <div className="profile-trigger">
              <span className="avatar mini-avatar">K</span>
              <span>KenoraTech</span>
            </div>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<Overview count={projectCount} />} />
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/projects" element={<ProjectsPage />} />
          {nav.slice(2).map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={<GenericPage title={item.label} path={item.path} />}
            />
          ))}
          <Route path="*" element={<ProjectsPage />} />
        </Routes>
        <div className="support-fab">
          <CircleHelp size={16} />
          <span>Help center</span>
        </div>
      </main>
    </div>
  );
}

function AuthScreen({
  ownerConfigured,
  databaseReady,
  onAuthenticated,
}: {
  ownerConfigured: boolean;
  databaseReady: boolean | null;
  onAuthenticated: (user: AuthUser, csrf: string) => void;
}) {
  const invitationToken =
    new URLSearchParams(window.location.search).get("token") ?? "";
  const accepting = Boolean(invitationToken);
  const [setup, setSetup] = useState(!ownerConfigured);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = accepting
        ? "accept-invitation"
        : setup
          ? "bootstrap"
          : "login";
      const payload = accepting
        ? { token: invitationToken, name, password }
        : { email, password, ...(setup ? { name } : {}) };
      const r = await apiClient.post(`${API}/auth/${path}`, payload);
      onAuthenticated(r.data.data.user, r.data.data.csrf);
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error?.message ??
              (err.response
                ? "The API rejected the authentication request. Check the Render logs for details."
                : "Cannot reach the API. Check VITE_API_URL and make sure Render WEB_ORIGIN matches this Vercel site."))
          : "Authentication request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <span className="auth-mark">
          <img src="/assets/Fully%20Transparent%20logo.png" />
        </span>
        <span>
          <b>KENORA</b>
          <small>AI HUB</small>
        </span>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">
          {accepting
            ? "TEAM INVITATION"
            : setup
              ? "FIRST-RUN SETUP"
              : "SECURE WORKSPACE"}
        </span>
        <h1>
          {accepting
            ? "Accept invitation"
            : setup
              ? "Create your owner account"
              : "Welcome back"}
        </h1>
        <p>
          {accepting
            ? "Choose your name and password to join the team."
            : setup
              ? "Set up the workspace owner. Passwords are hashed with Argon2id."
              : "Sign in to access your AI control plane."}
        </p>
        {!ownerConfigured && setup && !accepting && databaseReady === false && (
          <div className="inline-alert">
            <AlertCircle size={15} />
            MongoDB is not connected. Check MONGODB_URI and the Render service logs.
          </div>
        )}
        {!ownerConfigured && setup && !accepting && databaseReady === null && (
          <div className="inline-alert">
            <AlertCircle size={15} />
            Cannot check database status. Verify the API URL and Render CORS settings.
          </div>
        )}
        {(setup || accepting) && (
          <label>
            Your name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>
        )}
        {!accepting && (
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
        )}
        <label>
          Password
          <input
            required
            type="password"
            minLength={12}
            maxLength={256}
            autoComplete={
              setup || accepting ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              setup || accepting ? "At least 12 characters" : "Your password"
            }
          />
        </label>
        {error && (
          <div className="inline-alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        <button disabled={busy || (setup && !accepting && databaseReady === false)} className="button button-primary auth-submit">
          {busy && <span className="spinner" />}
          {accepting
            ? "Join workspace"
            : setup
              ? "Create owner account"
              : "Sign in"}
        </button>
        {ownerConfigured && !accepting && (
          <button
            type="button"
            className="auth-mode"
            onClick={() => setSetup(!setup)}
          >
            {setup ? "Back to sign in" : "Set up a new workspace"}
          </button>
        )}
        <small className="auth-foot">
          Sessions use HTTP-only cookies with SameSite and CSRF checks.
        </small>
      </form>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-line" />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Overview({ count }: { count: number | null }) {
  const { data: stats } = useLoad("/analytics/overview?days=30");
  const { data: series } = useLoad("/analytics/usage?days=30");
  const { data: providers } = useLoad("/providers");
  const { data: recentData } = useLoad("/logs?limit=5");
  const points = (series ?? []) as any[];
  const recent = (Array.isArray(recentData) ? recentData : []) as any[];
  const gemini = (providers ?? []).find((p: any) => p.name === "gemini");
  const cards = [
    {
      label: "Registered projects",
      value: count === null ? "—" : String(count),
      change: "Registered in this workspace",
      icon: Blocks,
      color: "violet",
    },
    {
      label: "AI requests",
      value: stats?.requests?.toLocaleString() ?? "0",
      change: `${stats?.failed ?? 0} failed in the last 30 days`,
      icon: Zap,
      color: "blue",
    },
    {
      label: "Tokens consumed",
      value: (
        (stats?.inputTokens ?? 0) + (stats?.outputTokens ?? 0)
      ).toLocaleString(),
      change: "Input and output tokens · 30 days",
      icon: Activity,
      color: "cyan",
    },
    {
      label: "Estimated spend",
      value:
        stats?.estimatedCostUsd == null
          ? "Unknown"
          : `$${stats.estimatedCostUsd.toFixed(4)}`,
      change:
        stats?.estimatedCostUsd == null
          ? "Configure model prices to estimate cost"
          : "Token-price estimate · 30 days",
      icon: CreditCard,
      color: "pink",
    },
  ];
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="MONDAY, NOVEMBER 2"
        title="Good morning"
        description="Here’s what’s happening across your AI workspace."
        action={
          <Link className="button button-primary" to="/projects">
            <Plus size={16} /> Add a project
          </Link>
        }
      />
      <section className="stats-grid">
        {cards.map(({ label, value, change, icon: Icon, color }) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={16} />
              </span>
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-change muted">
              <span>{change}</span>
            </div>
          </div>
        ))}
      </section>
      <section className="overview-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Request volume</h2>
              <p>Request activity over time</p>
            </div>
            <span className="select-button">Last 30 days</span>
          </div>
          <div className="empty-chart">
            {points.length ? (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={points}>
                  <defs>
                    <linearGradient
                      id="overviewFill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#9566f5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#9566f5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(170,180,255,.08)" />
                  <XAxis
                    dataKey="_id"
                    stroke="#77809a"
                    tick={{ fontSize: 8 }}
                  />
                  <YAxis stroke="#77809a" tick={{ fontSize: 8 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#111523",
                      border: "1px solid #33304c",
                      fontSize: 9,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#aa83ff"
                    fill="url(#overviewFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart-art">
                <div className="chart-grid-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="chart-empty-overlay">
                  <span className="empty-spark">
                    <Activity size={18} />
                  </span>
                  <b>No request data yet</b>
                  <small>
                    Your usage chart will appear once the gateway receives its
                    first request.
                  </small>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="panel provider-panel">
          <div className="panel-heading">
            <div>
              <h2>Provider health</h2>
              <p>Connection status</p>
            </div>
            <button className="more-button">
              <MoreHorizontal size={19} />
            </button>
          </div>
          <div className="provider-feature">
            <div className="provider-logo google-logo">G</div>
            <div className="provider-copy">
              <b>Google Gemini</b>
              <small>Primary provider</small>
            </div>
            <span
              className={`status-pill ${gemini?.status === "connected" ? "status-live" : "status-pending"}`}
            >
              <i />
              {gemini?.status ?? "not configured"}
            </span>
          </div>
          <div className="provider-divider" />
          <div className="provider-setup">
            <div className="setup-icon">
              <LockKeyhole size={15} />
            </div>
            <div>
              <b>
                {gemini
                  ? "Gemini is configured"
                  : "Connect your first provider"}
              </b>
              <small>
                {gemini
                  ? "Verify the connection and sync its live model catalog."
                  : "Add a server-side key to start routing AI requests."}
              </small>
            </div>
          </div>
          <Link className="text-link" to="/providers">
            Configure provider <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <section className="lower-grid">
        <div className="panel list-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent requests</h2>
              <p>Latest activity from your projects</p>
            </div>
            <Link to="/logs" className="subtle-link">
              View logs <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length ? (
            recent.map((r) => (
              <div className="recent-request" key={r._id}>
                <span className={`request-status ${r.status}`} />
                <span>
                  <b>{r.model ?? r.provider ?? "AI request"}</b>
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </span>
                <span className="recent-token-count">
                  {r.totalTokens ?? 0} tokens
                </span>
              </div>
            ))
          ) : (
            <EmptyInline
              icon={Clock3}
              title="No requests to show"
              text="Gateway requests will appear here after you connect an AI provider."
            />
          )}
        </div>
        <div className="panel list-panel">
          <div className="panel-heading">
            <div>
              <h2>Projects</h2>
              <p>Your registered integrations</p>
            </div>
            <Link to="/projects" className="subtle-link">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {count === 0 ? (
            <EmptyInline
              icon={Blocks}
              title="Your workspace is ready"
              text="Register a project to begin managing its AI integration."
            />
          ) : (
            <div className="project-summary">
              <div className="summary-icon">
                <Sparkles size={16} />
              </div>
              <div>
                <b>
                  {count === null
                    ? "Project service unavailable"
                    : `${count} registered project${count === 1 ? "" : "s"}`}
                </b>
                <small>
                  {count === null
                    ? "Check that the API is running."
                    : "Open project management to see details."}
                </small>
              </div>
              <Link to="/projects" aria-label="Open projects">
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
function EmptyInline({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Activity;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-inline">
      <span>
        <Icon size={18} />
      </span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [environment, setEnvironment] = useState("development");
  const params = useMemo(
    () => ({ ...(query ? { q: query } : {}), ...(status ? { status } : {}) }),
    [query, status],
  );
  useEffect(() => {
    let live = true;
    setLoading(true);
    apiClient
      .get(`${API}/projects`, { params })
      .then((r) => {
        if (live) {
          setProjects(r.data.data ?? []);
          setTotal(r.data.total ?? 0);
          setError(
            r.data.configured === false
              ? "MongoDB is not configured. Projects can’t be saved until a database is connected."
              : "",
          );
        }
      })
      .catch(() => {
        if (live) {
          setProjects([]);
          setTotal(0);
          setError(
            "Could not reach the project API. Start the API service and try again.",
          );
        }
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [params]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await apiClient.post(`${API}/projects`, {
        name,
        description,
        category,
        environment,
      });
      setModal(false);
      setName("");
      setDescription("");
      setQuery("");
      setStatus("");
    } catch (err) {
      setFormError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error?.message ?? "Could not create project.")
          : "Could not create project.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Projects"
        description="Register and manage the applications connected to your AI infrastructure."
        action={
          <button
            className="button button-primary"
            onClick={() => setModal(true)}
          >
            <Plus size={16} /> New project
          </button>
        }
      />
      <div className="project-toolbar">
        <label className="table-search">
          <Search size={15} />
          <input
            id="global-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
          />
        </label>
        <button
          className="select-button filter-button"
          onClick={() => setStatus(status ? "" : "active")}
        >
          <SlidersHorizontal size={14} />
          {status ? "Active projects" : "All statuses"}
          <ChevronDown size={14} />
        </button>
        <span className="result-count">
          {total} project{total === 1 ? "" : "s"}
        </span>
      </div>
      {error && (
        <div className="inline-alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <div className="panel projects-table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PROJECT</th>
                <th>CATEGORY</th>
                <th>ENVIRONMENT</th>
                <th>AI STATUS</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-loading">
                      <span className="spinner" />
                      Loading projects...
                    </div>
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyInline
                      icon={Blocks}
                      title={
                        error
                          ? "Project data unavailable"
                          : "No projects registered"
                      }
                      text={
                        error
                          ? "Check your API and database configuration, then refresh."
                          : "Add your first project or import existing project metadata to get started."
                      }
                    />
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <Link
                        className="project-cell project-cell-link"
                        to={`/projects/${p._id}`}
                      >
                        <span className="project-symbol">
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <b>{p.name}</b>
                          <small>{p.slug}</small>
                        </span>
                      </Link>
                    </td>
                    <td>{p.category}</td>
                    <td>
                      <span className="env-label">
                        <i className={p.environment} />
                        {p.environment}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${p.aiEnabled ? "status-live" : "status-pending"}`}
                      >
                        <i />
                        {p.aiEnabled ? "Enabled" : "Not configured"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${p.status}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="row-more"
                        to={`/projects/${p._id}`}
                        title="Project details"
                      >
                        <MoreHorizontal size={17} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Showing {projects.length} of {total} projects
          </span>
          <div>
            <button disabled>Previous</button>
            <button disabled>Next</button>
          </div>
        </div>
      </div>
      <div className="callout">
        <div className="callout-icon">
          <Sparkles size={16} />
        </div>
        <div>
          <b>Migrating an existing Gemini integration?</b>
          <p>
            Register your project first. We’ll help route requests safely
            through the gateway when provider configuration is ready.
          </p>
        </div>
        <Link to="/playground">
          Explore API Playground <ArrowRight size={14} />
        </Link>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <form className="modal" onSubmit={create}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">ONBOARDING</span>
                <h2>Register a project</h2>
                <p>Add a real project to your workspace registry.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              Project name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer portal"
              />
            </label>
            <label>
              Description <span className="optional">Optional</span>
              <textarea
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this project do?"
                rows={3}
              />
            </label>
            <div className="form-two">
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>Other</option>
                  <option>Web application</option>
                  <option>Mobile application</option>
                  <option>Internal tool</option>
                  <option>API / backend</option>
                </select>
              </label>
              <label>
                Environment
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </label>
            </div>
            {formError && (
              <div className="inline-alert">
                <AlertCircle size={15} />
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setModal(false)}
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : <Plus size={15} />}{" "}
                Create project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: providerRows } = useLoad("/providers");
  const { data: modelRows } = useLoad("/models");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState("development");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => {
    let live = true;
    apiClient
      .get(`${API}/projects/${id}`)
      .then((r) => {
        if (live) {
          setProject(r.data.data);
          setEnvironment(r.data.data.environment);
          setProvider(r.data.data.provider ?? "");
          setModel(r.data.data.model ?? "");
        }
      })
      .catch((err) => {
        if (live)
          setError(
            axios.isAxiosError(err)
              ? (err.response?.data?.error?.message ??
                  "Could not load project.")
              : "Could not load project.",
          );
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id]);
  async function update(patch: Partial<Project>) {
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      const r = await apiClient.patch(`${API}/projects/${id}`, patch);
      setProject(r.data.data);
      setEnvironment(r.data.data.environment);
      setProvider(r.data.data.provider ?? "");
      setModel(r.data.data.model ?? "");
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error?.message ??
              "Could not save project changes.")
          : "Could not save project changes.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!project || !window.confirm(`Permanently delete “${project.name}”?`))
      return;
    setBusy(true);
    try {
      await apiClient.delete(`${API}/projects/${id}`);
      navigate("/projects");
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error?.message ?? "Could not delete project.")
          : "Could not delete project.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content">
      <div className="detail-back">
        <Link to="/projects">← All projects</Link>
      </div>
      {loading ? (
        <div className="panel table-loading">
          <span className="spinner" />
          Loading project...
        </div>
      ) : !project ? (
        <div className="panel">
          <EmptyInline
            icon={Blocks}
            title="Project unavailable"
            text={error || "This project could not be found."}
          />
        </div>
      ) : (
        <>
          <PageHeader
            eyebrow="PROJECT DETAILS"
            title={project.name}
            description={
              project.description ||
              `Manage the ${project.slug} project and its AI access.`
            }
            action={
              <span
                className={`status-pill ${project.status === "active" ? "status-live" : "status-pending"}`}
              >
                <i />
                {project.status}
              </span>
            }
          />
          {error && (
            <div className="inline-alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <div className="detail-tabs">
            <span className="selected">Overview</span>
            <a href="#project-ai">AI Configuration</a>
            <Link to={`/credentials?projectId=${id}`}>Credentials</Link>
            <Link to="/analytics">Usage</Link>
            <Link to={`/budgets?projectId=${id}`}>Budgets</Link>
            <Link to={`/logs?projectId=${id}`}>Request Logs</Link>
            <a href="#project-ai">Environments</a>
            <Link to="/settings">Settings</Link>
          </div>
          <div className="detail-grid">
            <div className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <h2>Project configuration</h2>
                  <p>Basic registration details</p>
                </div>
              </div>
              <div className="detail-fields">
                <div>
                  <small>Project name</small>
                  <b>{project.name}</b>
                </div>
                <div>
                  <small>Unique slug</small>
                  <b className="mono">{project.slug}</b>
                </div>
                <div>
                  <small>Category</small>
                  <b>{project.category}</b>
                </div>
                <div>
                  <small>Environment</small>
                  <select
                    value={environment}
                    onChange={(e) => {
                      setEnvironment(e.target.value);
                      void update({ environment: e.target.value });
                    }}
                  >
                    <option value="development">Development</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>
                <div>
                  <small>Default provider</small>
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value);
                      setModel("");
                    }}
                  >
                    <option value="">Select provider</option>
                    {(providerRows ?? [])
                      .filter((p: any) => p.enabled && p.status === "connected")
                      .map((p: any) => (
                        <option key={p._id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <small>Default model</small>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    <option value="">Select verified model</option>
                    {(modelRows ?? [])
                      .filter((m: any) => m.provider === provider && m.active)
                      .map((m: any) => (
                        <option key={m._id} value={m.modelId}>
                          {m.displayName || m.modelId}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="detail-ai-note">
                <LockKeyhole size={15} />
                <span>
                  AI access requires a connected provider and a model verified
                  from its live catalog.
                </span>
              </div>
              <div className="detail-config-actions">
                <button
                  disabled={busy}
                  className="button button-secondary"
                  onClick={() => void update({ provider, model })}
                >
                  Save AI configuration
                </button>
                <button
                  disabled={busy || !provider || !model || project.aiEnabled}
                  className="button button-primary"
                  onClick={() =>
                    void update({ provider, model, aiEnabled: true })
                  }
                >
                  {project.aiEnabled ? "AI enabled" : "Enable AI access"}
                </button>
                {project.aiEnabled && (
                  <button
                    disabled={busy}
                    className="button button-quiet"
                    onClick={() => void update({ aiEnabled: false })}
                  >
                    Disable AI
                  </button>
                )}
              </div>
            </div>
            <div className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <h2>Project status</h2>
                  <p>Control this project’s availability</p>
                </div>
              </div>
              <div className="status-management">
                <span
                  className={`status-pill ${project.status === "active" ? "status-live" : "status-pending"}`}
                >
                  <i />
                  {project.status}
                </span>
                <p>
                  {project.status === "active"
                    ? "This project is available for configuration."
                    : "This project is currently paused or archived."}
                </p>
                <button
                  disabled={busy}
                  className="button button-secondary"
                  onClick={() =>
                    void update({
                      status: project.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {busy
                    ? "Saving…"
                    : project.status === "active"
                      ? "Pause project"
                      : "Activate project"}
                </button>
              </div>
              <div className="danger-zone">
                <div>
                  <b>Delete project</b>
                  <small>
                    Removes the project registry record permanently.
                  </small>
                </div>
                <button
                  disabled={busy}
                  className="button button-danger"
                  onClick={() => void remove()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const pageMeta: Record<
  string,
  {
    eyebrow: string;
    description: string;
    icon: typeof Activity;
    empty: string;
    detail: string;
    action: string;
  }
> = {
  "/providers": {
    eyebrow: "AI INFRASTRUCTURE",
    description:
      "Configure providers securely and monitor their connection health.",
    icon: Bot,
    empty: "No providers configured",
    detail:
      "Provider credentials are stored server-side and never returned to the browser.",
    action: "Configure provider",
  },
  "/models": {
    eyebrow: "AI INFRASTRUCTURE",
    description:
      "Review models available from configured providers and manage project access.",
    icon: GitBranch,
    empty: "No verified models available",
    detail:
      "Model catalog data will appear after a provider is configured and its model list is verified.",
    action: "View providers",
  },
  "/credentials": {
    eyebrow: "SECURITY",
    description: "Create and rotate project credentials for gateway access.",
    icon: FileKey2,
    empty: "No project credentials",
    detail:
      "Credentials can be generated after registering a project. Secrets are only shown once.",
    action: "Open projects",
  },
  "/playground": {
    eyebrow: "DEVELOPER TOOLS",
    description:
      "Run a real request through your configured project and provider.",
    icon: Command,
    empty: "Playground is not configured",
    detail:
      "Add a project and provider configuration to run requests through the backend gateway.",
    action: "Configure a provider",
  },
  "/analytics": {
    eyebrow: "INSIGHTS",
    description:
      "Understand real request volume, token use, cost, and latency.",
    icon: Activity,
    empty: "No usage records yet",
    detail:
      "Analytics are calculated from persisted gateway usage events. No sample data is shown.",
    action: "Open API Playground",
  },
  "/logs": {
    eyebrow: "INSIGHTS",
    description:
      "Search and inspect safe metadata for requests routed through the gateway.",
    icon: FileText,
    empty: "No request logs",
    detail:
      "Request logs will appear when projects send requests through the gateway.",
    action: "Open API Playground",
  },
  "/budgets": {
    eyebrow: "GOVERNANCE",
    description:
      "Set budget limits and monitor spend across registered projects.",
    icon: CreditCard,
    empty: "No budgets configured",
    detail:
      "Create project budgets to define usage thresholds and hard limits.",
    action: "Open projects",
  },
  "/prompts": {
    eyebrow: "DEVELOPER TOOLS",
    description:
      "Create and organize reusable prompt templates for your projects.",
    icon: BookOpen,
    empty: "Your prompt library is empty",
    detail: "Prompt templates you create will be saved to the workspace.",
    action: "Create prompt",
  },
  "/team": {
    eyebrow: "WORKSPACE",
    description: "Manage workspace members and their access levels.",
    icon: Users,
    empty: "No team members yet",
    detail:
      "Invitations and membership management require owner authentication to be configured.",
    action: "View workspace projects",
  },
  "/notifications": {
    eyebrow: "WORKSPACE",
    description:
      "Stay informed about real provider, budget, and security events.",
    icon: Bell,
    empty: "You’re all caught up",
    detail:
      "Notifications are generated from application events as they occur.",
    action: "Open settings",
  },
  "/audit": {
    eyebrow: "SECURITY",
    description:
      "Review an append-only record of administrative and security actions.",
    icon: ShieldCheck,
    empty: "No audit events",
    detail:
      "Administrative actions will be recorded here as authentication and audit services are enabled.",
    action: "Open settings",
  },
  "/health": {
    eyebrow: "OPERATIONS",
    description: "Check live API and connected service availability.",
    icon: HeartPulse,
    empty: "Health data unavailable",
    detail:
      "Health status is read from the running API. Unchecked dependencies are shown as unavailable.",
    action: "Refresh status",
  },
  "/settings": {
    eyebrow: "WORKSPACE",
    description:
      "Configure platform preferences, security, and service connections.",
    icon: Settings,
    empty: "Workspace settings",
    detail:
      "Sensitive options become available once authentication and persistent storage are configured.",
    action: "Configure provider",
  },
};
function GenericPage({ title, path }: { title: string; path: string }) {
  const meta = pageMeta[path] ?? pageMeta["/settings"];
  const [health, setHealth] = useState<any>(null);
  const [healthError, setHealthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptSaved, setPromptSaved] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  async function refresh() {
    setLoading(true);
    setHealthError("");
    try {
      const r = await apiClient.get(apiHealthUrl);
      setHealth(r.data);
    } catch {
      setHealthError(
        "API health endpoint could not be reached. Start the API service to check live status.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (path === "/health") void refresh();
  }, [path]);
  const Icon = meta.icon;
  const gemini: any = null;
  const operational: Record<string, React.ReactNode> = {
    "/providers": <ProvidersWorkspace />,
    "/models": <ModelsWorkspace />,
    "/credentials": <CredentialsWorkspace />,
    "/playground": <PlaygroundWorkspace />,
    "/analytics": <AnalyticsWorkspace />,
    "/logs": <LogsWorkspace />,
    "/budgets": <BudgetsWorkspace />,
    "/prompts": <PromptsWorkspace />,
    "/team": <TeamWorkspace />,
    "/notifications": <NotificationsWorkspace />,
    "/audit": <AuditWorkspace />,
    "/settings": <SettingsWorkspace />,
  };
  if (operational[path])
    return (
      <div className="page-content">
        <PageHeader
          eyebrow={meta.eyebrow}
          title={title}
          description={meta.description}
        />
        {operational[path]}
      </div>
    );
  return (
    <div className="page-content">
      <PageHeader
        eyebrow={meta.eyebrow}
        title={title}
        description={meta.description}
        action={
          path === "/health" ? (
            <button
              onClick={() => void refresh()}
              className="button button-primary"
              disabled={loading}
            >
              <Activity size={15} />
              {loading ? "Checking…" : "Refresh status"}
            </button>
          ) : path === "/prompts" ? (
            <button
              className="button button-primary"
              onClick={() => document.getElementById("prompt-name")?.focus()}
            >
              <Plus size={15} /> New prompt
            </button>
          ) : undefined
        }
      />
      {path === "/health" ? (
        <div className="health-grid">
          {healthError && (
            <div className="inline-alert">
              <AlertCircle size={16} />
              {healthError}
            </div>
          )}
          {["API", "MongoDB", "Redis", "AI providers"].map((name, i) => {
            const state =
              i === 0
                ? health?.services?.api
                : i === 1
                  ? health?.services?.mongodb
                  : "unavailable";
            return (
              <div className="panel health-card" key={name}>
                <div className="health-card-head">
                  <span
                    className={`health-symbol ${state === "healthy" ? "healthy" : ""}`}
                  >
                    <Icon size={17} />
                  </span>
                  <span
                    className={`health-dot ${state === "healthy" ? "good" : ""}`}
                  />
                </div>
                <h3>{name}</h3>
                <span
                  className={`health-state ${state === "healthy" ? "good-text" : ""}`}
                >
                  {state ?? (healthError ? "unavailable" : "checking")}
                </span>
                <small>
                  {health?.checkedAt
                    ? `Checked ${new Date(health.checkedAt).toLocaleTimeString()}`
                    : "Not yet verified"}
                </small>
              </div>
            );
          })}
        </div>
      ) : null}
      {path === "/prompts" && (
        <div className="panel prompt-create">
          <label>
            Prompt title
            <input
              id="prompt-name"
              placeholder="e.g. Summarize a support ticket"
            />
          </label>
          <label>
            Prompt content
            <textarea
              placeholder="Write a reusable prompt. Variables can be added as {{variable_name}}."
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <div className="prompt-actions">
            <small>
              Saving prompts requires the prompts API, which is not configured
              yet.
            </small>
            <button
              className="button button-primary"
              onClick={() => setPromptSaved(true)}
            >
              <Plus size={15} /> Save prompt
            </button>
          </div>
          {promptSaved && (
            <div className="inline-alert">
              <AlertCircle size={15} />
              Prompt persistence is not available yet; no data was saved.
            </div>
          )}
        </div>
      )}
      {path === "/notifications" && (
        <div className="panel notifications-head">
          <div>
            <b>Notification center</b>
            <small>0 unread notifications</small>
          </div>
          <button
            className="subtle-link"
            disabled={notifications.length === 0}
            onClick={() => setNotifications([])}
          >
            Clear all
          </button>
        </div>
      )}
      {path === "/playground" && (
        <div className="panel playground-panel">
          <div className="playground-top">
            <div>
              <span className="eyebrow">REQUEST BUILDER</span>
              <h2>Test the AI gateway</h2>
              <p>
                Requests are only sent through the configured backend. No
                provider key is exposed here.
              </p>
            </div>
            <span
              className={`status-pill ${gemini?.status === "connected" ? "status-live" : "status-pending"}`}
            >
              <i />
              {gemini?.status ?? "not configured"}
            </span>
          </div>
          <div className="playground-fields">
            <label>
              Project
              <select>
                <option>Select a registered project</option>
              </select>
            </label>
            <label>
              Provider
              <select>
                <option>No configured providers</option>
              </select>
            </label>
            <label>
              Model
              <select>
                <option>No verified models</option>
              </select>
            </label>
          </div>
          <label className="prompt-input-label">
            Input
            <textarea rows={6} placeholder="Write a prompt to test..." />
          </label>
          <button className="button button-primary" disabled>
            <Sparkles size={15} /> Run request
          </button>
        </div>
      )}
      {path !== "/health" &&
        path !== "/prompts" &&
        path !== "/notifications" &&
        path !== "/playground" && (
          <div className="panel empty-page-panel">
            <div className="empty-page-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span>
                <Icon size={27} />
              </span>
            </div>
            <span className="status-pill status-pending">
              <i />
              Awaiting configuration
            </span>
            <h2>{meta.empty}</h2>
            <p>{meta.detail}</p>
            {path === "/providers" ? (
              <ProviderSetup />
            ) : (
              <Link
                to={
                  meta.action.toLowerCase().includes("provider")
                    ? "/providers"
                    : meta.action.toLowerCase().includes("project")
                      ? "/projects"
                      : meta.action.toLowerCase().includes("playground")
                        ? "/playground"
                        : meta.action.toLowerCase().includes("settings")
                          ? "/settings"
                          : "/projects"
                }
                className="button button-secondary"
              >
                {meta.action}
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        )}
    </div>
  );
}
function ProvidersWorkspace() {
  const { data, loading, error, refresh } = useLoad("/providers");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const providers = data ?? [];
  const gemini = providers.find((p: any) => p.name === "gemini");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await apiClient.post(`${API}/providers`, { name: "gemini", apiKey });
      setApiKey("");
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Could not save provider.")
          : "Could not save provider.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setMessage("");
    try {
      await apiClient.post(`${API}/providers/${gemini._id}/test`);
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Connection test failed.")
          : "Connection test failed.",
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    try {
      const r = await apiClient.post(`${API}/providers/${gemini._id}/models/sync`);
      setMessage(
        `Synced ${r.data.data.length} models from Google’s live model catalog.`,
      );
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Model sync failed.")
          : "Model sync failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="operational-stack">
      {loading && (
        <div className="table-loading">
          <span className="spinner" />
          Loading provider configuration…
        </div>
      )}
      <ErrorNote text={error} />
      <div className="panel provider-workspace-card">
        <div className="provider-config-title">
          <span className="provider-logo google-logo">G</span>
          <span>
            <b>Google Gemini</b>
            <small>Official Google GenAI SDK · server-side key storage</small>
          </span>
          <span
            className={`status-pill ${gemini?.status === "connected" ? "status-live" : "status-pending"}`}
          >
            <i />
            {gemini?.status ?? "not configured"}
          </span>
        </div>
        {gemini ? (
          <div className="provider-config-actions">
            <span className="configured-secret">
              API key stored encrypted ·{" "}
              {gemini.enabled ? "enabled" : "disabled"}
            </span>
            <button
              disabled={busy}
              className="button button-secondary"
              onClick={test}
            >
              Test connection
            </button>
            <button
              disabled={busy || gemini.status !== "connected"}
              className="button button-secondary"
              onClick={sync}
            >
              Sync verified models
            </button>
          </div>
        ) : (
          <>
            <label>
              Gemini API key
              <input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste a Google AI Studio key"
              />
            </label>
            <p className="field-note">
              The API encrypts this key at rest with AES-256-GCM. Configure
              SECRETS_ENCRYPTION_KEY on the API first. The key is never returned
              to the browser.
            </p>
            <BusyButton busy={busy || !apiKey} onClick={save}>
              <Plus size={14} /> Save provider key
            </BusyButton>
          </>
        )}
        {message && (
          <div className="inline-alert">
            <AlertCircle size={15} />
            {message}
          </div>
        )}
      </div>
      <div className="provider-info-grid">
        <div className="panel">
          <b>Gemini</b>
          <small>
            Available through the official Google GenAI SDK. Models are imported
            only after a successful live catalog check.
          </small>
        </div>
        <div className="panel">
          <b>OpenAI</b>
          <small>
            Adapter not implemented yet. No connectivity is claimed.
          </small>
        </div>
        <div className="panel">
          <b>Anthropic Claude</b>
          <small>
            Adapter not implemented yet. No connectivity is claimed.
          </small>
        </div>
      </div>
    </div>
  );
}

function ModelsWorkspace() {
  const { data, loading, error, refresh } = useLoad("/models");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function save(model: any) {
    setBusy(model._id);
    try {
      await apiClient.patch(`${API}/models/${model._id}`, {
        active: model.active,
        inputPricePerMillion: Number(model.inputPricePerMillion),
        outputPricePerMillion: Number(model.outputPricePerMillion),
      });
      setMessage(
        "Model settings saved. Prices are operator-entered estimates; confirm them against your provider billing terms.",
      );
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ??
              "Could not save model settings.")
          : "Could not save model settings.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="panel projects-table-panel">
      <ErrorNote text={error} />
      {message && <div className="inline-alert">{message}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>MODEL</th>
              <th>PROVIDER</th>
              <th>CAPABILITIES</th>
              <th>CONTEXT</th>
              <th>INPUT $ / 1M</th>
              <th>OUTPUT $ / 1M</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <div className="table-loading">
                    <span className="spinner" />
                    Loading verified models…
                  </div>
                </td>
              </tr>
            ) : !data?.length ? (
              <tr>
                <td colSpan={7}>
                  <EmptyInline
                    icon={GitBranch}
                    title="No verified models yet"
                    text="Connect Gemini and sync its live model catalog. Model identifiers and capabilities will come from Google."
                  />
                </td>
              </tr>
            ) : (
              (data as any[]).map((m: any) => (
                <ModelRow
                  key={m._id}
                  model={m}
                  busy={busy === m._id}
                  onSave={save}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ModelRow({
  model,
  onSave,
  busy,
}: {
  model: any;
  onSave: (model: any) => void;
  busy: boolean;
}) {
  const [input, setInput] = useState(model.inputPricePerMillion ?? "");
  const [output, setOutput] = useState(model.outputPricePerMillion ?? "");
  const [active, setActive] = useState(model.active);
  return (
    <tr>
      <td>
        <div className="project-cell">
          <span>
            <b>{model.displayName || model.modelId}</b>
            <small>{model.modelId}</small>
          </span>
        </div>
      </td>
      <td>Google Gemini</td>
      <td>{(model.capabilities ?? []).join(", ") || "—"}</td>
      <td>{model.inputTokenLimit?.toLocaleString() ?? "—"}</td>
      <td>
        <input
          className="price-input"
          type="number"
          min="0"
          step="0.000001"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Set price"
        />
      </td>
      <td>
        <input
          className="price-input"
          type="number"
          min="0"
          step="0.000001"
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="Set price"
        />
      </td>
      <td>
        <div className="model-action">
          <label className="active-switch">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active
          </label>
          <button
            className="button button-secondary save-small"
            disabled={busy || input === "" || output === ""}
            onClick={() =>
              onSave({
                ...model,
                active,
                inputPricePerMillion: input,
                outputPricePerMillion: output,
              })
            }
          >
            {busy ? "Saving" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function CredentialsWorkspace() {
  const { data: projects } = useLoad("/projects");
  const [searchParams] = useSearchParams();
  const [projectId, setProjectId] = useState(
    searchParams.get("projectId") ?? "",
  );
  const {
    data: credentials,
    loading,
    error,
    refresh,
  } = useLoad(projectId ? `/projects/${projectId}/credentials` : "");
  const [label, setLabel] = useState("");
  const [environment, setEnvironment] = useState("development");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const r = await apiClient.post(`${API}/projects/${projectId}/credentials`, {
        label: label || `${environment} key`,
        environment,
      });
      setSecret(r.data.data.secret);
      setLabel("");
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Could not create credential.")
          : "Could not create credential.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function rotate(id: string) {
    setBusy(true);
    try {
      const r = await apiClient.post(`${API}/credentials/${id}/rotate`);
      setSecret(r.data.data.secret);
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Rotation failed.")
          : "Rotation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this credential immediately?")) return;
    await apiClient.delete(`${API}/credentials/${id}`);
    refresh();
  }
  return (
    <div className="operational-stack">
      <div className="panel credentials-panel">
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setSecret("");
            }}
          >
            <option value="">Select a project</option>
            {(projects ?? []).map((p: any) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-two">
          <label>
            Credential label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Production backend"
            />
          </label>
          <label>
            Environment
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
        </div>
        <BusyButton busy={busy || !projectId} onClick={create}>
          <Plus size={14} /> Generate credential
        </BusyButton>
        {secret && (
          <div className="secret-once">
            <b>Copy this secret now. It will not be shown again.</b>
            <code>{secret}</code>
            <button
              className="button button-secondary"
              onClick={() => navigator.clipboard.writeText(secret)}
            >
              Copy secret
            </button>
          </div>
        )}
        {message && <ErrorNote text={message} />}
      </div>
      <div className="panel projects-table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>LABEL</th>
                <th>ENVIRONMENT</th>
                <th>PREFIX</th>
                <th>STATUS</th>
                <th>LAST USED</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!projectId ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyInline
                      icon={FileKey2}
                      title="Choose a project"
                      text="Credentials are scoped to a registered project."
                    />
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-loading">Loading credentials…</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6}>
                    <ErrorNote text={error} />
                  </td>
                </tr>
              ) : !credentials?.length ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyInline
                      icon={FileKey2}
                      title="No credentials"
                      text="Generate a high-entropy key for the selected project."
                    />
                  </td>
                </tr>
              ) : (
                (credentials as any[]).map((c) => (
                  <tr key={c._id}>
                    <td>{c.label}</td>
                    <td>{c.environment}</td>
                    <td>
                      <code>{c.prefix}…</code>
                    </td>
                    <td>{c.active ? "Active" : "Revoked"}</td>
                    <td>
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td>
                      <button
                        className="row-action"
                        disabled={!c.active || busy}
                        onClick={() => rotate(c._id)}
                      >
                        Rotate
                      </button>
                      <button
                        className="row-action danger-text"
                        disabled={!c.active}
                        onClick={() => revoke(c._id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PlaygroundWorkspace() {
  const { data: projects } = useLoad("/projects");
  const { data: providers } = useLoad("/providers");
  const { data: models } = useLoad("/models");
  const [projectId, setProjectId] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const r = await apiClient.post(`${API}/playground/generate`, {
        projectId,
        model,
        input,
        maxOutputTokens: 1024,
        temperature: 0.7,
      });
      setResult(r.data.data);
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Request failed.")
          : "Request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const project = (projects ?? []).find((p: any) => p._id === projectId);
  const ready = providers?.some(
    (p: any) => p.name === project?.provider && p.status === "connected",
  );
  const allowed = (models ?? []).filter(
    (m: any) => m.provider === project?.provider,
  );
  return (
    <div className="panel playground-panel">
      <div className="playground-top">
        <div>
          <span className="eyebrow">LIVE GATEWAY REQUEST</span>
          <h2>Test through Kenora AI Hub</h2>
          <p>
            This sends the prompt to the configured provider through the API.
          </p>
        </div>
        <span
          className={`status-pill ${ready ? "status-live" : "status-pending"}`}
        >
          <i />
          {ready ? "provider connected" : "provider unavailable"}
        </span>
      </div>
      <div className="playground-fields">
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setModel("");
            }}
          >
            <option value="">Select project</option>
            {(projects ?? []).map((p: any) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">Use project default</option>
            {allowed.map((m: any) => (
              <option key={m._id} value={m.modelId}>
                {m.displayName || m.modelId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Temperature
          <input type="number" min="0" max="2" step="0.1" defaultValue="0.7" />
        </label>
      </div>
      <label className="prompt-input-label">
        Prompt
        <textarea
          rows={6}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter the prompt to send to your configured model…"
        />
      </label>
      {error && <ErrorNote text={error} />}
      <BusyButton busy={busy || !projectId || !input} onClick={run}>
        <Sparkles size={15} /> Send request
      </BusyButton>
      {result && (
        <div className="playground-result">
          <div className="result-meta">
            <span>Request {result.requestId}</span>
            <span>{result.latencyMs} ms</span>
            <span>{result.usage.totalTokens} tokens</span>
          </div>
          <pre>{result.text}</pre>
        </div>
      )}
    </div>
  );
}

function AnalyticsWorkspace() {
  const {
    data: overview,
    loading,
    error,
  } = useLoad("/analytics/overview?days=30");
  const { data: usage } = useLoad("/analytics/usage?days=30");
  const points = (usage ?? []) as any[];
  return (
    <div className="operational-stack">
      <ErrorNote text={error} />
      <div className="stats-grid">
        {[
          ["Requests", overview?.requests ?? 0],
          [
            "Success rate",
            overview?.successRate == null
              ? "—"
              : `${(overview.successRate * 100).toFixed(1)}%`,
          ],
          ["Input tokens", overview?.inputTokens ?? 0],
          ["Output tokens", overview?.outputTokens ?? 0],
        ].map(([label, value]) => (
          <div className="stat-card" key={String(label)}>
            <div className="stat-top">
              <span>{label}</span>
            </div>
            <div className="stat-value">
              {loading
                ? "…"
                : typeof value === "number"
                  ? value.toLocaleString()
                  : value}
            </div>
            <div className="stat-change">
              Persisted usage records · last 30 days
            </div>
          </div>
        ))}
      </div>
      <div className="panel analytics-chart">
        <div className="panel-heading">
          <div>
            <h2>Requests and token usage</h2>
            <p>Daily totals from MongoDB usage events</p>
          </div>
        </div>
        {points.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={points}>
              <defs>
                <linearGradient id="usageFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#9566f5" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#9566f5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(170,180,255,.08)" />
              <XAxis dataKey="_id" stroke="#77809a" tick={{ fontSize: 9 }} />
              <YAxis stroke="#77809a" tick={{ fontSize: 9 }} />
              <Tooltip
                contentStyle={{
                  background: "#111523",
                  border: "1px solid #33304c",
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="#aa83ff"
                fill="url(#usageFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyInline
            icon={Activity}
            title="No usage records yet"
            text="The chart will populate from real gateway requests."
          />
        )}
      </div>
      <div className="panel analytics-note">
        Average latency:{" "}
        <b>
          {overview?.avgLatencyMs == null
            ? "—"
            : `${Math.round(overview.avgLatencyMs)} ms`}
        </b>{" "}
        · Cost is only shown when the model has operator-configured pricing.
      </div>
    </div>
  );
}

function LogsWorkspace() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const projectFilter = searchParams.get("projectId") ?? "";
  const { data, loading, error, refresh } = useLoad(
    `/logs?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}), ...(projectFilter ? { projectId: projectFilter } : {}) })}`,
  );
  const rows = (Array.isArray(data) ? data : (data?.data ?? [])) as any[];
  function exportCsv() {
    const fields = [
      "createdAt",
      "projectId",
      "provider",
      "model",
      "status",
      "inputTokens",
      "outputTokens",
      "estimatedCostUsd",
      "latencyMs",
    ];
    const text = [
      fields.join(","),
      ...rows.map((row) =>
        fields.map((k) => JSON.stringify(row[k] ?? "")).join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    link.download = "kenora-request-logs.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return (
    <div className="operational-stack">
      <div className="project-toolbar">
        <label className="table-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by model…"
          />
        </label>
        <select
          className="select-button"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
        </select>
        <button className="button button-secondary" onClick={exportCsv}>
          Export CSV
        </button>
        <button className="button button-secondary" onClick={refresh}>
          Refresh
        </button>
      </div>
      <ErrorNote text={error} />
      <div className="panel projects-table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>PROJECT ID</th>
                <th>PROVIDER / MODEL</th>
                <th>STATUS</th>
                <th>TOKENS</th>
                <th>EST. COST</th>
                <th>LATENCY</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="table-loading">Loading request logs…</div>
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyInline
                      icon={FileText}
                      title="No request logs"
                      text="Only safe request metadata is stored. Prompt content is not retained by default."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>
                      <code>{String(r.projectId).slice(-8)}</code>
                    </td>
                    <td>
                      {r.provider} · {r.model}
                    </td>
                    <td>{r.status}</td>
                    <td>{r.totalTokens?.toLocaleString() ?? "—"}</td>
                    <td>
                      {r.estimatedCostUsd == null
                        ? "Unknown"
                        : `$${r.estimatedCostUsd.toFixed(6)}`}
                    </td>
                    <td>{r.latencyMs ?? "—"} ms</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BudgetsWorkspace() {
  const { data: projects, refresh: refreshProjects } = useLoad("/projects");
  const { data: budgets, refresh } = useLoad("/budgets");
  const [searchParams] = useSearchParams();
  const [projectId, setProjectId] = useState(
    searchParams.get("projectId") ?? "",
  );
  const [monthly, setMonthly] = useState("");
  const [daily, setDaily] = useState("");
  const [hard, setHard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiClient.put(`${API}/projects/${projectId}/budget`, {
        monthlyLimitUsd: Number(monthly),
        dailyLimitUsd: Number(daily) || 0,
        hardLimit: hard,
      });
      refresh();
      refreshProjects();
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Could not save budget.")
          : "Could not save budget.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="operational-stack">
      <div className="panel budget-editor">
        <h2>Project spending limit</h2>
        <p>
          Hard limits use atomic reservations before a provider request starts.
          Configure current model prices to enable cost-based enforcement.
        </p>
        <div className="playground-fields">
          <label>
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select project</option>
              {(projects ?? []).map((p: any) => (
                <option value={p._id} key={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monthly limit USD
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
          </label>
          <label>
            Daily limit USD (optional)
            <input
              type="number"
              min="0"
              step="0.01"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
          </label>
        </div>
        <label className="active-switch">
          <input
            type="checkbox"
            checked={hard}
            onChange={(e) => setHard(e.target.checked)}
          />
          Enforce hard limit before requests
        </label>
        <ErrorNote text={error} />
        <BusyButton busy={busy || !projectId || !monthly} onClick={save}>
          <Plus size={15} /> Save budget
        </BusyButton>
      </div>
      <div className="panel projects-table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PROJECT</th>
                <th>MONTHLY LIMIT</th>
                <th>MONTH SPEND</th>
                <th>DAILY LIMIT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {(budgets ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyInline
                      icon={CreditCard}
                      title="No budgets set"
                      text="Create a project budget above."
                    />
                  </td>
                </tr>
              ) : (
                (budgets as any[]).map((b) => (
                  <tr key={b._id}>
                    <td>{b.project?.name ?? String(b.projectId)}</td>
                    <td>${b.monthlyLimitUsd.toFixed(2)}</td>
                    <td>${b.monthSpentUsd.toFixed(4)}</td>
                    <td>
                      {b.dailyLimitUsd ? `$${b.dailyLimitUsd.toFixed(2)}` : "—"}
                    </td>
                    <td>{b.hardLimit ? "Hard limit" : "Warning only"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PromptsWorkspace() {
  const { data, loading, error, refresh } = useLoad("/prompts");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      if (editing)
        await apiClient.patch(`${API}/prompts/${editing}`, {
          title,
          body,
          category,
        });
      else await apiClient.post(`${API}/prompts`, { title, body, category });
      setTitle("");
      setBody("");
      setEditing("");
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Could not save prompt.")
          : "Could not save prompt.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(p: any) {
    setEditing(p._id);
    setTitle(p.title);
    setBody(p.body);
    setCategory(p.category);
  }
  return (
    <div className="operational-stack">
      <div className="panel prompt-create">
        <div className="playground-fields">
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reusable prompt name"
            />
          </label>
          <label>
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="General"
            />
          </label>
        </div>
        <label>
          Prompt content
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Use {{variable_name}} for variables."
          />
        </label>
        {message && <ErrorNote text={message} />}
        <BusyButton busy={busy || !title || !body} onClick={save}>
          {editing ? "Save changes" : "Create prompt"}
        </BusyButton>
        {editing && (
          <button
            className="button button-quiet"
            onClick={() => {
              setEditing("");
              setTitle("");
              setBody("");
            }}
          >
            Cancel edit
          </button>
        )}
      </div>
      <ErrorNote text={error} />
      <div className="prompt-list">
        {loading ? (
          <div className="table-loading">Loading prompts…</div>
        ) : !(data ?? []).length ? (
          <div className="panel">
            <EmptyInline
              icon={BookOpen}
              title="No prompts saved"
              text="Create a prompt above. Saved templates are stored in MongoDB."
            />
          </div>
        ) : (
          (data as any[]).map((p) => (
            <article className="panel prompt-card" key={p._id}>
              <div>
                <span className="status-pill status-pending">{p.category}</span>
                <h3>{p.title}</h3>
                <pre>{p.body}</pre>
              </div>
              <div className="prompt-card-actions">
                <button className="row-action" onClick={() => edit(p)}>
                  Edit
                </button>
                <button
                  className="row-action danger-text"
                  onClick={async () => {
                    await apiClient.delete(`${API}/prompts/${p._id}`);
                    refresh();
                  }}
                >
                  Delete
                </button>
                <button
                  className="row-action"
                  onClick={() => navigator.clipboard.writeText(p.body)}
                >
                  Copy
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function TeamWorkspace() {
  const { data, loading, error, refresh } = useLoad("/team");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("developer");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  async function invite() {
    setBusy(true);
    try {
      const r = await apiClient.post(`${API}/team/invitations`, { email, role });
      setToken(r.data.data.invitationToken);
      setEmail("");
      refresh();
    } catch (e) {
      alert(
        axios.isAxiosError(e)
          ? e.response?.data?.error?.message
          : "Invitation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="operational-stack">
      <div className="panel team-invite">
        <label>
          Invite by email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            type="email"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <BusyButton busy={busy || !email} onClick={invite}>
          <Plus size={14} /> Create invitation
        </BusyButton>
        {token && (
          <div className="secret-once">
            <b>Copy the invitation token and send it to the teammate.</b>
            <code>{token}</code>
            <button
              className="button button-secondary"
              onClick={() =>
                navigator.clipboard.writeText(
                  `${window.location.origin}/accept-invitation?token=${token}`,
                )
              }
            >
              Copy invitation link
            </button>
          </div>
        )}
      </div>
      <ErrorNote text={error} />
      <div className="panel projects-table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MEMBER</th>
                <th>ROLE</th>
                <th>STATUS</th>
                <th>JOINED</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>
                    <div className="table-loading">Loading members…</div>
                  </td>
                </tr>
              ) : (
                (data?.members ?? []).map((m: any) => (
                  <tr key={m._id}>
                    <td>
                      {m.name}
                      <small className="member-email">{m.email}</small>
                    </td>
                    <td>{m.role}</td>
                    <td>{m.suspended ? "Suspended" : "Active"}</td>
                    <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td>
                      {m.role !== "owner" && (
                        <button
                          className="row-action"
                          onClick={async () => {
                            await apiClient.patch(`${API}/team/${m._id}`, {
                              suspended: !m.suspended,
                            });
                            refresh();
                          }}
                        >
                          {m.suspended ? "Restore" : "Suspend"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
              {(data?.invitations ?? []).map((i: any) => (
                <tr key={i._id}>
                  <td>{i.email}</td>
                  <td>{i.role}</td>
                  <td>Invitation pending</td>
                  <td>Expires {new Date(i.expiresAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="row-action danger-text"
                      onClick={async () => {
                        await apiClient.delete(`${API}/team/invitations/${i._id}`);
                        refresh();
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NotificationsWorkspace() {
  const { data, loading, error, refresh } = useLoad("/notifications");
  const rows = (Array.isArray(data) ? data : []) as any[];
  const unread = rows.filter((n) => !n.readAt).length;
  async function markAll() {
    await apiClient.patch(`${API}/notifications/read-all`);
    refresh();
  }
  return (
    <div className="operational-stack">
      <div className="notifications-head panel">
        <div>
          <b>{unread} unread notifications</b>
          <small>Generated from real system events</small>
        </div>
        <button
          className="button button-secondary"
          disabled={!unread}
          onClick={markAll}
        >
          Mark all read
        </button>
      </div>
      <ErrorNote text={error} />
      {loading ? (
        <div className="table-loading">Loading notifications…</div>
      ) : !rows.length ? (
        <div className="panel">
          <EmptyInline
            icon={Bell}
            title="You’re all caught up"
            text="Budget and provider events will show up here."
          />
        </div>
      ) : (
        rows.map((n: any) => (
          <article className="panel notification-item" key={n._id}>
            <span className="notification-type">
              <Bell size={15} />
            </span>
            <div>
              <b>{n.title}</b>
              <p>{n.message}</p>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </div>
            <button
              className="row-action"
              onClick={async () => {
                await apiClient.patch(`${API}/notifications/${n._id}/read`);
                refresh();
              }}
            >
              {n.readAt ? "Read" : "Mark read"}
            </button>
            <button
              className="row-action danger-text"
              onClick={async () => {
                await apiClient.delete(`${API}/notifications/${n._id}`);
                refresh();
              }}
            >
              Delete
            </button>
          </article>
        ))
      )}
    </div>
  );
}

function AuditWorkspace() {
  const { data, loading, error } = useLoad("/audit");
  return (
    <div className="panel projects-table-panel">
      <ErrorNote text={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>TIME</th>
              <th>ACTOR</th>
              <th>ACTION</th>
              <th>RESOURCE</th>
              <th>DETAIL</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="table-loading">Loading audit records…</div>
                </td>
              </tr>
            ) : !(data?.data ?? []).length ? (
              <tr>
                <td colSpan={5}>
                  <EmptyInline
                    icon={ShieldCheck}
                    title="No audit actions yet"
                    text="Real administrative actions are recorded here and cannot be edited through this API."
                  />
                </td>
              </tr>
            ) : (
              (data.data as any[]).map((a: any) => (
                <tr key={a._id}>
                  <td>{new Date(a.createdAt).toLocaleString()}</td>
                  <td>
                    <code>{String(a.actorId ?? "system").slice(-8)}</code>
                  </td>
                  <td>{a.action}</td>
                  <td>{a.resourceType ?? "—"}</td>
                  <td>{a.resourceId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsWorkspace() {
  const { data, loading, error, refresh } = useLoad("/settings");
  const [name, setName] = useState("");
  const [retention, setRetention] = useState("30");
  const [promptRetention, setPromptRetention] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (data) {
      setName(data.name ?? "KenoraTech");
      setRetention(String(data.retentionDays ?? 30));
      setPromptRetention(Boolean(data.promptRetention));
    }
  }, [data]);
  async function save() {
    setMessage("");
    try {
      await apiClient.patch(`${API}/settings`, {
        name,
        retentionDays: Number(retention),
        promptRetention,
      });
      setMessage("Settings saved.");
      refresh();
    } catch (e) {
      setMessage(
        axios.isAxiosError(e)
          ? (e.response?.data?.error?.message ?? "Could not save settings.")
          : "Could not save settings.",
      );
    }
  }
  return (
    <div className="panel settings-form">
      <ErrorNote text={error} />
      {loading ? (
        <div className="table-loading">Loading persisted settings…</div>
      ) : (
        <>
          <label>
            Workspace name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Request data retention (days)
            <input
              type="number"
              min="1"
              max="3650"
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
          </label>
          <label className="active-switch">
            <input
              type="checkbox"
              checked={promptRetention}
              onChange={(e) => setPromptRetention(e.target.checked)}
            />
            Retain request prompts (disabled by default)
          </label>
          <button className="button button-primary" onClick={save}>
            Save settings
          </button>
          {message && <p className="success-copy">{message}</p>}
        </>
      )}
    </div>
  );
}

function ProviderSetup() {
  return null;
}

export default App;
