'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@/lib/constants';
import { User, Shield, Bell, Database } from 'lucide-react';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile.id);
    if (error) {
      toast.error(t('error.saveError'));
    } else {
      await refreshProfile();
      toast.success(t('settings.profileSaved'));
    }
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.title')} />
      <div className="p-6 max-w-2xl">
        <Tabs defaultValue="profile">
          <TabsList className="bg-secondary border border-border mb-6">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-card"><User className="w-4 h-4" />{t('settings.profile')}</TabsTrigger>
            <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-card"><Shield className="w-4 h-4" />{t('settings.security')}</TabsTrigger>
            <TabsTrigger value="system" className="gap-2 data-[state=active]:bg-card"><Database className="w-4 h-4" />{t('settings.system')}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t('settings.personalInfo')}</h3>
              <div className="space-y-1.5">
                <Label>{t('label.name')}</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('auth.email')}</Label>
                <Input value={profile?.email || ''} disabled className="bg-input border-border opacity-60" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('label.status')}</Label>
                <Input value={profile?.role ? ROLE_LABELS[profile.role] : ''} disabled className="bg-input border-border opacity-60" />
                <p className="text-xs text-muted-foreground">Contact admin to change your role</p>
              </div>
              <Button onClick={saveProfile} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {saving ? t('label.loading') : t('action.save')}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t('settings.securitySettings')}</h3>
              <div className="space-y-1.5">
                <Label>{t('auth.password')}</Label>
                <Input type="password" placeholder={t('auth.password')} className="bg-input border-border" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('auth.password')}</Label>
                <Input type="password" placeholder={t('auth.password')} className="bg-input border-border" />
              </div>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('action.save')}</Button>
            </div>
          </TabsContent>

          <TabsContent value="system">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t('settings.systemInfo')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t('settings.version')}</span>
                  <span className="text-foreground font-medium">FactoryOS v2.0</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Database</span>
                  <span className="text-emerald-400 font-medium">Connected</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Realtime</span>
                  <span className="text-emerald-400 font-medium">Active</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="text-foreground font-mono text-xs">{profile?.id?.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
