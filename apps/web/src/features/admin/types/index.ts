// Admin feature types for Printer

export interface AdminConfig {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName?: string;
  isAdmin: boolean;
  createdAt: Date;
  lastSignIn?: Date;
}

// Hook return types
export interface UseAdminReturn {
  config: AdminConfig | null;
  users: AdminUser[];
  loading: boolean;
  error: string | null;
  updateConfig: (config: Partial<AdminConfig>) => Promise<void>;
}

export interface UseAdminConfigReturn {
  config: AdminConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (config: Partial<AdminConfig>) => Promise<void>;
}
