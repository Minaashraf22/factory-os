'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center overflow-hidden">

      {/* 🎥 Background Video */}
      <video
        autoPlay
        loop
        muted
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/factory.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Glow */}
      <div className="absolute w-[600px] h-[600px] bg-orange-500/20 blur-[150px] rounded-full top-[-200px] left-[-200px]" />
      <div className="absolute w-[500px] h-[500px] bg-orange-400/20 blur-[160px] rounded-full bottom-[-200px] right-[-200px]" />

      {/* Content */}
      <div className="relative text-white px-6 max-w-3xl text-center pointer-events-auto">

        <h1 className="text-3xl md:text-4xl font-bold mb-6">
          👋 Welcome Team
        </h1>

        <div className="text-white/80 leading-relaxed text-sm md:text-base space-y-4 text-right md:text-center">

          <p>
            أنا حابب أرحب بيكم في أول يوم لينا مع بعض على الموقع الجديد بتاع الشركة،
            واللي بإذن الله هيكون بداية حاجة كبيرة ومختلفة جدًا لينا كلنا ❤️
          </p>

          <p>
            الموقع ده مش مجرد سيستم… ده حاجة بنبنيها سوا، وكل واحد فيكم ليه دور مهم جدًا فيه 🚀
          </p>

          <p>
            أنتم أول الناس اللي هتجربوه، وهتساعدوني أخليه أحسن يوم بعد يوم 💪
          </p>

          <p>
            أي ملاحظات منكم هتفرق جدًا وهتخلّي النظام أقوى 🔥
          </p>

          <p>
            شكراً ليكم على دعمكم وحماسكم ❤️🔥
          </p>

        </div>

        <button
          onClick={onEnter}
          className="mt-8 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 font-semibold hover:opacity-90 transition"
        >
          Enter System
        </button>

        <div className="mt-4 text-[10px] text-white/30">
          v1 passion by Mena Ashraf
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('admin@factoryos.com');
  const [password, setPassword] = useState('factory2024');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setShowWelcome(true);
  }

  function enterSystem() {
    router.push('/dashboard');
  }

  return (
    <>
      {/* 🌌 LOGIN (NO VIDEO HERE) */}
      <div className="min-h-screen relative flex items-center justify-center bg-black overflow-hidden">

        {/* Glow Background */}
        <div className="absolute w-[600px] h-[600px] bg-orange-500/30 blur-[140px] rounded-full top-[-200px] left-[-200px]" />
        <div className="absolute w-[500px] h-[500px] bg-orange-400/20 blur-[160px] rounded-full bottom-[-200px] right-[-200px]" />

        {/* Layout */}
        <div className="relative z-10 w-full max-w-6xl flex flex-col md:flex-row items-center gap-12 px-6">

          {/* LEFT LOGO (kept) */}
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <img
              src="/logo.png"
              className="w-[220px] md:w-[300px]"
              alt="logo"
            />
          </div>

          {/* LOGIN CARD */}
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-8">

              <h2 className="text-white text-xl mb-6">Login</h2>

              {error && (
                <div className="text-red-400 mb-3 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">

                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 text-white/40" />
                  <input
                    className="w-full pl-10 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 text-white/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-white/40"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <button
                  disabled={loading}
                  className="w-full py-3 bg-orange-500 rounded-lg text-white"
                >
                  {loading ? 'Loading...' : 'Login'}
                </button>

              </form>

            </div>
          </div>
        </div>
      </div>

      {/* 🚀 WELCOME OVERLAY (TOP MOST) */}
      {showWelcome && (
        <WelcomeScreen onEnter={enterSystem} />
      )}
    </>
  );
}
