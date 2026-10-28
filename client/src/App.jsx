import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import DashboardLayout from './components/layout/DashboardLayout';
import PublicLayout from './components/layout/PublicLayout';
import ProtectedRoute from './components/routing/ProtectedRoute';
import { PageLoader } from './components/ui/Feedback';
import { HotelScopeProvider } from './context/HotelScopeContext';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/public/AuthPages';
import Home from './pages/public/Home';
import { About, Contact, NotFound } from './pages/public/StaticPages';

// Public browsing pages load eagerly; signed-in areas are split into separate chunks.
const Hotels = lazy(() => import('./pages/public/Hotels'));
const HotelDetail = lazy(() => import('./pages/public/HotelDetail'));
const Rooms = lazy(() => import('./pages/public/Rooms'));
const RoomDetail = lazy(() => import('./pages/public/RoomDetail'));
const Checkout = lazy(() => import('./pages/guest/Checkout'));
const Payment = lazy(() => import('./pages/guest/Payment'));
const Confirmation = lazy(() => import('./pages/guest/Confirmation'));
const Invoice = lazy(() => import('./pages/shared/Invoice'));
const BookingDetail = lazy(() => import('./pages/shared/BookingDetail'));
const guest = () => import('./pages/guest/GuestPages');
const GuestDashboard = lazy(() => guest().then((m) => ({ default: m.GuestDashboard })));
const MyBookings = lazy(() => guest().then((m) => ({ default: m.MyBookings })));
const MyPayments = lazy(() => guest().then((m) => ({ default: m.MyPayments })));
const MyReviews = lazy(() => guest().then((m) => ({ default: m.MyReviews })));
const account = () => import('./pages/shared/AccountPages');
const Notifications = lazy(() => account().then((m) => ({ default: m.Notifications })));
const Profile = lazy(() => account().then((m) => ({ default: m.Profile })));
const staff = () => import('./pages/staff/StaffPages');
const StaffDashboard = lazy(() => staff().then((m) => ({ default: m.StaffDashboard })));
const FrontDesk = lazy(() => staff().then((m) => ({ default: m.FrontDesk })));
const RoomBoard = lazy(() => staff().then((m) => ({ default: m.RoomBoard })));
const Housekeeping = lazy(() => staff().then((m) => ({ default: m.Housekeeping })));
const GuestRequests = lazy(() => staff().then((m) => ({ default: m.GuestRequests })));
const mgr = () => import('./pages/manager/ManagerPages');
const ManagerDashboard = lazy(() => mgr().then((m) => ({ default: m.ManagerDashboard })));
const Reservations = lazy(() => mgr().then((m) => ({ default: m.Reservations })));
const RoomTypes = lazy(() => mgr().then((m) => ({ default: m.RoomTypes })));
const RoomsInventory = lazy(() => mgr().then((m) => ({ default: m.RoomsInventory })));
const HotelSettings = lazy(() => mgr().then((m) => ({ default: m.HotelSettings })));
const ManagerStaff = lazy(() => mgr().then((m) => ({ default: m.ManagerStaff })));
const ManagerReports = lazy(() => mgr().then((m) => ({ default: m.ManagerReports })));
const adm = () => import('./pages/admin/AdminPages');
const AdminDashboard = lazy(() => adm().then((m) => ({ default: m.AdminDashboard })));
const AdminAnalytics = lazy(() => adm().then((m) => ({ default: m.AdminAnalytics })));
const AdminBookings = lazy(() => adm().then((m) => ({ default: m.AdminBookings })));
const AdminPayments = lazy(() => adm().then((m) => ({ default: m.AdminPayments })));
const AdminUsers = lazy(() => adm().then((m) => ({ default: m.AdminUsers })));
const AdminHotels = lazy(() => adm().then((m) => ({ default: m.AdminHotels })));
const AdminStaff = lazy(() => adm().then((m) => ({ default: m.AdminStaff })));
const AdminReviews = lazy(() => adm().then((m) => ({ default: m.AdminReviews })));
const AuditLogs = lazy(() => adm().then((m) => ({ default: m.AuditLogs })));
const AdminSettings = lazy(() => adm().then((m) => ({ default: m.AdminSettings })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function TeamArea({ role }) {
  return (
    <ProtectedRoute roles={role === 'staff' ? ['staff'] : [role]}>
      <HotelScopeProvider>
        <DashboardLayout role={role} />
      </HotelScopeProvider>
    </ProtectedRoute>
  );
}

const ALL = ['guest', 'staff', 'manager', 'admin'];

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="hotels" element={<Hotels />} />
          <Route path="hotels/:slug" element={<HotelDetail />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="search" element={<Rooms />} />
          <Route path="rooms/:id" element={<RoomDetail />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="verify-email" element={<VerifyEmail />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute roles={ALL} />}>
            <Route path="checkout" element={<Checkout />} />
            <Route path="bookings/:id/pay" element={<Payment />} />
            <Route path="bookings/:id/confirmation" element={<Confirmation />} />
            <Route path="bookings/:id/invoice" element={<Invoice />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="account" element={<ProtectedRoute roles={ALL}><DashboardLayout role="guest" /></ProtectedRoute>}>
          <Route index element={<GuestDashboard />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
          <Route path="payments" element={<MyPayments />} />
          <Route path="reviews" element={<MyReviews />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="staff" element={<TeamArea role="staff" />}>
          <Route index element={<StaffDashboard />} />
          <Route path="front-desk" element={<FrontDesk />} />
          <Route path="rooms" element={<RoomBoard />} />
          <Route path="housekeeping" element={<Housekeeping />} />
          <Route path="requests" element={<GuestRequests />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="manager" element={<TeamArea role="manager" />}>
          <Route index element={<ManagerDashboard />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
          <Route path="room-types" element={<RoomTypes />} />
          <Route path="rooms" element={<RoomsInventory />} />
          <Route path="hotel" element={<HotelSettings />} />
          <Route path="staff" element={<ManagerStaff />} />
          <Route path="reports" element={<ManagerReports />} />
          <Route path="front-desk" element={<FrontDesk />} />
          <Route path="housekeeping" element={<Housekeeping />} />
          <Route path="requests" element={<GuestRequests />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="admin" element={<TeamArea role="admin" />}>
          <Route index element={<AdminDashboard />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="hotels" element={<AdminHotels />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="dashboard" element={<Navigate to="/account" replace />} />
      </Routes>
    </Suspense>
  );
}
