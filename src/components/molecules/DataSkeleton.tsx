// src/components/molecules/DataSkeleton.tsx
/**
 * DataSkeleton Molecule
 * ======================
 * Reusable data-loading skeleton with three layout variants:
 *   - 'list'   — stacked horizontal rows (default)
 *   - 'grid'   — responsive card grid
 *   - 'detail' — header + paragraph blocks for detail views
 *
 * Uses the Skeleton atom and matrix-green theme styling.
 */

import { useMemo } from 'react';
import { Skeleton } from '@/components/atoms/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataSkeletonVariant = 'list' | 'grid' | 'detail';

export interface DataSkeletonProps {
  /** Layout variant. */
  variant?: DataSkeletonVariant;
  /** Number of skeleton items to render. */
  count?: number;
  /** Extra CSS classes on the wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pre-built item descriptors with stable keys and deterministic widths. */
interface SkeletonItem {
  key: string;
  primaryWidth: string;
  secondaryWidth: string;
}

function buildItems(prefix: string, count: number): SkeletonItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    key: `${prefix}-${idx}`,
    primaryWidth: `${60 + ((idx * 13) % 30)}%`,
    secondaryWidth: `${35 + ((idx * 7) % 25)}%`,
  }));
}

// ---------------------------------------------------------------------------
// Sub-layouts
// ---------------------------------------------------------------------------

function ListSkeleton({ items }: { items: SkeletonItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center gap-3 p-3 rounded-lg border border-[var(--matrix-border)]/20 bg-[var(--matrix-bg-secondary)]/20"
        >
          <Skeleton shape="circle" width={36} height={36} />
          <div className="flex-1 space-y-2">
            <Skeleton shape="line" width={item.primaryWidth} height={14} />
            <Skeleton shape="line" width={item.secondaryWidth} height={10} />
          </div>
          <Skeleton shape="rectangle" width={56} height={24} className="!rounded-md" />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton({ items }: { items: SkeletonItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="p-4 rounded-lg border border-[var(--matrix-border)]/20 bg-[var(--matrix-bg-secondary)]/20 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Skeleton shape="rectangle" width={32} height={32} className="!rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton shape="line" width="70%" height={12} />
              <Skeleton shape="line" width="40%" height={10} />
            </div>
          </div>
          <Skeleton shape="rectangle" width="100%" height={40} />
          <div className="flex items-center justify-between">
            <Skeleton shape="line" width="30%" height={10} />
            <Skeleton shape="circle" width={18} height={18} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton({ items }: { items: SkeletonItem[] }) {
  return (
    <div className="space-y-6">
      {/* Detail header */}
      <div className="flex items-center gap-4">
        <Skeleton shape="rectangle" width={56} height={56} className="!rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton shape="line" width="50%" height={20} />
          <Skeleton shape="line" width="30%" height={14} />
        </div>
      </div>

      {/* Detail content blocks */}
      {items.map((item) => (
        <div key={item.key} className="space-y-2">
          <Skeleton shape="line" width={item.secondaryWidth} height={14} />
          <Skeleton shape="rectangle" width="100%" height={48} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataSkeleton({ variant = 'list', count = 4, className = '' }: DataSkeletonProps) {
  const items = useMemo(() => buildItems(variant, count), [variant, count]);

  return (
    <output className={`animate-in fade-in duration-300 block ${className}`} aria-busy="true" aria-label="Loading data">
      {variant === 'list' && <ListSkeleton items={items} />}
      {variant === 'grid' && <GridSkeleton items={items} />}
      {variant === 'detail' && <DetailSkeleton items={items} />}
    </output>
  );
}
