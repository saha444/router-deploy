import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const Navbar: React.FC = () => {
  const { pathname } = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <header
        className={`w-full h-16 px-6 md:px-14 flex items-center justify-between border-b transition-colors duration-300 shrink-0 select-none ${
          isDark
            ? 'bg-[#050505]/95 border-[#222222] text-[#fafafa]'
            : 'bg-[#fafafa]/95 border-[#e5e5e5] text-[#0a0a0a]'
        } backdrop-blur-md fixed top-0 left-0 right-0 z-50`}
        style={{ fontFamily: '"EB Garamond", serif' }}
      >
        {/* Simple "router" Brand text */}
        <Link
          to="/"
          className={`text-2xl lowercase tracking-tight transition-opacity hover:opacity-75 ${
            isDark ? 'text-white' : 'text-black'
          }`}
          style={{ fontStyle: 'italic', fontWeight: 600 }}
        >
          router
        </Link>

        {/* Navigation Items */}
        <nav className="flex items-center gap-6 sm:gap-8 text-lg">
          <Link
            to="/"
            className={`transition-opacity hover:opacity-100 ${
              pathname === '/'
                ? isDark
                  ? 'text-white font-medium underline underline-offset-4'
                  : 'text-black font-medium underline underline-offset-4'
                : isDark
                ? 'text-neutral-400 hover:text-white'
                : 'text-neutral-600 hover:text-black'
            }`}
          >
            home
          </Link>

          {/* Tools Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              className={`transition-opacity hover:opacity-100 flex items-center gap-1 ${
                pathname.startsWith('/routing') || pathname.startsWith('/demo') || pathname.startsWith('/research')
                  ? isDark
                    ? 'text-white font-medium'
                    : 'text-black font-medium'
                  : isDark
                  ? 'text-neutral-400 hover:text-white'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              <span>tools</span>
              <span className="text-xs">▾</span>
            </button>

            {showToolsMenu && (
              <div
                className={`absolute top-full mt-2 left-0 w-48 rounded-xl border py-2 shadow-2xl z-50 transition-all ${
                  isDark
                    ? 'bg-[#0e0e0e] border-[#262626] text-white shadow-black/80'
                    : 'bg-white border-[#e5e5e5] text-black shadow-black/10'
                }`}
                onMouseLeave={() => setShowToolsMenu(false)}
              >
                <Link
                  to="/routing"
                  onClick={() => setShowToolsMenu(false)}
                  className={`block px-4 py-2 text-base transition-colors ${
                    isDark ? 'hover:bg-neutral-900' : 'hover:bg-neutral-100'
                  }`}
                >
                  live routing
                </Link>
                <Link
                  to="/demo"
                  onClick={() => setShowToolsMenu(false)}
                  className={`block px-4 py-2 text-base transition-colors ${
                    isDark ? 'hover:bg-neutral-900' : 'hover:bg-neutral-100'
                  }`}
                >
                  route simulation
                </Link>
                <Link
                  to="/research"
                  onClick={() => setShowToolsMenu(false)}
                  className={`block px-4 py-2 text-base transition-colors ${
                    isDark ? 'hover:bg-neutral-900' : 'hover:bg-neutral-100'
                  }`}
                >
                  research lab
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAbout(true)}
            className={`transition-opacity hover:opacity-100 ${
              isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'
            }`}
          >
            about
          </button>

          <button
            onClick={() => setShowAuth(true)}
            className={`px-4 py-1 rounded-full border text-base transition-all duration-300 ${
              isDark
                ? 'border-neutral-700 text-white hover:bg-white hover:text-black'
                : 'border-neutral-300 text-black hover:bg-black hover:text-white'
            }`}
          >
            sign up / login
          </button>

          {/* Constant Navbar Theme Toggle (Icon Only) */}
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-300 ${
              isDark
                ? 'border-neutral-700 text-white hover:border-white hover:scale-105 active:scale-95'
                : 'border-neutral-300 text-black hover:border-black hover:scale-105 active:scale-95'
            }`}
          >
            {isDark ? (
              /* Sun icon */
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <circle cx="12" cy="12" r="4.5" />
                <path
                  strokeLinecap="round"
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                />
              </svg>
            ) : (
              /* Moon icon */
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </nav>
      </header>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in font-garamond">
          <div
            className={`max-w-xl w-full p-8 rounded-2xl border shadow-2xl relative ${
              isDark ? 'bg-[#0a0a0a] border-neutral-800 text-white' : 'bg-white border-neutral-300 text-black'
            }`}
            style={{ fontFamily: '"EB Garamond", serif' }}
          >
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-4 right-5 text-2xl font-light hover:opacity-60"
            >
              &times;
            </button>
            <h2 className="text-3xl font-semibold mb-2">About Router</h2>
            <p className="text-base leading-relaxed opacity-80 mb-4">
              ROUTER is an event-triggered many-objective quantum-inspired vehicle routing optimization platform.
              It dynamically reconfigures multi-vehicle urban delivery corridors across travel time, road distance,
              congestion exposure, and route disruption.
            </p>
            <div className={`p-4 rounded-xl border mb-6 text-sm ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-100 border-neutral-200'}`}>
              <div className="font-semibold mb-1">Core Mathematical Formulation</div>
              <div>min F(x) = &#123; T(x), D(x), C(x), R(x) &#125;</div>
              <div className="text-xs opacity-70 mt-1">
                Optimized via ET-MaO-QPSO over OpenStreetMap live topological graphs.
              </div>
            </div>
            <button
              onClick={() => setShowAbout(false)}
              className={`w-full py-2.5 rounded-full border text-base font-medium transition-all ${
                isDark ? 'border-neutral-700 bg-white text-black hover:bg-neutral-200' : 'border-neutral-300 bg-black text-white hover:bg-neutral-800'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Auth / Login Modal */}
      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in font-garamond">
          <div
            className={`max-w-md w-full p-8 rounded-2xl border shadow-2xl relative ${
              isDark ? 'bg-[#0a0a0a] border-neutral-800 text-white' : 'bg-white border-neutral-300 text-black'
            }`}
            style={{ fontFamily: '"EB Garamond", serif' }}
          >
            <button
              onClick={() => setShowAuth(false)}
              className="absolute top-4 right-5 text-2xl font-light hover:opacity-60"
            >
              &times;
            </button>
            <h2 className="text-3xl font-semibold mb-1">Sign In</h2>
            <p className="text-sm opacity-70 mb-6">Access your fleet operations and saved routing scenarios.</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowAuth(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm mb-1 opacity-80">Email address</label>
                <input
                  type="email"
                  required
                  placeholder="operator@fleet.org"
                  className={`w-full px-4 py-2.5 rounded-xl border text-base outline-none transition-colors ${
                    isDark
                      ? 'bg-neutral-900 border-neutral-800 text-white focus:border-white'
                      : 'bg-neutral-50 border-neutral-300 text-black focus:border-black'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 opacity-80">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className={`w-full px-4 py-2.5 rounded-xl border text-base outline-none transition-colors ${
                    isDark
                      ? 'bg-neutral-900 border-neutral-800 text-white focus:border-white'
                      : 'bg-neutral-50 border-neutral-300 text-black focus:border-black'
                  }`}
                />
              </div>

              <button
                type="submit"
                className={`w-full py-3 rounded-full text-base font-medium transition-all duration-300 mt-2 ${
                  isDark
                    ? 'bg-white text-black hover:bg-neutral-200'
                    : 'bg-black text-white hover:bg-neutral-800'
                }`}
              >
                Continue to Dispatch
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
