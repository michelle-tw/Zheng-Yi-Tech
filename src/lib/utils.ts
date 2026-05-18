import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from './firebase';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateByLocale(date: any, lang: string) {
  if (!date) return '';
  
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else if (date && typeof date === 'object' && 'seconds' in date) {
    // Handle Firestore Timestamp
    d = new Date(date.seconds * 1000);
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return String(date);
  
  if (lang.startsWith('zh') || lang.startsWith('vi')) {
    return format(d, 'MM/dd/yyyy');
  }
  return format(d, 'yyyy-MM-dd');
}

export function formatTimeAgo(date: any, lang: string) {
  if (!date) return '';
  
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else if (date && typeof date === 'object' && 'seconds' in date) {
    d = new Date(date.seconds * 1000);
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return lang === 'vi' ? 'vừa xong' : lang.startsWith('zh') ? '剛剛' : 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return lang === 'vi' ? `${diffInMinutes} phút trước` : lang.startsWith('zh') ? `${diffInMinutes} 分鐘前` : `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return lang === 'vi' ? `${diffInHours} giờ trước` : lang.startsWith('zh') ? `${diffInHours} 小時前` : `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return lang === 'vi' ? `${diffInDays} ngày trước` : lang.startsWith('zh') ? `${diffInDays} 天前` : `${diffInDays}d ago`;
  }

  return formatDateByLocale(d, lang);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function calculateOT(totalHours: number, isWeekend: boolean = false) {
  let normal = 0;
  let ot134 = 0;
  let ot167 = 0;

  if (isWeekend) {
    if (totalHours <= 2) {
      ot134 = totalHours;
    } else {
      ot134 = 2;
      ot167 = totalHours - 2;
    }
  } else {
    if (totalHours <= 8) {
      normal = totalHours;
    } else if (totalHours <= 10) {
      normal = 8;
      ot134 = totalHours - 8;
    } else {
      normal = 8;
      ot134 = 2;
      ot167 = totalHours - 10;
    }
  }

  return {
    normal: Number(normal.toFixed(2)),
    ot134: Number(ot134.toFixed(2)),
    ot167: Number(ot167.toFixed(2))
  };
}
