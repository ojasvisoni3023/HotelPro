import { Mail, Phone } from 'lucide-react';
import { Container, Nav, Navbar } from 'react-bootstrap';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import Brand from './Brand';
import UserMenu, { NotificationBell } from './UserMenu';
import './layout.css';

export function SiteHeader() {
  const { user, loading } = useAuth();
  return (
    <Navbar expand="md" variant="dark" className="site-header" collapseOnSelect>
      <Container>
        <Brand />
        <div className="d-flex align-items-center gap-1 order-md-last">
          {user && <NotificationBell />}
          {user && <UserMenu />}
          <Navbar.Toggle aria-controls="site-nav" className="ms-1" />
        </div>
        <Navbar.Collapse id="site-nav">
          <Nav className="mx-md-auto">
            <Nav.Link as={NavLink} to="/hotels" eventKey="hotels">
              Hotels
            </Nav.Link>
            <Nav.Link as={NavLink} to="/rooms" eventKey="rooms">
              Rooms
            </Nav.Link>
            <Nav.Link as={NavLink} to="/about" eventKey="about">
              About
            </Nav.Link>
            <Nav.Link as={NavLink} to="/contact" eventKey="contact">
              Contact
            </Nav.Link>
          </Nav>
          {!loading && !user && (
            <div className="d-flex gap-2 py-2 py-md-0">
              <Link to="/login" className="btn btn-sm btn-outline-light border-0">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-sm btn-brass">
                Create account
              </Link>
            </div>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export function SiteFooter() {
  const { config } = useConfig();
  return (
    <footer className="site-footer mt-auto">
      <Container className="py-5">
        <div className="row g-4">
          <div className="col-md-5">
            <Brand />
            <p className="mt-3 mb-0 footer-muted measure">Four independent hotels across India, booked and run from one place. Every room, rate and reservation here comes live from our own system.</p>
          </div>
          <div className="col-12 col-sm-6 col-md-3">
            <h2 className="footer-title">Stay</h2>
            <ul className="list-unstyled footer-links">
              <li><Link to="/hotels">All hotels</Link></li>
              <li><Link to="/rooms">Find a room</Link></li>
              <li><Link to="/account/bookings">Manage a booking</Link></li>
            </ul>
          </div>
          <div className="col-12 col-sm-6 col-md-4">
            <h2 className="footer-title">Talk to us</h2>
            <ul className="list-unstyled footer-links">
              {config?.supportEmail && (
                <li>
                  <a href={`mailto:${config.supportEmail}`}>
                    <Mail size={14} className="me-2" aria-hidden="true" />
                    {config.supportEmail}
                  </a>
                </li>
              )}
              {config?.supportPhone && (
                <li>
                  <a href={`tel:${config.supportPhone.replace(/\s/g, '')}`}>
                    <Phone size={14} className="me-2" aria-hidden="true" />
                    {config.supportPhone}
                  </a>
                </li>
              )}
              <li><Link to="/contact">Send a message</Link></li>
            </ul>
          </div>
        </div>
        <div className="d-flex flex-wrap justify-content-between gap-2 pt-4 mt-4 footer-rule small footer-muted">
          <span>© {new Date().getFullYear()} HotelPro. A student project; hotels and guests are fictional.</span>
          <span>Photography via Unsplash.</span>
        </div>
      </Container>
    </footer>
  );
}

export function Announcement() {
  const { config } = useConfig();
  const testMode = config?.payment?.testMode;
  if (!config?.announcement && !testMode) return null;
  return (
    <div className="announcement small text-center px-3 py-2">
      {config.announcement}
      {config.announcement && testMode && ' '}
      {testMode && <span>Payments are in test mode: no real money is charged.</span>}
    </div>
  );
}

export default function PublicLayout() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <a href="#main" className="visually-hidden-focusable skip-link">
        Skip to content
      </a>
      <Announcement />
      <SiteHeader />
      <main id="main" className="flex-grow-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
