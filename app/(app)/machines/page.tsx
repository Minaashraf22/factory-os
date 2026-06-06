'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Plus, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';

interface Machine {
  id: string;
  code: string;
  name: string;
  type: string;
  status: 'available' | 'in_use' | 'maintenance' | 'offline';
  is_active: boolean;
  machine_assignments?: MachineAssignment[];
}

interface MachineAssignment {
  id: string;
  assigned_at: string;
  released_at: string | null;
  notes: string | null;
  order_item?: {
    color_name: string;
    order?: { order_code: string; product_model: string };
  };
}

interface OrderItem {
  id: string;
  color_name: string;
  order?: { order_code: string; product_model: string };
}

const STATUS_COLORS: Record<string, string> = {
  available: 'text-emerald-400 bg-emerald-950',
  in_use: 'text-blue-400 bg-blue-950',
  maintenance: 'text-amber-400 bg-amber-950',
  offline: 'text-red-400 bg-red-950',
};

export default function MachinesPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialog, setAssignDialog] = useState(false);
  const [releaseDialog, setReleaseDialog] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [selectedOrderItem, setSelectedOrderItem] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);

      const [machinesRes, itemsRes] = await Promise.all([
        supabase
          .from('machines')
          .select(
            `
            *,
            machine_assignments(
              id, assigned_at, released_at, notes,
              order_item:order_items(color_name, order:orders(order_code, product_model))
            )
          `
          )
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('order_items')
          .select('id, color_name, order:orders(order_code, product_model)')
          .eq('workflow_stage', 'production'),
      ]);

      if (machinesRes.error) throw machinesRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setMachines((machinesRes.data as Machine[]) || []);
      setOrderItems((itemsRes.data as unknown as OrderItem[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('error.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function getActiveAssignment(machine: Machine): MachineAssignment | null {
    return (machine.machine_assignments || []).find((a) => !a.released_at) || null;
  }

  function openAssignDialog(machine: Machine) {
    setSelectedMachine(machine);
    setSelectedOrderItem('');
    setAssignmentNotes('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setAssignDialog(true);
  }

  function openReleaseDialog(machine: Machine) {
    setSelectedMachine(machine);
    setReleaseNotes('');
    setReleaseDialog(true);
  }

  async function handleAssignMachine() {
    if (!selectedMachine || !profile || !selectedOrderItem) {
      toast.error(t('error.required'));
      return;
    }

    setSubmitting(true);
    try {
      const { error: assignError } = await supabase.from('machine_assignments').insert({
        machine_id: selectedMachine.id,
        order_item_id: selectedOrderItem,
        assigned_at: new Date(startDate).toISOString(),
        notes: assignmentNotes || null,
        created_by: profile.id,
      });

      if (assignError) throw assignError;

      const { error: statusError } = await supabase
        .from('machines')
        .update({ status: 'in_use' })
        .eq('id', selectedMachine.id);

      if (statusError) throw statusError;

      toast.success(t('machines.assignSuccess'));
      setAssignDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error assigning machine:', error);
      toast.error(t('error.failedAssign'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReleaseMachine() {
    if (!selectedMachine || !profile) {
      toast.error(t('error.invalidState'));
      return;
    }

    setSubmitting(true);
    try {
      const activeAssignment = getActiveAssignment(selectedMachine);
      if (!activeAssignment) {
        toast.error(t('error.noActiveAssignment'));
        setSubmitting(false);
        return;
      }

      const { error: releaseError } = await supabase
        .from('machine_assignments')
        .update({
          released_at: new Date().toISOString(),
          notes: releaseNotes || activeAssignment.notes,
        })
        .eq('id', activeAssignment.id);

      if (releaseError) throw releaseError;

      const { error: statusError } = await supabase
        .from('machines')
        .update({ status: 'available' })
        .eq('id', selectedMachine.id);

      if (statusError) throw statusError;

      toast.success(t('machines.releaseSuccess'));
      setReleaseDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error releasing machine:', error);
      toast.error(t('error.failedRelease'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMachine(machineId: string) {
    try {
      const { error } = await supabase.from('machines').update({ is_active: false }).eq('id', machineId);

      if (error) throw error;
      toast.success(t('machines.deleteSuccess'));
      fetchData();
    } catch (error) {
      console.error('Error deleting machine:', error);
      toast.error(t('error.saveError'));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('machines.title')} />
        <div className="flex-1 p-6">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-card rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = {
    available: machines.filter((m) => m.status === 'available').length,
    in_use: machines.filter((m) => m.status === 'in_use').length,
    maintenance: machines.filter((m) => m.status === 'maintenance').length,
    offline: machines.filter((m) => m.status === 'offline').length,
    total: machines.length,
  };

  const utilizationPercent = stats.total > 0 ? Math.round((stats.in_use / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('machines.title')}
        subtitle={t('machines.machinesInUse', { used: stats.in_use, total: stats.total })}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-card border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('machines.available')}</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.available}</p>
            </Card>
            <Card className="bg-card border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('machines.inUse')}</p>
              <p className="text-2xl font-bold text-blue-400">{stats.in_use}</p>
            </Card>
            <Card className="bg-card border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('machines.maintenance')}</p>
              <p className="text-2xl font-bold text-amber-400">{stats.maintenance}</p>
            </Card>
            <Card className="bg-card border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('label.utilization')}</p>
              <div className="flex items-end gap-2 mt-2">
                <div className="flex-1 h-1 bg-card/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${utilizationPercent}%` }}
                  />
                </div>
                <p className="text-sm font-medium text-blue-400">{utilizationPercent}%</p>
              </div>
            </Card>
          </div>

          {machines.length === 0 ? (
            <Card className="bg-card border-border p-6 text-center">
              <p className="text-muted-foreground mb-4">{t('machines.noMachines')}</p>
              <Button size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1" />
                {t('machines.addFirst')}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {machines.map((machine) => {
                const activeAssignment = getActiveAssignment(machine);

                return (
                  <Card key={machine.id} className="bg-card border-border p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{machine.name}</h3>
                        <p className="text-xs font-mono text-muted-foreground">{machine.code}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => handleDeleteMachine(machine.id)}
                          >
                            {t('action.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('label.type')}</span>
                        <Badge variant="outline">{machine.type}</Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('label.status')}</span>
                        <Badge className={STATUS_COLORS[machine.status]}>
                          {machine.status === 'available' ? t('machines.available') : machine.status === 'in_use' ? t('machines.inUse') : machine.status === 'maintenance' ? t('machines.maintenance') : t('machines.offline')}
                        </Badge>
                      </div>

                      {activeAssignment && (
                        <div className="bg-card/50 border border-border rounded p-2 space-y-1">
                          <p className="text-xs text-muted-foreground">{t('machines.assignedTo')}</p>
                          <p className="text-sm font-medium text-blue-300">
                            {activeAssignment.order_item?.order?.order_code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activeAssignment.order_item?.color_name}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        {machine.status === 'available' ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openAssignDialog(machine)}
                            className="flex-1"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {t('machines.assign')}
                          </Button>
                        ) : machine.status === 'in_use' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReleaseDialog(machine)}
                            className="flex-1"
                          >
                            {t('machines.release')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('machines.assignMachine', { name: selectedMachine?.name || '' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">{t('machines.selectOrderItem')}</label>
              <Select value={selectedOrderItem} onValueChange={setSelectedOrderItem}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder={t('machines.selectOrderItem')} />
                </SelectTrigger>
                <SelectContent>
                  {orderItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.order?.order_code} - {item.color_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">{t('label.startDate')}</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-card border-border"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">{t('label.notes')}</label>
              <Input
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder={t('label.notes')}
                className="bg-card border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleAssignMachine} disabled={submitting}>
              {submitting ? t('machines.assigning') : t('machines.assign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={releaseDialog} onOpenChange={setReleaseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('machines.releaseMachine', { name: selectedMachine?.name || '' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">{t('label.completionNotes')}</label>
              <Input
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder={t('label.notes')}
                className="bg-card border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialog(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleReleaseMachine} disabled={submitting}>
              {submitting ? t('machines.releasing') : t('machines.release')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
