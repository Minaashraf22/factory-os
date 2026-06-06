'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { ROLE_LABELS } from '@/lib/constants';

import {
  LayoutDashboard, Package, Layers, ClipboardCheck, Archive,
  Warehouse, Truck, FlaskConical, Cpu, CircleDot, BookOpen,
  MessageSquare, Settings, ChevronLeft, ChevronRight, Factory,
  LogOut, Bell, User, BarChart3, Recycle, Hammer, Scissors,
  Sun, Moon
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useTheme } from '@/hooks/useTheme';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', group: 'core' },
  { href: '/orders', icon: Package, labelKey: 'nav.orders', group: 'core' },
  { href: '/kanban', icon: Layers, labelKey: 'nav.kanban', group: 'core' },
  { href: '/planning', icon: BarChart3, labelKey: 'nav.planning', group: 'core' },
  { href: '/production', icon: Hammer, labelKey: 'nav.production', group: 'production' },
  { href: '/finishing', icon: Scissors, labelKey: 'nav.finishing', group: 'production' },
  { href: '/qc', icon: ClipboardCheck, labelKey: 'nav.qc', group: 'production' },
  { href: '/packing', icon: Archive, labelKey: 'nav.packing', group: 'production' },
  { href: '/warehouse', icon: Warehouse, labelKey: 'nav.warehouse', group: 'production' },
  { href: '/shipping', icon: Truck, labelKey: 'nav.shipping', group: 'production' },
  { href: '/remnants', icon: Recycle, labelKey: 'nav.remnants', group: 'production' },
  { href: '/materials', icon: FlaskConical, labelKey: 'nav.materials', group: 'resources' },
  { href: '/machines', icon: Cpu, labelKey: 'nav.machines', group: 'resources' },
  { href: '/molds', icon: CircleDot, labelKey: 'nav.molds', group: 'resources' },
  { href: '/inventory', icon: BookOpen, labelKey: 'nav.inventory', group: 'resources' },
  { href: '/chat', icon: MessageSquare, labelKey: 'nav.chat', group: 'system' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings', group: 'system' },
];

const groups = [
  { key: 'core', labelKey: 'nav.groups.operations' },
  { key: 'production', labelKey: 'nav.groups.production' },
  { key: 'resources', labelKey: 'nav.groups.resources' },
  { key: 'system', labelKey: 'nav.groups.system' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { t } = useI18n();

  // 🌙 THEME HOOK
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className={cn(
      'flex flex-col h-screen bg-card border-r border-border transition-all duration-300 flex-shrink-0',
      collapsed ? 'w-16' : 'w-60'
    )}>

      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-4 border-b border-border',
        collapsed && 'justify-center px-2'
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Factory className="w-4 h-4 text-primary" />
        </div>

        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold text-foreground leading-none">FactoryOS</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">Manufacturing ERP</p>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors',
            collapsed && 'ml-0'
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {groups.map(group => {
          const items = navItems.filter(i => i.group === group.key);

          return (
            <div key={group.key} className="mb-4">
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                  {t(group.labelKey as TranslationKey)}
                </p>
              )}

              {items.map(item => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));

                return (
                  <Link key={item.href} href={item.href}>
                    <div className={cn(
                      'flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5',
                      active
                        ? 'sidebar-item-active text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                      collapsed && 'justify-center px-2'
                    )}>
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && (
                        <span className="truncate">
                          {t(item.labelKey as TranslationKey)}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className={cn(
        'border-t border-border p-2 flex flex-col gap-2',
        collapsed && 'items-center'
      )}>

        {/* 🌙 Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={cn(
            'flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-all',
            'hover:bg-secondary text-muted-foreground hover:text-foreground',
            collapsed && 'justify-center w-10 h-10'
          )}
          title="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-yellow-400" />
          ) : (
            <Moon className="w-4 h-4" />
          )}

          {!collapsed && (
            <span className="text-xs">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </button>

        {/* Language */}
        <LanguageSwitcher collapsed={collapsed} />

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              'flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-secondary transition-colors text-left',
              collapsed && 'justify-center w-auto'
            )}>
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
                {getInitials(profile?.full_name || profile?.email || '?')}
              </div>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {profile?.full_name || 'User'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {profile?.role ? ROLE_LABELS[profile.role] : ''}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
            <DropdownMenuItem className="gap-2">
              <User className="w-4 h-4" />
              {t('nav.profile')}
            </DropdownMenuItem>

            <DropdownMenuItem className="gap-2">
              <Bell className="w-4 h-4" />
              {t('nav.notifications')}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4" />
              {t('nav.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </aside>
  );
}