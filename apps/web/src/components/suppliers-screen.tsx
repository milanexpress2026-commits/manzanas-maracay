'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Search, Pencil, Users, RefreshCw } from 'lucide-react';
import { supplierSchema, updateSupplierSchema, type Supplier } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { useCommand, useRemote } from '@/lib/inventory-api';
import {
  FormError,
  LoadError,
  LoadingRows,
  SavedNotice,
  SaveButton,
  PageFooter,
} from './operations-ui';
export function SuppliersScreen({ session }: { session: AppSession }) {
  const suppliers = useRemote<Supplier[]>('/api/suppliers');
  const [query, setQuery] = useState(''),
    [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined),
    [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const list = (suppliers.data ?? []).filter(
    (s) =>
      (showInactive || s.active) &&
      `${s.name} ${s.taxId ?? ''} ${s.phone ?? ''}`
        .toLocaleLowerCase('es')
        .includes(query.trim().toLocaleLowerCase('es')),
  );
  return (
    <AppShell session={session} current="/proveedores">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Proveedores</h1>
            <p>El origen de cada lote, siempre a mano.</p>
          </div>
          <Button
            onClick={() => {
              setSuccess('');
              setEditing(null);
            }}
            disabled={suppliers.loading || !!suppliers.error}
          >
            <Plus data-icon="inline-start" />
            Nuevo proveedor
          </Button>
        </div>
        {success ? <SavedNotice>{success}</SavedNotice> : null}
        {suppliers.error ? (
          <LoadError error={suppliers.error} retry={() => void suppliers.reload()} />
        ) : null}
        <section className="operations-panel" aria-label="Lista de proveedores">
          <div className="operations-toolbar">
            <div className="search-field">
              <Search aria-hidden="true" />
              <Input
                aria-label="Buscar proveedores"
                placeholder="Buscar nombre, RIF o teléfono…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Mostrar inactivos
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar proveedores"
              disabled={suppliers.loading}
              onClick={() => void suppliers.reload()}
            >
              <RefreshCw />
            </Button>
          </div>
          {!suppliers.data ? (
            suppliers.loading ? (
              <LoadingRows />
            ) : null
          ) : list.length === 0 ? (
            <div className="operation-empty">
              <Users aria-hidden="true" />
              <h2>
                {query || showInactive ? 'No hay coincidencias' : 'Todavía no hay proveedores'}
              </h2>
              <p>
                {query
                  ? 'Prueba con otro nombre o limpia la búsqueda.'
                  : 'Agrega el proveedor antes de registrar la primera recepción.'}
              </p>
              {query ? (
                <Button variant="outline" onClick={() => setQuery('')}>
                  Limpiar búsqueda
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="supplier-list">
              {list.map((s) => (
                <article className="supplier-row" key={s.id}>
                  <div className="supplier-name">
                    <h2>{s.name}</h2>
                    <Badge variant="secondary">{s.active ? 'Activo' : 'Inactivo'}</Badge>
                    <p>{s.taxId || 'Sin RIF registrado'}</p>
                  </div>
                  <div className="supplier-contact">
                    <span>Teléfono</span>
                    <p>{s.phone || 'Sin teléfono registrado'}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Editar proveedor ${s.name}`}
                    disabled={suppliers.loading || !!suppliers.error}
                    onClick={() => {
                      setSuccess('');
                      setEditing(s);
                    }}
                  >
                    <Pencil data-icon="inline-start" />
                    Editar
                  </Button>
                </article>
              ))}
            </div>
          )}
          {suppliers.data ? (
            <footer className="table-footer">
              <span>{list.length} proveedores encontrados</span>
              <span>Los proveedores referenciados conservan su historial.</span>
            </footer>
          ) : null}
        </section>
        <PageFooter />
        <Dialog
          open={editing !== undefined}
          onOpenChange={(open) => {
            if (!open && !saving) setEditing(undefined);
          }}
        >
          <DialogContent className="catalog-dialog">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
              <DialogDescription>
                Datos de contacto y trazabilidad de las recepciones.
              </DialogDescription>
            </DialogHeader>
            {editing !== undefined ? (
              <SupplierForm
                key={`${editing?.id ?? 'new'}-${editing?.version ?? 0}`}
                supplier={editing}
                onBusy={setSaving}
                onCancel={() => setEditing(undefined)}
                onSaved={async () => {
                  setEditing(undefined);
                  setSuccess('Proveedor guardado correctamente.');
                  await suppliers.reload();
                }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  );
}
function SupplierForm({
  supplier,
  onSaved,
  onCancel,
  onBusy,
}: {
  supplier: Supplier | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState(supplier?.name ?? ''),
    [taxId, setTaxId] = useState(supplier?.taxId ?? ''),
    [phone, setPhone] = useState(supplier?.phone ?? ''),
    [notes, setNotes] = useState(supplier?.notes ?? ''),
    [active, setActive] = useState(supplier?.active ?? true);
  const command = useCommand();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.busy) return;
    const body = supplier
      ? { name, taxId, phone, notes, active, version: supplier.version }
      : { name, taxId, phone, notes };
    const parsed = (supplier ? updateSupplierSchema : supplierSchema).safeParse(body);
    if (!parsed.success) {
      command.setError('Revisa el nombre y la longitud de los datos del proveedor.');
      return;
    }
    onBusy(true);
    try {
      await command.run(
        `/api/suppliers${supplier ? `/${supplier.id}` : ''}`,
        parsed.data,
        supplier ? 'PATCH' : 'POST',
      );
      await onSaved();
    } catch {
    } finally {
      onBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="catalog-form">
      <fieldset disabled={command.busy}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="supplier-name">Nombre del proveedor</FieldLabel>
            <Input
              id="supplier-name"
              value={name}
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="operation-form-grid">
            <Field>
              <FieldLabel htmlFor="supplier-tax">RIF o identificación</FieldLabel>
              <Input
                id="supplier-tax"
                value={taxId}
                maxLength={40}
                onChange={(e) => setTaxId(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-phone">Teléfono</FieldLabel>
              <Input
                id="supplier-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                maxLength={40}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="supplier-notes">Observaciones</FieldLabel>
            <Textarea
              id="supplier-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          {supplier ? (
            <Field>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Proveedor activo
              </label>
              <FieldDescription>
                Al desactivarlo no aparecerá en nuevas recepciones. Sus lotes anteriores se
                conservan.
              </FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>
      </fieldset>
      <FormError message={command.error} />
      <div className="form-actions">
        <Button type="button" variant="outline" disabled={command.busy} onClick={onCancel}>
          Cancelar
        </Button>
        <SaveButton busy={command.busy}>Guardar proveedor</SaveButton>
      </div>
    </form>
  );
}
