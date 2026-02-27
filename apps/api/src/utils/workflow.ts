export type AssetStatus = 'draft' | 'review' | 'approved' | 'rejected';

const VALID_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  draft: ['review'],
  review: ['approved', 'rejected'],
  approved: [], // Статус не может быть изменен
  rejected: ['draft'], // Статус может быть изменен обратно в «Черновик»
};

/**
 * Проверяет, допустим ли переход между статусами
 */
export function validateStatusTransition(oldStatus: AssetStatus, newStatus: AssetStatus): boolean {
  // Переход в тот же самый статус всегда допустим (нет изменений)
  if (oldStatus === newStatus) {
    return true;
  }

  const allowedTransitions = VALID_TRANSITIONS[oldStatus];
  return allowedTransitions.includes(newStatus);
}

/**
 * Возвращает список допустимых следующих статусов для текущего статуса
 */
export function getAllowedStatusTransitions(currentStatus: AssetStatus): AssetStatus[] {
  return [...VALID_TRANSITIONS[currentStatus]];
}

/**
 * Проверяет, можно ли изменить статус (то есть он не равен 'approved')
 */
export function canChangeStatus(currentStatus: AssetStatus): boolean {
  return currentStatus !== 'approved';
}

/**
 * Форматирует статус для отображения в интерфейсе
 */
export function formatStatus(status: AssetStatus): string {
  const statusLabels: Record<AssetStatus, string> = {
    draft: 'Черновик',
    review: 'На согласовании',
    approved: 'Утвержден',
    rejected: 'Отклонен',
  };
  return statusLabels[status] || status;
}

/**
 * Возвращает цвет статуса для интерфейса
 */
export function getStatusColor(status: AssetStatus): string {
  const colors: Record<AssetStatus, string> = {
    draft: 'gray',
    review: 'blue',
    approved: 'green',
    rejected: 'red',
  };
  return colors[status] || 'gray';
}

