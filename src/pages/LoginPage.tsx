import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useAuthStore } from "../store/auth.store";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [showDemoLogin, setShowDemoLogin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const savedFlag = localStorage.getItem("enable_demo_login");
      setShowDemoLogin(savedFlag === "true");
    } catch {
      setShowDemoLogin(false);
    }
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await authApi.login(email, password);
      
      // Login with token and user info including permissions
      login(data.token, data.user);
      // Cashiers go straight to the POS; everyone else lands on the dashboard
      const roleName = data.user?.role?.name;
      navigate(roleName === "CASHIER" ? "/pos" : "/dashboard");
    } catch (error: any) {
      setError(error?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await authApi.demoLogin();
      
      // Login with token and temporary user info
      login(data.token, data.user);
      // Demo users are always CASHIER role, go to POS
      navigate("/dashboard");
    } catch (error: any) {
      setError(error?.response?.data?.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800">POS Login</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to continue
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              placeholder="admin@test.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          {showDemoLogin && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-slate-500">or try demo</span>
                </div>
              </div>

              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Loading Demo..." : "Demo Login"}
              </button>
            </>
          )}
        </div>

        {showDemoLogin && (
          <div className="mt-6 text-center text-xs text-slate-500">
            <p>Demo credentials:</p>
            <p className="mt-1">Email: admin@test.com</p>
            <p>Password: admin123</p>
            <p className="mt-3 font-semibold text-blue-600">Or click "Demo Login" above to get isolated demo session!</p>
          </div>
        )}
      </div>
    </div>
  );
}