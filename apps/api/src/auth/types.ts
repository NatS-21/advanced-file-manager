export interface AuthJwtPayload {
  uid: number;
  tid: number;
  email: string;
}

import type { UserRole } from '../utils/permissions';

export interface AuthContext {
  userId: number;
  teamId: number;
  email: string;
  role?: UserRole;
}


