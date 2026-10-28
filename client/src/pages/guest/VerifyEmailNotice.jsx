import { useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/client';
import { InlineAlert } from '../../components/ui/Feedback';

export default function VerifyEmailNotice({ className = '' }) {
  const [state, setState] = useState('idle');
  const resend = async () => {
    setState('sending');
    try {
      const res = await api.post('/auth/resend-verification');
      setState('sent');
      if (res.data.delivered === false) toast.info('Email delivery is not configured on this server. The link was written to the server log.');
      else toast.success('Verification email sent');
    } catch (err) {
      setState('idle');
      toast.error(err.message);
    }
  };
  return (
    <InlineAlert tone="warn" className={className}>
      Please confirm your email address before booking.{' '}
      {state === 'sent' ? (
        <strong>Check your inbox for the link.</strong>
      ) : (
        <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={resend} disabled={state === 'sending'}>
          Send the link again
        </button>
      )}
    </InlineAlert>
  );
}
