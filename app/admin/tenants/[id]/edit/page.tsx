'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TenantSettings {
  detection: {
    suspiciousThreshold: number;
    quarantineThreshold: number;
    blockThreshold: number;
    enableLlmAnalysis: boolean;
    llmDailyLimit: number;
  };
  notifications: {
    emailEnabled: boolean;
    severityThreshold: string;
  };
  quarantine: {
    autoDeleteAfterDays: number;
    allowUserRelease: boolean;
  };
  actions?: {
    autoQuarantine: boolean;
    notifyAdmin: boolean;
    notifyUser: boolean;
  };
}

interface TenantData {
  id: string;
  clerkOrgId: string;
  name: string;
  domain: string | null;
  plan: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  settings: TenantSettings;
}

const DEFAULT_SETTINGS: TenantSettings = {
  detection: {
    suspiciousThreshold: 30,
    quarantineThreshold: 60,
    blockThreshold: 80,
    enableLlmAnalysis: true,
    llmDailyLimit: 100,
  },
  notifications: {
    emailEnabled: true,
    severityThreshold: 'medium',
  },
  quarantine: {
    autoDeleteAfterDays: 30,
    allowUserRelease: false,
  },
  actions: {
    autoQuarantine: true,
    notifyAdmin: true,
    notifyUser: false,
  },
};

export default function TenantEditPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [plan, setPlan] = useState<'starter' | 'pro' | 'enterprise'>('starter');
  const [status, setStatus] = useState<'active' | 'suspended' | 'pending'>('active');

  // Detection settings
  const [suspiciousThreshold, setSuspiciousThreshold] = useState(30);
  const [quarantineThreshold, setQuarantineThreshold] = useState(60);
  const [blockThreshold, setBlockThreshold] = useState(80);

  // LLM settings
  const [enableLlmAnalysis, setEnableLlmAnalysis] = useState(true);
  const [llmDailyLimit, setLlmDailyLimit] = useState(100);

  // Quarantine / action settings
  const [autoQuarantine, setAutoQuarantine] = useState(true);
  const [notifyAdmin, setNotifyAdmin] = useState(true);
  const [notifyUser, setNotifyUser] = useState(false);

  useEffect(() => {
    loadTenant();
  }, [tenantId]);

  async function loadTenant() {
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`);
      if (!response.ok) {
        toast.error('Failed to load tenant');
        return;
      }

      const data = await response.json();
      const tenant: TenantData = data.tenant;

      setName(tenant.name);
      setDomain(tenant.domain || '');
      setPlan(tenant.plan);
      setStatus(tenant.status);

      const settings = tenant.settings || DEFAULT_SETTINGS;
      const detection = settings.detection || DEFAULT_SETTINGS.detection;
      const actions = settings.actions || DEFAULT_SETTINGS.actions!;

      setSuspiciousThreshold(detection.suspiciousThreshold ?? 30);
      setQuarantineThreshold(detection.quarantineThreshold ?? 60);
      setBlockThreshold(detection.blockThreshold ?? 80);
      setEnableLlmAnalysis(detection.enableLlmAnalysis ?? true);
      setLlmDailyLimit(detection.llmDailyLimit ?? 100);

      setAutoQuarantine(actions.autoQuarantine ?? true);
      setNotifyAdmin(actions.notifyAdmin ?? true);
      setNotifyUser(actions.notifyUser ?? false);
    } catch (error) {
      console.error('Failed to load tenant:', error);
      toast.error('Failed to load tenant data');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name,
        domain: domain || null,
        plan,
        status,
        settings: {
          detection: {
            suspiciousThreshold,
            quarantineThreshold,
            blockThreshold,
            enableLlmAnalysis,
            llmDailyLimit,
          },
          notifications: {
            emailEnabled: notifyAdmin || notifyUser,
            severityThreshold: 'medium',
          },
          quarantine: {
            autoDeleteAfterDays: 30,
            allowUserRelease: false,
          },
          actions: {
            autoQuarantine,
            notifyAdmin,
            notifyUser,
          },
        },
      };

      const response = await fetch(`/api/msp/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save changes');
      }

      toast.success('Tenant updated successfully');
      router.push(`/admin/tenants/${tenantId}`);
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/admin/tenants/${tenantId}`}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tenant
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Tenant</h1>
        <p className="text-gray-500 mt-1">Update tenant configuration and detection settings</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Organization Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organization name"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Domain</label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                placeholder="example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Plan</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as typeof plan)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detection Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Detection Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Suspicious Threshold: {suspiciousThreshold}%
              </label>
              <input
                type="range"
                min={10}
                max={50}
                value={suspiciousThreshold}
                onChange={(e) => setSuspiciousThreshold(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>10%</span>
                <span>50%</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Quarantine Threshold: {quarantineThreshold}%
              </label>
              <input
                type="range"
                min={40}
                max={80}
                value={quarantineThreshold}
                onChange={(e) => setQuarantineThreshold(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>40%</span>
                <span>80%</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Block Threshold: {blockThreshold}%
              </label>
              <input
                type="range"
                min={60}
                max={95}
                value={blockThreshold}
                onChange={(e) => setBlockThreshold(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>60%</span>
                <span>95%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* LLM Settings */}
        <Card>
          <CardHeader>
            <CardTitle>LLM Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableLlmAnalysis}
                onChange={(e) => setEnableLlmAnalysis(e.target.checked)}
                className="rounded h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Enable LLM Analysis</span>
                <p className="text-xs text-gray-500">Use AI-powered analysis for threat detection</p>
              </div>
            </label>

            {enableLlmAnalysis && (
              <div className="space-y-2 pl-7">
                <label className="text-sm font-medium text-gray-700">Daily Limit</label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={llmDailyLimit}
                  onChange={(e) => setLlmDailyLimit(parseInt(e.target.value) || 0)}
                  className="max-w-[200px]"
                />
                <p className="text-xs text-gray-500">Maximum LLM analysis calls per day</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quarantine Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Quarantine & Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoQuarantine}
                onChange={(e) => setAutoQuarantine(e.target.checked)}
                className="rounded h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Auto-Quarantine</span>
                <p className="text-xs text-gray-500">Automatically quarantine emails above threshold</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyAdmin}
                onChange={(e) => setNotifyAdmin(e.target.checked)}
                className="rounded h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Notify Admin</span>
                <p className="text-xs text-gray-500">Send alerts to admins for detected threats</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyUser}
                onChange={(e) => setNotifyUser(e.target.checked)}
                className="rounded h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Notify User</span>
                <p className="text-xs text-gray-500">Notify end users when their email is quarantined</p>
              </div>
            </label>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/admin/tenants/${tenantId}`)}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
