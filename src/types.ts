export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
}

export enum ProjectStatus {
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED',
  LOCKED = 'LOCKED',
}

export enum TimesheetStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface UserProfile {
  uid: string;
  full_name: string;
  username: string;
  role: UserRole;
  preferred_lang: 'vi' | 'zh';
  is_active: boolean;
  last_active_at?: any;
  created_at: any;
  updated_at: any;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  manager_id: string;
  responsible_person?: string;
  members?: string[];
  expect_h: number;
  status: ProjectStatus;
  start_date: string;
  end_date?: string;
  expected_completion_date?: string;
  manual_progress?: number;
}

export interface TimesheetEntry {
  id: string;
  user_id: string;
  full_name?: string;
  project_id: string;
  date: string;
  work_content?: string;
  start_time: string;
  end_time: string;
  normal_h: number;
  ot_134_h: number;
  ot_167_h: number;
  status: TimesheetStatus;
  comment?: string;
  approved_by?: string;
  locked: boolean;
  deleted_at?: any;
  deleted_by?: string;
  created_by?: string;
  created_by_name?: string;
  created_at?: any;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  admin_role?: UserRole;
  action: string;
  target_user?: string;
  timestamp: string;
  old_value?: any;
  new_value?: any;
}
