import { Bell, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import api from '../../api/client';
import { HOME_FOR_ROLE, useAuth } from '../../context/AuthContext';
import { initials } from '../../utils/format';
import { ROLE_LABEL } from '../../utils/status';

export function useUnreadCount() {
  const { user } = useAuth();
  const location = useLocation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const load = () =>
      api
        .get('/notifications/unread-count')
        .then((r) => alive && setCount(r.data.unread))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('hp:notifications', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('hp:notifications', load);
    };
  }, [user, location.pathname]);
  return user ? count : 0;
}

export function NotificationBell({ dark = true }) {
  const { user } = useAuth();
  const count = useUnreadCount();
  const base = HOME_FOR_ROLE[user?.role] ?? '/account';
  return (
    <Link to={`${base}/notifications`} className="position-relative d-inline-flex p-2 rounded-2" style={{ color: dark ? '#e9dcc0' : 'var(--hp-navy)' }} aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}>
      <Bell size={20} strokeWidth={1.7} />
      {count > 0 && (
        <span className="position-absolute top-0 end-0 badge rounded-pill num" style={{ background: 'var(--hp-brass)', color: '#fff', fontSize: '0.65rem' }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export default function UserMenu({ dark = true }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const home = HOME_FOR_ROLE[user.role];
  const signOut = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/');
  };
  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        className="d-flex align-items-center gap-2 text-decoration-none p-1"
        style={{ color: dark ? '#f3ead8' : 'var(--hp-navy)' }}
        aria-label={`Account menu for ${user.name}`}
      >
        <span className="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold small" style={{ width: 34, height: 34, background: 'var(--hp-brass-light)', color: 'var(--hp-night)' }}>
          {initials(user.name)}
        </span>
        <span className="d-none d-lg-inline small fw-semibold">{user.name.split(' ')[0]}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Header>
          <div className="fw-semibold text-body">{user.name}</div>
          <div className="small text-muted">{ROLE_LABEL[user.role]}</div>
        </Dropdown.Header>
        <Dropdown.Item as={Link} to={home}>
          <LayoutDashboard size={16} className="me-2" aria-hidden="true" />
          Dashboard
        </Dropdown.Item>
        <Dropdown.Item as={Link} to={`${home}/profile`}>
          <UserRound size={16} className="me-2" aria-hidden="true" />
          Profile
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item as="button" onClick={signOut}>
          <LogOut size={16} className="me-2" aria-hidden="true" />
          Sign out
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
