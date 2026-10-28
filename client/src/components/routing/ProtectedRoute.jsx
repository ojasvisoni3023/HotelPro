import { Navigate, Outlet, useLocation } from 'react-router';
import { HOME_FOR_ROLE, useAuth } from '../../context/AuthContext';
import { PageLoader } from '../ui/Feedback';

/**
 * UX-level guard only: it decides what to render. Every API call is still
 * authorised on the server, which is the real security boundary.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role] ?? '/'} replace />;
  }
  return children ?? <Outlet />;
}
