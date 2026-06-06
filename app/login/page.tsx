'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Factory, Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role: 'production' },
          },
        });
        if (error) throw error;
        toast.success(t('auth.signup') + '!');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('error.generic');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'admin@factoryos.com',
        password: 'factory2024',
      });
      if (error) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: 'admin@factoryos.com',
          password: 'factory2024',
          options: { data: { full_name: 'Factory Admin', role: 'admin' } },
        });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: 'admin@factoryos.com',
          password: 'factory2024',
        });
        if (signInError) throw signInError;
      }
      router.replace('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('error.generic');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background factory-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Factory className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">FactoryOS</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('dashboard.title')}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-6">
            {isSignUp ? t('auth.signup') : t('auth.signin')}
          </h2>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder={t('auth.fullName')}
                  required
                  className="bg-input border-border"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@factory.com"
                  required
                  className="pl-9 bg-input border-border"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pl-9 pr-9 bg-input border-border"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {isSignUp ? '...' : '...'}
                </span>
              ) : (
                isSignUp ? t('auth.signup') : t('auth.signin')
              )}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full border-border hover:bg-secondary"
            onClick={handleDemoLogin}
            disabled={loading}
          >
            {t('auth.demoLogin')}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? t('auth.signin') : t('auth.signup')}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          FactoryOS v2.0 &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}  
