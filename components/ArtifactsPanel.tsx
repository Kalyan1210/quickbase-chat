'use client';

import { useState } from 'react';
import { X, Table, BarChart3, Download, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TableArtifact {
  type: 'table';
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  source?: string;
}

export interface ChartArtifact {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: Array<{ name: string; value: number; [key: string]: unknown }>;
  source?: string;
}

export type Artifact = TableArtifact | ChartArtifact;

interface ArtifactsPanelProps {
  artifacts: Artifact[];
  isOpen: boolean;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#14b8a6', // teal
];

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function DataTable({ artifact }: { artifact: TableArtifact }) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedRows = [...artifact.rows].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const exportCSV = () => {
    const headers = artifact.columns.join(',');
    const rows = sortedRows.map(row => 
      artifact.columns.map(col => {
        const val = row[col];
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`;
        }
        return val ?? '';
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-surface-200">{artifact.title}</h3>
        <button
          onClick={exportCSV}
          className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
          title="Export CSV"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-auto rounded-lg border border-surface-700">
        <table className="w-full text-sm">
          <thead className="bg-surface-800 sticky top-0">
            <tr>
              {artifact.columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-3 py-2 text-left text-surface-300 font-medium cursor-pointer hover:bg-surface-700 transition-colors whitespace-nowrap"
                >
                  {col}
                  {sortColumn === col && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr
                key={idx}
                className="border-t border-surface-700 hover:bg-surface-800/50 transition-colors"
              >
                {artifact.columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {String(row[col] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <p className="text-xs text-surface-500 mt-2">
        {sortedRows.length} rows {artifact.source && `• ${artifact.source}`}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHART COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function DataChart({ artifact }: { artifact: ChartArtifact }) {
  const renderChart = () => {
    switch (artifact.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={artifact.data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="name" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                }}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={artifact.data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {artifact.data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={artifact.data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="name" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#6366f1" 
                strokeWidth={2}
                dot={{ fill: '#6366f1', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-surface-200 mb-3">{artifact.title}</h3>
      <div className="flex-1 min-h-0">
        {renderChart()}
      </div>
      {artifact.source && (
        <p className="text-xs text-surface-500 mt-2">{artifact.source}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACTS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function ArtifactsPanel({ artifacts, isOpen, onClose }: ArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  if (artifacts.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: isExpanded ? '60%' : 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full border-l border-surface-700 bg-surface-900 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-medium text-surface-200">Artifacts</span>
              <span className="text-xs text-surface-500">({artifacts.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          {artifacts.length > 1 && (
            <div className="flex gap-1 px-4 py-2 border-b border-surface-700 overflow-x-auto">
              {artifacts.map((artifact, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
                    ${activeTab === idx 
                      ? 'bg-brand-500/20 text-brand-400' 
                      : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200'
                    }
                  `}
                >
                  {artifact.type === 'table' ? (
                    <Table className="w-3 h-3" />
                  ) : (
                    <BarChart3 className="w-3 h-3" />
                  )}
                  {artifact.title.length > 20 
                    ? artifact.title.substring(0, 20) + '...' 
                    : artifact.title
                  }
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 p-4 overflow-auto">
            {artifacts[activeTab]?.type === 'table' ? (
              <DataTable artifact={artifacts[activeTab] as TableArtifact} />
            ) : (
              <DataChart artifact={artifacts[activeTab] as ChartArtifact} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
