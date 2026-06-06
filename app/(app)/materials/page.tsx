'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { MATERIAL_TYPE_LABELS } from '@/lib/constants';

export default function MaterialsPage() {
  const { t } = useI18n();

  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: '',
    unit: '',
    cost_per_unit: '',
    description: '',
    location: '',
  });

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('materials')
      .select('*, material_stock(*)')
      .eq('is_active', true)
      .order('name');

    if (error) {
      toast.error('Failed to load materials');
    } else {
      setMaterials(data || []);
    }

    setLoading(false);
  };

  const filtered = materials.filter((m) => {
    const matchSearch =
      m.code.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase());

    const matchType = typeFilter === 'all' || m.type === typeFilter;

    return matchSearch && matchType;
  });

  const stats = {
    total: materials.length,
    totalValue: materials.reduce((sum, m) => {
      const qty = m.material_stock?.[0]?.quantity || 0;
      return sum + qty * m.cost_per_unit;
    }, 0),
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Loading materials...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          Materials
        </h1>

        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Material
        </Button>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Total Items</p>
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Total Value</p>
          <p className="text-xl font-bold text-primary">
            ${stats.totalValue.toFixed(2)}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Status</p>
          <p className="text-xl font-bold text-foreground">
            Active Inventory
          </p>
        </div>

      </div>

      {/* FILTERS */}
      <div className="flex flex-col md:flex-row gap-3">

        <Input
          placeholder="Search materials..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-card"
        />

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-60">
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {Object.entries(MATERIAL_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>

      {/* TABLE */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">

        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Code</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-right">Stock</th>
              <th className="p-3 text-right">Cost</th>
              <th className="p-3 text-left">Location</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((m) => {
              const qty = m.material_stock?.[0]?.quantity || 0;

              return (
                <tr
                  key={m.id}
                  className="border-t border-border hover:bg-secondary/40 transition"
                >
                  <td className="p-3 font-mono text-primary">
                    {m.code}
                  </td>

                  <td className="p-3 text-foreground">
                    {m.name}
                  </td>

                  <td className="p-3">
                    <Badge variant="outline">
{MATERIAL_TYPE_LABELS[m.type as keyof typeof MATERIAL_TYPE_LABELS] ?? m.type}                    </Badge>
                  </td>

                  <td className="p-3 text-right text-foreground">
                    {qty}
                  </td>

                  <td className="p-3 text-right text-primary">
                    ${m.cost_per_unit}
                  </td>

                  <td className="p-3 text-muted-foreground">
                    {m.location || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

      </div>

      {/* EMPTY */}
      {filtered.length === 0 && (
        <div className="text-center text-muted-foreground py-10">
          No materials found
        </div>
      )}

      {/* ADD DIALOG (basic UI فقط) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Add Material</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input placeholder="Code" />
            <Input placeholder="Name" />
            <Input placeholder="Unit" />
            <Input placeholder="Cost" />

            <Button className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}