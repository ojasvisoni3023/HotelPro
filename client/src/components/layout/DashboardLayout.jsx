import {
  Bell,
  BedDouble,
  Building2,
  CalendarDays,
  ChartLine,
  ClipboardList,
  ConciergeBell,
  CreditCard,
  DoorOpen,
  Hotel,
  LayoutDashboard,
  Menu,
  ScrollText,
  Search,
  Settings,
  SprayCan,
  Star,
  Tag,
  UserRound,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useHotelScope } from '../../context/HotelScopeContext';
import { Announcement } from './PublicLayout';
import Brand from './Brand';
import UserMenu, { NotificationBell } from './UserMenu';
import './layout.css';

export const NAV = {
  guest: [
    { group: 'Your stays', items: [
      { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/account/bookings', label: 'My bookings', icon: CalendarDays },
      { to: '/account/payments', label: 'Payments', icon: CreditCard },
      { to: '/account/reviews', label: 'My reviews', icon: Star },
    ] },
    { group: 'Account', items: [
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
      { to: '/account/profile', label: 'Profile', icon: UserRound },
      { to: '/rooms', label: 'Find a stay', icon: Search },
    ] },
  ],
  staff: [
    { group: 'Shift', items: [
      { to: '/staff', label: 'Today', icon: LayoutDashboard, end: true },
      { to: '/staff/front-desk', label: 'Front desk', icon: ConciergeBell },
      { to: '/staff/rooms', label: 'Room board', icon: DoorOpen },
      { to: '/staff/housekeeping', label: 'Housekeeping', icon: SprayCan },
      { to: '/staff/requests', label: 'Guest requests', icon: ClipboardList },
    ] },
    { group: 'Account', items: [
      { to: '/staff/notifications', label: 'Notifications', icon: Bell },
      { to: '/staff/profile', label: 'Profile', icon: UserRound },
    ] },
  ],
  manager: [
    { group: 'Hotel', items: [
      { to: '/manager', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/manager/reservations', label: 'Reservations', icon: CalendarDays },
      { to: '/manager/reports', label: 'Reports', icon: ChartLine },
    ] },
    { group: 'Inventory', items: [
      { to: '/manager/room-types', label: 'Room types & pricing', icon: Tag },
      { to: '/manager/rooms', label: 'Rooms', icon: BedDouble },
      { to: '/manager/hotel', label: 'Hotel settings', icon: Hotel },
      { to: '/manager/staff', label: 'Staff', icon: Users },
    ] },
    { group: 'Operations', items: [
      { to: '/manager/front-desk', label: 'Front desk', icon: ConciergeBell },
      { to: '/manager/housekeeping', label: 'Housekeeping', icon: SprayCan },
      { to: '/manager/requests', label: 'Guest requests', icon: ClipboardList },
    ] },
    { group: 'Account', items: [
      { to: '/manager/notifications', label: 'Notifications', icon: Bell },
      { to: '/manager/profile', label: 'Profile', icon: UserRound },
    ] },
  ],
  admin: [
    { group: 'Platform', items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/analytics', label: 'Analytics', icon: ChartLine },
      { to: '/admin/bookings', label: 'Bookings', icon: CalendarDays },
      { to: '/admin/payments', label: 'Payments & refunds', icon: CreditCard },
    ] },
    { group: 'Manage', items: [
      { to: '/admin/hotels', label: 'Hotels', icon: Building2 },
      { to: '/admin/users', label: 'Users & roles', icon: Users },
      { to: '/admin/staff', label: 'Staff assignments', icon: ConciergeBell },
      { to: '/admin/reviews', label: 'Reviews', icon: Star },
    ] },
    { group: 'System', items: [
      { to: '/admin/audit-logs', label: 'Audit log', icon: ScrollText },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/profile', label: 'Profile', icon: UserRound },
    ] },
  ],
};

function SideNav({ role, onNavigate }) {
  return (
    <nav aria-label="Dashboard">
      {NAV[role].map((section) => (
        <div key={section.group}>
          <div className="dash-nav-group">{section.group}</div>
          <ul className="dash-nav mt-0">
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} onClick={onNavigate}>
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function HotelPicker() {
  const { hotels, hotelId, setHotelId, loading } = useHotelScope();
  if (loading) return <span className="small text-muted">Loading hotels…</span>;
  if (!hotels.length) return <span className="small text-muted">No hotel assigned yet</span>;
  if (hotels.length === 1) return <span className="fw-semibold small text-truncate">{hotels[0].name}</span>;
  return (
    <select className="form-select form-select-sm hotel-select" aria-label="Hotel" value={hotelId ?? ''} onChange={(e) => setHotelId(e.target.value)}>
      {hotels.map((h) => (
        <option key={h._id} value={h._id}>
          {h.name}
          {h.status !== 'active' ? ' (inactive)' : ''}
        </option>
      ))}
    </select>
  );
}

export default function DashboardLayout({ role }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const scoped = ['staff', 'manager'].includes(role);
  return (
    <div className="dash">
      <aside className="dash-side">
        <Brand />
        <SideNav role={role} />
        <div className="mt-auto pt-4 small" style={{ color: '#8f8a7e' }}>
          Signed in as {user?.name}
        </div>
      </aside>
      <Offcanvas show={open} onHide={() => setOpen(false)} className="dash-side-offcanvas" style={{ width: 280 }}>
        <Offcanvas.Header closeButton closeVariant="white">
          <Brand />
        </Offcanvas.Header>
        <Offcanvas.Body>
          <SideNav role={role} onNavigate={() => setOpen(false)} />
        </Offcanvas.Body>
      </Offcanvas>
      <div className="dash-main">
        <Announcement />
        <div className="dash-top">
          <button type="button" className="btn btn-quiet btn-sm d-lg-none" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          {scoped ? <HotelPicker /> : <Link to="/" className="small fw-semibold text-decoration-none d-none d-sm-inline">Visit the public site</Link>}
          <div className="ms-auto d-flex align-items-center gap-1">
            <NotificationBell dark={false} />
            <UserMenu dark={false} />
          </div>
        </div>
        <main id="main" className="dash-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
