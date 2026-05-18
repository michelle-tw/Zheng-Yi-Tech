import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  onSnapshot,
  Timestamp,
  serverTimestamp,
  doc as firestoreDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

enum OperationType {
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
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const createTimesheet = async (userId: string, data: any) => {
  const path = 'timesheets';
  try {
    return await addDoc(collection(db, path), {
      ...data,
      userId,
      status: 'pending',
      locked: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const approveTimesheet = async (timesheetId: string, adminId: string) => {
  const path = `timesheets/${timesheetId}`;
  try {
    const tsRef = doc(db, 'timesheets', timesheetId);
    await updateDoc(tsRef, {
      status: 'approved',
      approvedBy: adminId,
      approvedAt: serverTimestamp(),
      locked: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const rejectTimesheet = async (timesheetId: string, reason: string) => {
  const path = `timesheets/${timesheetId}`;
  try {
    const tsRef = doc(db, 'timesheets', timesheetId);
    await updateDoc(tsRef, {
      status: 'rejected',
      rejectReason: reason,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const getProjectStats = async (projectId: string) => {
  const path = 'timesheets';
  try {
    const q = query(collection(db, path), where('projectId', '==', projectId), where('status', '==', 'approved'));
    const snapshot = await getDocs(q);
    let totalNormal = 0;
    let totalOT134 = 0;
    let totalOT167 = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalNormal += data.normalHours || 0;
      totalOT134 += data.ot134Hours || 0;
      totalOT167 += data.ot167Hours || 0;
    });

    return { totalNormal, totalOT134, totalOT167, total: totalNormal + totalOT134 + totalOT167 };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
};
