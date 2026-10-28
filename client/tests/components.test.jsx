import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../src/api/client', async (orig) => {
  const actual = await orig();
  return { ...actual, default: apiMock };
});

import PriceBreakdown from '../src/components/booking/PriceBreakdown';
import SearchBar from '../src/components/booking/SearchBar';
import ProtectedRoute from '../src/components/routing/ProtectedRoute';
import { Img, StatusBadge } from '../src/components/ui/Bits';
import { AuthProvider } from '../src/context/AuthContext';
import { ConfigProvider } from '../src/context/ConfigContext';
import { Login, Register } from '../src/pages/public/AuthPages';
import { ApiError } from '../src/api/client';

const CONFIG = { data: { today: '2026-10-28', taxRatePercent: 12, payment: { provider: 'mock', testMode: true } } };

function setup({ user = null } = {}) {
  apiMock.get.mockImplementation((url) => {
    if (url === '/config') return Promise.resolve(CONFIG);
    if (url === '/auth/session') return Promise.resolve({ data: { user } });
    return Promise.resolve({ data: [] });
  });
}

function renderAt(path, routes) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfigProvider>
        <AuthProvider>
          <Routes>{routes}</Routes>
        </AuthProvider>
      </ConfigProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe('Login form', () => {
  it('shows field errors without calling the API', async () => {
    setup();
    renderAt('/login', <Route path="/login" element={<Login />} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('shows the server message on bad credentials', async () => {
    setup();
    apiMock.post.mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' }));
    renderAt('/login', <Route path="/login" element={<Login />} />);
    await userEvent.type(await screen.findByLabelText('Email'), 'guest@hotelpro.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/login', { email: 'guest@hotelpro.demo', password: 'wrong-pass-1' });
  });

  it('redirects to the requested page after signing in', async () => {
    setup();
    apiMock.post.mockResolvedValue({ data: { user: { _id: '1', name: 'Ananya Iyer', role: 'guest' } } });
    renderAt('/login?next=/checkout', [<Route key="l" path="/login" element={<Login />} />, <Route key="c" path="/checkout" element={<p>Checkout page</p>} />]);
    await userEvent.type(await screen.findByLabelText('Email'), 'guest@hotelpro.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'Sample-pass-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Checkout page')).toBeInTheDocument();
  });

  it('ignores off-site redirect targets', async () => {
    setup();
    apiMock.post.mockResolvedValue({ data: { user: { _id: '1', name: 'Ananya Iyer', role: 'guest' } } });
    renderAt('/login?next=//evil.example', [<Route key="l" path="/login" element={<Login />} />, <Route key="a" path="/account" element={<p>Account home</p>} />]);
    await userEvent.type(await screen.findByLabelText('Email'), 'guest@hotelpro.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'Sample-pass-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Account home')).toBeInTheDocument();
  });
});

describe('Registration form', () => {
  it('enforces the password rule client-side', async () => {
    setup();
    renderAt('/register', <Route path="/register" element={<Register />} />);
    await userEvent.type(await screen.findByLabelText('Full name'), 'Asha Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'onlyletters');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Include at least one letter and one number')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('shows server-side field errors next to the field', async () => {
    setup();
    apiMock.post.mockRejectedValue(new ApiError({ status: 409, code: 'EMAIL_TAKEN', message: 'An account with this email already exists', details: [{ field: 'body.email', message: 'Already registered' }] }));
    renderAt('/register', <Route path="/register" element={<Register />} />);
    await userEvent.type(await screen.findByLabelText('Full name'), 'Asha Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Secur3pass');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Already registered')).toBeInTheDocument();
    expect(screen.getByText('An account with this email already exists')).toBeInTheDocument();
  });
});

describe('SearchBar', () => {
  it('rejects a check-out before check-in', async () => {
    setup();
    renderAt('/', <Route path="/" element={<SearchBar onSearch={vi.fn()} />} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/config'));
    const inEl = screen.getByLabelText('Check-in');
    await userEvent.type(inEl, '2026-11-10');
    const outEl = screen.getByLabelText('Check-out');
    await userEvent.clear(outEl);
    await userEvent.type(outEl, '2026-11-08');
    await userEvent.click(screen.getByRole('button', { name: /search rooms/i }));
    expect(screen.getByText('Check-out must be after check-in')).toBeInTheDocument();
  });

  it('submits clean search parameters', async () => {
    setup();
    const onSearch = vi.fn();
    renderAt('/', <Route path="/" element={<SearchBar onSearch={onSearch} />} />);
    await userEvent.type(screen.getByLabelText('Where'), '  Goa ');
    await userEvent.click(screen.getByRole('button', { name: /search rooms/i }));
    expect(onSearch).toHaveBeenCalledWith({ location: 'Goa', guests: '2' });
  });
});

describe('ProtectedRoute', () => {
  it('sends signed-out visitors to login with a return path', async () => {
    setup();
    renderAt('/account', [
      <Route key="a" path="/account" element={<ProtectedRoute roles={['guest']}><p>Secret</p></ProtectedRoute>} />,
      <Route key="l" path="/login" element={<p>Login page</p>} />,
    ]);
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('sends users with the wrong role to their own home', async () => {
    setup({ user: { _id: '1', name: 'G', role: 'guest' } });
    renderAt('/admin', [
      <Route key="a" path="/admin" element={<ProtectedRoute roles={['admin']}><p>Admin console</p></ProtectedRoute>} />,
      <Route key="h" path="/account" element={<p>Guest home</p>} />,
    ]);
    expect(await screen.findByText('Guest home')).toBeInTheDocument();
  });
});

describe('display components', () => {
  it('renders the server price breakdown without recomputing it', () => {
    render(<PriceBreakdown pricing={{ nightly: [{ date: '2026-11-01', rate: 5000 }, { date: '2026-11-02', rate: 6000, season: 'Festive' }], subtotal: 11000, taxRatePercent: 12, taxes: 1320, total: 12320 }} />);
    expect(screen.getByText('(Festive)')).toBeInTheDocument();
    expect(screen.getByText('₹12,320')).toBeInTheDocument();
    expect(screen.getByText('Taxes (12% GST)')).toBeInTheDocument();
  });

  it('labels booking states in words, not colour alone', () => {
    render(<StatusBadge kind="booking" value="checked_in" />);
    expect(screen.getByText('In house')).toBeInTheDocument();
  });

  it('shows a fallback when an image fails', () => {
    render(<Img src="https://broken.example/x.jpg" alt="Room photo" />);
    const img = screen.getByAltText('Room photo');
    img.dispatchEvent(new Event('error'));
    return waitFor(() => expect(screen.getByText('Photo unavailable')).toBeInTheDocument());
  });
});
