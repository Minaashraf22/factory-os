'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';

interface Remnant {
  id: string;
  product_id: string;
  color: string;
  size: string;
  quantity: number;
  reserved_quantity: number;
  status: string;
  origin_order_id: string | null;
  created_at: string;
  product?: { name: string; code: string };
  origin_order?: { order_code: string };
}

interface Order {
  id: string;
  order_code: string;
  product_model?: string;
  product?: { name: string };
}

interface Product {
  id: string;
  name: string;
  code: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-950 text-emerald-400',
  reserved: 'bg-blue-950 text-blue-400',
  used: 'bg-gray-950 text-gray-400',
  voided: 'bg-red-950 text-red-400',
};

export default function RemnantsPage() {
  const { t } = useI18n();
  const [remnants, setRemnants] = useState<Remnant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [selectedRemnant, setSelectedRemnant] = useState<Remnant | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [allocationData, setAllocationData] = useState({
    order_id: '',
    quantity: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [remnantsRes, ordersRes] = await Promise.all([
        supabase
          .from('remnants')
          .select('*, product:products(name, code), origin_order:orders(order_code)')
          .neq('status', 'used')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, order_code, product:products(name)')
          .in('status', ['draft', 'planning'])
          .order('order_code'),
      ]);

      if (remnantsRes.error) throw remnantsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      setRemnants(remnantsRes.data || []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOrders((ordersRes.data || []) as any);
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAllocateToOrder = async () => {
    if (!selectedRemnant || !allocationData.order_id || !allocationData.quantity) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      const qtyToAllocate = parseInt(allocationData.quantity);
      const available = selectedRemnant.quantity - selectedRemnant.reserved_quantity;

      if (qtyToAllocate > available) {
        toast.error(`Cannot allocate more than ${available} units`);
        return;
      }

      // Insert allocation
      const { error: allocationError } = await supabase.from('remnant_allocation').insert([
        {
          remnant_id: selectedRemnant.id,
          order_id: allocationData.order_id,
          quantity: qtyToAllocate,
        },
      ]);

      if (allocationError) throw allocationError;

      // Update reserved quantity
      const newReserved = selectedRemnant.reserved_quantity + qtyToAllocate;
      const { error: updateError } = await supabase
        .from('remnants')
        .update({
          reserved_quantity: newReserved,
          status: newReserved >= selectedRemnant.quantity ? 'reserved' : 'available',
        })
        .eq('id', selectedRemnant.id);

      if (updateError) throw updateError;

      toast.success('Remnant allocated successfully');
      setAllocationDialogOpen(false);
      setSelectedRemnant(null);
      setAllocationData({ order_id: '', quantity: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to allocate remnant');
      console.error(error);
    }
  };

  const handleVoidRemnant = async (remnantId: string) => {
    try {
      const { error } = await supabase
        .from('remnants')
        .update({ status: 'voided' })
        .eq('id', remnantId);

      if (error) throw error;
      toast.success('Remnant voided');
      fetchData();
    } catch (error) {
      toast.error('Failed to void remnant');
      console.error(error);
    }
  };

  let filtered = remnants;
  if (statusFilter !== 'all') {
    filtered = filtered.filter((r) => r.status === statusFilter);
  }

  // Group by product
  const grouped = filtered.reduce(
    (acc, remnant) => {
      const productName = remnant.product?.name || 'Unknown Product';
      if (!acc[productName]) {
        acc[productName] = [];
      }
      acc[productName].push(remnant);
      return acc;
    },
    {} as Record<string, Remnant[]>,
  );

  const stats = {
    totalPairs: remnants.reduce((sum, r) => sum + r.quantity, 0),
    availablePairs: remnants.reduce(
      (sum, r) => sum + (r.quantity - r.reserved_quantity),
      0,
    ),
    reservedPairs: remnants.reduce((sum, r) => sum + r.reserved_quantity, 0),
    uniqueProducts: new Set(remnants.map((r) => r.product_id)).size,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('label.loading')}</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{t('remnants.title')}</h1>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">{t('remnants.totalRemnants')}</p>
          <p className="text-2xl font-bold">{stats.totalPairs}</p>
        </div>
        <div className="bg-emerald-900 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">{t('remnants.availableQty')}</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.availablePairs}</p>
        </div>
        <div className="bg-blue-900 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">{t('remnants.reservedQty')}</p>
          <p className="text-2xl font-bold text-blue-400">{stats.reservedPairs}</p>
        </div>
        <div className="bg-slate-800 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">{t('label.product')}</p>
          <p className="text-2xl font-bold">{stats.uniqueProducts}</p>
        </div>
      </div>

      <div className="mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('label.all')}</SelectItem>
            <SelectItem value="available">{t('remnants.available')}</SelectItem>
            <SelectItem value="reserved">{t('remnants.reserved')}</SelectItem>
            <SelectItem value="voided">{t('remnants.voidedQty')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {remnants.length === 0 ? t('label.noData') : t('label.noData')}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([productName, productRemnants]) => (
            <div key={productName} className="border border-slate-700 rounded-lg overflow-hidden">
              <div className="bg-slate-800 px-6 py-3">
                <h3 className="font-semibold text-lg">{productName}</h3>
              </div>
              <table className="w-full">
                <thead className="bg-slate-750">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.color')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.size')}</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">{t('label.quantity')}</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">{t('remnants.reservedQty')}</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">{t('label.available')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('remnants.originOrder')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.status')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.created')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {productRemnants.map((remnant) => {
                    const available = remnant.quantity - remnant.reserved_quantity;
                    return (
                      <tr key={remnant.id} className="hover:bg-slate-800 border-t border-slate-700">
                        <td className="px-6 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: remnant.color || '#999' }}
                            />
                            <span>{remnant.color || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-sm">{remnant.size}</td>
                        <td className="px-6 py-3 text-sm text-right font-semibold">{remnant.quantity}</td>
                        <td className="px-6 py-3 text-sm text-right text-blue-400">
                          {remnant.reserved_quantity}
                        </td>
                        <td className="px-6 py-3 text-sm text-right font-semibold text-emerald-400">
                          {available}
                        </td>
                        <td className="px-6 py-3 text-sm font-mono text-gray-400">
                          {remnant.origin_order?.order_code || '-'}
                        </td>
                        <td className="px-6 py-3 text-sm">
                          <Badge className={STATUS_COLORS[remnant.status] || 'bg-gray-950 text-gray-400'}>
                            {remnant.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-400">
                          {new Date(remnant.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-sm space-x-2">
                          {available > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedRemnant(remnant);
                                setAllocationDialogOpen(true);
                              }}
                            >
                              {t('remnants.allocate')}
                            </Button>
                          )}
                          {remnant.status !== 'voided' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVoidRemnant(remnant.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Dialog open={allocationDialogOpen} onOpenChange={setAllocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('remnants.allocate')}</DialogTitle>
          </DialogHeader>
          {selectedRemnant && (
            <div className="space-y-4">
              <div className="bg-slate-800 p-3 rounded text-sm">
                <p className="text-gray-400">
                  {selectedRemnant.product?.name} - {selectedRemnant.color} - {selectedRemnant.size}
                </p>
                <p className="text-gray-400 mt-1">
                  {t('label.available')}: {selectedRemnant.quantity - selectedRemnant.reserved_quantity} {t('label.pairs')}
                </p>
              </div>

              <Select value={allocationData.order_id} onValueChange={(value) => setAllocationData({ ...allocationData, order_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('remnants.selectOrder')} />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_code} - {order.product_model || order.product?.name || '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder={t('label.quantity')}
                type="number"
                value={allocationData.quantity}
                onChange={(e) => setAllocationData({ ...allocationData, quantity: e.target.value })}
                max={selectedRemnant.quantity - selectedRemnant.reserved_quantity}
              />

              <Button onClick={handleAllocateToOrder} className="w-full">
                {t('remnants.allocate')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
