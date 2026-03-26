'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTenant } from '@/lib/auth/tenant-context';
import { ShieldCheck, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Threat {
  id: string;
  subject: string;
  sender_email: string;
  sender_name: string;
  threat_type: string;
  verdict: string;
  score: number;
  status: string;
  quarantined_at: string;
  explanation: string;
}

const ITEMS_PER_PAGE = 50;

export default function ThreatsPage() {
  const { currentTenant } = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page') || '1');
  const currentFilter = (searchParams.get('status') || 'all') as 'all' | 'quarantined' | 'released' | 'deleted';

  const [threats, setThreats] = useState<Threat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'all' && key === 'status') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.replace(`?${params.toString()}`);
  }

  const fetchThreats = useCallback(async () => {
    if (!currentTenant) return;

    try {
      const params = new URLSearchParams();
      params.set('status', currentFilter);
      params.set('page', String(currentPage));
      params.set('limit', String(ITEMS_PER_PAGE));

      const response = await fetch(`/api/threats?${params}`);
      if (!response.ok) throw new Error('Failed to fetch threats');

      const data = await response.json();
      setThreats(data.threats || []);
      setTotal(data.total || data.threats?.length || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threats');
    } finally {
      setLoading(false);
    }
  }, [currentTenant, currentFilter, currentPage]);

  useEffect(() => {
    setLoading(true);
    fetchThreats();
  }, [fetchThreats]);

  const getThreatTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      phishing: 'bg-red-100 text-red-800',
      malware: 'bg-purple-100 text-purple-800',
      spam: 'bg-yellow-100 text-yellow-800',
      bec: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      quarantined: 'bg-amber-100 text-amber-800',
      released: 'bg-green-100 text-green-800',
      deleted: 'bg-red-100 text-red-800',
      dismissed: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Threats</h1>
          <p className="mt-1 text-sm text-gray-500">
            Read-only overview of detected email threats. To take action, use the Quarantine page.
          </p>
        </div>
        <Link
          href="/dashboard/quarantine"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Manage Quarantine
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <div className="flex gap-2">
            {(['all', 'quarantined', 'released', 'deleted'] as const).map((status) => (
              <button
                key={status}
                onClick={() => updateParams({ status, page: '1' })}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  currentFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Threats Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {threats.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheck className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No threats found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {currentFilter === 'all'
                ? 'No email threats have been detected yet.'
                : `No ${currentFilter} threats found.`}
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Threat Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Detected
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {threats.map((threat) => (
                <tr key={threat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {threat.subject || '(No subject)'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {threat.sender_name ? `${threat.sender_name} <${threat.sender_email}>` : threat.sender_email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getThreatTypeBadge(threat.threat_type)}`}>
                      {threat.threat_type || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className={`h-2 rounded-full ${threat.score >= 80 ? 'bg-red-500' : threat.score >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${threat.score}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-700">{threat.score}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(threat.status)}`}>
                      {threat.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {threat.quarantined_at ? new Date(threat.quarantined_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/dashboard/threats/${threat.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-blue-900">Looking for quarantine actions?</h4>
            <p className="text-sm text-blue-700 mt-1">
              To release, delete, report false positives, or manage sender lists, go to the{' '}
              <Link href="/dashboard/quarantine" className="underline font-medium">
                Quarantine page
              </Link>
              . This page is a read-only view of all detected threats.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
