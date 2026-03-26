'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTenant } from '@/lib/auth/tenant-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, CheckCircle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Threat {
  id: string;
  messageId: string;
  subject: string;
  senderEmail: string;
  recipientEmail: string;
  verdict: 'block' | 'quarantine' | 'suspicious' | 'pass';
  score: number;
  status: 'quarantined' | 'released' | 'deleted';
  provider: 'microsoft' | 'google' | 'smtp';
  quarantinedAt: string;
  releasedAt?: string;
  releasedBy?: string;
}

interface ThreatStats {
  quarantinedCount: number;
  releasedCount: number;
  deletedCount: number;
  last24Hours: number;
  last7Days: number;
  avgScore: number;
}

type BulkAction = 'release' | 'delete' | 'false_positive' | 'blocklist' | 'allowlist';

const ITEMS_PER_PAGE = 50;

export default function QuarantinePage() {
  const { currentTenant } = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page') || '1');
  const statusFilter = (searchParams.get('status') || 'quarantined') as 'quarantined' | 'released' | 'deleted' | 'all';

  const [threats, setThreats] = useState<Threat[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedThreats, setSelectedThreats] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`);
  }

  const fetchThreats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      params.set('stats', 'true');
      params.set('page', String(currentPage));
      params.set('limit', String(ITEMS_PER_PAGE));

      const response = await fetch(`/api/threats?${params}`);
      const data = await response.json();
      setThreats(data.threats || []);
      setTotal(data.total || data.threats?.length || 0);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch threats:', error);
      toast.error('Failed to load quarantine data');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage]);

  useEffect(() => {
    setLoading(true);
    fetchThreats();
  }, [fetchThreats]);

  async function handleAction(threatId: string, action: 'release' | 'delete' | 'false_positive' | 'blocklist' | 'allowlist') {
    if (action === 'delete' && !confirm('Are you sure you want to permanently delete this email?')) {
      return;
    }

    setActionLoading(threatId);
    try {
      switch (action) {
        case 'release': {
          const res = await fetch(`/api/threats/${threatId}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addToAllowlist: false }),
          });
          if (!res.ok) throw new Error('Release failed');
          toast.success('Email released from quarantine');
          break;
        }
        case 'delete': {
          const res = await fetch(`/api/threats/${threatId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          toast.success('Email permanently deleted');
          break;
        }
        case 'false_positive': {
          const res = await fetch(`/api/threats/${threatId}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isFalsePositive: true, addToAllowlist: true }),
          });
          if (!res.ok) throw new Error('Report failed');
          toast.success('Reported as false positive. Sender added to allowlist.');
          break;
        }
        case 'blocklist': {
          const res = await fetch('/api/threats/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'blocklist', threatIds: [threatId] }),
          });
          if (!res.ok) throw new Error('Blocklist failed');
          toast.success('Sender added to blocklist');
          break;
        }
        case 'allowlist': {
          const res = await fetch(`/api/threats/${threatId}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addToAllowlist: true }),
          });
          if (!res.ok) throw new Error('Allowlist failed');
          toast.success('Email released and sender added to allowlist');
          break;
        }
      }
      setSelectedThreats(new Set());
      await fetchThreats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function bulkAction(action: BulkAction) {
    if (selectedThreats.size === 0) return;

    const labels: Record<BulkAction, string> = {
      release: 'release',
      delete: 'permanently delete',
      false_positive: 'mark as false positive',
      blocklist: 'add senders to blocklist for',
      allowlist: 'add senders to allowlist for',
    };

    if (!confirm(`Are you sure you want to ${labels[action]} ${selectedThreats.size} email(s)?`)) {
      return;
    }

    setActionLoading('bulk');
    try {
      const res = await fetch('/api/threats/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          threatIds: Array.from(selectedThreats),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Bulk action failed');
      }

      toast.success(`Successfully processed ${selectedThreats.size} email(s)`);
      setSelectedThreats(new Set());
      await fetchThreats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk action failed');
    } finally {
      setActionLoading(null);
    }
  }

  function toggleSelectAll() {
    if (selectedThreats.size === threats.length) {
      setSelectedThreats(new Set());
    } else {
      setSelectedThreats(new Set(threats.map(t => t.id)));
    }
  }

  function toggleSelect(threatId: string) {
    const newSelected = new Set(selectedThreats);
    if (newSelected.has(threatId)) {
      newSelected.delete(threatId);
    } else {
      newSelected.add(threatId);
    }
    setSelectedThreats(newSelected);
  }

  function getVerdictBadge(verdict: Threat['verdict'], score: number) {
    if (verdict === 'block' || score >= 80) {
      return <Badge className="bg-red-100 text-red-800">Block</Badge>;
    }
    if (verdict === 'quarantine' || score >= 50) {
      return <Badge className="bg-orange-100 text-orange-800">Quarantine</Badge>;
    }
    if (verdict === 'suspicious') {
      return <Badge className="bg-yellow-100 text-yellow-800">Suspicious</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Pass</Badge>;
  }

  function getStatusBadge(status: Threat['status']) {
    switch (status) {
      case 'quarantined':
        return <Badge className="bg-orange-100 text-orange-800">Quarantined</Badge>;
      case 'released':
        return <Badge className="bg-green-100 text-green-800">Released</Badge>;
      case 'deleted':
        return <Badge className="bg-gray-100 text-gray-800">Deleted</Badge>;
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quarantine</h1>
        <p className="text-muted-foreground">
          Manage quarantined emails: release, delete, report false positives, or update sender lists.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-600">{stats.quarantinedCount}</div>
              <p className="text-sm text-muted-foreground">Quarantined</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.releasedCount}</div>
              <p className="text-sm text-muted-foreground">Released</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.last24Hours}</div>
              <p className="text-sm text-muted-foreground">Last 24 Hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.avgScore}</div>
              <p className="text-sm text-muted-foreground">Avg Score</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex gap-2 border-b">
        {(['quarantined', 'released', 'deleted', 'all'] as const).map((status) => (
          <button
            key={status}
            className={`px-4 py-2 font-medium capitalize ${
              statusFilter === status
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => {
              updateParams({ status, page: '1' });
              setSelectedThreats(new Set());
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Controls + Bulk Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => fetchThreats()}>
            Refresh
          </Button>
          {selectedThreats.size > 0 && (
            <span className="text-sm text-muted-foreground ml-2">
              {selectedThreats.size} selected
            </span>
          )}
        </div>

        {selectedThreats.size > 0 && (
          <div className="flex gap-2 flex-wrap relative">
            <Button
              variant="outline"
              className="text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => bulkAction('release')}
              disabled={actionLoading === 'bulk'}
            >
              Release ({selectedThreats.size})
            </Button>
            <Button
              variant="outline"
              className="text-yellow-700 border-yellow-300 hover:bg-yellow-50"
              onClick={() => bulkAction('false_positive')}
              disabled={actionLoading === 'bulk'}
            >
              False Positive ({selectedThreats.size})
            </Button>
            <Button
              variant="outline"
              className="text-orange-700 border-orange-300 hover:bg-orange-50"
              onClick={() => bulkAction('blocklist')}
              disabled={actionLoading === 'bulk'}
            >
              Blocklist ({selectedThreats.size})
            </Button>
            <Button
              variant="outline"
              className="text-blue-700 border-blue-300 hover:bg-blue-50"
              onClick={() => bulkAction('allowlist')}
              disabled={actionLoading === 'bulk'}
            >
              Allowlist ({selectedThreats.size})
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkAction('delete')}
              disabled={actionLoading === 'bulk'}
            >
              Delete ({selectedThreats.size})
            </Button>
          </div>
        )}
      </div>

      {/* Threat List */}
      <Card>
        <CardHeader>
          <CardTitle>Quarantined Emails</CardTitle>
          <CardDescription>
            {threats.length === 0
              ? `No ${statusFilter === 'all' ? '' : statusFilter} emails`
              : `Showing ${startItem}-${endItem} of ${total} ${statusFilter === 'all' ? '' : statusFilter} email(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {threats.length === 0 ? (
            <div className="text-center py-12">
              {statusFilter === 'quarantined' ? (
                <Shield className="mx-auto h-12 w-12 text-gray-400" />
              ) : statusFilter === 'released' ? (
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
              ) : (
                <Inbox className="mx-auto h-12 w-12 text-gray-400" />
              )}
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No emails found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Detected threats will appear here for review
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg font-medium text-sm">
                <input
                  type="checkbox"
                  checked={selectedThreats.size === threats.length && threats.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <div className="flex-1 grid grid-cols-12 gap-4">
                  <div className="col-span-3">From</div>
                  <div className="col-span-2">Subject</div>
                  <div className="col-span-1">Score</div>
                  <div className="col-span-1">Verdict</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-2">Actions</div>
                </div>
              </div>

              {/* Rows */}
              {threats.map((threat) => (
                <div
                  key={threat.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border ${
                    selectedThreats.has(threat.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedThreats.has(threat.id)}
                    onChange={() => toggleSelect(threat.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-3">
                      <p className="font-medium truncate">{threat.senderEmail}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        To: {threat.recipientEmail}
                      </p>
                    </div>
                    <div className="col-span-2 truncate" title={threat.subject}>
                      <Link
                        href={`/dashboard/threats/${threat.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {threat.subject || '(No subject)'}
                      </Link>
                    </div>
                    <div className="col-span-1">
                      <span
                        className={`font-bold ${
                          threat.score >= 80
                            ? 'text-red-600'
                            : threat.score >= 50
                            ? 'text-orange-600'
                            : 'text-yellow-600'
                        }`}
                      >
                        {threat.score}
                      </span>
                    </div>
                    <div className="col-span-1">
                      {getVerdictBadge(threat.verdict, threat.score)}
                    </div>
                    <div className="col-span-1">
                      {getStatusBadge(threat.status)}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      {formatDate(threat.quarantinedAt)}
                    </div>
                    <div className="col-span-2">
                      {threat.status === 'quarantined' ? (
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:bg-green-50 px-2 h-7 text-xs"
                            onClick={() => handleAction(threat.id, 'release')}
                            disabled={actionLoading === threat.id}
                            title="Release email"
                          >
                            Release
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-yellow-600 hover:bg-yellow-50 px-2 h-7 text-xs"
                            onClick={() => handleAction(threat.id, 'false_positive')}
                            disabled={actionLoading === threat.id}
                            title="Report false positive"
                          >
                            FP
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 px-2 h-7 text-xs"
                            onClick={() => handleAction(threat.id, 'delete')}
                            disabled={actionLoading === threat.id}
                            title="Delete permanently"
                          >
                            Del
                          </Button>
                        </div>
                      ) : (
                        <Link
                          href={`/dashboard/threats/${threat.id}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          View Details
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startItem}</span> to{' '}
            <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: String(currentPage - 1) })}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => updateParams({ page: String(currentPage + 1) })}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Action Reference */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Reference</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-muted-foreground">
            <div><span className="font-medium text-green-700">Release</span> -- Deliver email to the recipient inbox</div>
            <div><span className="font-medium text-yellow-700">False Positive</span> -- Release + add sender to allowlist</div>
            <div><span className="font-medium text-red-700">Delete</span> -- Permanently remove the email</div>
            <div><span className="font-medium text-orange-700">Blocklist</span> -- Block all future email from this sender</div>
            <div><span className="font-medium text-blue-700">Allowlist</span> -- Release + trust this sender going forward</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
