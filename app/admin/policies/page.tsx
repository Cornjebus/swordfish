'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface TenantOption {
  id: string;
  name: string;
  domain: string | null;
  plan: string;
}

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'compliance' | 'productivity' | 'custom';
  settings: {
    detection: {
      suspiciousThreshold: number;
      quarantineThreshold: number;
      blockThreshold: number;
      enableLlmAnalysis: boolean;
      llmDailyLimit: number;
    };
    actions: {
      autoQuarantine: boolean;
      notifyAdmin: boolean;
      notifyUser: boolean;
    };
    allowlists: string[];
    blocklists: string[];
  };
  usageCount: number;
  isDefault: boolean;
  createdAt: string;
}

export default function PolicyTemplatesPage() {
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PolicyTemplate | null>(null);
  const [applyTemplate, setApplyTemplate] = useState<PolicyTemplate | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [applying, setApplying] = useState(false);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/policies/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/admin/policies/templates/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        loadTemplates();
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  }

  async function openApplyDialog(template: PolicyTemplate) {
    setApplyTemplate(template);
    setSelectedTenantId('');
    setTenantsLoading(true);
    try {
      const response = await fetch('/api/msp/tenants');
      if (response.ok) {
        const data = await response.json();
        setTenants(data.tenants || []);
      }
    } catch (error) {
      console.error('Failed to load tenants:', error);
      toast.error('Failed to load tenant list');
    } finally {
      setTenantsLoading(false);
    }
  }

  async function handleApplyPolicy() {
    if (!applyTemplate || !selectedTenantId) return;
    setApplying(true);

    try {
      const response = await fetch(`/api/msp/tenants/${selectedTenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            detection: applyTemplate.settings.detection,
            actions: applyTemplate.settings.actions,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to apply policy');
      }

      toast.success(`Policy "${applyTemplate.name}" applied successfully`);
      setApplyTemplate(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply policy');
    } finally {
      setApplying(false);
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'security':
        return 'bg-red-100 text-red-700';
      case 'compliance':
        return 'bg-blue-100 text-blue-700';
      case 'productivity':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Templates</h1>
          <p className="text-gray-600 mt-1">
            Create and manage policy templates for tenant deployment
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Create Template
        </button>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-lg h-48 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
          <p className="text-gray-500 mb-4">Create your first policy template to get started.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    {template.isDefault && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded ${getCategoryColor(template.category)}`}>
                    {template.category}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSelectedTemplate(template)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="View Details"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  {!template.isDefault && (
                    <button
                      onClick={() => deleteTemplate(template.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {template.description}
              </p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Quarantine Threshold</span>
                  <span className="font-medium text-gray-900">
                    {template.settings.detection.quarantineThreshold}%
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Block Threshold</span>
                  <span className="font-medium text-gray-900">
                    {template.settings.detection.blockThreshold}%
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>LLM Analysis</span>
                  <span className={`font-medium ${template.settings.detection.enableLlmAnalysis ? 'text-green-600' : 'text-gray-400'}`}>
                    {template.settings.detection.enableLlmAnalysis ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Used by {template.usageCount} tenant{template.usageCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => openApplyDialog(template)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Apply to Tenant
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadTemplates();
          }}
        />
      )}

      {/* Apply to Tenant Dialog */}
      <Dialog open={!!applyTemplate} onOpenChange={(open) => { if (!open) setApplyTemplate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Policy to Tenant</DialogTitle>
            <DialogDescription>
              Apply the &ldquo;{applyTemplate?.name}&rdquo; detection settings to a tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {tenantsLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No tenants available</p>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Select Tenant</label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Choose a tenant...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.domain ? `(${t.domain})` : ''} - {t.plan}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {applyTemplate && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-gray-700">Settings to apply:</p>
                <p className="text-gray-600">Suspicious: {applyTemplate.settings.detection.suspiciousThreshold}%</p>
                <p className="text-gray-600">Quarantine: {applyTemplate.settings.detection.quarantineThreshold}%</p>
                <p className="text-gray-600">Block: {applyTemplate.settings.detection.blockThreshold}%</p>
                <p className="text-gray-600">
                  LLM Analysis: {applyTemplate.settings.detection.enableLlmAnalysis ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTemplate(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyPolicy}
              disabled={!selectedTenantId || applying}
            >
              {applying ? 'Applying...' : 'Apply Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      {selectedTemplate && (
        <TemplateDetailModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
        />
      )}
    </div>
  );
}

function CreateTemplateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'security' | 'compliance' | 'productivity' | 'custom'>('security');
  const [settings, setSettings] = useState({
    detection: {
      suspiciousThreshold: 40,
      quarantineThreshold: 60,
      blockThreshold: 80,
      enableLlmAnalysis: true,
      llmDailyLimit: 100,
    },
    actions: {
      autoQuarantine: true,
      notifyAdmin: true,
      notifyUser: false,
    },
    allowlists: [] as string[],
    blocklists: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/policies/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, category, settings }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create template');
      }
    } catch (error) {
      setError('Failed to create template');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 my-8">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Policy Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full border rounded-lg px-4 py-2"
                placeholder="e.g., High Security"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full border rounded-lg px-4 py-2"
                placeholder="Describe when to use this template..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="security">Security</option>
                <option value="compliance">Compliance</option>
                <option value="productivity">Productivity</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-3">Detection Thresholds</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Suspicious ({settings.detection.suspiciousThreshold}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.detection.suspiciousThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      detection: {
                        ...settings.detection,
                        suspiciousThreshold: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Quarantine ({settings.detection.quarantineThreshold}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.detection.quarantineThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      detection: {
                        ...settings.detection,
                        quarantineThreshold: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Block ({settings.detection.blockThreshold}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.detection.blockThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      detection: {
                        ...settings.detection,
                        blockThreshold: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-3">Actions</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.actions.autoQuarantine}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      actions: { ...settings.actions, autoQuarantine: e.target.checked },
                    })
                  }
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Auto-quarantine suspicious emails</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.actions.notifyAdmin}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      actions: { ...settings.actions, notifyAdmin: e.target.checked },
                    })
                  }
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Notify admins on threats</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.actions.notifyUser}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      actions: { ...settings.actions, notifyUser: e.target.checked },
                    })
                  }
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Notify users on quarantine</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TemplateDetailModal({
  template,
  onClose,
}: {
  template: PolicyTemplate;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{template.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-600">{template.description}</p>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Detection Settings</h3>
            <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Suspicious Threshold</span>
                <span>{template.settings.detection.suspiciousThreshold}%</span>
              </div>
              <div className="flex justify-between">
                <span>Quarantine Threshold</span>
                <span>{template.settings.detection.quarantineThreshold}%</span>
              </div>
              <div className="flex justify-between">
                <span>Block Threshold</span>
                <span>{template.settings.detection.blockThreshold}%</span>
              </div>
              <div className="flex justify-between">
                <span>LLM Analysis</span>
                <span>{template.settings.detection.enableLlmAnalysis ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex justify-between">
                <span>LLM Daily Limit</span>
                <span>{template.settings.detection.llmDailyLimit}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Actions</h3>
            <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Auto-quarantine</span>
                <span>{template.settings.actions.autoQuarantine ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span>Notify Admin</span>
                <span>{template.settings.actions.notifyAdmin ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span>Notify User</span>
                <span>{template.settings.actions.notifyUser ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t text-sm text-gray-500">
            Created: {new Date(template.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
