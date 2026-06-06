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
import { STANDARD_SIZES } from '@/lib/constants';

interface Mold {
  id: string;
  code: string;
  mold_number: string;
  product_id: string;
  material_type: string;
  compatible_sizes: string[];
  status: string;
  notes: string | null;
  is_active: boolean;
  product?: { name: string; code: string };
}

interface Product {
  id: string;
  name: string;
  code: string;
}

const MOLD_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-950 text-emerald-400',
  inactive: 'bg-gray-950 text-gray-400',
  maintenance: 'bg-amber-950 text-amber-400',
  retired: 'bg-red-950 text-red-400',
};

export default function MoldsPage() {
  const { t } = useI18n();
  const [molds, setMolds] = useState<Mold[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [formData, setFormData] = useState({
    code: '',
    mold_number: '',
    product_id: '',
    material_type: '',
    compatible_sizes: [] as string[],
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [moldsRes, productsRes] = await Promise.all([
        supabase.from('molds').select('*, product:products(name, code)').eq('is_active', true).order('mold_number'),
        supabase.from('products').select('id, name, code').eq('is_active', true).order('name'),
      ]);

      if (moldsRes.error) throw moldsRes.error;
      if (productsRes.error) throw productsRes.error;

      setMolds(moldsRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMold = async () => {
    if (!formData.code || !formData.mold_number || !formData.product_id || !formData.material_type) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase.from('molds').insert([
        {
          code: formData.code,
          mold_number: formData.mold_number,
          product_id: formData.product_id,
          material_type: formData.material_type,
          compatible_sizes: formData.compatible_sizes.length > 0 ? formData.compatible_sizes : [],
          notes: formData.notes,
          status: 'active',
        },
      ]);

      if (error) throw error;
      toast.success('Mold added successfully');
      setOpen(false);
      setFormData({ code: '', mold_number: '', product_id: '', material_type: '', compatible_sizes: [], notes: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add mold');
      console.error(error);
    }
  };

  const handleDeleteMold = async (moldId: string) => {
    try {
      const { error } = await supabase.from('molds').update({ is_active: false }).eq('id', moldId);

      if (error) throw error;
      toast.success('Mold deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete mold');
      console.error(error);
    }
  };

  const handleToggleSize = (size: string) => {
    setFormData((prev) => ({
      ...prev,
      compatible_sizes: prev.compatible_sizes.includes(size)
        ? prev.compatible_sizes.filter((s) => s !== size)
        : [...prev.compatible_sizes, size],
    }));
  };

  let filtered = molds;
  if (statusFilter !== 'all') {
    filtered = filtered.filter((m) => m.status === statusFilter);
  }
  if (productFilter !== 'all') {
    filtered = filtered.filter((m) => m.product_id === productFilter);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('label.loading')}</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{t('molds.title')}</h1>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t('molds.addMold')}
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('molds.allStatuses')}</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="retired">{t('molds.retired')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('label.all')}</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.code')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('molds.moldNumber')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.product')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('molds.compatibleSizes')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('molds.materialType')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.status')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.notes')}</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">{t('label.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((mold) => (
              <tr key={mold.id} className="hover:bg-slate-800 border-t border-slate-700">
                <td className="px-6 py-3 text-sm font-mono text-blue-400">{mold.code}</td>
                <td className="px-6 py-3 text-sm font-semibold">{mold.mold_number}</td>
                <td className="px-6 py-3 text-sm">
                  <div>
                    <p className="font-medium">{mold.product?.name || '-'}</p>
                    {mold.product && <p className="text-xs text-gray-400 font-mono">{mold.product.code}</p>}
                  </div>
                </td>
                <td className="px-6 py-3 text-sm">
                  <div className="flex flex-wrap gap-1">
                    {mold.compatible_sizes && mold.compatible_sizes.length > 0
                      ? mold.compatible_sizes.map((size) => (
                          <Badge key={size} variant="outline" className="text-xs">
                            {size}
                          </Badge>
                        ))
                      : <span className="text-gray-400">-</span>}
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-gray-300">{mold.material_type}</td>
                <td className="px-6 py-3 text-sm">
                  <Badge className={MOLD_STATUS_COLORS[mold.status] || 'bg-gray-950 text-gray-400'}>
                    {mold.status}
                  </Badge>
                </td>
                <td className="px-6 py-3 text-sm text-gray-400 max-w-xs truncate">{mold.notes || '-'}</td>
                <td className="px-6 py-3 text-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteMold(mold.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {molds.length === 0 ? t('label.noData') : t('label.noData')}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('molds.addMold')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder={t('label.code')} value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
            <Input
              placeholder={t('molds.moldNumber')}
              value={formData.mold_number}
              onChange={(e) => setFormData({ ...formData, mold_number: e.target.value })}
            />

            <Select value={formData.product_id} onValueChange={(value) => setFormData({ ...formData, product_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('label.product')} />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder={t('molds.materialType')}
              value={formData.material_type}
              onChange={(e) => setFormData({ ...formData, material_type: e.target.value })}
            />

            <div>
              <label className="text-sm font-medium block mb-2">{t('molds.compatibleSizes')}</label>
              <div className="grid grid-cols-3 gap-2">
                {STANDARD_SIZES.map((size) => (
                  <Button
                    key={size}
                    variant={formData.compatible_sizes.includes(size) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggleSize(size)}
                    className="w-full"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            <Input placeholder={t('label.notes')} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />

            <Button onClick={handleAddMold} className="w-full">
              {t('molds.addMold')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
