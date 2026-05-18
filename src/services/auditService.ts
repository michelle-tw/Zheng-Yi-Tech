import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserRole } from '../types';

export async function logAction(
  executorId: string, 
  executorRole: UserRole,
  action: string, 
  targetId?: string, 
  oldValue?: any, 
  newValue?: any
) {
  try {
    if (!db) return;
    await addDoc(collection(db, 'audit_logs'), {
      admin_id: executorId,
      admin_role: executorRole,
      action,
      target_user: targetId || null,
      old_value: oldValue || null,
      new_value: newValue || null,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Failed to log audit action:", e);
  }
}
