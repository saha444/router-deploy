import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import RoutingPage from './pages/routing/RoutingPage';
import DemoPage from './pages/demo/DemoPage';
import ResearchLab from './pages/ResearchLab';
import { RoutingProvider } from './context/RoutingContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const MainLayout: React.FC = () => {
  const { isDark } = useTheme();

  return (
    <div
      className={`min-h-screen flex flex-col font-garamond transition-colors duration-300 ${
        isDark ? 'bg-[#050505] text-[#fafafa]' : 'bg-[#fafafa] text-[#0a0a0a]'
      }`}
      style={{ fontFamily: '"EB Garamond", serif' }}
    >
      <Navbar />
      <main className="flex-1 pt-16 flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/routing/*" element={<RoutingPage />} />
          <Route path="/demo/*" element={<DemoPage />} />
          <Route path="/research/*" element={<ResearchLab />} />

          {/* Backwards compatibility aliases */}
          <Route path="/network" element={<Navigate to="/routing" replace />} />
          <Route path="/optimizer" element={<Navigate to="/routing" replace />} />
          <Route path="/traffic" element={<Navigate to="/demo" replace />} />
          <Route path="/benchmark" element={<Navigate to="/research" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <ThemeProvider>
      <RoutingProvider>
        <MainLayout />
      </RoutingProvider>
    </ThemeProvider>
  </BrowserRouter>
);

export default App;
