import type { ReactNode } from 'react';
import { Ban, Check, CircleSlash, Loader2, RotateCw, TriangleAlert } from 'lucide-react';
import type { SupplierProgressStatus } from '../api/contract';

export type StatusTone = 'idle' | 'active' | 'warn' | 'ok' | 'danger' | 'muted';

export interface StatusDescriptor {
  /** Shown next to the supplier name. */
  label: string;
  tone: StatusTone;
  icon: ReactNode;
  /** True while the supplier is still working — drives the animated rail. */
  live: boolean;
}

const ICON_SIZE = 13;

export function describeStatus(status: SupplierProgressStatus): StatusDescriptor {
  switch (status) {
    case 'PENDING':
      return { label: 'Queued', tone: 'idle', icon: <CircleSlash size={ICON_SIZE} />, live: false };
    case 'CALLING':
      return {
        label: 'Calling',
        tone: 'active',
        icon: <Loader2 size={ICON_SIZE} className="spin" />,
        live: true,
      };
    case 'RETRYING':
      return {
        label: 'Retrying',
        tone: 'warn',
        icon: <RotateCw size={ICON_SIZE} className="spin" />,
        live: true,
      };
    case 'FULFILLED':
      return { label: 'Returned rates', tone: 'ok', icon: <Check size={ICON_SIZE} />, live: false };
    case 'EMPTY':
      return {
        label: 'No inventory',
        tone: 'muted',
        icon: <CircleSlash size={ICON_SIZE} />,
        live: false,
      };
    case 'FAILED':
      return {
        label: 'Failed',
        tone: 'danger',
        icon: <TriangleAlert size={ICON_SIZE} />,
        live: false,
      };
    case 'TIMED_OUT':
      return { label: 'Timed out', tone: 'warn', icon: <Ban size={ICON_SIZE} />, live: false };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'muted', icon: <Ban size={ICON_SIZE} />, live: false };
  }
}
