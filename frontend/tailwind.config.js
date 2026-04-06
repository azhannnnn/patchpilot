export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface:'#0d0f17', panel:'#131621', border:'#1e2130', muted:'#3d4258',
        subtle:'#6b7094', body:'#c9cde0', heading:'#eceef6',
        accent:'#6366f1', 'accent-light':'#818cf8', 'accent-glow':'rgba(99,102,241,0.18)',
        success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', info:'#38bdf8',
      },
      fontFamily: { sans:['Inter','system-ui','sans-serif'], mono:['"JetBrains Mono"','monospace'] },
      animation: { 'fade-up':'fadeUp 0.3s ease both', 'fade-in':'fadeIn 0.2s ease both',
        'slide-in':'slideIn 0.35s cubic-bezier(0.16,1,0.3,1) both', 'orb-float':'orbFloat 8s ease-in-out infinite' },
      keyframes: {
        fadeUp:   { from:{opacity:0,transform:'translateY(12px)'}, to:{opacity:1,transform:'translateY(0)'} },
        fadeIn:   { from:{opacity:0}, to:{opacity:1} },
        slideIn:  { from:{opacity:0,transform:'translateX(-10px)'}, to:{opacity:1,transform:'translateX(0)'} },
        orbFloat: { '0%,100%':{transform:'translateY(0) scale(1)'}, '50%':{transform:'translateY(-20px) scale(1.04)'} },
      },
    },
  },
  plugins: [],
}
