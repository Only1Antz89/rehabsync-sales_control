'use client';

import React, { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

export function CaptureForm({
  slug,
  headline,
  redirectUrl,
}: {
  slug: string;
  headline: string;
  redirectUrl: string | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      const utm: Record<string, string> = {};
      const params = new URLSearchParams(window.location.search);
      for (const [k, v] of params.entries()) if (k.startsWith('utm_')) utm[k] = v;

      const res = await fetch(`/api/public/capture/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, clinicName, phone, message, website, utm }),
      });
      if (!res.ok) {
        setState('error');
        return;
      }
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <Card className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Thanks — we&apos;ll be in touch shortly.
        </h1>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {headline}
        </h1>
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Clinic name" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
        <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Anything you&apos;d like to tell us?
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          />
        </div>
        {/* Honeypot — hidden from humans, filled by naive bots */}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        />
        {state === 'error' && (
          <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>
            Something went wrong — please try again.
          </p>
        )}
        <Button type="submit" loading={state === 'busy'} className="w-full">
          Send
        </Button>
      </form>
    </Card>
  );
}
