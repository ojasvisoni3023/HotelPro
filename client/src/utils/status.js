/** Human labels and tones for every status the API returns. */
export const STATUS = {
  booking: {
    pending: ['Awaiting payment', 'wait'],
    confirmed: ['Confirmed', 'good'],
    checked_in: ['In house', 'info'],
    checked_out: ['Completed', 'neutral'],
    cancelled: ['Cancelled', 'bad'],
    expired: ['Hold expired', 'neutral'],
    no_show: ['No-show', 'bad'],
  },
  payment: {
    unpaid: ['Unpaid', 'wait'],
    failed: ['Payment failed', 'bad'],
    paid: ['Paid', 'good'],
    refund_pending: ['Refund pending', 'wait'],
    refunded: ['Refunded', 'neutral'],
    partially_refunded: ['Partly refunded', 'neutral'],
    created: ['Awaiting payment', 'wait'],
    captured: ['Captured', 'good'],
  },
  refund: {
    requested: ['Requested', 'wait'],
    processing: ['Processing', 'info'],
    processed: ['Refunded', 'good'],
    failed: ['Failed', 'bad'],
    rejected: ['Declined', 'bad'],
  },
  room: {
    available: ['Ready', 'good'],
    occupied: ['Occupied', 'info'],
    cleaning: ['Cleaning', 'wait'],
    maintenance: ['Maintenance', 'bad'],
    out_of_service: ['Out of service', 'neutral'],
  },
  task: {
    pending: ['To do', 'wait'],
    in_progress: ['In progress', 'info'],
    done: ['Done', 'good'],
  },
  request: {
    open: ['Open', 'wait'],
    in_progress: ['In progress', 'info'],
    resolved: ['Resolved', 'good'],
    cancelled: ['Cancelled', 'neutral'],
  },
  user: {
    active: ['Active', 'good'],
    suspended: ['Suspended', 'bad'],
  },
  review: {
    published: ['Published', 'good'],
    hidden: ['Hidden', 'neutral'],
  },
  audit: {
    security: ['Security', 'bad'],
    admin: ['Admin', 'info'],
    activity: ['Activity', 'neutral'],
  },
};

export function statusInfo(kind, value) {
  const [label, tone] = STATUS[kind]?.[value] ?? [String(value ?? '—').replace(/_/g, ' '), 'neutral'];
  return { label, tone };
}

export const ROLE_LABEL = { guest: 'Guest', staff: 'Staff', manager: 'Hotel manager', admin: 'Administrator' };

export const SERVICE_TYPES = {
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  room_service: 'Room service',
  amenities: 'Amenities',
  other: 'Other',
};

export const TASK_TYPES = {
  checkout_clean: 'Departure clean',
  daily_service: 'Daily service',
  deep_clean: 'Deep clean',
  inspection: 'Inspection',
  maintenance: 'Maintenance',
};
