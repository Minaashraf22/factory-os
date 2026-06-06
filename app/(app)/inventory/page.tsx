'use client';

import { useEffect, useState } from 'react';
import { Plus, Calendar } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';

interface LedgerEntry {
  id: string;
  item_type: string;
  item_id: string;
  transaction_type: string;
  quantity: number;
  reference: string;
  balance_after: number;
  created_at: string;
  performed_by_profile?: { full_name: string };
  material?: { name: string; code: string };
}

interface Material {
  id: string;
  name: string;
  code: string;
}

const TRANSACTION_COLORS: Record<string, string> = {
  addition: 'bg-emerald-950 text-emerald-400',
  deduction: 'bg-red-950 text-red-400',
  transfer: 'bg-blue-950 text-blue-400',
  return: 'bg-amber-950 text-amber-400',
  adjustment: 'bg-orange-950 text-orange-400',
};

export default function InventoryLedgerPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formData, setFormData] = useState({
    item_id: '',
    transaction_type: 'adjustment',
    quantity: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ledgerRes, materialsRes] = await Promise.all([
        supabase
          .from('inventory_ledger')
          .select('*, performed_by_profile:profiles(full_name), material:materials(name, code)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('materials').select('id, name, code').eq('is_active', true).order('name'),
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (materialsRes.error) throw materialsRes.error;

      setEntries(ledgerRes.data || []);
      setMaterials(materialsRes.data || []);
    } catch (error) {
      toast.error('Failed to load ledger');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordTransaction = async () => {
    if (!formData.item_id || !formData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const quantity = parseInt(formData.quantity);
      const material = materials.find((m) => m.id === formData.item_id);

      // Get current balance
      const { data: stockData } = await supabase
        .from('material_stock')
        .select('quantity')
        .eq('material_id', formData.item_id)
        .single();

      const currentQty = stockData?.quantity || 0;
      const newBalance =
        formData.transaction_type === 'addition'
          ? currentQty + quantity
          : currentQty - quantity;

      // Insert ledger entry
      const { error } = await supabase.from('inventory_ledger').insert([
        {
          item_type: 'material',
          item_id: formData.item_id,
          transaction_type: formData.transaction_type,
          quantity: quantity,
          reference: formData.notes,
          balance_after: newBalance,
        },
      ]);

      if (error) throw error;

      // Update material stock
      await supabase
        .from('material_stock')
        .update({ quantity: newBalance })
        .eq('material_id', formData.item_id);

      toast.success('Transaction recorded');
      setOpen(false);
      setFormData({ item_id: '', transaction_type: 'adjustment', quantity: '', notes: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to record transaction');
      console.error(error);
    }
  };

  const filtered = entries.filter((entry) => {
    let matchesType = true;
    if (typeFilter !== 'all') {
      matchesType = entry.transaction_type === typeFilter;
    }

    let matchesDate = true;
    if (startDate || endDate) {
      const entryDate = new Date(entry.created_at);
      if (startDate) matchesDate = matchesDate && entryDate >= new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && entryDate <= end;
      }
    }

    return matchesType && matchesDate;
  });

  const stats = {
    additionsToday: entries
      .filter((e) => {
        const today = new Date();
        const entryDate = new Date(e.created_at);
        return (
          e.transaction_type === 'addition'
          && entryDate.toDateString() === today.toDateString()
        );
      })
      .reduce((sum, e) => sum + e.quantity, 0),
    deductionsToday: entries
      .filter((e) => {
        const today = new Date();
        const entryDate = new Date(e.created_at);
        return (
          e.transaction_type === 'deduction'
          && entryDate.toDateString() === today.toDateString()
        );
      })
      .reduce((sum, e) => sum + e.quantity, 0),
    pending: 0,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('label.loading')}</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{t('inventory.title')}</h1>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t('action.submit')}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">{t('inventory.addition')}</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.additionsToday}</p>
        </div>
        <div className="bg-slate-800 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">{t('inventory.deduction')}</p>
          <p className="text-2xl font-bold text-red-400">{stats.deductionsToday}</p>
        </div>
        <div className="bg-slate-800 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">Pending Transactions</p>
          <p className="text-2xl font-bold">{stats.pending}</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('inventory.allTypes')}</SelectItem>
            <SelectItem value="addition">{t('inventory.addition')}</SelectItem>
            <SelectItem value="deduction">{t('inventory.deduction')}</SelectItem>
            <SelectItem value="transfer">{t('inventory.transfer')}</SelectItem>
            <SelectItem value="return">{t('inventory.return')}</SelectItem>
            <SelectItem value="adjustment">{t('inventory.adjustment')}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Start date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-40"
        />
        <Input
          placeholder="End date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-40"
        />
      </div>

      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.date')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('inventory.transactionType')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('inventory.item')}</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">{t('label.quantity')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('inventory.reference')}</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">{t('inventory.balance')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('inventory.performedBy')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-800 border-t border-slate-700">
                <td className="px-6 py-3 text-sm">{new Date(entry.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-3 text-sm">
                  <Badge className={TRANSACTION_COLORS[entry.transaction_type] || 'bg-gray-950 text-gray-400'}>
                    {entry.transaction_type}
                  </Badge>
                </td>
                <td className="px-6 py-3 text-sm">
                  {entry.material ? (
                    <div>
                      <p className="font-medium">{entry.material.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{entry.material.code}</p>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className={`px-6 py-3 text-sm text-right font-semibold ${
                  entry.transaction_type === 'addition' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {entry.transaction_type === 'addition' ? '+' : '-'}
                  {entry.quantity}
                </td>
                <td className="px-6 py-3 text-sm text-gray-400">{entry.reference || '-'}</td>
                <td className="px-6 py-3 text-sm text-right font-mono">{entry.balance_after}</td>
                <td className="px-6 py-3 text-sm text-gray-400">{entry.performed_by_profile?.full_name || 'System'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {entries.length === 0 ? t('label.noData') : t('label.noData')}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('action.submit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={formData.item_id} onValueChange={(value) => setFormData({ ...formData, item_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('label.material')} />
              </SelectTrigger>
              <SelectContent>
                {materials.map((material) => (
                  <SelectItem key={material.id} value={material.id}>
                    {material.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={formData.transaction_type} onValueChange={(value) => setFormData({ ...formData, transaction_type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="addition">{t('inventory.addition')}</SelectItem>
                <SelectItem value="deduction">{t('inventory.deduction')}</SelectItem>
                <SelectItem value="transfer">{t('inventory.transfer')}</SelectItem>
                <SelectItem value="return">{t('inventory.return')}</SelectItem>
                <SelectItem value="adjustment">{t('inventory.adjustment')}</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder={t('label.quantity')}
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            />

            <Input
              placeholder={t('inventory.reference')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />

            <Button onClick={handleRecordTransaction} className="w-full">
              {t('action.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
