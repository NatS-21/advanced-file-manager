import { pool } from '../db/pool';

export type UserRole = 'viewer' | 'uploader' | 'editor' | 'moderator' | 'admin' | 'analyst' | 'owner';

export interface Permission {
  id: number;
  role: UserRole;
  resource: string;
  action: string;
  allowed: boolean;
}

// Simple in-memory cache for permissions (can be cleared if needed)
const permissionsCache = new Map<string, boolean>();
let cacheValid = false;

/**
 * Clear the permissions cache (useful after role/permission changes)
 */
export function clearPermissionsCache(): void {
  permissionsCache.clear();
  cacheValid = false;
}

/**
 * Check if a role has permission for a resource and action
 */
export async function checkPermission(
  role: UserRole,
  resource: string,
  action: string
): Promise<boolean> {
  const cacheKey = `${role}:${resource}:${action}`;
  
  // Check cache first
  if (cacheValid && permissionsCache.has(cacheKey)) {
    return permissionsCache.get(cacheKey)!;
  }

  // Query database
  const { rows } = await pool.query<{ allowed: boolean }>(
    `SELECT allowed FROM permissions
     WHERE role = $1 AND resource = $2 AND action = $3`,
    [role, resource, action]
  );

  const allowed = rows.length > 0 ? rows[0].allowed : false;
  
  // Cache the result
  permissionsCache.set(cacheKey, allowed);
  cacheValid = true;

  return allowed;
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(role: UserRole): Promise<Permission[]> {
  const { rows } = await pool.query<Permission>(
    `SELECT id, role, resource, action, allowed
     FROM permissions
     WHERE role = $1
     ORDER BY resource, action`,
    [role]
  );

  return rows;
}

/**
 * Check if a role is one of the allowed roles
 */
export function isRoleAllowed(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Check if a role has at least the minimum required role level
 * Role hierarchy: viewer < uploader < editor < moderator < analyst < admin < owner
 */
const roleHierarchy: Record<UserRole, number> = {
  viewer: 1,
  uploader: 2,
  editor: 3,
  moderator: 4,
  analyst: 5,
  admin: 6,
  owner: 7,
};

export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[minimumRole];
}

