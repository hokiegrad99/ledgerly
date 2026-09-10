import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, Badge, EmptyState } from '../components/ui/basic';
import { Field, Input, Select, Toggle } from '../components/ui/form';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Plus, Pencil, Trash2, ArrowDown, ArrowUp, Wand2, Database, RefreshCw, AlertTriangle, FolderPlus, Tag as TagIcon } from 'lucide-react';
import { newId, nowISO } from '../lib/id';
import type { Category, CategoryGroup, Tag, TransactionRule } from '../domain/types';
import { DATE_FORMATS } from '../domain/types';
import { integrityCheck } from '../domain/calculations';
import type { IntegrityIssue } from '../domain/calculations';
import { buildSampleData } from '../data/sample-data';

export default function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const [section, setSection] = useState<'appearance' | 'categories' | 'tags' | 'rules' | 'data'>('appearance');

  const sections = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'categories', label: 'Categories' },
    { id: 'tags', label: 'Tags' },
    { id: 'rules', label: 'Rules' },
    { id: 'data', label: 'Data management' },
  ] as const;

  return (
    <div>
      <PageHeader title="Settings" description="Customize Ledgerly, manage categories, tags, and rules, and control your data." />
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900" style={{ width: 'fit-content' }}>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              section === s.id ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'appearance' && <AppearanceSection settings={settings} updateSettings={updateSettings} />}
      {section === 'categories' && <CategoriesSection />}
      {section === 'tags' && <TagsSection />}
      {section === 'rules' && <RulesSection />}
      {section === 'data' && <DataSection />}
    </div>
  );
}

// ------------------------------------------------------------- Appearance

function AppearanceSection({ settings, updateSettings }: { settings: ReturnType<typeof useApp>['settings']; updateSettings: ReturnType<typeof useApp>['updateSettings'] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Appearance</h3>
          <Field label="Theme">
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => void updateSettings({ theme: t })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    settings.theme === t
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Currency">
            <Select value={settings.currency} onChange={(e) => void updateSettings({ currency: e.target.value })}>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'BRL', 'MXN'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date format">
            <Select value={settings.dateFormat} onChange={(e) => void updateSettings({ dateFormat: e.target.value })}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Start of week">
            <Select value={settings.weekStart} onChange={(e) => void updateSettings({ weekStart: e.target.value as 'sunday' | 'monday' })}>
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
            </Select>
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile</h3>
          <Field label="First name" hint="Used for the dashboard greeting">
            <Input value={settings.firstName} onChange={(e) => void updateSettings({ firstName: e.target.value })} placeholder="Your name" />
          </Field>
          <Field label="Household name" hint="For future household/multi-user support">
            <Input value={settings.householdName} onChange={(e) => void updateSettings({ householdName: e.target.value })} placeholder="e.g. The Morgan Household" />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <strong>Privacy:</strong> Ledgerly is local-first. Your financial data is stored in your browser&apos;s IndexedDB on this device and is never sent to any server. No analytics, no tracking, no ads.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------- Categories

function CategoriesSection() {
  const { repo, groups, categories, refresh, bumpTxn } = useApp();
  const [editingGroup, setEditingGroup] = useState<CategoryGroup | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatGroupId, setNewCatGroupId] = useState('');
  const [deleting, setDeleting] = useState<{ kind: 'group' | 'category'; id: string; name: string } | null>(null);

  const groupsSorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const catsByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const g of groups) map.set(g.id, []);
    for (const c of categories) {
      const arr = map.get(c.groupId) ?? [];
      arr.push(c);
      map.set(c.groupId, arr);
    }
    for (const [, v] of map) v.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [groups, categories]);

  const moveGroup = async (id: string, dir: -1 | 1) => {
    const idx = groupsSorted.findIndex((g) => g.id === id);
    const other = groupsSorted[idx + dir];
    if (!other) return;
    const a = groupsSorted[idx];
    await repo.saveCategoryGroups([
      { ...a, sortOrder: other.sortOrder, updatedAt: nowISO() },
      { ...other, sortOrder: a.sortOrder, updatedAt: nowISO() },
    ]);
    await refresh();
  };

  const moveCat = async (id: string, dir: -1 | 1) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const siblings = (catsByGroup.get(cat.groupId) ?? []).filter((c) => !c.archived);
    const idx = siblings.findIndex((c) => c.id === id);
    const other = siblings[idx + dir];
    if (!other) return;
    await repo.saveCategories([
      { ...cat, sortOrder: other.sortOrder, updatedAt: nowISO() },
      { ...other, sortOrder: cat.sortOrder, updatedAt: nowISO() },
    ]);
    await refresh();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (deleting.kind === 'group') {
      await repo.deleteCategoryGroup(deleting.id);
    } else {
      await repo.deleteCategory(deleting.id);
    }
    bumpTxn();
    await refresh();
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Categories are grouped by type. Create, rename, reorder, archive, or delete — nothing is hard-coded.
        </p>
        <Button variant="primary" size="sm" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setNewGroupOpen(true)}>New group</Button>
      </div>
      {groupsSorted.map((g) => (
        <Card key={g.id}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{g.name}</h3>
              <Badge tone={g.kind === 'income' ? 'green' : g.kind === 'transfer' ? 'purple' : 'neutral'}>{g.kind}</Badge>
              {g.archived && <Badge tone="amber">Archived</Badge>}
            </div>
            <div className="flex items-center gap-0.5">
              <button className="btn-ghost p-1.5" disabled={groupsSorted.indexOf(g) === 0} onClick={() => void moveGroup(g.id, -1)} aria-label="Move group up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button className="btn-ghost p-1.5" disabled={groupsSorted.indexOf(g) === groupsSorted.length - 1} onClick={() => void moveGroup(g.id, 1)} aria-label="Move group down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button className="btn-ghost p-1.5" onClick={() => setEditingGroup(g)} aria-label="Edit group">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleting({ kind: 'group', id: g.id, name: g.name })} aria-label="Delete group">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {(catsByGroup.get(g.id) ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-800 dark:text-slate-200">{c.name}</span>
                  {c.archived && <Badge tone="amber">Archived</Badge>}
                </div>
                <div className="flex items-center gap-0.5">
                  <button className="btn-ghost p-1.5" onClick={() => void moveCat(c.id, -1)} aria-label={`Move ${c.name} up`}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost p-1.5" onClick={() => void moveCat(c.id, 1)} aria-label={`Move ${c.name} down`}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost p-1.5" onClick={() => setEditingCat(c)} aria-label={`Edit ${c.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleting({ kind: 'category', id: c.id, name: c.name })} aria-label={`Delete ${c.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <button
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
              onClick={() => { setNewCatGroupId(g.id); setEditingCat(null); }}
            >
              <Plus className="h-3.5 w-3.5" /> Add category
            </button>
          </div>
        </Card>
      ))}

      {editingGroup && (
        <GroupModal open onClose={() => setEditingGroup(null)} group={editingGroup} onSave={async (g) => { await repo.saveCategoryGroup(g); await refresh(); }} />
      )}
      {newGroupOpen && (
        <GroupModal open onClose={() => setNewGroupOpen(false)} group={null} onSave={async (g) => { await repo.saveCategoryGroup(g); await refresh(); }} />
      )}
      {editingCat && (
        <CategoryModal open onClose={() => setEditingCat(null)} category={editingCat} groups={groups} onSave={async (c) => { await repo.saveCategory(c); await refresh(); }} />
      )}
      {newCatGroupId && (
        <CategoryModal open onClose={() => setNewCatGroupId('')} category={null} groups={groups} defaultGroupId={newCatGroupId} onSave={async (c) => { await repo.saveCategory(c); await refresh(); }} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        danger
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete"
        message={
          deleting?.kind === 'group'
            ? 'This deletes the group. Its categories are not deleted but become orphaned — move them first if you want to keep them.'
            : 'Transactions using this category will become uncategorized. Consider archiving instead of deleting.'
        }
      />
    </div>
  );
}

function GroupModal({ open, onClose, group, onSave }: { open: boolean; onClose: () => void; group: CategoryGroup | null; onSave: (g: CategoryGroup) => Promise<void> }) {
  const [form, setForm] = useState<CategoryGroup>(() =>
    group ?? {
      id: newId(),
      name: '',
      sortOrder: 999,
      archived: false,
      kind: 'expense',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );
  return (
    <Modal open={open} onClose={onClose} title={group ? `Edit ${group.name}` : 'New category group'} size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void onSave({ ...form, name: form.name.trim() || 'Unnamed group', updatedAt: nowISO() }).then(onClose)}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Group name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Kind">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CategoryGroup['kind'] })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function CategoryModal({ open, onClose, category, groups, defaultGroupId, onSave }: {
  open: boolean;
  onClose: () => void;
  category: Category | null;
  groups: CategoryGroup[];
  defaultGroupId?: string;
  onSave: (c: Category) => Promise<void>;
}) {
  const [form, setForm] = useState<Category>(() =>
    category ?? {
      id: newId(),
      groupId: defaultGroupId ?? groups[0]?.id ?? '',
      name: '',
      sortOrder: 999,
      archived: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );
  return (
    <Modal open={open} onClose={onClose} title={category ? `Edit ${category.name}` : 'New category'} size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void onSave({ ...form, name: form.name.trim() || 'Unnamed category', updatedAt: nowISO() }).then(onClose)}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Category name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Group">
          <Select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 dark:text-slate-300">Archived (hidden from new transactions)</span>
          <Toggle checked={form.archived} onChange={(v) => setForm({ ...form, archived: v })} label="Archived" />
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Tags

function TagsSection() {
  const { repo, tags, refresh, bumpTxn } = useApp();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [name, setName] = useState('');

  const addTag = async () => {
    if (!name.trim()) return;
    await repo.saveTag({ id: newId(), name: name.trim(), createdAt: nowISO(), updatedAt: nowISO() });
    setName('');
    await refresh();
  };

  const renameTag = async () => {
    if (!editing || !editing.name.trim()) return;
    await repo.saveTag({ ...editing, name: editing.name.trim(), updatedAt: nowISO() });
    setEditing(null);
    await refresh();
  };

  const deleteTag = async () => {
    if (!deleting) return;
    await repo.deleteTag(deleting.id);
    bumpTxn();
    await refresh();
    setDeleting(null);
  };

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Tags</h3>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Tags are independent from categories. Attach multiple tags to any transaction and filter reports by them.</p>
        <div className="mb-4 flex max-w-sm gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" onKeyDown={(e) => { if (e.key === 'Enter') void addTag(); }} />
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => void addTag()}>Add</Button>
        </div>
        {tags.length === 0 ? (
          <EmptyState title="No tags yet" description="Create tags like Household, Work, or Travel to organize transactions." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-3 pr-1 dark:border-slate-700">
                <TagIcon className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-sm text-slate-700 dark:text-slate-200">{t.name}</span>
                <button className="btn-ghost p-1" onClick={() => setEditing({ ...t })} aria-label={`Rename ${t.name}`}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button className="btn-ghost p-1 text-red-500" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardBody>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Rename tag" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void renameTag()}>Rename</Button>
          </>
        }
      >
        <Field label="Tag name">
          <Input value={editing?.name ?? ''} onChange={(e) => setEditing((t) => (t ? { ...t, name: e.target.value } : t))} autoFocus />
        </Field>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={deleteTag} danger title={`Delete ${deleting?.name}?`} confirmLabel="Delete tag"
        message="The tag is removed from all transactions." />
    </Card>
  );
}

// ------------------------------------------------------------------ Rules

const RULE_FIELDS = [
  { value: 'merchant', label: 'Merchant' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
  { value: 'account', label: 'Account' },
  { value: 'category', label: 'Category' },
  { value: 'type', label: 'Type' },
  { value: 'tag', label: 'Tag' },
] as const;

const RULE_OPS: Record<string, string[]> = {
  merchant: ['contains', 'not-contains', 'equals', 'starts-with', 'ends-with'],
  description: ['contains', 'not-contains', 'equals', 'starts-with', 'ends-with'],
  amount: ['gt', 'lt'],
  account: ['is'],
  category: ['is'],
  type: ['is'],
  tag: ['is', 'not'],
};

function RulesSection() {
  const { repo, rules, refresh, bumpTxn, categories, tags, accounts } = useApp();
  const [editing, setEditing] = useState<TransactionRule | null>(null);
  const [deleting, setDeleting] = useState<TransactionRule | null>(null);

  const newRule = (): TransactionRule => ({
    id: newId(),
    name: '',
    enabled: true,
    priority: rules.length,
    conditions: [{ field: 'merchant', op: 'contains', value: '' }],
    actions: [{ kind: 'set-category', categoryId: '' }],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });

  const deleteRule = async () => {
    if (!deleting) return;
    await repo.deleteRule(deleting.id);
    bumpTxn();
    await refresh();
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Rules automatically categorize and organize incoming transactions. They run at import and when you add transactions manually.
        </p>
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(newRule()); }}>New rule</Button>
      </div>
      {rules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wand2 className="h-6 w-6" />}
            title="No rules yet"
            description="Create rules like: if merchant contains “Amazon” then set category to Shopping."
            action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(newRule()); }}>Create your first rule</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {[...rules].sort((a, b) => a.priority - b.priority).map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Toggle checked={r.enabled} onChange={(v) => { void repo.saveRule({ ...r, enabled: v, updatedAt: nowISO() }).then(refresh); }} label={`${r.name} enabled`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.name || 'Untitled rule'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      IF {r.conditions.map((c) => `${c.field} ${c.op} “${c.value}”`).join(' AND ') || 'always'} →{' '}
                      {r.actions.map(actionLabel).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => setEditing({ ...r })} aria-label={`Edit ${r.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <RuleModal
          open={!!editing}
          onClose={() => setEditing(null)}
          rule={editing}
          categories={categories}
          tags={tags}
          accounts={accounts}
          onSave={async (r) => {
            await repo.saveRule(r);
            bumpTxn();
            await refresh();
          }}
        />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={deleteRule} danger title={`Delete rule?`} confirmLabel="Delete rule"
        message="Existing transactions are not changed, but this rule will no longer apply to new imports." />
    </div>
  );
}

function actionLabel(a: TransactionRule['actions'][number]): string {
  switch (a.kind) {
    case 'set-category': return 'set category';
    case 'set-merchant': return `rename to “${a.value}”`;
    case 'add-tag': return 'add tag';
    case 'remove-tag': return 'remove tag';
    case 'mark-reviewed': return 'mark reviewed';
    case 'exclude-from-budget': return 'exclude from budget';
    case 'exclude-from-reports': return 'exclude from reports';
  }
}

function RuleModal({ open, onClose, rule, categories, tags, accounts, onSave }: {
  open: boolean;
  onClose: () => void;
  rule: TransactionRule;
  categories: Category[];
  tags: Tag[];
  accounts: ReturnType<typeof useApp>['accounts'];
  onSave: (r: TransactionRule) => Promise<void>;
}) {
  const [form, setForm] = useState<TransactionRule>({ ...rule, conditions: rule.conditions.map((c) => ({ ...c })), actions: rule.actions.map((a) => ({ ...a })) });

  const updateCondition = (i: number, patch: Partial<TransactionRule['conditions'][number]>) => {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c, ci) => (ci === i ? { ...c, ...patch } : c)),
    }));
  };

  const replaceAction = (i: number, action: TransactionRule['actions'][number]) => {
    setForm((f) => ({
      ...f,
      actions: f.actions.map((a, ai) => (ai === i ? action : a)),
    }));
  };

  const newActionFor = (kind: string): TransactionRule['actions'][number] => {
    switch (kind) {
      case 'set-category': return { kind: 'set-category', categoryId: '' };
      case 'set-merchant': return { kind: 'set-merchant', value: '' };
      case 'add-tag': return { kind: 'add-tag', tagId: '' };
      case 'remove-tag': return { kind: 'remove-tag', tagId: '' };
      case 'mark-reviewed': return { kind: 'mark-reviewed' };
      case 'exclude-from-budget': return { kind: 'exclude-from-budget' };
      case 'exclude-from-reports': return { kind: 'exclude-from-reports' };
      default: return { kind: 'set-category', categoryId: '' };
    }
  };

  const valid = form.name.trim() !== '' && form.conditions.every((c) => c.value !== '');

  return (
    <Modal open={open} onClose={onClose} title={rule.id === form.id && !rule.name ? 'New rule' : `Edit rule`} size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => void onSave({ ...form, name: form.name.trim() || 'Untitled rule', updatedAt: nowISO() }).then(onClose)}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Rule name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amazon → Shopping" autoFocus />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Conditions (all must match)</span>
            <button className="btn-ghost p-1 text-xs" onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: 'merchant', op: 'contains', value: '' }] }))}>
              + Add condition
            </button>
          </div>
          <div className="space-y-2">
            {form.conditions.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select className="w-32" value={c.field} onChange={(e) => {
                  const field = e.target.value as TransactionRule['conditions'][number]['field'];
                  updateCondition(i, { field, op: (RULE_OPS[field]?.[0] ?? 'contains') as TransactionRule['conditions'][number]['op'], value: '' });
                }}>
                  {RULE_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </Select>
                <Select className="w-36" value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value as TransactionRule['conditions'][number]['op'] })}>
                  {(RULE_OPS[c.field] ?? []).map((op) => (
                    <option key={op} value={op}>{op.replace('-', ' ')}</option>
                  ))}
                </Select>
                {c.field === 'account' ? (
                  <Select className="flex-1 min-w-[160px]" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })}>
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                ) : c.field === 'category' ? (
                  <Select className="flex-1 min-w-[160px]" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })}>
                    <option value="">Select category…</option>
                    {categories.filter((x) => !x.archived).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </Select>
                ) : c.field === 'tag' ? (
                  <Select className="flex-1 min-w-[160px]" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })}>
                    <option value="">Select tag…</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                ) : c.field === 'type' ? (
                  <Select className="flex-1 min-w-[160px]" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </Select>
                ) : (
                  <Input className="flex-1 min-w-[160px]" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="Value" />
                )}
                <button className="btn-ghost p-1.5 text-red-500" onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, ci) => ci !== i) }))} aria-label="Remove condition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Actions (all applied)</span>
            <button className="btn-ghost p-1 text-xs" onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, newActionFor('set-category')] }))}>
              + Add action
            </button>
          </div>
          <div className="space-y-2">
            {form.actions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select className="w-44" value={a.kind} onChange={(e) => {
                  replaceAction(i, newActionFor(e.target.value));
                }}>
                  <option value="set-category">Set category</option>
                  <option value="set-merchant">Set merchant</option>
                  <option value="add-tag">Add tag</option>
                  <option value="remove-tag">Remove tag</option>
                  <option value="mark-reviewed">Mark reviewed</option>
                  <option value="exclude-from-budget">Exclude from budget</option>
                  <option value="exclude-from-reports">Exclude from reports</option>
                </Select>
                {a.kind === 'set-category' && (
                  <Select className="flex-1 min-w-[160px]" value={a.categoryId ?? ''} onChange={(e) => replaceAction(i, { kind: 'set-category', categoryId: e.target.value })}>
                    <option value="">Select category…</option>
                    {categories.filter((x) => !x.archived).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </Select>
                )}
                {a.kind === 'set-merchant' && (
                  <Input className="flex-1 min-w-[160px]" value={a.value} onChange={(e) => replaceAction(i, { kind: 'set-merchant', value: e.target.value })} placeholder="New merchant name" />
                )}
                {(a.kind === 'add-tag' || a.kind === 'remove-tag') && (
                  <Select className="flex-1 min-w-[160px]" value={a.tagId ?? ''} onChange={(e) => replaceAction(i, { kind: a.kind, tagId: e.target.value })}>
                    <option value="">Select tag…</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                )}
                <button className="btn-ghost p-1.5 text-red-500" onClick={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, ci) => ci !== i) }))} aria-label="Remove action">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- Data

function DataSection() {
  const { repo, refresh, bumpTxn, accounts, transactionsLoaded } = useApp();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [issues, setIssues] = useState<IntegrityIssue[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runIntegrityCheck = async () => {
    setChecking(true);
    try {
      const [accs, txs, splits, transfers, cats, groups, goals, holds, secs, rec, budgets, budgetItems] = await Promise.all([
        repo.getAccounts(), repo.getAllTransactions(), (async () => {
          const all = await repo.getAllTransactions();
          return repo.getSplitsForTransactions(all.map((t) => t.id));
        })(), repo.getTransfers(), repo.getCategories(), repo.getCategoryGroups(),
        repo.getGoals(), repo.getHoldings(), repo.getSecurities(), repo.getRecurring(), repo.getBudgets(),
        repo.getBudgetItemsForMonth(new Date().toISOString().slice(0, 7)),
      ]);
      const result = integrityCheck({ accounts: accs, transactions: txs, splits, transfers, categories: cats, groups, goals, holdings: holds, securities: secs, recurring: rec, budgets, budgetItems });
      setIssues(result);
    } finally {
      setChecking(false);
    }
  };

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      const demo = buildSampleData();
      await repo.importAll(demo, { replace: false });
      bumpTxn();
      await refresh();
      setMessage('Sample data loaded. It is clearly labeled and can be removed at any time.');
    } finally {
      setLoadingDemo(false);
      setConfirmDemo(false);
    }
  };

  const resetAll = async () => {
    await repo.clear();
    bumpTxn();
    await refresh();
    setConfirmReset(false);
    setMessage('All data cleared. The app is now empty.');
  };

  const recompute = async () => {
    await repo.recomputeBalances();
    await refresh();
    setMessage('All account balances recomputed from transactions.');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Data integrity check
          </h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Scans for duplicate IDs, broken references, invalid categories, negative asset balances, and other problems.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void runIntegrityCheck()} disabled={checking}>
              {checking ? 'Checking…' : 'Run integrity check'}
            </Button>
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void recompute()}>
              Recompute all balances
            </Button>
          </div>
          {issues && (
            <div className="mt-3">
              {issues.length === 0 ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  ✓ No integrity issues found.
                </p>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                  <p className="mb-2 text-sm font-medium text-red-700 dark:text-red-300">{issues.length} issue(s) found:</p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-red-700 dark:text-red-300">
                    {issues.map((iss, i) => (
                      <li key={i}>[{iss.severity}] {iss.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Database className="h-4 w-4 text-brand-500" /> Sample data
          </h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Load a fully fictional demo dataset — checking, savings, credit card, mortgage, brokerage, ~300 transactions, budgets, goals, and recurring bills. Clearly labeled as sample data.
          </p>
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setConfirmDemo(true)} disabled={loadingDemo}>
            {loadingDemo ? 'Loading…' : 'Load sample data'}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <Trash2 className="h-4 w-4" /> Danger zone
          </h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Permanently delete everything stored in this browser. Export a backup first — this cannot be undone.
          </p>
          <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={!transactionsLoaded && accounts.length === 0}>
            Delete all data
          </Button>
        </CardBody>
      </Card>

      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{message}</p>}

      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        onConfirm={() => void loadDemo()}
        title="Load sample data?"
        confirmLabel="Load sample data"
        message="This adds a fictional demo dataset to your workspace. It is safe to delete later."
      />
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => void resetAll()}
        danger
        title="Delete ALL data?"
        confirmLabel="Delete everything"
        message={
          <span>
            This permanently deletes <strong>all</strong> accounts, transactions, budgets, goals, and settings from this
            browser. Export a backup first if you might need this data again.
          </span>
        }
      />
    </div>
  );
}