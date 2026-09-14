import React from 'react';
import { Link } from 'react-router-dom';
import RotatingEarth from '@/components/ui/wireframe-dotted-globe';
import { useTheme } from '../context/ThemeContext';

const Home: React.FC = () => {
  const { isDark } = useTheme();

  return (
    <div
      className={`flex-1 w-full flex flex-col justify-between font-garamond transition-colors duration-300 select-none ${
        isDark ? 'bg-[#050505] text-[#fafafa]' : 'bg-[#fafafa] text-[#0a0a0a]'
      }`}
      style={{ fontFamily: '"EB Garamond", serif' }}
    >
      {/* Main Hero Body: Left Typography + Right Dotted Globe */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-8 md:px-16 flex flex-col lg:flex-row items-center justify-between gap-8 py-8 md:py-12">
        {/* Left Side: Left Aligned */}
        <div className="w-full lg:w-1/2 flex flex-col items-start text-left space-y-6 z-10">
          <div className="space-y-3">
            {/* "Router" in extrabold italic */}
            <h1
              className={`text-7xl sm:text-8xl md:text-9xl leading-none tracking-tight ${
                isDark ? 'text-white' : 'text-black'
              }`}
              style={{
                fontFamily: '"EB Garamond", serif',
                fontWeight: 800,
                fontStyle: 'italic',
              }}
            >
              Router
            </h1>

            {/* "Intelligent Traffic Route Optimiser" */}
            <p
              className={`text-2xl sm:text-3xl md:text-4xl tracking-normal font-normal ${
                isDark ? 'text-neutral-300' : 'text-neutral-800'
              }`}
              style={{ fontFamily: '"EB Garamond", serif' }}
            >
              Intelligent Traffic Route Optimiser
            </p>
          </div>

          <p
            className={`text-lg sm:text-xl max-w-lg leading-relaxed ${
              isDark ? 'text-neutral-400' : 'text-neutral-600'
            }`}
            style={{ fontFamily: '"EB Garamond", serif' }}
          >
            Quantum-inspired many-objective path generation across travel time, road distance, congestion exposure, and route disruption.
          </p>

          {/* Action Button: "Demo a Route" */}
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Link
              to="/demo"
              className={`px-8 py-3 rounded-full text-xl font-medium tracking-wide transition-all duration-300 ${
                isDark
                  ? 'bg-white text-black hover:bg-neutral-200 shadow-lg shadow-white/5 hover:scale-105 active:scale-95'
                  : 'bg-black text-white hover:bg-neutral-800 shadow-lg shadow-black/10 hover:scale-105 active:scale-95'
              }`}
              style={{ fontFamily: '"EB Garamond", serif' }}
            >
              Demo a Route
            </Link>
          </div>
        </div>

        {/* Right Side: Rotating Wireframe Dotted Globe */}
        <div className="w-full lg:w-1/2 flex items-center justify-center relative p-2 md:p-6">
          <div className="w-full max-w-[500px] aspect-square flex items-center justify-center relative">
            <RotatingEarth
              width={500}
              height={500}
              isDark={isDark}
              className="w-full h-full"
            />
          </div>
        </div>
      </main>

      {/* Footer / Status */}
      <footer
        className={`w-full px-8 md:px-16 py-4 flex items-center justify-between border-t text-sm ${
          isDark ? 'border-[#1a1a1a] text-neutral-500' : 'border-[#eeeeee] text-neutral-500'
        }`}
      >
        <div>
          <span>© {new Date().getFullYear()} router · all rights reserved</span>
        </div>
        <div className="text-right hidden sm:block">
          <span>quantum particle swarm optimisation · osm live graph</span>
        </div>
      </footer>
    </div>
  );
};

export default Home;
