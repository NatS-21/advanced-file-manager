import { pool } from '../db/pool';

export type ChangeType = 'metadata' | 'status' | 'tags' | 'folder';

export interface LogAssetChangeParams {
  assetId: number;
  userId: number;
  changeType: ChangeType;
  fieldName: string;
  oldValue: any;
  newValue: any;
}

/**
 * Logs a change to asset metadata in the asset_changes table.
 * Values are stored as JSONB to support various data types.
 */
export async function logAssetChange(params: LogAssetChangeParams): Promise<void> {
  const { assetId, userId, changeType, fieldName, oldValue, newValue } = params;

  // Skip logging if values are the same
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
    return;
  }

  // Convert values to JSONB-compatible format
  const oldValueJson = oldValue === undefined || oldValue === null ? null : JSON.stringify(oldValue);
  const newValueJson = newValue === undefined || newValue === null ? null : JSON.stringify(newValue);

  await pool.query(
    `INSERT INTO asset_changes (asset_id, user_id, change_type, field_name, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [assetId, userId, changeType, fieldName, oldValueJson, newValueJson]
  );
}

/**
 * Logs multiple changes in a single transaction.
 * Useful when multiple fields are updated at once.
 */
export async function logAssetChanges(changes: LogAssetChangeParams[]): Promise<void> {
  if (changes.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const change of changes) {
    // Skip if values are the same
    if (JSON.stringify(change.oldValue) === JSON.stringify(change.newValue)) {
      continue;
    }

    const oldValueJson = change.oldValue === undefined || change.oldValue === null 
      ? null 
      : JSON.stringify(change.oldValue);
    const newValueJson = change.newValue === undefined || change.newValue === null 
      ? null 
      : JSON.stringify(change.newValue);

    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}::jsonb, $${paramIndex + 5}::jsonb)`
    );
    values.push(
      change.assetId,
      change.userId,
      change.changeType,
      change.fieldName,
      oldValueJson,
      newValueJson
    );
    paramIndex += 6;
  }

  if (placeholders.length === 0) return;

  await pool.query(
    `INSERT INTO asset_changes (asset_id, user_id, change_type, field_name, old_value, new_value)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

