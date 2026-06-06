'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';
import { generateOrderCode } from '@/lib/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Copy } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { SIZE_GROUPS } from '@/lib/constants';

interface ColorEntry {
  id: string;
  name: string;
  code: string;
  hex: string;
  activeGroups: Set<string>;
  sizes: Record<string, number>;
}

interface MaterialEntry {
  id: string;
  materialId: string;
  requiredQty: number;
  notes: string;
}

interface Material {
  id: string;
  name: string;
  code: string;
  type: string;
  unit: string;
}

interface RemnantSuggestion {
  remnantId: string;
  colorName: string;
  sizeValue: string;
  availableQty: number;
  neededQty: number;
  suggestedQty: number;
  useQty: number;
  originOrderCode: string;
  status: 'pending' | 'accepted' | 'modified' | 'ignored';
}

interface RemnantSelection {
  id: string;
  color_name: string;
  size_value: string;
  quantity: number;
  reserved_quantity: number;
  useQty: number;
  origin_order_code: string;
}

interface OrderItem {
  id: string;
  color_name: string;
  color_hex: string;
  order_item_sizes: { size_value: string; required_qty: number }[];
}

interface PreviousOrder {
  id: string;
  order_code: string;
  product_model: string;
  brand_type_override: string;
  external_brand_name?: string;
  order_items: OrderItem[];
}

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export default function NewOrderPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [previousOrders, setPreviousOrders] = useState<PreviousOrder[]>([]);
  const [showReuseModal, setShowReuseModal] = useState(false);

  const [brandType, setBrandType] = useState('');
  const [externalBrandName, setExternalBrandName] = useState('');
  const [productModel, setProductModel] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [cartonCapacity, setCartonCapacity] = useState(12);
  const [notes, setNotes] = useState('');
  const [colors, setColors] = useState<ColorEntry[]>([]);
  const [materialEntries, setMaterialEntries] = useState<MaterialEntry[]>([]);
  const [remnants, setRemnants] = useState<RemnantSelection[]>([]);
  const [suggestions, setSuggestions] = useState<RemnantSuggestion[]>([]);

  useEffect(() => {
    fetchMaterials();
    fetchPreviousOrders();
  }, []);

  useEffect(() => {
    if (step === 3) {
      fetchRemnants();
    }
  }, [step]);

  async function fetchMaterials() {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, code, type, unit')
        .eq('is_active', true);
      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  }

  async function fetchPreviousOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, product_model, brand_type_override, external_brand_name, order_items(id, color_name, color_hex, order_item_sizes(size_value, required_qty))')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setPreviousOrders(data || []);
    } catch (error) {
      console.error('Error fetching previous orders:', error);
    }
  }

  async function fetchRemnants() {
    try {
      const { data, error } = await supabase
        .from('remnants')
        .select('*, origin_order:orders(order_code)')
        .eq('status', 'available')
        .gte('quantity', 1);
      if (error) throw error;
      const loaded: RemnantSelection[] = (data as any[])?.map(r => ({
        id: r.id,
        color_name: r.color_name,
        size_value: r.size_value,
        quantity: r.quantity,
        reserved_quantity: r.reserved_quantity || 0,
        useQty: 0,
        origin_order_code: r.origin_order?.order_code || ''
      })) || [];
      setRemnants(loaded);
      computeSuggestions(loaded);
    } catch (error) {
      console.error('Error fetching remnants:', error);
    }
  }

  function computeSuggestions(availableRemnants: RemnantSelection[]) {
    const newSuggestions: RemnantSuggestion[] = [];
    for (const color of colors) {
      for (const [sizeValue, neededQty] of Object.entries(color.sizes)) {
        if (!neededQty) continue;
        const match = availableRemnants.find(
          r => r.color_name.toLowerCase().trim() === color.name.toLowerCase().trim() &&
               r.size_value === sizeValue
        );
        if (match) {
          const available = match.quantity - match.reserved_quantity;
          if (available <= 0) continue;
          const suggestedQty = Math.min(available, neededQty);
          newSuggestions.push({
            remnantId: match.id,
            colorName: color.name,
            sizeValue,
            availableQty: available,
            neededQty,
            suggestedQty,
            useQty: suggestedQty,
            originOrderCode: match.origin_order_code,
            status: 'pending',
          });
        }
      }
    }
    setSuggestions(newSuggestions);
  }

  function addColor() {
    setColors([...colors, {
      id: genId(),
      name: '',
      code: '',
      hex: '#000000',
      activeGroups: new Set(),
      sizes: {}
    }]);
  }

  function removeColor(id: string) {
    setColors(colors.filter(c => c.id !== id));
  }

  function updateColor(id: string, field: string, value: any) {
    setColors(colors.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  function toggleSizeGroup(colorId: string, groupKey: string) {
    setColors(colors.map(c => {
      if (c.id === colorId) {
        const newGroups = new Set(c.activeGroups);
        if (newGroups.has(groupKey)) {
          newGroups.delete(groupKey);
          const newSizes = { ...c.sizes };
          const group = SIZE_GROUPS.find(g => g.key === groupKey);
          group?.sizes.forEach(s => delete newSizes[s]);
          return { ...c, activeGroups: newGroups, sizes: newSizes };
        } else {
          newGroups.add(groupKey);
          return { ...c, activeGroups: newGroups };
        }
      }
      return c;
    }));
  }

  function toggleSize(colorId: string, size: string) {
    setColors(colors.map(c => {
      if (c.id === colorId) {
        const newSizes = { ...c.sizes };
        if (newSizes[size] !== undefined) {
          delete newSizes[size];
        } else {
          newSizes[size] = 0;
        }
        return { ...c, sizes: newSizes };
      }
      return c;
    }));
  }

  function updateSizeQty(colorId: string, size: string, qty: number) {
    setColors(colors.map(c => {
      if (c.id === colorId) {
        return { ...c, sizes: { ...c.sizes, [size]: Math.max(0, qty) } };
      }
      return c;
    }));
  }

  function selectAllGroup(colorId: string, groupKey: string) {
    setColors(colors.map(c => {
      if (c.id === colorId) {
        const group = SIZE_GROUPS.find(g => g.key === groupKey);
        const newSizes = { ...c.sizes };
        group?.sizes.forEach(s => { if (!newSizes[s]) newSizes[s] = 1; });
        return { ...c, sizes: newSizes };
      }
      return c;
    }));
  }

  function clearGroup(colorId: string, groupKey: string) {
    setColors(colors.map(c => {
      if (c.id === colorId) {
        const group = SIZE_GROUPS.find(g => g.key === groupKey);
        const newSizes = { ...c.sizes };
        group?.sizes.forEach(s => delete newSizes[s]);
        return { ...c, sizes: newSizes };
      }
      return c;
    }));
  }

  function addMaterialEntry() {
    setMaterialEntries([...materialEntries, { id: genId(), materialId: '', requiredQty: 0, notes: '' }]);
  }

  function removeMaterialEntry(id: string) {
    setMaterialEntries(materialEntries.filter(m => m.id !== id));
  }

  function updateMaterialEntry(id: string, field: string, value: any) {
    setMaterialEntries(materialEntries.map(m => m.id === id ? { ...m, [field]: value } : m));
  }

  function loadPreviousOrder(order: PreviousOrder) {
    setBrandType(order.brand_type_override);
    setExternalBrandName(order.external_brand_name || '');
    setProductModel(order.product_model);
    setColors(order.order_items.map(item => ({
      id: genId(),
      name: item.color_name,
      code: '',
      hex: item.color_hex,
      activeGroups: new Set(),
      sizes: Object.fromEntries(item.order_item_sizes.map(s => [s.size_value, s.required_qty]))
    })));
    setShowReuseModal(false);
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!brandType || !productModel || colors.length === 0 || colors.some(c => !c.name || Object.keys(c.sizes).length === 0)) {
      toast.error(t('orders.create.fillRequired'));
      return;
    }

    if (brandType === 'external' && !externalBrandName.trim()) {
      toast.error(t('orders.create.fillRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const orderCode = await generateOrderCode();
      const totalPairs = colors.reduce((sum, color) => sum + Object.values(color.sizes).reduce((a, b) => a + b, 0), 0);

      let productId = null;
      const { data: existingProduct } = await supabase
        .from('products')
        .select('id')
        .eq('name', productModel)
        .eq('brand_type', brandType)
        .maybeSingle();

      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        const { data: newProduct, error: productError } = await supabase.from('products').insert({
          code: `${brandType.toUpperCase()}-${productModel.toUpperCase().replace(/\s+/g, '-')}-${Date.now()}`,
          name: productModel,
          brand_type: brandType,
          external_brand_name: externalBrandName || '',
          category: 'footwear',
          is_active: true
        }).select('id').single();
        if (productError) throw productError;
        productId = newProduct?.id ?? null;
      }

      const { data: order, error: orderError } = await supabase.from('orders').insert({
        order_code: orderCode,
        product_id: productId,
        product_model: productModel,
        brand_type_override: brandType,
        external_brand_name: externalBrandName || '',
        status: 'planning',
        delivery_date: deliveryDate || null,
        notes,
        carton_capacity: cartonCapacity,
        total_pairs: totalPairs
      }).select('id').single();

      if (orderError) throw orderError;
      if (!order) throw new Error('Failed to create order');

      for (const color of colors) {
        const { data: item, error: itemError } = await supabase.from('order_items').insert({
          order_id: order.id,
          color_name: color.name,
          color_code: color.code || '',
          color_hex: color.hex,
          workflow_stage: 'production',
          status: 'pending'
        }).select('id').single();

        if (itemError) throw itemError;
        if (!item) continue;

        const sizeInserts = Object.entries(color.sizes).map(([size, qty]) => ({
          order_item_id: item.id,
          size_value: size,
          required_qty: qty
        }));

        if (sizeInserts.length > 0) {
          const { error: sizeError } = await supabase.from('order_item_sizes').insert(sizeInserts);
          if (sizeError) throw sizeError;
        }
      }

      for (const mat of materialEntries.filter(m => m.materialId)) {
        await supabase.from('material_allocations').insert({
          order_id: order.id,
          material_id: mat.materialId,
          allocated_qty: mat.requiredQty,
          status: 'pending',
          notes: mat.notes
        });
      }

      for (const suggestion of suggestions.filter(s => s.status === 'accepted' || s.status === 'modified')) {
        if (suggestion.useQty <= 0) continue;
        const remnant = remnants.find(r => r.id === suggestion.remnantId);
        if (remnant) {
          await supabase.from('remnant_allocations').insert({
            remnant_id: remnant.id,
            target_order_id: order.id,
            quantity: suggestion.useQty,
            status: 'pending',
            notes: `Suggested allocation: ${suggestion.colorName} size ${suggestion.sizeValue}`
          });
          await supabase.from('remnants').update({
            reserved_quantity: remnant.reserved_quantity + suggestion.useQty
          }).eq('id', remnant.id);
        }
      }

      toast.success(t('orders.create.success'));
      router.push(`/orders/${order.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error(t('orders.create.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  const totalPairs = colors.reduce((sum, c) => sum + Object.values(c.sizes).reduce((a, b) => a + b, 0), 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('orders.create.title')}>
        <Link href="/orders">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t('action.back')}
          </Button>
        </Link>
      </PageHeader>

      <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
          <div className="flex justify-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s <= step ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </div>
            ))}
          </div>

          {step === 1 && (
            <Card className="p-6 space-y-6">
              <div>
                <Label className="text-sm font-medium mb-3 block">{t('orders.create.brandType')} *</Label>
                <div className="flex gap-3">
                  {[
                    { key: 'carlos', label: t('orders.create.carlos') },
                    { key: 'arrow', label: t('orders.create.arrow') },
                    { key: 'external', label: t('orders.create.external') }
                  ].map(({ key, label }) => (
                    <Button
                      key={key}
                      type="button"
                      variant={brandType === key ? 'default' : 'outline'}
                      onClick={() => {
                        setBrandType(key);
                        if (key !== 'external') setExternalBrandName('');
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {brandType === 'external' && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.externalBrandName')} *</Label>
                  <Input
                    value={externalBrandName}
                    onChange={(e) => setExternalBrandName(e.target.value)}
                    placeholder={t('label.brand')}
                    required
                  />
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.productName')} *</Label>
                <Input
                  value={productModel}
                  onChange={(e) => setProductModel(e.target.value)}
                  placeholder={t('orders.create.productNamePlaceholder')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.deliveryDate')}</Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.cartonCapacity')}</Label>
                  <Input
                    type="number"
                    value={cartonCapacity}
                    onChange={(e) => setCartonCapacity(Math.max(1, Number(e.target.value)))}
                    min="1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.notes')}</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('label.notes')}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowReuseModal(true)}
              >
                <Copy className="w-4 h-4" />
                {t('orders.create.reuseOrder')}
              </Button>
            </Card>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {colors.map((color, idx) => (
                <Card key={color.id} className="p-4 space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.colorName')} *</Label>
                      <Input
                        value={color.name}
                        onChange={(e) => updateColor(color.id, 'name', e.target.value)}
                        placeholder={t('label.colorName')}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">{t('orders.create.colorCode')}</Label>
                      <Input
                        value={color.code}
                        onChange={(e) => updateColor(color.id, 'code', e.target.value)}
                        placeholder={t('label.code')}
                        className="w-20"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Hex</Label>
                        <Input
                          type="color"
                          value={color.hex}
                          onChange={(e) => updateColor(color.id, 'hex', e.target.value)}
                          className="w-14 h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColor(color.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {SIZE_GROUPS.map(group => (
                      <div key={group.key} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Button
                            type="button"
                            variant={color.activeGroups.has(group.key) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleSizeGroup(color.id, group.key)}
                            className="text-xs"
                          >
                            {t((`sizes.${group.key}`) as any)}
                          </Button>
                          {color.activeGroups.has(group.key) && (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => selectAllGroup(color.id, group.key)}
                                className="text-xs h-7"
                              >
                                {t('orders.create.selectAll')}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => clearGroup(color.id, group.key)}
                                className="text-xs h-7"
                              >
                                {t('orders.create.clearAll')}
                              </Button>
                            </div>
                          )}
                        </div>
                        {color.activeGroups.has(group.key) && (
                          <div className="grid grid-cols-5 gap-2">
                            {group.sizes.map(size => (
                              <div key={size} className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <Checkbox
                                    checked={color.sizes[size] !== undefined}
                                    onCheckedChange={() => toggleSize(color.id, size)}
                                    id={`${color.id}-${size}`}
                                  />
                                  <label className="text-xs text-muted-foreground">{size}</label>
                                </div>
                                {color.sizes[size] !== undefined && (
                                  <Input
                                    type="number"
                                    min="0"
                                    value={color.sizes[size]}
                                    onChange={(e) => updateSizeQty(color.id, size, Number(e.target.value))}
                                    className="text-xs h-7"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={addColor}
              >
                <Plus className="w-4 h-4" />
                {t('orders.create.addColor')}
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {materials.length > 0 && (
                <Card className="p-4 space-y-4">
                  <h4 className="font-semibold">{t('orders.create.addMaterial')}</h4>
                  <div className="space-y-3">
                    {materialEntries.map(entry => (
                      <div key={entry.id} className="flex gap-3 items-end">
                        <select
                          value={entry.materialId}
                          onChange={(e) => updateMaterialEntry(entry.id, 'materialId', e.target.value)}
                          className="flex-1 border rounded px-2 py-1 text-sm"
                        >
                          <option value="">{t('orders.create.selectMaterial')}</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min="0"
                          value={entry.requiredQty}
                          onChange={(e) => updateMaterialEntry(entry.id, 'requiredQty', Number(e.target.value))}
                          placeholder={t('orders.create.materialQty')}
                          className="w-20"
                        />
                        <Input
                          value={entry.notes}
                          onChange={(e) => updateMaterialEntry(entry.id, 'notes', e.target.value)}
                          placeholder={t('orders.create.materialNotes')}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMaterialEntry(entry.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addMaterialEntry}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4" />
                    {t('orders.create.addMaterial')}
                  </Button>
                </Card>
              )}

              {suggestions.length > 0 && (
                <Card className="p-4 space-y-4 border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{t('orders.create.remnantSuggestions')}</h4>
                    <span className="text-xs text-muted-foreground">{t('orders.create.remnantSuggestFor')}</span>
                  </div>
                  <div className="space-y-3">
                    {suggestions.map((s, idx) => (
                      <div
                        key={`${s.remnantId}-${s.sizeValue}`}
                        className={`border rounded-lg p-3 text-sm transition-colors ${
                          s.status === 'accepted' ? 'border-emerald-500/50 bg-emerald-500/5' :
                          s.status === 'ignored' ? 'border-border opacity-50' :
                          s.status === 'modified' ? 'border-blue-500/50 bg-blue-500/5' :
                          'border-amber-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="font-medium">
                              {s.colorName} — {t('label.size')} {s.sizeValue}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t('label.available')}: {s.availableQty} &nbsp;|&nbsp;
                              {t('orders.totalPairs')}: {s.neededQty} &nbsp;|&nbsp;
                            {t('label.from')}: {s.originOrderCode}
                            </div>
                            {s.status !== 'ignored' && (
                              <div className="text-xs text-emerald-400">
                                {t('orders.create.remnantSaving').replace('{{qty}}', String(s.useQty))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {(s.status === 'accepted' || s.status === 'modified') && (
                              <Input
                                type="number"
                                min="1"
                                max={s.availableQty}
                                value={s.useQty}
                                onChange={(e) => {
                                  const qty = Math.min(s.availableQty, Math.max(1, Number(e.target.value)));
                                  setSuggestions(prev => prev.map((x, i) =>
                                    i === idx ? { ...x, useQty: qty, status: qty !== x.suggestedQty ? 'modified' : 'accepted' } : x
                                  ));
                                }}
                                className="w-16 text-xs h-7"
                              />
                            )}
                            {s.status === 'pending' && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                                  onClick={() => setSuggestions(prev => prev.map((x, i) =>
                                    i === idx ? { ...x, status: 'accepted' } : x
                                  ))}
                                >
                                  {t('orders.create.suggestionAccept')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                                  onClick={() => setSuggestions(prev => prev.map((x, i) =>
                                    i === idx ? { ...x, status: 'modified' } : x
                                  ))}
                                >
                                  {t('orders.create.suggestionModify')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() => setSuggestions(prev => prev.map((x, i) =>
                                    i === idx ? { ...x, status: 'ignored' } : x
                                  ))}
                                >
                                  {t('orders.create.suggestionIgnore')}
                                </Button>
                              </>
                            )}
                            {(s.status === 'accepted' || s.status === 'modified') && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => setSuggestions(prev => prev.map((x, i) =>
                                  i === idx ? { ...x, status: 'ignored' } : x
                                ))}
                              >
                                {t('orders.create.suggestionIgnore')}
                              </Button>
                            )}
                            {s.status === 'ignored' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setSuggestions(prev => prev.map((x, i) =>
                                  i === idx ? { ...x, status: 'pending' } : x
                                ))}
                              >
                                {t('action.undo')}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {suggestions.some(s => s.status === 'accepted' || s.status === 'modified') && (
                    <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-3 py-2">
                      {t('orders.create.remnantSaving').replace('{{qty}}',
                        String(suggestions.filter(s => s.status === 'accepted' || s.status === 'modified').reduce((sum, s) => sum + s.useQty, 0))
                      )}
                    </div>
                  )}
                </Card>
              )}

              {suggestions.length === 0 && remnants.length === 0 && step === 3 && (
                <div className="text-center text-sm text-muted-foreground py-2">
                  {t('orders.create.noSuggestions')}
                </div>
              )}

              <Card className="p-4">
                <h4 className="font-semibold mb-4">{t('orders.create.orderSummary')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('orders.create.brandName')}:</span>
                    <span className="font-medium">{t(`orders.create.${brandType}` as any) || brandType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('orders.create.modelName')}:</span>
                    <span className="font-medium">{productModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('orders.create.pairsCount')}:</span>
                    <span className="font-medium">{totalPairs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('orders.create.colorsCount')}:</span>
                    <span className="font-medium">{colors.length}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div className="flex gap-3 sticky bottom-0 bg-background pt-4">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(step - 1)}
              >
                {t('action.back')}
              </Button>
            )}
            {step < 3 && (
              <Button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && (!brandType || !productModel) || step === 2 && colors.length === 0}
              >
                {t('action.next')}
              </Button>
            )}
            {step === 3 && (
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? t('orders.create.submitting') : t('orders.create.submit')}
              </Button>
            )}
          </div>
        </div>
      </form>

      <Dialog open={showReuseModal} onOpenChange={setShowReuseModal}>
        <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('orders.create.reuseTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {previousOrders.map(order => (
              <button
                key={order.id}
                type="button"
                onClick={() => loadPreviousOrder(order)}
                className="w-full text-left p-3 border rounded hover:bg-muted transition"
              >
                <div className="font-medium text-sm">{order.order_code}</div>
                <div className="text-xs text-muted-foreground">{order.product_model} • {order.order_items.length} {t('orders.create.colorsCount')}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
